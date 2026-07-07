import { useMemo, useState } from 'react';
import { format, subDays, startOfDay, parseISO } from 'date-fns';
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
  Brush,
} from 'recharts';
import {
  AlertCircle,
  Calendar,
  Clock,
  Droplets,
  Fuel,
  Loader2,
  MapPin,
  RefreshCw,
  TrendingUp,
  Zap,
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
} from '@/services/fleet';
import {
  useStationaryAssets,
  useStationaryFuelTransactions,
  type StationaryFuelType,
} from './useStationaryFuelHooks';
import {
  buildGeneratorEngineIntervalsByUnit,
  getGeneratorFuelActivity,
  type GeneratorEngineInterval,
} from '@/services/fleet/generatorFuelClassification';
import type { FuelTransaction, GeneratorEngineHours } from '@/types';

/**
 * GeneratorRuntimeTrendChart — merged daily activity chart.
 *
 * Per-generator (or fleet-wide) daily breakdown of runtime hours, fuel
 * consumed, and fuel filled, over a selectable date range. Runtime is sourced
 * from the Wialon "Engine Hours Report (Group)" via `useGeneratorEngineHours`
 * and bucketed by each interval's `beginning` day. Fuel rows are classified
 * via `getGeneratorFuelActivity`:
 *   - `consumption` rows + engine-on Sudden Fuel Drops contribute to Consumed
 *   - `drain` rows (drops while engine off) are folded into Consumed to match
 *     the per-row Generators table
 *   - `filling` rows contribute to Filled
 * Efficiency (L/h) is derived per day and surfaced in the tooltip + summary.
 */

type RangeOption = '7' | '14' | '30';

const RANGE_LABELS: Record<RangeOption, string> = {
  '7': 'Last 7 days',
  '14': 'Last 14 days',
  '30': 'Last 30 days',
};

/** Sentinel value used by the generator <Select> to mean "aggregate every
 *  generator in the fleet". Picked so it can never collide with a real Wialon
 *  unit id (which are numeric strings). */
const ALL_GENERATORS_VALUE = '__all__';

interface DailyPoint {
  dateKey: string; // YYYY-MM-DD for sort
  dateLabel: string; // Display label
  runtimeHours: number; // Sum of engine-hours deltas
  fuelConsumed: number; // Classified fuel consumed (L), drains folded in
  fuelFilled: number; // Classified fuel filled (L)
  efficiency: number | null; // L/h for the day
}

interface TooltipPayloadItem {
  payload: DailyPoint;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-xs space-y-1">
      <p className="font-semibold text-foreground">{data.dateLabel}</p>
      <div className="flex items-center gap-2">
        <Clock className="w-3.5 h-3.5 text-primary" />
        <span className="text-muted-foreground">Runtime:</span>
        <span className="font-mono font-medium">{data.runtimeHours.toFixed(2)} h</span>
      </div>
      <div className="flex items-center gap-2">
        <Droplets className="w-3.5 h-3.5 text-blue-500" />
        <span className="text-muted-foreground">Consumed:</span>
        <span className="font-mono font-medium text-blue-600">
          {data.fuelConsumed.toFixed(1)} L
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Fuel className="w-3.5 h-3.5 text-green-600" />
        <span className="text-muted-foreground">Filled:</span>
        <span className="font-mono font-medium text-green-600">
          {data.fuelFilled.toFixed(1)} L
        </span>
      </div>
      {data.efficiency != null && (
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-orange-500" />
          <span className="text-muted-foreground">Avg L/h:</span>
          <span className="font-mono font-medium text-orange-600">
            {data.efficiency.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}

function buildDailyData(
  engineRows: GeneratorEngineHours[],
  fuelRows: FuelTransaction[],
  startDate: Date,
  endDate: Date,
  engineIntervalsByUnit: Map<string, GeneratorEngineInterval[]>,
): {
  points: DailyPoint[];
  totalRuntime: number;
  totalConsumed: number;
  totalFilled: number;
  avgEfficiency: number | null;
} {
  const map = new Map<string, { runtime: number; consumed: number; filled: number }>();

  // Pre-seed every day in the range with zeroes so the chart shows continuity.
  for (let d = startOfDay(startDate); d <= endDate; d = new Date(d.getTime() + 86_400_000)) {
    map.set(format(d, 'yyyy-MM-dd'), { runtime: 0, consumed: 0, filled: 0 });
  }

  // Engine-hours rows: bucket each interval's wall-clock duration by its
  // `beginning` day. Intervals that span midnight are credited to the start
  // day — acceptable because Wialon leaf intervals are typically short
  // (single run cycles). Computing from `(end - beginning)` matches the
  // Wialon "Engine hours" column semantics and avoids relying on the
  // `engineHours` field that older cache rows may have stored corrupted.
  for (const row of engineRows) {
    const day = format(new Date(row.beginning * 1000), 'yyyy-MM-dd');
    const bucket = map.get(day);
    if (!bucket) continue;
    const durationSec = row.end > row.beginning ? row.end - row.beginning : 0;
    bucket.runtime += durationSec / 3600;
  }

  // Fuel rows: bucket Consumed (incl. engine-on Sudden Fuel Drops + drains
  // folded in to mirror the Generators table) and Filled by event timestamp.
  for (const tx of fuelRows) {
    const activity = getGeneratorFuelActivity(tx, engineIntervalsByUnit);
    const day = format(new Date(tx.timestamp * 1000), 'yyyy-MM-dd');
    const bucket = map.get(day);
    if (!bucket) continue;
    if (activity.kind === 'consumption' && activity.consumed > 0) {
      bucket.consumed += activity.consumed;
    } else if (activity.kind === 'drain' && activity.drained > 0) {
      bucket.consumed += activity.drained;
    } else if (activity.kind === 'filling' && activity.filled > 0) {
      bucket.filled += activity.filled;
    }
  }

  const points: DailyPoint[] = Array.from(map.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([dateKey, v]) => ({
      dateKey,
      dateLabel: format(new Date(dateKey), 'MMM d'),
      runtimeHours: Math.round(v.runtime * 100) / 100,
      fuelConsumed: Math.round(v.consumed * 10) / 10,
      fuelFilled: Math.round(v.filled * 10) / 10,
      efficiency: v.runtime > 0 ? Math.round((v.consumed / v.runtime) * 100) / 100 : null,
    }));

  const totalRuntime = points.reduce((s, p) => s + p.runtimeHours, 0);
  const totalConsumed = points.reduce((s, p) => s + p.fuelConsumed, 0);
  const totalFilled = points.reduce((s, p) => s + p.fuelFilled, 0);
  const avgEfficiency = totalRuntime > 0 ? totalConsumed / totalRuntime : null;

  return { points, totalRuntime, totalConsumed, totalFilled, avgEfficiency };
}

interface GeneratorRuntimeTrendChartProps {
  /** Optional ISO date (yyyy-MM-dd). When supplied, overrides the local
   *  "Last X days" picker so the chart honours the tab-level filter. */
  fromDate?: string;
  toDate?: string;
  stationaryType?: StationaryFuelType;
}

export function GeneratorRuntimeTrendChart({
  fromDate,
  toDate,
  stationaryType = 'generator',
}: GeneratorRuntimeTrendChartProps = {}) {
  const { data: generators = [], isLoading: generatorsLoading } = useStationaryAssets(stationaryType);
  const [range, setRange] = useState<RangeOption>('14');
  // Default to the aggregate "All generators" view; users can drill into a
  // single unit via the selector when they need per-generator detail.
  const [selectedId, setSelectedId] = useState<string>(ALL_GENERATORS_VALUE);

  const isAllSelected = selectedId === ALL_GENERATORS_VALUE;
  const hasParentRange = Boolean(fromDate && toDate);

  const { startDate, endDate, startStr, endStr } = useMemo(() => {
    if (hasParentRange) {
      const from = parseISO(fromDate as string);
      const to = parseISO(toDate as string);
      return {
        startDate: from,
        endDate: to,
        startStr: fromDate as string,
        endStr: toDate as string,
      };
    }
    const days = parseInt(range, 10);
    const to = new Date();
    const from = subDays(to, days);
    return {
      startDate: from,
      endDate: to,
      startStr: format(from, 'yyyy-MM-dd'),
      endStr: format(to, 'yyyy-MM-dd'),
    };
  }, [hasParentRange, fromDate, toDate, range]);

  // Engine-hours rows for the entire group; filtered client-side by unit id.
  const {
    data: allEngineRows = [],
    isLoading: engineLoading,
    error: engineError,
    refetch: refetchEngine,
  } = useGeneratorEngineHours({ startDate: startStr, endDate: endStr });

  // Generator-only fuel transactions for the same range — used for the L/h
  // efficiency overlay (fuelUsed per day).
  const {
    data: allFuelRows = [],
    isLoading: fuelLoading,
    error: fuelError,
    refetch: refetchFuel,
  } = useStationaryFuelTransactions(stationaryType, { startDate: startStr, endDate: endStr });

  const selectedGenerator = useMemo(
    () => (isAllSelected ? undefined : generators.find((g) => g.id === selectedId)),
    [generators, selectedId, isAllSelected],
  );

  // When "All generators" is active, skip the per-id filter so the chart sums
  // runtime / fuel across the entire fleet for each day in the window.
  const filteredEngine = useMemo(() => {
    if (isAllSelected) return allEngineRows;
    if (!selectedId) return [];
    return allEngineRows.filter((r) => String(r.unitId) === String(selectedId));
  }, [allEngineRows, selectedId, isAllSelected]);

  const filteredFuel = useMemo(() => {
    if (isAllSelected) return allFuelRows;
    if (!selectedId) return [];
    return allFuelRows.filter((t) => String(t.unitId) === String(selectedId));
  }, [allFuelRows, selectedId, isAllSelected]);

  const engineIntervalsByUnit = useMemo(
    () => buildGeneratorEngineIntervalsByUnit(allEngineRows),
    [allEngineRows],
  );

  const { points, totalRuntime, totalConsumed, totalFilled, avgEfficiency } = useMemo(
    () => buildDailyData(filteredEngine, filteredFuel, startDate, endDate, engineIntervalsByUnit),
    [filteredEngine, filteredFuel, startDate, endDate, engineIntervalsByUnit],
  );

  const error = engineError || fuelError;
  const isLoading = generatorsLoading || engineLoading || fuelLoading;
  const refetch = () => {
    refetchEngine();
    refetchFuel();
  };
  const sortedGenerators = useMemo(
    () => generators.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [generators],
  );
  const hasData = points.some(
    (p) => p.runtimeHours > 0 || p.fuelConsumed > 0 || p.fuelFilled > 0,
  );

  return (
    <div className="fleet-card">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Runtime, Consumption &amp; Fillings</h3>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {hasData && (
            <>
              <div className="flex items-center gap-1 text-xs">
                <Clock className="w-3.5 h-3.5 text-primary" />
                <span className="text-muted-foreground">Runtime:</span>
                <span className="font-medium">{totalRuntime.toFixed(1)} h</span>
              </div>
              <div className="flex items-center gap-1 text-xs">
                <Droplets className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-muted-foreground">Consumed:</span>
                <span className="font-medium text-blue-600">{totalConsumed.toFixed(0)} L</span>
              </div>
              <div className="flex items-center gap-1 text-xs">
                <Fuel className="w-3.5 h-3.5 text-green-600" />
                <span className="text-muted-foreground">Filled:</span>
                <span className="font-medium text-green-600">{totalFilled.toFixed(0)} L</span>
              </div>
              {avgEfficiency != null && (
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-muted-foreground">Avg:</span>
                  <span className="font-medium text-orange-600">
                    {avgEfficiency.toFixed(2)} L/h
                  </span>
                </div>
              )}
            </>
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

      <div className="h-[360px] min-h-[300px]">
        {isLoading ? (
          <div className="h-full flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading runtime data…</span>
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <AlertCircle className="w-10 h-10 mx-auto text-destructive opacity-60 mb-2" />
              <p className="font-medium">Failed to load runtime data</p>
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
        ) : !hasData ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Clock className="w-10 h-10 mx-auto opacity-30 mb-2" />
              <p className="font-medium">No runtime data</p>
              <p className="text-sm mt-1 max-w-md mx-auto">
                No runtime, consumption or filling events were recorded for
                {isAllSelected ? ' any generator' : ' this generator'} in the selected period.
              </p>
            </div>
          </div>
        ) : (

          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={points}
              margin={{ top: 10, right: 20, left: 0, bottom: 30 }}
              barCategoryGap="20%"
              barGap={2}
            >
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
                interval={Math.max(0, Math.floor(points.length / 12) - 1)}
              />
              <YAxis
                yAxisId="hours"
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                label={{
                  value: 'Runtime (h)',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' },
                }}
              />
              <YAxis
                yAxisId="litres"
                orientation="right"
                stroke="hsl(217, 91%, 60%)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                label={{
                  value: 'Fuel (L)',
                  angle: 90,
                  position: 'insideRight',
                  style: { fontSize: 11, fill: 'hsl(217, 91%, 60%)' },
                }}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                yAxisId="hours"
                dataKey="runtimeHours"
                fill="hsl(217, 91%, 60%)"
                name="Runtime (h)"
                radius={[3, 3, 0, 0]}
                maxBarSize={18}
              />
              <Bar
                yAxisId="litres"
                dataKey="fuelConsumed"
                fill="hsl(199, 89%, 48%)"
                name="Consumed (L)"
                radius={[3, 3, 0, 0]}
                maxBarSize={18}
              />
              <Bar
                yAxisId="litres"
                dataKey="fuelFilled"
                fill="hsl(142, 71%, 45%)"
                name="Filled (L)"
                radius={[3, 3, 0, 0]}
                maxBarSize={18}
              />
              <Brush
                dataKey="dateLabel"
                height={24}
                stroke="hsl(var(--primary))"
                fill="hsl(var(--muted))"
                tickFormatter={() => ''}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
