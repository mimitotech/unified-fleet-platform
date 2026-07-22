import { useMemo } from 'react';
import { Download, Search, Radio, Truck, ChevronDown, ChevronRight, Route, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { getFuelRangeForPreset, type FuelQuickRange } from './utils';

interface FuelTableHeaderProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  fromDate: string;
  toDate: string;
  todayStr: string;
  onFromDateChange: (value: string) => void;
  onToDateChange: (value: string) => void;
  hasMultipleVehicles: boolean;
  totalUnits: number;
  unitLabelPlural: string;
  showFuelPerTrip: boolean;
  allExpanded: boolean;
  onToggleAllVehicles: (expand: boolean) => void;
  onExport: () => void;
  onOpenFuelPerTrip: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  isBackgroundRefreshing?: boolean;
}

const QUICK_RANGES: { id: FuelQuickRange; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7', label: '7d' },
  { id: '14', label: '14d' },
  { id: '30', label: '30d' },
];

export function FuelTableHeader({
  searchTerm,
  onSearchChange,
  fromDate,
  toDate,
  todayStr,
  onFromDateChange,
  onToDateChange,
  hasMultipleVehicles,
  totalUnits,
  unitLabelPlural,
  showFuelPerTrip,
  allExpanded,
  onToggleAllVehicles,
  onExport,
  onOpenFuelPerTrip,
  onRefresh,
  isRefreshing,
  isBackgroundRefreshing,
}: FuelTableHeaderProps) {
  const activeQuick = useMemo(() => {
    for (const q of QUICK_RANGES) {
      const r = getFuelRangeForPreset(q.id);
      if (fromDate === r.fromDate && toDate === r.toDate) return q.id;
    }
    return null;
  }, [fromDate, toDate]);

  const applyQuick = (id: FuelQuickRange) => {
    const r = getFuelRangeForPreset(id);
    onFromDateChange(r.fromDate);
    onToDateChange(r.toDate);
  };

  const isLiveToday = fromDate === todayStr && toDate === todayStr;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2 min-w-0 mr-1">
        <h3 className="font-semibold text-sm whitespace-nowrap">Fuel Usage</h3>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Radio className={cn('w-3 h-3', isLiveToday ? 'text-emerald-500' : 'text-muted-foreground')} />
          Sensor
        </span>
        {isLiveToday && (
          <span className="inline-flex items-center rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 text-[10px] font-medium">
            Live today
          </span>
        )}
        {hasMultipleVehicles && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground border-l border-border pl-2">
            <Truck className="w-3 h-3" />
            {totalUnits} {unitLabelPlural}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {QUICK_RANGES.map((q) => (
          <Button
            key={q.id}
            type="button"
            size="sm"
            variant={activeQuick === q.id ? 'default' : 'outline'}
            className={cn('h-7 px-2 text-[11px]', activeQuick === q.id && 'shadow-sm')}
            onClick={() => applyQuick(q.id)}
          >
            {q.label}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <Label htmlFor="fuel-from-date" className="text-[10px] font-medium text-muted-foreground shrink-0">
          From
        </Label>
        <Input
          id="fuel-from-date"
          type="date"
          className="h-7 w-[132px] text-xs"
          value={fromDate}
          max={toDate}
          onChange={(e) => onFromDateChange(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <Label htmlFor="fuel-to-date" className="text-[10px] font-medium text-muted-foreground shrink-0">
          To
        </Label>
        <Input
          id="fuel-to-date"
          type="date"
          className="h-7 w-[132px] text-xs"
          value={toDate}
          min={fromDate}
          max={todayStr}
          onChange={(e) => onToDateChange(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 ml-auto">
        {hasMultipleVehicles && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 h-7 px-2 text-[11px]"
            onClick={() => onToggleAllVehicles(!allExpanded)}
          >
            {allExpanded ? (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                Collapse
              </>
            ) : (
              <>
                <ChevronRight className="w-3.5 h-3.5" />
                Expand
              </>
            )}
          </Button>
        )}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search…"
            className="pl-7 h-7 w-[160px] text-xs"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        {showFuelPerTrip && (
          <Button variant="outline" size="sm" className="gap-1 h-7 px-2 text-[11px]" onClick={onOpenFuelPerTrip}>
            <Route className="w-3.5 h-3.5" />
            Per trip
          </Button>
        )}
        {isBackgroundRefreshing && !isRefreshing && (
          <span className="text-[11px] text-muted-foreground animate-pulse">Updating…</span>
        )}
        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1 h-7 px-2 text-[11px]"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh report data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        )}
        <Button variant="outline" size="sm" className="gap-1 h-7 px-2 text-[11px]" onClick={onExport}>
          <Download className="w-3.5 h-3.5" />
          CSV
        </Button>
      </div>
    </div>
  );
}
