/**
 * Fuel level vs time — same proven logic as MAMSv2:
 * plot main/reserve tank levels from fuel transactions (fills, consumption, drains).
 * No message polling. Multi-asset mode draws one line per unit.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  Bar,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
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

type NamedUnit = { name: string };

interface FuelLevelChartProps {
  className?: string;
  transactions?: FuelTransaction[];
  vehicles?: NamedUnit[];
  vehicleFuelLevels?: Map<string, number>;
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  fromDate?: string;
  toDate?: string;
  unitLabel?: string;
  /** Taller chart + brush (report Fuel Graph). */
  dense?: boolean;
  /** One line per asset (All assets). */
  multiUnit?: boolean;
  /** Hide internal asset picker when parent already has one. */
  hideUnitSelect?: boolean;
}

interface ChartDataPoint {
  id: string;
  timestamp: number;
  dateLabel: string;
  timeLabel: string;
  fuelLevel: number | null;
  eventType: 'level' | 'refill' | 'drain' | 'consumption';
  vehicleName: string;
  location: string;
  refillAmount?: number;
  drainAmount?: number;
  fuelUsed?: number;
  mainTankLevel: number | null;
  reserveTankLevel: number | null;
  eventTank?: 'main' | 'reserve' | 'unknown';
  [key: string]: string | number | null | undefined;
}

const MULTI_COLORS = [
  '#2563eb',
  '#16a34a',
  '#ea580c',
  '#7c3aed',
  '#0891b2',
  '#dc2626',
  '#ca8a04',
  '#0d9488',
];

function unitKey(name: string): string {
  return `u_${name.replace(/[^\w]+/g, '_').slice(0, 48)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function FuelDot(props: any) {
  const { cx, cy, payload } = props as { cx?: number; cy?: number; payload?: ChartDataPoint };
  if (cx == null || cy == null || !payload) return <g />;

  if (payload.eventType === 'refill') {
    return (
      <circle cx={cx} cy={cy} r={5} fill="#22c55e" stroke="#fff" strokeWidth={1.5} />
    );
  }
  if (payload.eventType === 'drain') {
    return (
      <circle cx={cx} cy={cy} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1.5} />
    );
  }
  if (payload.eventType === 'consumption' && (payload.fuelUsed ?? 0) > 0) {
    return (
      <circle cx={cx} cy={cy} r={3} fill="hsl(25, 95%, 53%)" stroke="#fff" strokeWidth={1.2} />
    );
  }
  return <g />;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartDataPoint; name?: string; value?: number; color?: string; dataKey?: string }>;
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 shadow-md text-xs min-w-[180px]">
      <p className="font-semibold text-foreground mb-1">
        {data.dateLabel} · {data.timeLabel}
      </p>
      <p className="text-muted-foreground">{data.vehicleName}</p>
      {payload
        .filter((p) => typeof p.value === 'number' && p.dataKey !== 'fuelUsed')
        .slice(0, 6)
        .map((p) => (
          <p key={String(p.dataKey)} className="mt-1 font-semibold" style={{ color: p.color || '#2563eb' }}>
            {p.name}: {Number(p.value).toLocaleString(undefined, { maximumFractionDigits: 1 })} L
          </p>
        ))}
      {data.eventType === 'refill' && data.refillAmount != null && (
        <p className="mt-1 text-green-600 font-medium">+{data.refillAmount.toFixed(1)} L filled</p>
      )}
      {data.eventType === 'drain' && data.drainAmount != null && (
        <p className="mt-1 text-red-600 font-medium">-{Math.abs(data.drainAmount).toFixed(1)} L lost</p>
      )}
      {data.eventType === 'consumption' && data.fuelUsed != null && data.fuelUsed > 0 && (
        <p className="mt-1 text-amber-700 font-medium">-{data.fuelUsed.toFixed(2)} L consumed</p>
      )}
      {data.location && data.location !== 'Unknown' && (
        <p className="mt-1 text-muted-foreground truncate max-w-[220px]">{data.location}</p>
      )}
    </div>
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
  dense = false,
  multiUnit = false,
  hideUnitSelect = false,
}: FuelLevelChartProps) {
  const unitNames = useMemo(() => {
    const names = new Set<string>();
    if (transactions) for (const tx of transactions) if (tx.unitName) names.add(tx.unitName);
    if (vehicles) for (const v of vehicles) if (v.name) names.add(v.name);
    return Array.from(names).sort();
  }, [transactions, vehicles]);

  const [selectedVehicle, setSelectedVehicle] = useState<string>('');

  useEffect(() => {
    if (multiUnit) return;
    if (!unitNames.length) {
      setSelectedVehicle('');
      return;
    }
    setSelectedVehicle((prev) => (prev && unitNames.includes(prev) ? prev : unitNames[0]));
  }, [unitNames, multiUnit]);

  const filteredTransactions = useMemo(() => {
    if (!transactions?.length) return [];
    if (multiUnit) return transactions;
    if (!selectedVehicle) return [];
    return transactions.filter((tx) => tx.unitName === selectedVehicle);
  }, [transactions, selectedVehicle, multiUnit]);

  const days = useMemo(() => {
    if (!fromDate || !toDate) return 14;
    const from = new Date(fromDate).getTime();
    const to = new Date(toDate).getTime();
    return Math.max(1, Math.round((to - from) / (1000 * 60 * 60 * 24)));
  }, [fromDate, toDate]);

  const { chartData, refillCount, drainCount, consumedTotal, hasReserve, multiKeys } = useMemo(() => {
    if (!filteredTransactions.length) {
      return {
        chartData: [] as ChartDataPoint[],
        refillCount: 0,
        drainCount: 0,
        consumedTotal: 0,
        hasReserve: false,
        multiKeys: [] as Array<{ key: string; name: string; color: string }>,
      };
    }

    const sorted = [...filteredTransactions].sort((a, b) => a.timestamp - b.timestamp);
    let refills = 0;
    let drains = 0;
    let consumedL = 0;
    let hasReserveData = false;

    // --- Multi-asset: one column per unit (GeneratorFuelLevelChart pattern) ---
    if (multiUnit) {
      const namesWithLevel = new Set<string>();
      for (const tx of sorted) {
        if (tx.mainTankLevel != null || tx.reserveTankLevel != null) namesWithLevel.add(tx.unitName);
      }
      const keys = [...namesWithLevel].sort().map((name, i) => ({
        key: unitKey(name),
        name,
        color: MULTI_COLORS[i % MULTI_COLORS.length],
      }));

      const byTs = new Map<number, ChartDataPoint>();
      for (const tx of sorted) {
        const main = tx.mainTankLevel ?? null;
        const reserve = tx.reserveTankLevel ?? null;
        if (main == null && reserve == null && !(tx.filled > 0) && !(tx.suddenFuelDrop > 0) && !(tx.fuelUsed > 0)) {
          continue;
        }

        const filled = tx.filled || 0;
        const suddenDrop = tx.suddenFuelDrop || 0;
        const fuelChange = (tx.finalLevel ?? 0) - (tx.initialLevel ?? 0);
        let eventType: ChartDataPoint['eventType'] = 'level';
        let refillAmount: number | undefined;
        let drainAmount: number | undefined;
        let fuelUsed: number | undefined;

        if (filled > 0.5 || (tx.section === 'filling' && filled > 0)) {
          eventType = 'refill';
          refillAmount = filled || Math.abs(fuelChange);
          refills += 1;
        } else if (suddenDrop > 0.5 || tx.section === 'theft') {
          eventType = 'drain';
          drainAmount = suddenDrop || Math.abs(fuelChange);
          drains += 1;
        } else if (fuelChange < -0.05 || (tx.fuelUsed ?? 0) > 0 || tx.section === 'consumption') {
          eventType = 'consumption';
          fuelUsed = tx.fuelUsed > 0 ? tx.fuelUsed : Math.abs(fuelChange);
          consumedL += fuelUsed;
        }

        if (reserve != null) hasReserveData = true;
        const ts = tx.timestamp * 1000;
        const txDate = new Date(ts);
        let point = byTs.get(ts);
        if (!point) {
          point = {
            id: `t-${ts}`,
            timestamp: ts,
            dateLabel: format(txDate, days > 14 ? 'MMM d' : 'MMM d HH:mm'),
            timeLabel: format(txDate, 'HH:mm'),
            fuelLevel: null,
            eventType: 'level',
            vehicleName: 'Fleet',
            location: '',
            mainTankLevel: null,
            reserveTankLevel: null,
          };
          byTs.set(ts, point);
        }

        const k = unitKey(tx.unitName);
        const level =
          main == null && reserve == null ? undefined : (main ?? 0) + (reserve ?? 0);
        if (level != null) point[k] = level;

        if (eventType === 'refill' || eventType === 'drain') {
          point.eventType = eventType;
          point.refillAmount = refillAmount;
          point.drainAmount = drainAmount;
          point.vehicleName = tx.unitName;
          point.location = tx.location || point.location;
        }
        if (fuelUsed != null) {
          point.fuelUsed = (Number(point.fuelUsed) || 0) + fuelUsed;
          if (point.eventType === 'level') {
            point.eventType = 'consumption';
            point.vehicleName = tx.unitName;
          }
        }
      }

      return {
        chartData: Array.from(byTs.values()).sort((a, b) => a.timestamp - b.timestamp),
        refillCount: refills,
        drainCount: drains,
        consumedTotal: consumedL,
        hasReserve: hasReserveData,
        multiKeys: keys,
      };
    }

    // --- Single asset (MAMSv2) ---
    const dataPoints: ChartDataPoint[] = [];
    for (const tx of sorted) {
      // Do NOT fall back to finalLevel — consumption rows often have 0 and would
      // collapse the line (MAMSv2 comment). Use enriched main/reserve only.
      const mainLevel = tx.mainTankLevel ?? null;
      const reserveLevel = tx.reserveTankLevel ?? null;
      if (reserveLevel != null) hasReserveData = true;

      const fuelChange = (tx.finalLevel ?? 0) - (tx.initialLevel ?? 0);
      const filled = tx.filled || 0;
      const suddenDrop = tx.suddenFuelDrop || 0;

      let eventType: ChartDataPoint['eventType'] = 'level';
      let refillAmount: number | undefined;
      let drainAmount: number | undefined;
      let fuelUsed: number | undefined;

      if (filled > 0.5) {
        eventType = 'refill';
        refillAmount = filled;
        refills += 1;
      } else if (suddenDrop > 0) {
        eventType = 'drain';
        drainAmount = suddenDrop;
        drains += 1;
      } else if (fuelChange < 0 || (tx.fuelUsed ?? 0) > 0 || tx.section === 'consumption') {
        eventType = 'consumption';
        fuelUsed = tx.fuelUsed > 0 ? tx.fuelUsed : Math.abs(fuelChange);
        consumedL += fuelUsed;
      }

      const combined =
        mainLevel == null && reserveLevel == null
          ? null
          : (mainLevel ?? 0) + (reserveLevel ?? 0);

      const txDate = new Date(tx.timestamp * 1000);
      dataPoints.push({
        id: tx.id,
        timestamp: tx.timestamp * 1000,
        dateLabel: format(txDate, days > 30 ? 'MMM d, yy' : days > 14 ? 'MMM d' : 'MMM d HH:mm'),
        timeLabel: format(txDate, 'HH:mm'),
        fuelLevel: combined,
        eventType,
        vehicleName: tx.unitName,
        location: tx.location || 'Unknown',
        refillAmount,
        drainAmount,
        fuelUsed,
        mainTankLevel: mainLevel,
        reserveTankLevel: reserveLevel,
        eventTank: tx.tank,
      });
    }

    return {
      chartData: dataPoints,
      refillCount: refills,
      drainCount: drains,
      consumedTotal: consumedL,
      hasReserve: hasReserveData,
      multiKeys: [] as Array<{ key: string; name: string; color: string }>,
    };
  }, [filteredTransactions, multiUnit, days]);

  const liveVolume = useMemo(() => {
    if (!vehicleFuelLevels?.size) return null;
    if (multiUnit) {
      let sum = 0;
      for (const name of unitNames) {
        const v = vehicleFuelLevels.get(name);
        if (v != null) sum += v;
      }
      return sum > 0 ? sum : null;
    }
    const v = selectedVehicle ? vehicleFuelLevels.get(selectedVehicle) : null;
    return v != null && v > 0 ? v : null;
  }, [vehicleFuelLevels, selectedVehicle, multiUnit, unitNames]);

  if (isLoading) {
    return (
      <div className={`fleet-card ${className || ''}`}>
        <div className="flex items-center gap-2 mb-4">
          <Droplets className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Fuel level over time</h3>
        </div>
        <div className="h-[320px] flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading fuel data…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`fleet-card ${className || ''}`}>
        <div className="flex items-center gap-2 mb-4">
          <Droplets className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Fuel level over time</h3>
        </div>
        <div className="h-[320px] flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <AlertCircle className="w-10 h-10 mx-auto text-destructive opacity-60 mb-2" />
            <p className="font-medium">Failed to load fuel data</p>
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

  const latest =
    liveVolume ??
    [...chartData]
      .reverse()
      .map((d) => d.mainTankLevel ?? d.fuelLevel)
      .find((v) => v != null && v > 0) ??
    null;

  return (
    <div className={`fleet-card ${className || ''}`}>
      <div className="flex flex-col gap-3 mb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground">Fuel level over time</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Filled · consumed · lost · {multiUnit ? 'all assets' : 'selected asset'}
            {fromDate && toDate ? ` · ${fromDate} → ${toDate}` : ''}
            {chartData.length ? ` · ${chartData.length} points` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {latest != null && (
            <div>
              <span className="text-muted-foreground">Level </span>
              <span className="font-semibold text-blue-600">
                {latest.toLocaleString(undefined, { maximumFractionDigits: 1 })} L
              </span>
            </div>
          )}
          <span className="text-green-700 font-medium">{refillCount} fills</span>
          <span className="text-amber-700 font-medium">{consumedTotal.toFixed(0)} L used</span>
          {drainCount > 0 && (
            <span className="text-red-600 font-medium">{drainCount} drains</span>
          )}
          {unitNames.length > 1 && !hideUnitSelect && !multiUnit && (
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

      <div
        className={
          dense
            ? 'h-[420px] min-h-[320px] bg-white rounded-md border border-border/60'
            : 'h-[360px] min-h-[280px] bg-white rounded-md border border-border/60'
        }
      >
        {!chartData.length ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center px-4">
              <Droplets className="w-10 h-10 mx-auto opacity-30 mb-2" />
              <p className="font-medium">No fuel events for this view</p>
              <p className="text-sm max-w-md mx-auto mt-1">
                Need fillings, consumption, or sudden drops with levels in the selected period.
              </p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 12, right: 28, left: 4, bottom: dense ? 8 : 24 }}>
              <defs>
                <linearGradient id="mainTankGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="dateLabel"
                stroke="#9ca3af"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                angle={-35}
                textAnchor="end"
                height={52}
                interval={Math.max(0, Math.floor(chartData.length / 12) - 1)}
              />
              <YAxis
                yAxisId="fuel"
                stroke="#9ca3af"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={48}
                label={{
                  value: 'Fuel (L)',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fontSize: 10, fill: '#6b7280' },
                }}
              />
              <YAxis
                yAxisId="consumed"
                orientation="right"
                stroke="hsl(25, 95%, 53%)"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                width={40}
                label={{
                  value: 'Used (L)',
                  angle: 90,
                  position: 'insideRight',
                  style: { fontSize: 10, fill: 'hsl(25, 95%, 53%)' },
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                yAxisId="consumed"
                dataKey="fuelUsed"
                fill="hsl(25, 95%, 53%)"
                name="Consumed"
                maxBarSize={10}
                isAnimationActive={false}
              />
              {multiKeys.length ? (
                multiKeys.map((k) => (
                  <Line
                    key={k.key}
                    yAxisId="fuel"
                    type="monotone"
                    dataKey={k.key}
                    name={k.name}
                    stroke={k.color}
                    strokeWidth={1.75}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))
              ) : (
                <>
                  <Area
                    yAxisId="fuel"
                    type="monotone"
                    dataKey="mainTankLevel"
                    fill="url(#mainTankGradient)"
                    stroke="none"
                    connectNulls
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="fuel"
                    type="monotone"
                    dataKey="mainTankLevel"
                    name="Main tank"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={FuelDot}
                    connectNulls
                    isAnimationActive={false}
                    activeDot={{ r: 5, stroke: '#3b82f6', strokeWidth: 2, fill: '#fff' }}
                  />
                  {hasReserve && (
                    <Line
                      yAxisId="fuel"
                      type="monotone"
                      dataKey="reserveTankLevel"
                      name="Reserve tank"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  )}
                </>
              )}
              {dense && chartData.length > 24 && (
                <Brush dataKey="dateLabel" height={26} stroke="#3b82f6" tickFormatter={() => ''} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="flex items-center justify-center gap-5 mt-3 text-xs text-muted-foreground flex-wrap">
        {multiKeys.length
          ? multiKeys.slice(0, 10).map((k) => (
              <span key={k.key} className="inline-flex items-center gap-1.5">
                <span className="inline-block w-5 h-0.5 rounded" style={{ background: k.color }} />
                {k.name}
              </span>
            ))
          : (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-5 h-0.5 rounded bg-blue-500" />
                Main tank
              </span>
              {hasReserve && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-5 h-0.5 rounded bg-amber-500" />
                  Reserve
                </span>
              )}
            </>
          )}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
          Filled
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-500" />
          Consumed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
          Lost / drain
        </span>
      </div>
    </div>
  );
}
