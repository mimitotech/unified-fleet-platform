import { useMemo, useState } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Brush,
  ReferenceLine,
} from 'recharts';
import { differenceInCalendarDays, format, parseISO, subDays } from 'date-fns';
import {
  Droplets,
  Loader2,
  Calendar,
  ZoomIn,
  Zap,
  AlertCircle,
  RefreshCw,
  Fuel,
  MapPin,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useGeneratorEngineHours,
  useGeneratorFuelTransactions,
  useGenerators,
} from '@/services/fleet';
import {
  buildGeneratorEngineIntervalsByUnit,
  getGeneratorFuelActivity,
  type GeneratorEngineInterval,
} from '@/services/fleet/generatorFuelClassification';
import type { FuelTransaction, Generator } from '@/types';

/**
 * GeneratorFuelLevelChart — fuel level over time for a single generator.
 *
 * Phase 2b. Reuses the existing `/fuel/transactions` edge function (same
 * source as the vehicle FuelLevelChart) and filters client-side to a single
 * generator's unitId. Self-contained: provides its own generator selector and
 * date range select (Last 7d / 14d / 30d). Cost analysis is intentionally
 * absent — generator fuel cost is computed on the Reports page.
 *
 * Limitations (for live test):
 *   - The Wialon fuel report group must include generator units; otherwise
 *     this chart will show an empty state for every generator.
 *   - Reserve tank is not rendered — generators are assumed to have a single
 *     main FLS sensor.
 */

type RangeOption = '7' | '14' | '30';
const RANGE_LABELS: Record<RangeOption, string> = {
  '7': 'Last 7 days',
  '14': 'Last 14 days',
  '30': 'Last 30 days',
};

/** Sentinel value used by the generator <Select> to mean "every generator".
 *  In multi-mode the chart renders one line per unit instead of refill/drain
 *  markers — those events are only meaningful when zoomed into a single tank. */
const ALL_GENERATORS_VALUE = '__all__';

/** Palette used to colour per-generator lines when "All generators" is active.
 *  Cycled if the fleet exceeds this length. */
const MULTI_LINE_COLORS = [
  'hsl(217, 91%, 60%)',
  'hsl(142, 76%, 36%)',
  'hsl(25, 95%, 53%)',
  'hsl(280, 70%, 55%)',
  'hsl(0, 84%, 60%)',
  'hsl(199, 89%, 48%)',
  'hsl(45, 93%, 47%)',
  'hsl(160, 60%, 45%)',
];

interface ChartDataPoint {
  id: string;
  timestamp: number;
  dateLabel: string;
  timeLabel: string;
  mainTankLevel: number | null;
  eventType: 'level' | 'refill' | 'drain';
  refillAmount?: number;
  drainAmount?: number;
  location: string;
}

function FuelDot(props: unknown) {
  const { cx, cy, payload } = props as {
    cx?: number;
    cy?: number;
    payload?: ChartDataPoint;
  };
  if (cx == null || cy == null || !payload) return null;

  if (payload.eventType === 'refill') {
    return (
      <svg key={payload.id} x={cx - 7} y={cy - 7} width="14" height="14" viewBox="0 0 24 24">
        <rect x="2" y="6" width="14" height="14" rx="2" fill="hsl(142, 76%, 36%)" stroke="white" strokeWidth="1.5" />
        <path d="M6 6V2M10 6V2" stroke="white" strokeWidth="1.5" />
      </svg>
    );
  }
  if (payload.eventType === 'drain') {
    return (
      <svg key={payload.id} x={cx - 7} y={cy - 7} width="14" height="14" viewBox="0 0 24 24">
        <rect x="3" y="6" width="14" height="14" rx="2" fill="hsl(0, 84%, 60%)" stroke="white" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <circle key={payload.id} cx={cx} cy={cy} r={2.5} fill="hsl(217, 91%, 60%)" stroke="white" strokeWidth={1} />
  );
}

interface TooltipProps {
  active?: boolean;
  payload?: { payload: ChartDataPoint }[];
}

function ChartTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg p-3 min-w-[220px]">
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <span className="font-semibold text-sm">{d.dateLabel}</span>
        <span className="text-muted-foreground text-sm">{d.timeLabel}</span>
      </div>
      <div className="space-y-1.5 text-sm">
        {d.mainTankLevel != null && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              <Droplets className="w-3.5 h-3.5 text-blue-500" /> Fuel level:
            </span>
            <span className="font-medium text-blue-600">{d.mainTankLevel.toFixed(1)} L</span>
          </div>
        )}
        {d.eventType === 'refill' && d.refillAmount != null && (
          <div className="flex items-center justify-between text-xs pt-1 border-t border-border">
            <span className="text-muted-foreground flex items-center gap-1">
              <Fuel className="w-3 h-3 text-green-500" /> Refill:
            </span>
            <span className="font-medium text-green-600">+{d.refillAmount.toFixed(1)} L</span>
          </div>
        )}
        {d.eventType === 'drain' && d.drainAmount != null && (
          <div className="flex items-center justify-between text-xs pt-1 border-t border-border">
            <span className="text-muted-foreground">Drain:</span>
            <span className="font-medium text-destructive">-{Math.abs(d.drainAmount).toFixed(1)} L</span>
          </div>
        )}
        {d.location && d.location !== 'Unknown' && (
          <div className="flex items-start gap-1 pt-1 border-t border-border">
            <MapPin className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
            <span className="text-xs text-muted-foreground truncate max-w-[180px]">{d.location}</span>
          </div>
        )}
      </div>
    </div>
  );
}


function buildChartData(
  transactions: FuelTransaction[],
  rangeDays: number,
  engineIntervalsByUnit: Map<string, GeneratorEngineInterval[]>,
): { points: ChartDataPoint[]; refills: number; drains: number; avgLevel: number | null } {
  if (transactions.length === 0) {
    return { points: [], refills: 0, drains: 0, avgLevel: null };
  }

  const sorted = [...transactions].sort((a, b) => a.timestamp - b.timestamp);
  const points: ChartDataPoint[] = [];
  let refills = 0;
  let drains = 0;

  for (const tx of sorted) {
    const txDate = new Date(tx.timestamp * 1000);
    const activity = getGeneratorFuelActivity(tx, engineIntervalsByUnit);
    let eventType: ChartDataPoint['eventType'] = 'level';
    let refillAmount: number | undefined;
    let drainAmount: number | undefined;

    if (activity.filled > 5) {
      eventType = 'refill';
      refillAmount = activity.filled;
      refills += 1;
    } else if (activity.kind === 'drain' && activity.drained > 0) {
      eventType = 'drain';
      drainAmount = activity.drained;
      drains += 1;
    }

    points.push({
      id: tx.id,
      timestamp: tx.timestamp * 1000,
      dateLabel: format(txDate, rangeDays > 14 ? 'MMM d' : 'MMM d HH:mm'),
      timeLabel: format(txDate, 'HH:mm'),
      mainTankLevel: tx.mainTankLevel ?? null,
      eventType,
      refillAmount,
      drainAmount,
      location: tx.location || 'Unknown',
    });
  }

  const levels = points
    .map((p) => p.mainTankLevel)
    .filter((v): v is number => v != null && v > 0);
  const avgLevel = levels.length > 0 ? levels.reduce((s, v) => s + v, 0) / levels.length : null;

  return { points, refills, drains, avgLevel };
}

/** Wide-format point used in multi-generator mode: each known generator gets a
 *  numeric column keyed by its unit id, populated only for timestamps where a
 *  reading was actually emitted. Recharts skips `undefined` values so each
 *  series stays sparse and `connectNulls` keeps the line continuous. */
interface MultiPoint {
  timestamp: number;
  dateLabel: string;
  timeLabel: string;
  [unitId: string]: number | string | undefined;
}

function buildMultiSeriesData(
  transactions: FuelTransaction[],
  generators: Generator[],
  rangeDays: number,
): { points: MultiPoint[]; series: { unitId: string; name: string; color: string }[] } {
  if (transactions.length === 0 || generators.length === 0) {
    return { points: [], series: [] };
  }

  // Build a stable sorted series list so colours stay consistent across
  // re-renders and only generators that actually have readings are plotted.
  const unitIdsWithData = new Set<string>();
  for (const tx of transactions) {
    if (tx.mainTankLevel != null) unitIdsWithData.add(String(tx.unitId));
  }

  const series = generators
    .filter((g) => unitIdsWithData.has(String(g.id)))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((g, i) => ({
      unitId: String(g.id),
      name: g.name,
      color: MULTI_LINE_COLORS[i % MULTI_LINE_COLORS.length],
    }));

  const sorted = [...transactions].sort((a, b) => a.timestamp - b.timestamp);
  const byTs = new Map<number, MultiPoint>();
  for (const tx of sorted) {
    if (tx.mainTankLevel == null) continue;
    const ts = tx.timestamp * 1000;
    let point = byTs.get(ts);
    if (!point) {
      const txDate = new Date(ts);
      point = {
        timestamp: ts,
        dateLabel: format(txDate, rangeDays > 14 ? 'MMM d' : 'MMM d HH:mm'),
        timeLabel: format(txDate, 'HH:mm'),
      };
      byTs.set(ts, point);
    }
    point[String(tx.unitId)] = tx.mainTankLevel;
  }

  const points = Array.from(byTs.values()).sort((a, b) => a.timestamp - b.timestamp);
  return { points, series };
}

interface MultiTooltipProps {
  active?: boolean;
  payload?: { dataKey: string; value: number; color: string; name: string; payload: MultiPoint }[];
}

function MultiSeriesTooltip({ active, payload }: MultiTooltipProps) {
  if (!active || !payload?.length) return null;
  const first = payload[0].payload;
  // Recharts may emit duplicate entries (one per Line). Dedupe by dataKey to
  // keep the popover compact when many generators share a timestamp.
  const seen = new Set<string>();
  const rows = payload.filter((p) => {
    if (seen.has(p.dataKey)) return false;
    seen.add(p.dataKey);
    return p.value != null;
  });
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg p-3 min-w-[200px]">
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <span className="font-semibold text-sm">{first.dateLabel}</span>
        <span className="text-muted-foreground text-sm">{first.timeLabel}</span>
      </div>
      <div className="space-y-1 text-xs">
        {rows.map((r) => (
          <div key={r.dataKey} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: r.color }} />
              {r.name}
            </span>
            <span className="font-medium text-foreground tabular-nums">
              {r.value.toFixed(1)} L
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface GeneratorFuelLevelChartProps {
  /** Optional ISO date (yyyy-MM-dd). When supplied, overrides the local
   *  "Last X days" picker so the chart honours the tab-level filter. */
  fromDate?: string;
  toDate?: string;
}

export function GeneratorFuelLevelChart({ fromDate, toDate }: GeneratorFuelLevelChartProps = {}) {
  const { data: generators = [], isLoading: generatorsLoading } = useGenerators();
  const [range, setRange] = useState<RangeOption>('7');
  // Default to "All generators" so the chart immediately shows fleet context;
  // users can drill into a single tank to see refill / drain markers.
  const [selectedId, setSelectedId] = useState<string>(ALL_GENERATORS_VALUE);

  const isAllSelected = selectedId === ALL_GENERATORS_VALUE;
  const hasParentRange = Boolean(fromDate && toDate);

  const { startDate, endDate, rangeDays } = useMemo(() => {
    if (hasParentRange) {
      const fromD = parseISO(fromDate as string);
      const toD = parseISO(toDate as string);
      return {
        startDate: fromDate as string,
        endDate: toDate as string,
        rangeDays: Math.max(1, differenceInCalendarDays(toD, fromD) + 1),
      };
    }
    const days = parseInt(range, 10);
    const to = new Date();
    const from = subDays(to, days);
    return {
      startDate: format(from, 'yyyy-MM-dd'),
      endDate: format(to, 'yyyy-MM-dd'),
      rangeDays: days,
    };
  }, [hasParentRange, fromDate, toDate, range]);

  const {
    data: fuelTxData,
    isLoading: txLoading,
    error: txError,
    refetch: refetchFuel,
  } = useGeneratorFuelTransactions({ startDate, endDate });
  const allTransactions = fuelTxData?.transactions ?? [];

  const {
    data: allEngineRows = [],
    isLoading: engineLoading,
    error: engineError,
    refetch: refetchEngine,
  } = useGeneratorEngineHours({ startDate, endDate });

  const selectedGenerator = useMemo(
    () => (isAllSelected ? undefined : generators.find((g) => g.id === selectedId)),
    [generators, selectedId, isAllSelected],
  );

  // Per-tank single-series data (refill/drain dots, avg ref-line). In multi
  // mode this stays empty so the renderer falls through to the multi-series
  // branch below.
  const filtered = useMemo(() => {
    if (isAllSelected || !selectedId) return [];
    return allTransactions.filter((t) => String(t.unitId) === String(selectedId));
  }, [allTransactions, selectedId, isAllSelected]);

  const engineIntervalsByUnit = useMemo(
    () => buildGeneratorEngineIntervalsByUnit(allEngineRows),
    [allEngineRows],
  );

  const { points, refills, drains, avgLevel } = useMemo(
    () => buildChartData(filtered, rangeDays, engineIntervalsByUnit),
    [filtered, rangeDays, engineIntervalsByUnit],
  );

  // Multi-generator wide-format data (one column per unit). Only computed
  // when the aggregate view is active.
  const { points: multiPoints, series: multiSeries } = useMemo(() => {
    if (!isAllSelected) return { points: [], series: [] };
    return buildMultiSeriesData(allTransactions, generators, rangeDays);
  }, [isAllSelected, allTransactions, generators, rangeDays]);

  const error = txError || engineError;
  const isLoading = generatorsLoading || txLoading || engineLoading;
  const refetch = () => {
    refetchFuel();
    refetchEngine();
  };
  const sortedGenerators = useMemo(
    () => generators.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [generators],
  );


  return (
    <div className="fleet-card">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <ZoomIn className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Fuel Level Over Time</h3>
          <span className="text-xs text-muted-foreground ml-2">
            {isAllSelected
              ? `(${multiPoints.length} reading${multiPoints.length === 1 ? '' : 's'} · ${multiSeries.length} generator${multiSeries.length === 1 ? '' : 's'})`
              : `(${points.length} reading${points.length === 1 ? '' : 's'})`}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {!isAllSelected && avgLevel != null && (
            <div className="flex items-center gap-1 text-xs">
              <Droplets className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-muted-foreground">Avg:</span>
              <span className="font-medium text-blue-600">{avgLevel.toFixed(0)}L</span>
            </div>
          )}
          {!isAllSelected && refills > 0 && (
            <div className="flex items-center gap-1 text-xs">
              <Fuel className="w-3.5 h-3.5 text-green-500" />
              <span className="text-muted-foreground">Refills:</span>
              <span className="font-medium text-green-600">{refills}</span>
            </div>
          )}
          {!isAllSelected && drains > 0 && (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground">Drains:</span>
              <span className="font-medium text-destructive">{drains}</span>
            </div>
          )}
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <Zap className="w-3.5 h-3.5 mr-1.5" />
              <SelectValue placeholder="Generator" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_GENERATORS_VALUE}>All generators</SelectItem>
              {sortedGenerators.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!hasParentRange && (
            <Select value={range} onValueChange={(v) => setRange(v as RangeOption)}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <Calendar className="w-3.5 h-3.5 mr-1.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(RANGE_LABELS) as RangeOption[]).map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {RANGE_LABELS[opt]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {selectedGenerator?.siteName && (
        <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
          <MapPin className="w-3 h-3" />
          {selectedGenerator.siteName}
        </p>
      )}

      <div className="h-[320px] min-h-[260px]">
        {isLoading ? (
          <div className="h-full flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading fuel data…</span>
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <AlertCircle className="w-10 h-10 mx-auto text-destructive opacity-60 mb-2" />
              <p className="font-medium">Failed to load fuel data</p>
              <p className="text-sm mt-1">{(error as Error).message}</p>
              <button
                onClick={() => refetch()}
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          </div>
        ) : !isAllSelected && !selectedId ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            No generators available.
          </div>
        ) : (isAllSelected ? multiPoints.length === 0 : points.length === 0) ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Droplets className="w-10 h-10 mx-auto opacity-30 mb-2" />
              <p className="font-medium">No fuel data available</p>
              <p className="text-sm mt-1 max-w-md mx-auto">
                No fuel-sensor readings recorded for
                {isAllSelected ? ' any generator' : ' this generator'} in the selected period.
              </p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={isAllSelected ? multiPoints : points}
              margin={{ top: 10, right: 20, left: 0, bottom: 30 }}
            >
              <defs>
                <linearGradient id="generatorTankGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="dateLabel"
                stroke="hsl(var(--muted-foreground))"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                angle={-45}
                textAnchor="end"
                height={60}
                interval={Math.max(
                  0,
                  Math.floor((isAllSelected ? multiPoints.length : points.length) / 12) - 1,
                )}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                label={{
                  value: 'Fuel Level (L)',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' },
                }}
              />
              <Tooltip content={isAllSelected ? <MultiSeriesTooltip /> : <ChartTooltip />} />
              {!isAllSelected && avgLevel != null && (
                <ReferenceLine
                  y={avgLevel}
                  stroke="hsl(217, 91%, 60%)"
                  strokeDasharray="5 5"
                  strokeOpacity={0.5}
                  label={{
                    value: `Avg: ${avgLevel.toFixed(0)}L`,
                    position: 'insideTopLeft',
                    fontSize: 10,
                    fill: 'hsl(217, 91%, 60%)',
                  }}
                />
              )}

              {!isAllSelected && (
                <Area
                  type="monotone"
                  dataKey="mainTankLevel"
                  fill="url(#generatorTankGradient)"
                  stroke="none"
                  strokeWidth={0}
                  style={{ pointerEvents: 'none' }}
                  connectNulls
                />
              )}
              {!isAllSelected && (
                <Line
                  type="monotone"
                  dataKey="mainTankLevel"
                  stroke="hsl(217, 91%, 60%)"
                  strokeWidth={2}
                  dot={FuelDot}
                  activeDot={{
                    r: 6,
                    stroke: 'hsl(217, 91%, 60%)',
                    strokeWidth: 2,
                    fill: 'white',
                  }}
                  name="Fuel level"
                  connectNulls
                />
              )}
              {isAllSelected &&
                multiSeries.map((s) => (
                  <Line
                    key={s.unitId}
                    type="monotone"
                    dataKey={s.unitId}
                    stroke={s.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, stroke: s.color, strokeWidth: 2, fill: 'white' }}
                    name={s.name}
                    connectNulls
                  />
                ))}
              <Brush
                dataKey="dateLabel"
                height={28}
                stroke="hsl(var(--primary))"
                fill="hsl(var(--muted))"
                tickFormatter={() => ''}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="flex items-center justify-center gap-x-4 gap-y-2 mt-4 text-xs flex-wrap">
        {isAllSelected ? (
          multiSeries.map((s) => (
            <div key={s.unitId} className="flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-0.5 rounded"
                style={{ background: s.color }}
              />
              <span className="text-muted-foreground">{s.name}</span>
            </div>
          ))
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-blue-500" />
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 border border-white shadow-sm" />
              <span className="text-muted-foreground">Fuel level</span>
            </div>
            <div className="flex items-center gap-2">
              <Fuel className="w-3.5 h-3.5 text-green-600" />
              <span className="text-muted-foreground">Refill</span>
            </div>
            {drains > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-2.5 rounded-sm bg-destructive" />
                <span className="text-muted-foreground">Drain</span>
              </div>
            )}
          </>
        )}
      </div>

      {(isAllSelected ? multiPoints.length : points.length) > 0 && (
        <p className="text-xs text-muted-foreground text-center mt-2">
          Drag handles below the chart to zoom into a specific time range.
        </p>
      )}
    </div>
  );
}
