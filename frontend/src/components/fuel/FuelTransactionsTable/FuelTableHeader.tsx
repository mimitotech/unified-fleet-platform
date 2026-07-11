import React, { useMemo } from 'react';
import { Download, Search, Radio, Truck, ChevronDown, ChevronRight, Calendar, Route, RefreshCw } from 'lucide-react';
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
    <div className="space-y-3 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-semibold">Fuel Usage</h3>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Radio className={cn('w-3 h-3', isLiveToday ? 'text-emerald-500' : 'text-muted-foreground')} />
              <span>FLS Sensor Data</span>
            </div>
            {isLiveToday && (
              <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
                Live · Today
              </span>
            )}
            {hasMultipleVehicles && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground border-l border-border pl-3 ml-1">
                <Truck className="w-3 h-3" />
                <span>
                  {totalUnits} {unitLabelPlural}
                </span>
              </div>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Collapsed rows = period totals for {fromDate} → {toDate} · Expand for event-by-event breakdown
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasMultipleVehicles && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => onToggleAllVehicles(!allExpanded)}
            >
              {allExpanded ? (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  Collapse All
                </>
              ) : (
                <>
                  <ChevronRight className="w-3.5 h-3.5" />
                  Expand All
                </>
              )}
            </Button>
          )}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search transactions..."
              className="pl-8 h-9 w-[200px] text-sm"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          {showFuelPerTrip && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onOpenFuelPerTrip}>
              <Route className="w-4 h-4" />
              Fuel per Trip
            </Button>
          )}
          {isBackgroundRefreshing && !isRefreshing && (
            <span className="text-xs text-muted-foreground animate-pulse">Updating…</span>
          )}
          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Force refresh from Wialon"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Force refresh'}
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onExport}>
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
        <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex items-center gap-1">
          {QUICK_RANGES.map((q) => (
            <Button
              key={q.id}
              type="button"
              size="sm"
              variant={activeQuick === q.id ? 'default' : 'ghost'}
              className={cn(
                'h-7 px-2.5 text-xs',
                activeQuick === q.id && 'shadow-sm',
              )}
              onClick={() => applyQuick(q.id)}
            >
              {q.label}
            </Button>
          ))}
        </div>
        <div className="hidden sm:block h-4 w-px bg-border mx-1" />
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Label htmlFor="from-date" className="text-xs text-muted-foreground">
              From
            </Label>
            <Input
              id="from-date"
              type="date"
              className="h-8 w-[130px] text-xs"
              value={fromDate}
              max={toDate}
              onChange={(e) => onFromDateChange(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1">
            <Label htmlFor="to-date" className="text-xs text-muted-foreground">
              To
            </Label>
            <Input
              id="to-date"
              type="date"
              className="h-8 w-[130px] text-xs"
              value={toDate}
              min={fromDate}
              max={todayStr}
              onChange={(e) => onToDateChange(e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
