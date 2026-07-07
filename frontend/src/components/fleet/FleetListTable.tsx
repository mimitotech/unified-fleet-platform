import { useMemo, useState, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, History, Search, MapPin, Gauge, Fuel } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/shared/StatusBadge';
import type { VehicleStatus } from '@/components/shared/StatusBadge';
import { UnitTypeIcon } from '@/components/fleet/UnitTypeIcon';
import { formatFuelDisplay, hwDisplayLabel, type FleetUnit } from '@/lib/fleetUnits';
import { cn } from '@/lib/utils';
import { prefetchWialonUnitDetail } from '@/hooks/useWialonLive';

export type FleetFilterState = {
  search: string;
  statuses: VehicleStatus[];
};

type Props = {
  units: FleetUnit[];
  selectedId?: string | null;
  onSelect: (unit: FleetUnit) => void;
  onViewOnMap?: (unit: FleetUnit) => void;
  onTripHistory?: (unit: FleetUnit) => void;
  className?: string;
};

export function FleetListTable({
  units,
  selectedId,
  onSelect,
  onViewOnMap,
  onTripHistory,
  className,
}: Props) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<FleetFilterState>({ search: '', statuses: [] });

  const prefetchUnit = useCallback(
    (u: FleetUnit) => {
      if (u.wialonId) void prefetchWialonUnitDetail(queryClient, u.wialonId, true);
    },
    [queryClient]
  );

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return units.filter((u) => {
      if (q && !`${u.name} ${u.plate || ''}`.toLowerCase().includes(q)) return false;
      if (filters.statuses.length && !filters.statuses.includes(u.status)) return false;
      return true;
    });
  }, [units, filters]);

  const toggleStatus = (s: VehicleStatus) => {
    setFilters((f) => ({
      ...f,
      statuses: f.statuses.includes(s) ? f.statuses.filter((x) => x !== s) : [...f.statuses, s],
    }));
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="flex flex-wrap gap-2 p-3 border-b border-border/60">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search fleet…"
            className="pl-8 h-9"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {(['moving', 'idle', 'stopped', 'offline'] as VehicleStatus[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              className={cn(
                'rounded-full px-2 py-0.5 text-xs border transition-colors',
                filters.statuses.includes(s) ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'
              )}
            >
              <StatusBadge status={s} size="sm" />
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card/95 backdrop-blur z-10 border-b">
            <tr className="text-left text-xs text-muted-foreground">
              <th className="p-3 font-medium">Asset</th>
              <th className="p-3 font-medium hidden md:table-cell">Type</th>
              <th className="p-3 font-medium">Speed</th>
              <th className="p-3 font-medium hidden lg:table-cell">Fuel</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium hidden sm:table-cell">Updated</th>
              <th className="p-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr
                key={u.id}
                className={cn(
                  'border-b border-border/40 hover:bg-muted/40 cursor-pointer transition-colors',
                  selectedId === u.id && 'bg-primary/5'
                )}
                onClick={() => onSelect(u)}
                onMouseEnter={() => prefetchUnit(u)}
              >
                <td className="p-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <UnitTypeIcon
                      size="sm"
                      wialonId={u.wialonId}
                      iconUgi={u.iconUgi}
                      title={u.name}
                    />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{u.name}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{u.plate || u.id}</p>
                    </div>
                  </div>
                </td>
                <td className="p-3 hidden md:table-cell text-muted-foreground text-xs truncate max-w-[140px]">
                  {hwDisplayLabel(u)}
                </td>
                <td className="p-3">
                  <span className="inline-flex items-center gap-1 text-xs">
                    <Gauge className="h-3 w-3 text-muted-foreground" />
                    {u.speed != null ? `${Math.round(u.speed)} km/h` : '—'}
                  </span>
                </td>
                <td className="p-3 hidden lg:table-cell">
                  <span className="inline-flex items-center gap-1 text-xs">
                    <Fuel className="h-3 w-3 text-muted-foreground" />
                    {formatFuelDisplay(u)}
                  </span>
                </td>
                <td className="p-3">
                  <StatusBadge status={u.status} label={u.motionState} size="sm" />
                </td>
                <td className="p-3 hidden sm:table-cell text-xs text-muted-foreground">
                  {u.lastUpdate ? formatDistanceToNow(u.lastUpdate, { addSuffix: true }) : '—'}
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    {onViewOnMap && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="View on map" onClick={() => onViewOnMap(u)}>
                        <MapPin className="h-4 w-4" />
                      </Button>
                    )}
                    {onTripHistory && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Trip history" onClick={() => onTripHistory(u)}>
                        <History className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Select for details"
                      onClick={() => onSelect(u)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <p className="text-center text-muted-foreground text-sm py-12">No units match your filters.</p>
        )}
      </div>
    </div>
  );
}
