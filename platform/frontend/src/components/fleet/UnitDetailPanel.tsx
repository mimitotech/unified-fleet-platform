import type { ReactNode } from 'react';
import { useMemo } from 'react';
import {
  X,
  Gauge,
  MapPin,
  Clock,
  History,
  Fuel,
  Navigation,
  Compass,
  Cpu,
  Wrench,
  Video,
  Loader2,
  Radio,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { UnitTypeIcon } from '@/components/fleet/UnitTypeIcon';
import { WialonCommandButton } from '@/components/fleet/WialonCommandButton';
import {
  hasEngineHoursData,
  hwDisplayLabel,
  formatFuelDisplay,
  isFleetVideoDevice,
  type FleetUnit,
} from '@/lib/fleetUnits';
import { cn } from '@/lib/utils';
import { safeArray } from '@/lib/safeArray';
import { useWialonUnitCommands, useWialonUnitDetail } from '@/hooks/useWialonLive';
import { useWialonGeocode } from '@/hooks/useWialonGeocode';

type Props = {
  unit: FleetUnit | null;
  onClose?: () => void;
  onViewOnMap?: (unit: FleetUnit) => void;
  onTripHistory?: (unit: FleetUnit) => void;
  compact?: boolean;
  showControls?: boolean;
  live?: boolean;
  className?: string;
};

function Stat({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 px-2.5 py-2 min-w-0">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wide">
        <Icon className="h-3 w-3 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <p className="text-sm font-semibold leading-tight break-words">{value}</p>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{title}</h4>
      {children}
    </section>
  );
}

type SensorRow = { name: string; value: string | number; unit?: string; type?: string };

function sensorGroup(name: string, type?: string): string {
  const blob = `${name} ${type || ''}`.toLowerCase();
  if (/fuel|lls|tank|litre|liter/.test(blob)) return 'Fuel';
  if (/ignition|acc|engine\s*on|engine\s*off|rpm|moto/.test(blob)) return 'Powertrain';
  if (/batter|voltage|pwr|power|volt|amp/.test(blob)) return 'Power / Battery';
  if (/temp|coolant|thermo|ambient/.test(blob)) return 'Temperature';
  if (/door|hatch|boot|trunk|cover/.test(blob)) return 'Doors / Security';
  if (/speed|gps|sat|hdop|altitude|course|odometer|mileage/.test(blob)) return 'Location / Motion';
  if (/hour|mh\b|counter/.test(blob)) return 'Counters';
  return 'Other';
}

const SENSOR_GROUP_ORDER = [
  'Fuel',
  'Powertrain',
  'Power / Battery',
  'Temperature',
  'Doors / Security',
  'Location / Motion',
  'Counters',
  'Other',
];

function groupSensors(sensors: SensorRow[]): Array<{ group: string; items: SensorRow[] }> {
  const map = new Map<string, SensorRow[]>();
  for (const s of sensors) {
    const g = sensorGroup(s.name, s.type);
    const list = map.get(g) || [];
    list.push(s);
    map.set(g, list);
  }
  return SENSOR_GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
    group: g,
    items: map.get(g)!,
  }));
}

function formatCounter(value?: number, unit?: 'km' | 'h'): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (unit === 'h') return `${value.toFixed(2)} h`;
  if (value >= 1000) return `${Math.round(value)} km`;
  return `${value.toFixed(1)} km`;
}

export function UnitDetailPanel({
  unit,
  onClose,
  onViewOnMap,
  onTripHistory,
  compact = false,
  showControls = true,
  live = false,
  className,
}: Props) {
  const wialonId = unit?.wialonId;
  const enabled = showControls && !!wialonId;
  const { data: detail, isPending: detailPending, isFetching: detailFetching } = useWialonUnitDetail(
    wialonId ?? null,
    enabled,
    live
  );

  const lat = detail?.position?.lat ?? unit?.lat;
  const lng = detail?.position?.lng ?? unit?.lng;
  const { data: geocode, isPending: geoPending } = useWialonGeocode(
    lat,
    lng,
    enabled && lat != null && lng != null,
    live
  );

  const loadingAsset = enabled && (detailPending || detailFetching);
  const { data: commandsPayload } = useWialonUnitCommands(wialonId ?? null, enabled && !!detail && !detailFetching);
  const commands = commandsPayload?.commands;

  const address = detail?.address || geocode?.address;
  const addressParts = useMemo(
    () => safeArray<string>(detail?.addressParts || geocode?.parts || (address ? [address] : [])),
    [detail?.addressParts, geocode?.parts, address]
  );
  const resolvingAddress = !addressParts.length && !address && geoPending && lat != null && lng != null;

  if (!unit) {
    return (
      <div className={cn('fleet-card flex flex-col items-center justify-center h-full min-h-[200px] text-center px-4', className)}>
        <MapPin className="h-8 w-8 text-muted-foreground/40 mb-2" />
        <p className="text-muted-foreground text-sm">Select a unit to view live details</p>
      </div>
    );
  }

  const displayName = detail?.name || unit.name;
  const displayPlate = detail?.plate || unit.plate;
  const status = (detail?.status as FleetUnit['status']) || unit.status;
  const motionLabel = detail?.motionState || unit.motionState;
  const speed = detail?.position?.speed ?? unit.speed;
  const course = detail?.position?.course ?? unit.course;
  const mileage = detail?.counters?.mileage ?? unit.mileage;
  const stationary =
    unit.stationary === true ||
    unit.assetCategory === 'generator' ||
    unit.assetCategory === 'machinery';
  const engineHours = detail?.counters?.engineHours ?? unit.engineHours;
  const lastAge = detail?.lastUpdateAge;
  const sensors = detail?.sensors || [];
  const sensorGroups = useMemo(() => groupSensors(sensors as SensorRow[]), [sensors]);
  const parameters = detail?.prms || [];
  const customFields = detail?.flds || [];
  const maintenance = detail?.maintenance || [];
  const video = detail?.video;
  const health = detail?.health as
    | { battery?: number; satellites?: number; hdop?: number; altitude?: number }
    | undefined;
  const engineAsset = hasEngineHoursData({ ...unit, engineHours });
  const isVideoUnit = isFleetVideoDevice(unit) || Boolean(video && Object.keys(video).length);
  const tripState =
    detail?.trip?.state === 1 ? 'On trip' : detail?.trip?.state === 2 ? 'Brief stop' : detail?.trip?.state === 0 ? 'Parked' : undefined;

  const fuelDisplay = formatFuelDisplay({
    fuelFormatted: detail?.fuel?.levelFormatted ?? unit.fuelFormatted,
    fuelLiters: detail?.fuel?.levelLiters ?? unit.fuelLiters,
    fuelLevel: detail?.fuelLevel ?? unit.fuelLevel,
  });

  const showScrollable = showControls && (!compact || sensors.length > 0 || parameters.length > 0);
  const sensorLimit = compact ? 8 : 40;
  const paramLimit = compact ? 12 : 40;

  return (
    <div className={cn('fleet-card flex flex-col h-full overflow-hidden p-0 relative', className)}>
      {loadingAsset && (
        <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-3 py-2 bg-primary/8 border-b border-primary/20 text-xs text-primary backdrop-blur-sm">
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          <span>Loading asset data…</span>
        </div>
      )}
      {/* Header */}
      <div className={cn('shrink-0 border-b border-border/60', compact ? 'p-3' : 'p-4', loadingAsset && 'pt-10')}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <UnitTypeIcon
              size={compact ? 'sm' : 'md'}
              wialonId={wialonId}
              iconUgi={unit.iconUgi}
              title={displayName}
            />
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-sm leading-snug">{displayName}</h3>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <StatusBadge status={status} label={motionLabel} size="sm" />
                {live && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-status-moving font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-status-moving animate-pulse" />
                    Live
                  </span>
                )}
                {tripState && (
                  <span className="text-[10px] text-muted-foreground">{tripState}</span>
                )}
              </div>
              {displayPlate && (
                <p className="text-xs text-muted-foreground font-mono mt-1">{displayPlate}</p>
              )}
              <p className="text-[11px] text-muted-foreground mt-0.5">{hwDisplayLabel(detail || unit)}</p>
            </div>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* Address — prominent for monitoring */}
        <div className="mt-3 rounded-lg bg-muted/30 border border-border/40 px-2.5 py-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            Location
          </p>
          {resolvingAddress ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Resolving address…
            </p>
          ) : addressParts.length > 0 ? (
            <p className="text-xs text-foreground leading-relaxed">{addressParts.join(', ')}</p>
          ) : address ? (
            <p className="text-xs text-foreground leading-relaxed">{address}</p>
          ) : lat != null && lng != null ? (
            <p className="text-xs font-mono text-muted-foreground">
              {lat.toFixed(5)}, {lng.toFixed(5)}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Position unavailable</p>
          )}
          {(lastAge || detail?.lastUpdate) && (
            <p className="text-[10px] text-muted-foreground mt-1.5">
              {lastAge}
              {detail?.lastUpdate && (
                <span className="ml-1">· {new Date(detail.lastUpdate).toLocaleString()}</span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className={cn('grid grid-cols-2 gap-1.5 shrink-0', compact ? 'p-3 pt-2' : 'p-4 pt-3')}>
        {!stationary && (
          <Stat icon={Gauge} label="Speed" value={speed != null ? `${Math.round(speed)} km/h` : '0 km/h'} />
        )}
        {!stationary && <Stat icon={Navigation} label="Odometer" value={formatCounter(mileage, 'km')} />}
        <Stat icon={Fuel} label="Fuel" value={fuelDisplay} />
        {engineAsset ? (
          <Stat icon={Clock} label="Engine hrs" value={formatCounter(engineHours, 'h')} />
        ) : (
          <Stat icon={Cpu} label="Device" value={hwDisplayLabel(detail || unit)} />
        )}
        {!stationary && course != null && status === 'moving' && (
          <Stat icon={Compass} label="Heading" value={`${Math.round(course)}°`} />
        )}
        {detail?.netconn != null && (
          <Stat icon={Radio} label="Online" value={detail.netconn ? 'Yes' : 'No'} />
        )}
      </div>

      {/* Scrollable detail sections */}
      {showScrollable && (
        <div className="flex-1 overflow-auto border-t px-3 py-3 space-y-4 min-h-0">
          {(health?.battery != null ||
            health?.satellites != null ||
            health?.hdop != null ||
            health?.altitude != null) && (
            <DetailSection title="Device vitals">
              <div className="grid grid-cols-2 gap-1.5">
                {health?.battery != null && (
                  <Stat icon={Radio} label="Battery" value={`${Math.round(health.battery)}%`} />
                )}
                {health?.satellites != null && (
                  <Stat icon={Navigation} label="Satellites" value={String(health.satellites)} />
                )}
                {health?.hdop != null && (
                  <Stat icon={Gauge} label="HDOP" value={String(health.hdop)} />
                )}
                {health?.altitude != null && (
                  <Stat icon={Compass} label="Altitude" value={`${Math.round(health.altitude)} m`} />
                )}
              </div>
            </DetailSection>
          )}

          {sensorGroups.length > 0 && (
            <DetailSection title="Sensors">
              <div className="space-y-3">
                {sensorGroups.map((g) => {
                  const items = g.items.slice(0, Math.max(2, Math.ceil(sensorLimit / sensorGroups.length)));
                  return (
                    <div key={g.group} className="rounded-lg border border-border/40 overflow-hidden">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/40 px-2.5 py-1.5 border-b border-border/40">
                        {g.group}
                        <span className="ml-1.5 font-normal tabular-nums">({g.items.length})</span>
                      </p>
                      <ul className="divide-y divide-border/40">
                        {items.map((s, i) => (
                          <li
                            key={`${g.group}-${s.name}-${i}`}
                            className="flex justify-between gap-2 text-xs px-2.5 py-2 bg-card/50"
                          >
                            <span className="text-muted-foreground min-w-0">{s.name}</span>
                            <span className="font-semibold shrink-0 text-right tabular-nums">
                              {s.value}
                              {s.unit ? ` ${s.unit}` : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </DetailSection>
          )}

          {(detail?.ph || detail?.uid) && !compact && (
            <DetailSection title="Connectivity">
              <dl className="text-xs space-y-1.5">
                {detail.ph && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd className="font-medium font-mono">{detail.ph}</dd>
                  </div>
                )}
                {detail.uid && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">UID</dt>
                    <dd className="font-medium font-mono text-[10px] break-all text-right">{detail.uid}</dd>
                  </div>
                )}
              </dl>
            </DetailSection>
          )}

          {parameters.length > 0 && (
            <DetailSection title="Parameters">
              <div className="rounded-lg border border-border/40 divide-y divide-border/40 overflow-hidden">
                {parameters.slice(0, paramLimit).map((p) => (
                  <div key={p.key} className="flex justify-between gap-2 text-[11px] px-2.5 py-1.5 bg-card/50 font-mono">
                    <span className="text-muted-foreground shrink-0 max-w-[45%] break-all">{p.key}</span>
                    <span className="font-medium text-right break-all">{p.value}</span>
                  </div>
                ))}
              </div>
            </DetailSection>
          )}

          {customFields.length > 0 && !compact && (
            <DetailSection title="Custom fields">
              <dl className="text-xs space-y-1.5">
                {customFields.map((f) => (
                  <div key={f.name} className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{f.name}</dt>
                    <dd className="font-medium text-right">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </DetailSection>
          )}

          {maintenance.length > 0 && !compact && (
            <DetailSection title="Maintenance">
              <ul className="text-xs space-y-1.5">
                {maintenance.map((m, i) => (
                  <li key={`${m.name}-${i}`} className="flex justify-between gap-2">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Wrench className="h-3 w-3" />
                      {m.name}
                    </span>
                    <span className="font-medium text-right">{m.detail}</span>
                  </li>
                ))}
              </ul>
            </DetailSection>
          )}

          {commands && commands.length > 0 && (
            <DetailSection title="Commands">
              <div className="flex flex-wrap gap-1">
                {commands.slice(0, compact ? 4 : 8).map((c, i) =>
                  wialonId ? (
                    <WialonCommandButton
                      key={`${c.name}-${i}`}
                      unitId={wialonId}
                      commandName={c.name}
                      label={c.label || c.name}
                      variant="outline"
                      size="sm"
                      className="h-7 text-[10px] px-2"
                    />
                  ) : null
                )}
              </div>
            </DetailSection>
          )}

          {detailPending && wialonId && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading data…
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className={cn('shrink-0 border-t bg-muted/20 flex flex-wrap gap-1.5', compact ? 'p-2' : 'p-3')}>
        {onViewOnMap && (
          <Button variant="secondary" size="sm" className="h-8 text-xs flex-1 min-w-[5rem]" onClick={() => onViewOnMap(unit)}>
            <MapPin className="h-3.5 w-3.5 mr-1" />
            Map
          </Button>
        )}
        {onTripHistory && (
          <Button variant="outline" size="sm" className="h-8 text-xs flex-1 min-w-[5rem]" onClick={() => onTripHistory(unit)}>
            <History className="h-3.5 w-3.5 mr-1" />
            Track
          </Button>
        )}
        {isVideoUnit && (
          <Button variant="outline" size="sm" className="h-8 text-xs flex-1 min-w-[5rem]" asChild>
            <Link to={`/app/surveillance${wialonId ? `?unitId=${wialonId}` : ''}`}>
              <Video className="h-3.5 w-3.5 mr-1" />
              Video
            </Link>
          </Button>
        )}
        {wialonId && (
          <Button variant="outline" size="sm" className="h-8 text-xs flex-1 min-w-[5rem]" asChild>
            <Link to={`/app/commands?unit=${wialonId}`}>
              <Radio className="h-3.5 w-3.5 mr-1" />
              Commands
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
