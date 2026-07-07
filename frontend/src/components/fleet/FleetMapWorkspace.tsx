import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, ListFilter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LazyUnifiedMap } from '@/components/app/LazyUnifiedMap';
import { MapSkeleton } from '@/components/app/MapSkeleton';
import { FleetListTable } from '@/components/fleet/FleetListTable';
import { UnitDetailPanel } from '@/components/fleet/UnitDetailPanel';
import { UnitTypeIcon } from '@/components/fleet/UnitTypeIcon';
import { StatusBadge } from '@/components/shared/StatusBadge';
import type { VehicleStatus } from '@/components/shared/StatusBadge';
import { type FleetUnit } from '@/lib/fleetUnits';
import { MapBasemapBar } from '@/components/map/MapBasemapPicker';
import { cn } from '@/lib/utils';
import type { AssetStatusEntry } from '@/hooks/useAssets';

type Props = {
  units: FleetUnit[];
  statuses?: AssetStatusEntry[];
  isLoading?: boolean;
  mapSessionKey: string;
  selectedId?: string | null;
  onSelectId?: (id: string | null) => void;
  onOpenTrack?: (unit: FleetUnit) => void;
  className?: string;
};

const STATUS_FILTERS: VehicleStatus[] = ['moving', 'idle', 'stopped', 'offline'];

export function FleetMapSidebar({
  units,
  selectedId,
  onSelect,
  className,
}: {
  units: FleetUnit[];
  selectedId?: string | null;
  onSelect: (u: FleetUnit) => void;
  className?: string;
}) {
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<VehicleStatus[]>([]);

  const filtered = useMemo(() => {
    const hay = q.trim().toLowerCase();
    return units.filter((u) => {
      if (hay && !`${u.name} ${u.plate || ''}`.toLowerCase().includes(hay)) return false;
      if (statusFilter.length && !statusFilter.includes(u.status)) return false;
      return true;
    });
  }, [units, q, statusFilter]);

  const toggleStatus = (s: VehicleStatus) => {
    setStatusFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  return (
    <div className={cn('flex flex-col h-full border-r border-border/60 bg-card/30', className)}>
      <div className="p-2.5 border-b border-border/60 space-y-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search units…"
            className="pl-8 h-8 text-xs"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              className={cn(
                'rounded-full transition-opacity',
                statusFilter.length > 0 && !statusFilter.includes(s) && 'opacity-40'
              )}
            >
              <StatusBadge status={s} size="sm" showDot={false} />
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <ListFilter className="h-3 w-3" />
          {filtered.length} of {units.length} units
        </p>
      </div>
      <ul className="flex-1 overflow-auto p-1.5 space-y-0.5 min-h-0">
        {filtered.map((u) => (
          <li key={u.id}>
            <button
              type="button"
              onClick={() => onSelect(u)}
              className={cn(
                'w-full flex items-center gap-2 p-2 rounded-lg text-left transition-colors hover:bg-muted/50',
                selectedId === u.id && 'bg-primary/10 ring-1 ring-primary/25'
              )}
            >
              <UnitTypeIcon size="sm" wialonId={u.wialonId} iconUgi={u.iconUgi} title={u.name} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium leading-tight line-clamp-2">{u.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{u.plate || u.id}</p>
              </div>
              <div className="shrink-0 text-right">
                <StatusBadge status={u.status} size="sm" showDot={false} />
                <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                  {u.speed != null ? `${Math.round(u.speed)}` : '0'} km/h
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FleetMapWorkspace({
  units,
  statuses,
  isLoading,
  mapSessionKey,
  selectedId: controlledId,
  onSelectId,
  onOpenTrack,
  className,
}: Props) {
  const navigate = useNavigate();
  const [internalId, setInternalId] = useState<string | null>(null);
  const selectedId = controlledId !== undefined ? controlledId : internalId;
  const setSelectedId = (id: string | null) => {
    if (onSelectId) onSelectId(id);
    else setInternalId(id);
  };

  const selected = units.find((u) => u.id === selectedId) || null;
  const showMapSkeleton = isLoading && !(units?.length);
  const [showGeofences, setShowGeofences] = useState(false);

  const openTrack = (unit: FleetUnit) => {
    if (onOpenTrack) onOpenTrack(unit);
    else navigate(`/app/monitoring?view=tracks&unitId=${unit.id}`);
  };

  return (
    <div className={cn('fleet-card p-0 overflow-hidden monitoring-workspace', className)}>
      <div className="grid h-full grid-cols-1 lg:grid-cols-12">
        <div className="hidden lg:flex lg:col-span-3 flex-col h-full min-h-0 overflow-hidden">
          <FleetMapSidebar units={units} selectedId={selectedId} onSelect={(u) => setSelectedId(u.id)} />
        </div>

        <div className="lg:col-span-6 relative h-full min-h-0 flex flex-col">
          <div className="absolute top-2 left-2 z-[500] flex gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={showGeofences ? 'default' : 'outline'}
              className="h-7 text-[10px] shadow-sm bg-card/95 px-2"
              onClick={() => setShowGeofences((v) => !v)}
            >
              <MapPin className="h-3 w-3 mr-1" />
              Geofences
            </Button>
          </div>
          <MapBasemapBar />
          <div className="flex-1 min-h-0">
            {showMapSkeleton ? (
              <MapSkeleton height="100%" />
            ) : (
              <LazyUnifiedMap
                statuses={statuses ?? []}
                height="100%"
                sessionKey={mapSessionKey}
                selectedUnitId={selectedId}
                onUnitSelect={(id) => setSelectedId(id)}
                detailPanel="none"
                showFitControl
                showGeofences={showGeofences}
              />
            )}
          </div>
          {selected && (
            <div className="lg:hidden border-t border-border/60 max-h-[42%] overflow-hidden shrink-0">
              <UnitDetailPanel
                unit={selected}
                compact
                live
                showControls
                onClose={() => setSelectedId(null)}
                onTripHistory={openTrack}
              />
            </div>
          )}
        </div>

        <div className="hidden lg:flex lg:col-span-3 flex-col h-full min-h-0 overflow-hidden border-l border-border/60">
          <UnitDetailPanel
            unit={selected}
            live
            showControls
            onClose={() => setSelectedId(null)}
            onTripHistory={openTrack}
            className="h-full border-0 rounded-none shadow-none"
          />
        </div>
      </div>
    </div>
  );
}

export function FleetListWorkspace({
  units,
  selectedId,
  onSelectId,
  onViewOnMap,
  onOpenTrack,
  className,
}: {
  units: FleetUnit[];
  selectedId?: string | null;
  onSelectId: (id: string) => void;
  onViewOnMap?: (unit: FleetUnit) => void;
  onOpenTrack?: (unit: FleetUnit) => void;
  className?: string;
}) {
  const navigate = useNavigate();
  const selected = units.find((u) => u.id === selectedId) || null;

  const openTrack = (unit: FleetUnit) => {
    if (onOpenTrack) onOpenTrack(unit);
    else navigate(`/app/monitoring?view=tracks&unitId=${unit.id}`);
  };

  return (
    <div className={cn('fleet-card p-0 overflow-hidden monitoring-workspace', className)}>
      <div className="grid h-full grid-cols-1 xl:grid-cols-12">
        <div className="xl:col-span-8 h-full min-h-0 flex flex-col border-r border-border/60">
          <FleetListTable
            units={units}
            selectedId={selectedId}
            onSelect={(u) => onSelectId(u.id)}
            onViewOnMap={onViewOnMap}
            onTripHistory={openTrack}
            className="h-full"
          />
        </div>
        <div className="hidden xl:flex xl:col-span-4 flex-col h-full min-h-0 overflow-hidden">
          <UnitDetailPanel
            unit={selected}
            live
            showControls
            onViewOnMap={onViewOnMap}
            onTripHistory={openTrack}
            className="h-full border-0 rounded-none shadow-none"
          />
        </div>
      </div>
      {selected && (
        <div className="xl:hidden border-t border-border/60 max-h-[45%] overflow-hidden">
          <UnitDetailPanel
            unit={selected}
            compact
            live
            showControls
            onViewOnMap={onViewOnMap}
            onTripHistory={openTrack}
          />
        </div>
      )}
    </div>
  );
}

export function FleetTracksPlaceholder({ unitId }: { unitId?: string | null }) {
  return (
    <div className="fleet-card monitoring-workspace flex flex-col items-center justify-center text-center p-8">
      <p className="text-lg font-semibold mb-2">Track</p>
      <p className="text-sm text-muted-foreground max-w-md">
        Use the Track tab to replay routes{unitId ? ` for unit ${unitId}` : ''}.
      </p>
    </div>
  );
}

export function FleetViolationsPlaceholder() {
  return (
    <div className="fleet-card monitoring-workspace flex flex-col items-center justify-center text-center p-8">
      <p className="text-lg font-semibold mb-2">Events</p>
      <p className="text-sm text-muted-foreground max-w-md">
        Fleet alerts, eco violations, and video events appear in the Events tab.
      </p>
    </div>
  );
}

/** @deprecated Use useMonitoringUrlState from @/hooks/useMonitoringUrlState */
export { useMonitoringUrlState as useMonitoringViewFromUrl } from '@/hooks/useMonitoringUrlState';
export type { MonitoringViewMode } from '@/components/fleet/MonitoringViewHeader';
