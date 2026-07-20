import { useMemo, useState } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Brush,
  ReferenceLine,
} from 'recharts';
import { Droplets, Loader2, Calendar, ZoomIn, MapPin, Fuel, AlertCircle, RefreshCw, Truck, Flame } from 'lucide-react';
import { format } from 'date-fns';
import type { FuelTransaction, Vehicle } from '@/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Inline SVG Jerican Icon — uses currentColor so CSS color classes work (Fix #5)
const JericanIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-label="Jerican"
  >
    <path d="M8 2h6v3h-6zM7 5h8a2 2 0 012 2v13a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2zm5 7a2 2 0 10-4 0c0 2 2 4 2 4s2-2 2-4z" />
    <path d="M16 6h2v5h-2z" opacity="0.6" />
  </svg>
);

interface FuelLevelChartProps {
  className?: string;
  /** Transactions from parent (avoids duplicate API call — Fix #2) */
  transactions?: FuelTransaction[];
  /** Full vehicle list — used to populate the vehicle selector even for vehicles
   *  that have no transactions in the current date range (live-data-only vehicles). */
  vehicles?: Vehicle[];
  /**
   * Live fuel levels from Wialon position data (vehicle name → total litres).
   * Same source as the Monitoring page and the Fuel Usage Table's Total Level
   * column. When provided, the header Main/Reserve stats use this value so that
   * all three surfaces (Monitoring, Table, Chart) are consistent.
   */
  vehicleFuelLevels?: Map<string, number>;
  /** Loading state from parent */
  isLoading?: boolean;
  /** Error from parent data fetch */
  error?: Error | null;
  /** Callback to retry data fetch */
  onRetry?: () => void;
  /** Shared date filter — from parent (unified with Fuel Usage table) */
  fromDate?: string;
  /** Shared date filter — from parent (unified with Fuel Usage table) */
  toDate?: string;
}

// Location is now truncated via CSS text-overflow instead of char count (Fix #19)

interface ChartDataPoint {
  id: string;
  timestamp: number;
  dateLabel: string;
  timeLabel: string;
  fuelLevel: number | null;
  fuelChange: number;
  eventType: 'level' | 'refill' | 'drain' | 'consumption';
  vehicleName: string;
  location: string;
  refillAmount?: number;
  drainAmount?: number;
  /** Litres consumed on this event — plotted as orange bars on the right axis. */
  fuelUsed?: number;
  // Tank information — null when Wialon has not yet emitted a level snapshot
  // (consumption events don't carry level data; only fillings/thefts do).
  mainTankLevel: number | null;
  reserveTankLevel: number | null;
  eventTank?: 'main' | 'reserve' | 'unknown';
}


// Extracted dot renderer — stable reference, no re-creation per render (Fix #4)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function FuelDot(props: any) {
  const { cx, cy, payload } = props as { cx?: number; cy?: number; payload?: ChartDataPoint };
  if (cx == null || cy == null || !payload) return null;

  if (payload.eventType === 'refill') {
    return (
      <svg
        key={payload.id}
        x={cx - 8}
        y={cy - 8}
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
      >
        <rect x="2" y="6" width="12" height="12" rx="2" fill="hsl(142, 76%, 36%)" stroke="white" strokeWidth="1.5" />
        <path d="M6 6V2" stroke="white" strokeWidth="1.5" />
        <path d="M10 6V2" stroke="white" strokeWidth="1.5" />
        <path d="M14 10h4" stroke="white" strokeWidth="1.5" />
        <path d="M18 10v8" stroke="white" strokeWidth="1.5" />
        <path d="M18 18h2" stroke="white" strokeWidth="1.5" />
      </svg>
    );
  }

  if (payload.eventType === 'drain') {
    return (
      <svg
        key={payload.id}
        x={cx - 8}
        y={cy - 8}
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
      >
        <path d="M3 10h12v10H3z" fill="hsl(0, 84%, 60%)" stroke="white" strokeWidth="1.5" />
        <path d="M5 10V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v4" stroke="white" strokeWidth="1.5" />
        <circle cx="10.5" cy="15" r="1.5" fill="white" stroke="none" />
        <path d="M15 8h2v4h-2" stroke="white" strokeWidth="1.5" fill="hsl(0, 84%, 60%)" />
      </svg>
    );
  }

  if (payload.eventType === 'consumption') {
    // Orange dot on the main-tank line to mark a consumption event;
    // the corresponding fuel-used volume is rendered as an orange bar below.
    return (
      <circle
        key={payload.id}
        cx={cx}
        cy={cy}
        r={3}
        fill="hsl(25, 95%, 53%)"
        stroke="white"
        strokeWidth={1.5}
      />
    );
  }

  if (payload.eventType === 'level') {
    return (
      <circle
        key={payload.id}
        cx={cx}
        cy={cy}
        r={3}
        fill="hsl(217, 91%, 60%)"
        stroke="white"
        strokeWidth={1.5}
      />
    );
  }

  return null;
}

interface TooltipPayload {
  payload: ChartDataPoint;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
}

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  const isRefill = data.eventType === 'refill';
  const isDrain = data.eventType === 'drain';
  const isConsumption = data.eventType === 'consumption' && (data.fuelUsed ?? 0) > 0;

  // Determine which tank had the event
  const eventOnMain = data.eventTank === 'main';
  const eventOnReserve = data.eventTank === 'reserve';
  const hasEvent = isRefill || isDrain || isConsumption;

  return (
    <div className="bg-card border border-border rounded-lg shadow-lg p-3 min-w-[240px]">
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <span className="font-semibold text-sm">{data.dateLabel}</span>
        <span className="text-muted-foreground text-sm">{data.timeLabel}</span>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Vehicle:</span>
          <span className="font-medium">{data.vehicleName}</span>
        </div>

        {/* Main Tank Section */}
        <div className={`rounded-md p-2 border ${eventOnMain && hasEvent ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-950/20' : 'border-transparent bg-muted/30'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium flex items-center gap-1">
              <Droplets className="w-3.5 h-3.5 text-blue-500" />
              Main Tank
            </span>
            <span className={`font-semibold ${eventOnMain && hasEvent ? 'text-blue-600' : 'text-blue-600/70'}`}>
              {data.mainTankLevel != null ? `${data.mainTankLevel.toFixed(1)} L` : '—'}
            </span>
          </div>

          {/* Show event only if it happened on this tank */}
          {eventOnMain && isRefill && data.refillAmount && (
            <div className="flex items-center justify-between text-xs pt-1 border-t border-blue-200 dark:border-blue-800 mt-1">
              <span className="text-muted-foreground flex items-center gap-1">
                <Fuel className="w-3 h-3 text-green-500" />
                Refill:
              </span>
              <span className="font-medium text-green-600">+{data.refillAmount.toFixed(1)} L</span>
            </div>
          )}

          {eventOnMain && isDrain && data.drainAmount && (
            <div className="flex items-center justify-between text-xs pt-1 border-t border-blue-200 dark:border-blue-800 mt-1">
              <span className="text-muted-foreground flex items-center gap-1">
                <JericanIcon className="w-3 h-3 text-red-500" />
                Drain:
              </span>
              <span className="font-medium text-red-600">-{Math.abs(data.drainAmount).toFixed(1)} L</span>
            </div>
          )}

          {eventOnMain && isConsumption && data.fuelUsed != null && (
            <div className="flex items-center justify-between text-xs pt-1 border-t border-blue-200 dark:border-blue-800 mt-1">
              <span className="text-muted-foreground flex items-center gap-1">
                <Flame className="w-3 h-3" style={{ color: 'hsl(25, 95%, 53%)' }} />
                Consumed:
              </span>
              <span className="font-medium" style={{ color: 'hsl(25, 95%, 53%)' }}>
                -{data.fuelUsed.toFixed(1)} L
              </span>
            </div>
          )}
        </div>

        {/* Reserve Tank Section — only when this point has a reserve reading */}
        {data.reserveTankLevel != null && (
          <div className={`rounded-md p-2 border ${eventOnReserve && hasEvent ? 'border-orange-400 bg-orange-50/50 dark:bg-orange-950/20' : 'border-transparent bg-muted/30'}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium flex items-center gap-1">
                <Droplets className="w-3.5 h-3.5 text-orange-500" />
                Reserve Tank
              </span>
              <span className={`font-semibold ${eventOnReserve && hasEvent ? 'text-orange-600' : 'text-orange-600/70'}`}>
                {data.reserveTankLevel.toFixed(1)} L
              </span>
            </div>

            {/* Show event only if it happened on this tank */}
            {eventOnReserve && isRefill && data.refillAmount && (
              <div className="flex items-center justify-between text-xs pt-1 border-t border-orange-200 dark:border-orange-800 mt-1">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Fuel className="w-3 h-3 text-green-500" />
                  Refill:
                </span>
                <span className="font-medium text-green-600">+{data.refillAmount.toFixed(1)} L</span>
              </div>
            )}

            {eventOnReserve && isDrain && data.drainAmount && (
              <div className="flex items-center justify-between text-xs pt-1 border-t border-orange-200 dark:border-orange-800 mt-1">
                <span className="text-muted-foreground flex items-center gap-1">
                  <JericanIcon className="w-3 h-3 text-red-500" />
                  Drain:
                </span>
                <span className="font-medium text-red-600">-{Math.abs(data.drainAmount).toFixed(1)} L</span>
              </div>
            )}
          </div>
        )}

        {/* Total Fuel Level — only when we have a level reading */}
        {data.fuelLevel != null && (
          <div className="flex items-center justify-between pt-1 border-t border-border">
            <span className="text-muted-foreground text-xs">Total Fuel:</span>
            <span className="font-medium text-sm">{data.fuelLevel.toFixed(1)} L</span>
          </div>
        )}

        {data.location && data.location !== 'Unknown' && (
          <div className="pt-2 border-t border-border">
            <div className="flex items-start gap-1">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <span className="text-xs text-muted-foreground truncate max-w-[200px] block">
                {data.location}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

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
}: FuelLevelChartProps) {
  const [selectedVehicle, setSelectedVehicle] = useState<string>('all');

  // Compute day span from the shared date filter for label formatting
  const days = useMemo(() => {
    if (!fromDate || !toDate) return 14;
    const from = new Date(fromDate).getTime();
    const to = new Date(toDate).getTime();
    return Math.max(1, Math.round((to - from) / (1000 * 60 * 60 * 24)));
  }, [fromDate, toDate]);

  // Unique vehicle names for selector — merges transaction-derived names with the
  // full vehicles prop so that vehicles with live data but no transactions in the
  // current period still appear in the dropdown (fixes 4-vs-5 vehicle discrepancy).
  const vehicleNames = useMemo(() => {
    const names = new Set<string>();
    if (transactions) {
      for (const tx of transactions) names.add(tx.unitName);
    }
    if (vehicles) {
      for (const v of vehicles) names.add(v.name);
    }
    return Array.from(names).sort();
  }, [transactions, vehicles]);

  // Vehicle filtering — date filtering is already done upstream in Fuel.tsx
  // (filteredFuelTransactions useMemo), so only the vehicle selector is applied here.
  const filteredTransactions = useMemo(() => {
    if (!transactions || transactions.length === 0) return [];
    if (selectedVehicle === 'all') return transactions;
    return transactions.filter((tx) => tx.unitName === selectedVehicle);
  }, [transactions, selectedVehicle]);

  const { chartData, refillCount, drainCount, consumptionTotal, currentMainLevel, currentReserveLevel, hasReserveData } = useMemo(() => {
    if (filteredTransactions.length === 0) {
      return { chartData: [], refillCount: 0, drainCount: 0, consumptionTotal: 0, currentMainLevel: 0, currentReserveLevel: 0, hasReserveData: false };
    }

    let refills = 0;
    let drains = 0;
    let consumedL = 0;

    const sorted = [...filteredTransactions].sort((a, b) => a.timestamp - b.timestamp);
    const dataPoints: ChartDataPoint[] = [];

    // Track the most-recent main/reserve level per vehicle so that the header
    // totals sum across ALL selected vehicles rather than showing only the last
    // chronological transaction (which belongs to just one vehicle).
    const latestMainPerVehicle = new Map<string, number>();
    const latestReservePerVehicle = new Map<string, number>();

    // Process each transaction individually — no grouping by timestamp.
    // Wialon only emits tank-level snapshots on filling/theft events; consumption
    // rows arrive with initial_level = final_level = 0. The edge function's
    // enrichTransactionsWithTankLevels carries the last known level forward, so
    // tx.mainTankLevel / tx.reserveTankLevel are the correct source. We do NOT
    // fall back to tx.finalLevel — for consumption rows that value is 0 and
    // would pull the chart line down to zero between refills.
    for (const tx of sorted) {
      const txDate = new Date(tx.timestamp * 1000);

      const mainLevel = tx.mainTankLevel ?? null;
      const reserveLevel = tx.reserveTankLevel ?? null;

      const fuelChange = (tx.finalLevel ?? 0) - (tx.initialLevel ?? 0);
      const filled = tx.filled || 0;
      const suddenDrop = tx.suddenFuelDrop || 0;

      let eventType: ChartDataPoint['eventType'] = 'level';
      let refillAmount: number | undefined;
      let drainAmount: number | undefined;
      let fuelUsed: number | undefined;

      // Classification:
      //   refill      — filling event (> 5 L added)
      //   drain       — Wialon theft / sudden drop only (suddenFuelDrop > 0)
      //   consumption — any other negative level change (normal trip consumption)
      //   level       — neutral snapshot
      if (filled > 5) {
        eventType = 'refill';
        refillAmount = filled;
        refills++;
      } else if (suddenDrop > 0) {
        eventType = 'drain';
        drainAmount = suddenDrop;
        drains++;
      } else if (fuelChange < 0 || (tx.fuelUsed ?? 0) > 0) {
        eventType = 'consumption';
      }

      // Per-event fuel-used volume — prefer Wialon's fuelUsed (from the
      // consumption report section) and fall back to the level delta. Stored
      // on the datapoint so the orange bar series can plot it on the right axis.
      if (eventType === 'consumption') {
        const used = tx.fuelUsed > 0 ? tx.fuelUsed : Math.abs(fuelChange);
        fuelUsed = used;
        consumedL += used;
      }

      const combinedLevel =
        mainLevel == null && reserveLevel == null
          ? null
          : (mainLevel ?? 0) + (reserveLevel ?? 0);

      dataPoints.push({
        id: tx.id,
        timestamp: tx.timestamp * 1000,
        dateLabel: format(txDate, days > 30 ? 'MMM d, yy' : 'MMM d'),
        timeLabel: format(txDate, 'HH:mm'),
        fuelLevel: combinedLevel,
        fuelChange,
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

      // Keep most-recent non-null snapshot per vehicle (sorted asc so later = newer).
      if (mainLevel != null) latestMainPerVehicle.set(tx.unitName, mainLevel);
      if (reserveLevel != null) latestReservePerVehicle.set(tx.unitName, reserveLevel);
    }

    // Sum the most-recent level for each vehicle that has at least one snapshot.
    const currentMainLevel = Array.from(latestMainPerVehicle.values()).reduce((s, v) => s + v, 0);
    const currentReserveLevel = Array.from(latestReservePerVehicle.values()).reduce((s, v) => s + v, 0);
    const hasReserveData = latestReservePerVehicle.size > 0;

    return {
      chartData: dataPoints,
      refillCount: refills,
      drainCount: drains,
      consumptionTotal: consumedL,
      currentMainLevel,
      currentReserveLevel,
      hasReserveData,
    };
  }, [filteredTransactions, days]);

  // Override the transaction-derived header totals with live Wialon position data
  // (same source as the Monitoring page and the Fuel Usage Table's Total Level).
  // Mirror the table's formula exactly:
  //   liveTotal  = vehicleFuelLevels value (total litres for the vehicle)
  //   headerMain = liveTotal − transactionReserve   (removes reserve portion)
  //   headerReserve = transactionReserve            (reserve stays transaction-based)
  const { headerMainLevel, headerReserveLevel } = useMemo(() => {
    if (!vehicleFuelLevels || vehicleFuelLevels.size === 0) {
      return { headerMainLevel: currentMainLevel, headerReserveLevel: currentReserveLevel };
    }

    if (selectedVehicle !== 'all') {
      // Single vehicle — look up its live total directly
      const liveTotal = vehicleFuelLevels.get(selectedVehicle);
      if (liveTotal === undefined) {
        return { headerMainLevel: currentMainLevel, headerReserveLevel: currentReserveLevel };
      }
      return {
        headerMainLevel: liveTotal - currentReserveLevel,
        headerReserveLevel: currentReserveLevel,
      };
    }

    // All Vehicles — union of vehicles from transactions and the vehicles prop
    const vehicleNames = new Set<string>();
    for (const tx of filteredTransactions) vehicleNames.add(tx.unitName);
    if (vehicles) {
      for (const v of vehicles) {
        if (vehicleFuelLevels.has(v.name)) vehicleNames.add(v.name);
      }
    }

    let liveTotal = 0;
    for (const name of vehicleNames) {
      const level = vehicleFuelLevels.get(name);
      if (level !== undefined) liveTotal += level;
    }

    return {
      headerMainLevel: liveTotal - currentReserveLevel,
      headerReserveLevel: currentReserveLevel,
    };
  }, [vehicleFuelLevels, selectedVehicle, currentMainLevel, currentReserveLevel, filteredTransactions, vehicles]);

  // Average the Main Tank level only (reserve is rarely present) and ignore
  // null points so consumption-only rows don't drag the average toward zero.
  const avgFuelLevel = useMemo(() => {
    const levels = chartData
      .map((d) => d.mainTankLevel)
      .filter((v): v is number => v != null && v > 0);
    if (!levels.length) return null;
    return levels.reduce((s, v) => s + v, 0) / levels.length;
  }, [chartData]);

  // Loading state with skeleton placeholder (Fix #16)
  if (isLoading) {
    return (
      <div className={`fleet-card ${className || ''}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ZoomIn className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Fuel Level Over Time</h3>
          </div>
        </div>
        <div className="h-[350px] flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading fuel data...</span>
        </div>
      </div>
    );
  }

  // Error state — distinct from empty data, with retry button (Fix #6)
  if (error) {
    return (
      <div className={`fleet-card ${className || ''}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ZoomIn className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Fuel Level Over Time</h3>
          </div>
        </div>
        <div className="h-[350px] flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <AlertCircle className="w-10 h-10 mx-auto text-destructive opacity-60 mb-2" />
            <p className="font-medium">Failed to load fuel data</p>
            <p className="text-sm max-w-md mx-auto mt-1">{error.message}</p>
            {onRetry && (
              <button
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



  return (
    <div className={`fleet-card ${className || ''}`}>
      {/* Header — wraps on narrow viewports so stats and selector stay visible */}
      <div className="flex flex-col gap-3 mb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <ZoomIn className="w-5 h-5 text-primary shrink-0" />
          <h3 className="font-semibold truncate">Fuel Level Over Time</h3>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            ({chartData.length} readings)
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <div className="flex items-center gap-1">
              <Droplets className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-muted-foreground">Main:</span>
              <span className="font-medium text-blue-600">{headerMainLevel.toFixed(0)}L</span>
            </div>
            {hasReserveData && (
              <div className="flex items-center gap-1">
                <Droplets className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-muted-foreground">Reserve:</span>
                <span className="font-medium text-orange-600">{headerReserveLevel.toFixed(0)}L</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Fuel className="w-3.5 h-3.5 text-green-500" />
              <span className="text-muted-foreground">Refills:</span>
              <span className="font-medium text-green-600">{refillCount}</span>
            </div>
            <div className="flex items-center gap-1">
              <Flame className="w-3.5 h-3.5" style={{ color: 'hsl(25, 95%, 53%)' }} />
              <span className="text-muted-foreground">Consumed:</span>
              <span className="font-medium" style={{ color: 'hsl(25, 95%, 53%)' }}>{consumptionTotal.toFixed(0)}L</span>
            </div>
            {drainCount > 0 && (
              <div className="flex items-center gap-1">
                <JericanIcon className="w-3.5 h-3.5 text-red-500" />
                <span className="text-muted-foreground">Drains:</span>
                <span className="font-medium text-red-600">{drainCount}</span>
              </div>
            )}
          </div>
          {/* Vehicle selector (Fix #7) */}
          {vehicleNames.length > 1 && (
            <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <Truck className="w-3.5 h-3.5 mr-1.5" />
                <SelectValue placeholder="Vehicle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vehicles</SelectItem>
                {vehicleNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Chart body — empty state when no data, chart otherwise */}
      <div className="h-[400px] min-h-[320px]">
        {!chartData.length ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Droplets className="w-10 h-10 mx-auto opacity-30 mb-2" />
              <p className="font-medium">No fuel data available</p>
              <p className="text-sm max-w-md mx-auto mt-1">
                {selectedVehicle !== 'all'
                  ? 'No transactions recorded for this vehicle in the selected period.'
                  : 'Fuel data will appear once trips are recorded.'}
              </p>
            </div>
          </div>
        ) : (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 30 }}>
            <defs>
              {/* Gradient for Main Tank (Blue) */}
              <linearGradient id="mainTankGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.15} />
                <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.02} />
              </linearGradient>
              {/* Gradient for Reserve Tank (Orange) */}
              <linearGradient id="reserveTankGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.15} />
                <stop offset="95%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.02} />
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
              interval={Math.max(0, Math.floor(chartData.length / 12) - 1)}
            />
            <YAxis
              yAxisId="fuel"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              label={{
                value: 'Fuel Level (L)',
                angle: -90,
                position: 'insideLeft',
                style: {
                  fontSize: 11,
                  fill: 'hsl(var(--muted-foreground))'
                }
              }}
            />
            {/* Right axis: per-event fuel consumed (L). Kept separate from the
                fuel-level axis so that bars stay compact at the bottom of the
                plot regardless of tank capacity. */}
            <YAxis
              yAxisId="consumed"
              orientation="right"
              stroke="hsl(25, 95%, 53%)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              label={{
                value: 'Fuel Used (L)',
                angle: 90,
                position: 'insideRight',
                style: {
                  fontSize: 11,
                  fill: 'hsl(25, 95%, 53%)'
                }
              }}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Average fuel level reference line — only when we have at least
                one Main Tank snapshot to average (otherwise the avg is pinned
                at 0 and the label clutters the chart). */}
            {avgFuelLevel != null && (
              <ReferenceLine
                yAxisId="fuel"
                y={avgFuelLevel}
                stroke="hsl(217, 91%, 60%)"
                strokeDasharray="5 5"
                strokeOpacity={0.5}
                label={{
                  value: `Avg: ${avgFuelLevel.toFixed(0)}L`,
                  position: 'insideTopLeft',
                  fontSize: 10,
                  fill: 'hsl(217, 91%, 60%)'
                }}
              />
            )}

            {/* Fuel consumed per event (Orange bars, right axis) — rendered
                first so the tank-level lines and event markers sit on top. */}
            <Bar
              yAxisId="consumed"
              dataKey="fuelUsed"
              fill="hsl(25, 95%, 53%)"
              name="Fuel Used"
              maxBarSize={12}
              isAnimationActive={false}
            />

            {/* Gradient fills under each line */}
            <Area
              yAxisId="fuel"
              type="monotone"
              dataKey="mainTankLevel"
              fill="url(#mainTankGradient)"
              stroke="none"
              strokeWidth={0}
              name="Main Tank Area"
              style={{ pointerEvents: 'none' }}
              connectNulls={true}
            />
            {hasReserveData && (
              <Area
                yAxisId="fuel"
                type="monotone"
                dataKey="reserveTankLevel"
                fill="url(#reserveTankGradient)"
                stroke="none"
                strokeWidth={0}
                name="Reserve Tank Area"
                style={{ pointerEvents: 'none' }}
                connectNulls={true}
              />
            )}

            {/* Main Tank Line (Blue) */}
            <Line
              yAxisId="fuel"
              type="monotone"
              dataKey="mainTankLevel"
              stroke="hsl(217, 91%, 60%)"
              strokeWidth={2}
              dot={FuelDot}
              activeDot={{
                r: 6,
                stroke: 'hsl(217, 91%, 60%)',
                strokeWidth: 2,
                fill: 'white'
              }}
              name="Main Tank"
              connectNulls={true}
            />

            {/* Reserve Tank Line (Orange) — hidden when fleet has no reserve tanks */}
            {hasReserveData && (
              <Line
                yAxisId="fuel"
                type="monotone"
                dataKey="reserveTankLevel"
                stroke="hsl(38, 92%, 50%)"
                strokeWidth={2}
                dot={FuelDot}
                activeDot={{
                  r: 6,
                  stroke: 'hsl(38, 92%, 50%)',
                  strokeWidth: 2,
                  fill: 'white'
                }}
                name="Reserve Tank"
                connectNulls={true}
              />
            )}

            <Brush
              dataKey="dateLabel"
              height={30}
              stroke="hsl(var(--primary))"
              fill="hsl(var(--muted))"
              tickFormatter={() => ''}
            />
          </ComposedChart>
        </ResponsiveContainer>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4 text-xs flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-blue-500"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 border border-white shadow-sm"></div>
          <span className="text-muted-foreground">Main Tank</span>
        </div>
        {hasReserveData && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5" style={{ background: 'hsl(38, 92%, 50%)' }}></div>
            <div
              className="w-2.5 h-2.5 rounded-full border border-white shadow-sm"
              style={{ background: 'hsl(38, 92%, 50%)' }}
            ></div>
            <span className="text-muted-foreground">Reserve Tank</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Fuel className="w-3.5 h-3.5 text-green-600" />
          <span className="text-muted-foreground">Refill</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-2.5 rounded-sm" style={{ background: 'hsl(25, 95%, 53%)' }}></div>
          <div
            className="w-2.5 h-2.5 rounded-full border border-white shadow-sm"
            style={{ background: 'hsl(25, 95%, 53%)' }}
          ></div>
          <span className="text-muted-foreground">Consumption (L used)</span>
        </div>
        {drainCount > 0 && (
          <div className="flex items-center gap-2">
            <JericanIcon className="w-3.5 h-3.5 text-red-500" />
            <span className="text-muted-foreground">Drain (theft)</span>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center mt-2">
        Drag handles below the chart to zoom into a specific time range.
      </p>
    </div>
  );
}