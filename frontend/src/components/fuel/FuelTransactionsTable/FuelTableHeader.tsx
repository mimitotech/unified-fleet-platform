import React from 'react';
import { Download, Search, Radio, Truck, ChevronDown, ChevronRight, Calendar, Route, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
}

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
}: FuelTableHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
      <div className="flex items-center gap-3">
        <h3 className="font-semibold">Fuel Usage</h3>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Radio className="w-3 h-3 text-green-500" />
          <span>FLS Sensor Data</span>
        </div>
        {hasMultipleVehicles && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground border-l border-border pl-3 ml-1">
            <Truck className="w-3 h-3" />
            <span>
              {totalUnits} {unitLabelPlural}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
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

      <div className="flex items-center gap-2">
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
        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Sync latest data"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Syncing...' : 'Sync'}
          </Button>
        )}
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onExport}>
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>
    </div>
  );
}
