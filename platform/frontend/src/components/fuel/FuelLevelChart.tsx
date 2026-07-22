import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  Customized,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertCircle, Droplets, Loader2, RefreshCw, Truck } from 'lucide-react';
import { format } from 'date-fns';
import type { FuelTransaction } from '@/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Green filling pump — matches Wialon Hosting fuel graph markers. */
function FillMarkerIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="7" width="11" height="13" rx="1.5" fill="#22c55e" />
      <path d="M7 7V4M10 7V4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M14 11h2.5a2 2 0 0 1 2 2v5.5a1.5 1.5 0 0 0 3 0V10.5"
        stroke="#22c55e"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="21.5" cy="9" r="1.4" fill="#22c55e" />
    </svg>
  );
}

/** Red drain / theft pump — matches Wialon Hosting fuel graph markers. */
function DrainMarkerIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="7" width="11" height="13" rx="1.5" fill="#ef4444" />
      <path d="M7 7V4M10 7V4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M14 11h2.5a2 2 0 0 1 2 2v5.5a1.5 1.5 0 0 0 3 0V10.5"
        stroke="#ef4444"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="21.5" cy="9" r="1.4" fill="#ef4444" />
    </svg>
  );
}

type NamedUnit = { name: string };

interface FuelLevelChartProps {
  className?: string;
  transactions?: FuelTransaction[];
  /** Unit names for the selector (vehicles, generators, machinery, bowsers). */
  vehicles?: NamedUnit[];
  vehicleFuelLevels?: Map<string, number>;
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  fromDate?: string;
  toDate?: string;
  /** Singular label for the asset picker (Vehicle / Generator / …). */
  unitLabel?: string;
}

interface ChartDataPoint {
  id: string;
  timestamp: number;
  axisLabel: string;
  dateLabel: string;
  timeLabel: string;
  volume: number | null;
  eventType: 'level' | 'refill' | 'drain' | 'consumption';
  vehicleName: string;
  location: string;
  refillAmount?: number;
  drainAmount?: number;
  fuelUsed?: number;
  mainTankLevel: number | null;
  reserveTankLevel: number | null;
  eventTank?: 'main' | 'reserve' | 'unknown';
}

const LINE = '#3b82f6';
const GRID = '#e5e7eb';

function formatVolumeTick(v: number): string {
  if (!Number.isFinite(v)) return '';
  const abs = Math.abs(v);
  if (abs >= 1000) {
    const k = v / 1000;
    const digits = abs >= 10000 ? 1 : 2;
    return `${k.toFixed(digits)}K`;
  }
  return String(Math.round(v * 10) / 10);
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartDataPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 shadow-md text-xs min-w-[180px]">
      <p className="font-semibold text-foreground mb-1">
        {data.dateLabel} · {data.timeLabel}
      </p>
      <p className="text-muted-foreground">{data.vehicleName}</p>
      {data.volume != null && (
        <p className="mt-1.5 text-sm font-semibold text-blue-600">
          {data.volume.toLocaleString(undefined, { maximumFractionDigits: 1 })} L
        </p>
      )}
      {data.eventType === 'refill' && data.refillAmount != null && (
        <p className="mt-1 text-green-600 font-medium">+{data.refillAmount.toFixed(1)} L filling</p>
      )}
      {data.eventType === 'drain' && data.drainAmount != null && (
        <p className="mt-1 text-red-600 font-medium">-{Math.abs(data.drainAmount).toFixed(1)} L drain</p>
      )}
      {data.location && data.location !== 'Unknown' && (
        <p className="mt-1 text-muted-foreground truncate max-w-[220px]">{data.location}</p>
      )}
    </div>
  );
}

/**
 * Wialon-style event lane: green/red pump icons along the top of the plot,
 * time-aligned — not drawn on the volume line itself.
 */
function EventLane(props: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  xAxisMap?: Record<string, any>;
  offset?: { top: number; left: number; width: number; height: number };
  chartData?: ChartDataPoint[];
}) {
  const { xAxisMap, offset, chartData = [] } = props;
  if (!xAxisMap || !offset || !chartData.length) return null;
  const xAxis = Object.values(xAxisMap)[0];
  const scale = xAxis?.scale as ((v: number) => number) | undefined;
  if (!scale) return null;

  const events = chartData.filter((d) => d.eventType === 'refill' || d.eventType === 'drain');
  if (!events.length) return null;

  const y = offset.top + 2;

  return (
    <g className="fuel-event-lane" pointerEvents="none">
      {events.map((ev) => {
        const cx = scale(ev.timestamp);
        if (!Number.isFinite(cx)) return null;
        // Inline paths (no nested <svg>) so markers render inside the chart SVG.
        if (ev.eventType === 'refill') {
          return (
            <g key={`ev-${ev.id}`} transform={`translate(${cx - 7}, ${y})`}>
              <rect x="1" y="3" width="8" height="10" rx="1" fill="#22c55e" />
              <path d="M3.5 3V1M6.5 3V1" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
              <path
                d="M9 6h1.5a1.2 1.2 0 0 1 1.2 1.2V12"
                stroke="#22c55e"
                strokeWidth="1.3"
                strokeLinecap="round"
                fill="none"
              />
              <circle cx="12.2" cy="5.2" r="1.1" fill="#22c55e" />
            </g>
          );
        }
        return (
          <g key={`ev-${ev.id}`} transform={`translate(${cx - 7}, ${y})`}>
            <rect x="1" y="3" width="8" height="10" rx="1" fill="#ef4444" />
            <path d="M3.5 3V1M6.5 3V1" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
            <path
              d="M9 6h1.5a1.2 1.2 0 0 1 1.2 1.2V12"
              stroke="#ef4444"
              strokeWidth="1.3"
              strokeLinecap="round"
              fill="none"
            />
            <circle cx="12.2" cy="5.2" r="1.1" fill="#ef4444" />
          </g>
        );
      })}
    </g>
  );
}

export function FuelLevelChart({
  className,
  transactions,
  vehicles,
  vehicleFuelLevels,
  isLoading = false,
  error = null,
  onRetry,
  fromDate,
  toDate,
  unitLabel = 'Unit',
}: FuelLevelChartProps) {
  const unitNames = useMemo(() => {
    const names = new Set<string>();
    if (transactions) for (const tx of transactions) if (tx.unitName) names.add(tx.unitName);
    if (vehicles) for (const v of vehicles) if (v.name) names.add(v.name);
    return Array.from(names).sort();
  }, [transactions, vehicles]);

  // Wialon graph is always one unit — default to first unit with volume events.
  const [selectedVehicle, setSelectedVehicle] = useState<string>('');

  useEffect(() => {
    if (!unitNames.length) {
      setSelectedVehicle('');
      return;
    }
    setSelectedVehicle((prev) => (prev && unitNames.includes(prev) ? prev : unitNames[0]));
  }, [unitNames]);

  const filteredTransactions = useMemo(() => {
    if (!transactions?.length || !selectedVehicle) return [];
    return transactions.filter((tx) => tx.unitName === selectedVehicle);
  }, [transactions, selectedVehicle]);

  const { chartData, refillCount, drainCount, liveVolume } = useMemo(() => {
    if (!filteredTransactions.length) {
      return { chartData: [] as ChartDataPoint[], refillCount: 0, drainCount: 0, liveVolume: null as number | null };
    }

    let refills = 0;
    let drains = 0;
    const sorted = [...filteredTransactions].sort((a, b) => a.timestamp - b.timestamp);
    const dataPoints: ChartDataPoint[] = [];
    let lastMain: number | null = null;
    let lastReserve: number | null = null;

    for (const tx of sorted) {
      const txDate = new Date(tx.timestamp * 1000);
      const mainLevel = tx.mainTankLevel ?? null;
      const reserveLevel = tx.reserveTankLevel ?? null;
      if (mainLevel != null) lastMain = mainLevel;
      if (reserveLevel != null) lastReserve = reserveLevel;

      const filled = tx.filled || 0;
      const suddenDrop = tx.suddenFuelDrop || 0;
      const fuelChange = (tx.finalLevel ?? 0) - (tx.initialLevel ?? 0);

      let eventType: ChartDataPoint['eventType'] = 'level';
      let refillAmount: number | undefined;
      let drainAmount: number | undefined;
      let fuelUsed: number | undefined;

      if (filled > 5 || tx.section === 'filling') {
        eventType = 'refill';
        refillAmount = filled || Math.abs(fuelChange);
        refills += 1;
      } else if (suddenDrop > 0 || tx.section === 'theft') {
        eventType = 'drain';
        drainAmount = suddenDrop || Math.abs(fuelChange);
        drains += 1;
      } else if (fuelChange < 0 || (tx.fuelUsed ?? 0) > 0 || tx.section === 'consumption') {
        eventType = 'consumption';
        fuelUsed = tx.fuelUsed > 0 ? tx.fuelUsed : Math.abs(fuelChange);
      }

      // Prefer explicit tank levels; otherwise carry last known so the line stays continuous.
      const carriedMain = mainLevel ?? lastMain;
      const carriedReserve = reserveLevel ?? lastReserve;
      const volume =
        carriedMain == null && carriedReserve == null
          ? null
          : (carriedMain ?? 0) + (carriedReserve ?? 0);

      // Skip pure consumption rows with no volume — they don't move the Wialon volume line.
      if (volume == null && eventType === 'consumption') continue;

      dataPoints.push({
        id: tx.id,
        timestamp: tx.timestamp * 1000,
        axisLabel: `${format(txDate, 'HH:mm')}\n${format(txDate, 'MM-dd')}`,
        dateLabel: format(txDate, 'MMM d, yyyy'),
        timeLabel: format(txDate, 'HH:mm'),
        volume,
        eventType,
        vehicleName: tx.unitName,
        location: tx.location || 'Unknown',
        refillAmount,
        drainAmount,
        fuelUsed,
        mainTankLevel: carriedMain,
        reserveTankLevel: carriedReserve,
        eventTank: tx.tank,
      });
    }

    const live = vehicleFuelLevels?.get(selectedVehicle) ?? null;

    return {
      chartData: dataPoints,
      refillCount: refills,
      drainCount: drains,
      liveVolume: live != null && live > 0 ? live : null,
    };
  }, [filteredTransactions, selectedVehicle, vehicleFuelLevels]);

  // Time-scale points so markers align like Wialon’s continuous timeline.
  const plotData = useMemo(
    () =>
      chartData.map((d) => ({
        ...d,
        // numeric x for time scale
        t: d.timestamp,
      })),
    [chartData],
  );

  const yDomain = useMemo(() => {
    const vals = plotData.map((d) => d.volume).filter((v): v is number => v != null && v > 0);
    if (!vals.length) return ['auto', 'auto'] as const;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = Math.max((max - min) * 0.08, max * 0.002, 2);
    return [Math.max(0, min - pad), max + pad] as [number, number];
  }, [plotData]);

  if (isLoading) {
    return (
      <div className={`fleet-card ${className || ''}`}>
        <div className="flex items-center gap-2 mb-4">
          <Droplets className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Volume, litres</h3>
        </div>
        <div className="h-[320px] flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading fuel volume…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`fleet-card ${className || ''}`}>
        <div className="flex items-center gap-2 mb-4">
          <Droplets className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Volume, litres</h3>
        </div>
        <div className="h-[320px] flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <AlertCircle className="w-10 h-10 mx-auto text-destructive opacity-60 mb-2" />
            <p className="font-medium">Failed to load fuel volume</p>
            <p className="text-sm max-w-md mx-auto mt-1">{error.message}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const latestVolume =
    liveVolume ??
    [...plotData].reverse().find((d) => d.volume != null)?.volume ??
    null;

  return (
    <div className={`fleet-card ${className || ''}`}>
      <div className="flex flex-col gap-3 mb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground">Volume, litres</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tank level over time · fillings (green) · drains (red)
            {fromDate && toDate ? ` · ${fromDate} → ${toDate}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {latestVolume != null && (
            <div className="text-xs">
              <span className="text-muted-foreground">Level </span>
              <span className="font-semibold text-blue-600">
                {latestVolume.toLocaleString(undefined, { maximumFractionDigits: 1 })} L
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <FillMarkerIcon size={12} /> {refillCount} fill
            </span>
            <span className="inline-flex items-center gap-1">
              <DrainMarkerIcon size={12} /> {drainCount} drain
            </span>
          </div>
          {unitNames.length > 0 && (
            <Select value={selectedVehicle || undefined} onValueChange={setSelectedVehicle}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <Truck className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                <SelectValue placeholder={`Select ${unitLabel.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {unitNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="h-[360px] min-h-[280px] bg-white rounded-md border border-border/60">
        {!plotData.length ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center px-4">
              <Droplets className="w-10 h-10 mx-auto opacity-30 mb-2" />
              <p className="font-medium">No volume series for this unit</p>
              <p className="text-sm max-w-md mx-auto mt-1">
                Pick another {unitLabel.toLowerCase()}, or run Execute after fuel reports sync.
              </p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={plotData}
              margin={{ top: 28, right: 16, left: 8, bottom: 28 }}
            >
              <CartesianGrid stroke={GRID} strokeDasharray="0" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                domain={['dataMin', 'dataMax']}
                scale="time"
                tickCount={8}
                tickFormatter={(ms: number) => {
                  const d = new Date(ms);
                  return `${format(d, 'HH:mm')} ${format(d, 'MM-dd')}`;
                }}
                stroke="#9ca3af"
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: GRID }}
                minTickGap={48}
              />
              <YAxis
                dataKey="volume"
                domain={yDomain as [number, number]}
                tickFormatter={formatVolumeTick}
                stroke="#9ca3af"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={48}
                label={{
                  value: 'Volume, litres',
                  angle: -90,
                  position: 'insideLeft',
                  offset: 4,
                  style: { fontSize: 11, fill: '#6b7280' },
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Customized
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                component={(p: any) => <EventLane {...p} chartData={plotData} />}
              />
              <Area
                type="monotone"
                dataKey="volume"
                stroke="none"
                fill={LINE}
                fillOpacity={0.06}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="volume"
                stroke={LINE}
                strokeWidth={1.75}
                dot={false}
                activeDot={{ r: 4, stroke: LINE, strokeWidth: 2, fill: '#fff' }}
                connectNulls
                isAnimationActive={false}
                name="Volume"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="flex items-center justify-center gap-5 mt-3 text-xs text-muted-foreground flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-5 h-0.5 rounded" style={{ background: LINE }} />
          Tank volume
        </span>
        <span className="inline-flex items-center gap-1.5">
          <FillMarkerIcon size={12} />
          Filling
        </span>
        <span className="inline-flex items-center gap-1.5">
          <DrainMarkerIcon size={12} />
          Drain / theft
        </span>
      </div>
    </div>
  );
}
