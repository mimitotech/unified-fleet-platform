import { useMemo, useState, useCallback } from 'react';
import {
  X,
  MapPin,
  Gauge,
  Fuel,
  Clock,
  Navigation,
  Copy,
  Check,
  Loader2,
  Wifi,
  WifiOff,
  Satellite,
  Mountain,
  Battery,
  Radio,
} from 'lucide-react';
import { useWialonUnitDetail } from '@/hooks/useWialonLive';
import { useWialonGeocode } from '@/hooks/useWialonGeocode';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { UnitTypeIcon } from '@/components/fleet/UnitTypeIcon';
import { hwDisplayLabel, formatFuelDisplay, type FleetUnit } from '@/lib/fleetUnits';
import type { VehicleStatus } from '@/types/status';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { safeArray } from '@/lib/safeArray';

type UnitSlice = Pick<
  FleetUnit,
  'id' | 'wialonId' | 'name' | 'plate' | 'status' | 'motionState' | 'iconUgi' | 'hwName' | 'hw' | 'fuelLevel' | 'fuelLiters' | 'fuelFormatted'
>;

type Props = {
  unit: UnitSlice;
  lat: number;
  lng: number;
  speed?: number;
  course?: number;
  live?: boolean;
  onClose?: () => void;
  onOpenPanel?: () => void;
  className?: string;
};

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof Gauge }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 min-w-0">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-0.5">
        {Icon && <Icon className="h-3 w-3 shrink-0" />}
        <span className="truncate">{label}</span>
      </div>
      <p className="text-sm font-semibold truncate">{value}</p>
    </div>
  );
}

function sortSensors<T extends { name: string }>(sensors: T[]): T[] {
  const fuel = sensors.filter((s) => /fuel|lls|tank/i.test(s.name));
  const rest = sensors.filter((s) => !/fuel|lls|tank/i.test(s.name));
  return [...fuel, ...rest];
}

export function MapUnitDetailCard({ unit, lat, lng, speed, course, live = false, onClose, onOpenPanel, className }: Props) {
  const wialonId = unit.wialonId ?? (Number.isFinite(Number(unit.id)) ? Number(unit.id) : null);
  const { data: detail, isPending: detailPending } = useWialonUnitDetail(wialonId, wialonId != null, live);
  const { data: geocode, isPending: geoPending } = useWialonGeocode(lat, lng, wialonId != null, live);

  const [copied, setCopied] = useState(false);

  const status = (detail?.status as VehicleStatus) || unit.status;
  const motionLabel = detail?.motionState || unit.motionState;
  const liveSpeed = speed ?? detail?.trip?.currSpeed ?? detail?.position?.speed;
  const liveCourse = course ?? detail?.trip?.course ?? detail?.position?.course;
  const satellites = detail?.health?.satellites ?? detail?.position?.satellites;
  const altitude = detail?.health?.altitude ?? detail?.position?.altitude;
  const battery = detail?.health?.battery;
  const tripState =
    detail?.trip?.state === 1 ? 'On trip' : detail?.trip?.state === 2 ? 'Brief stop' : detail?.trip?.state === 0 ? 'Parked' : undefined;
  const sensors = useMemo(() => sortSensors(detail?.sensors || []), [detail?.sensors]);
  const customFields = detail?.flds || [];
  const address = detail?.address || geocode?.address;
  const fuelInfo = detail?.fuel;
  const addressParts = safeArray<string>(
    detail?.addressParts || geocode?.parts || (address ? [address] : [])
  );
  const hasAddress = addressParts.length > 0 || Boolean(address);
  const resolvingAddress = !hasAddress && geoPending && !geocode;
  const fuelTanks = safeArray(fuelInfo?.tanks);
  const ioInputs = safeArray(detail?.io?.inputs);
  const ioOutputs = safeArray(detail?.io?.outputs);

  const fuelSensor = sensors.find((s) => /fuel|lls|tank/i.test(s.name));
  const fuelDisplay = formatFuelDisplay({
    fuelFormatted: fuelInfo?.levelFormatted || unit.fuelFormatted,
    fuelLiters: fuelInfo?.levelLiters ?? unit.fuelLiters,
    fuelLevel: detail?.fuelLevel ?? unit.fuelLevel,
  });

  const copyCoords = useCallback(() => {
    void navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [lat, lng]);

  return (
    <div
      className={cn(
        'flex flex-col bg-card border border-border shadow-xl rounded-xl overflow-hidden',
        'w-[min(100%,420px)] max-h-[min(85vh,640px)]',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 p-4 border-b border-border/60 bg-card/95 shrink-0">
        <UnitTypeIcon
          wialonId={wialonId ?? undefined}
          iconUgi={detail?.iconUgi ?? unit.iconUgi}
          size="lg"
          title={unit.name}
        />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-base leading-snug truncate">{detail?.name || unit.name}</h3>
          {unit.plate && <p className="text-sm text-muted-foreground font-mono mt-0.5">{unit.plate}</p>}
          <p className="text-xs text-muted-foreground mt-1">{hwDisplayLabel(detail || unit)}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <StatusBadge status={status} label={motionLabel} size="md" />
          {status === 'moving' && liveSpeed != null && liveSpeed > 0 && (
            <span className="text-xs font-bold text-status-moving tabular-nums">
              {Math.round(liveSpeed)} km/h
            </span>
          )}
          {onClose && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        {/* Location — Wialon-style prominent address */}
        <div className="p-4 border-b border-border/50 bg-muted/20">
          <div className="flex gap-2.5">
            <MapPin className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 space-y-1">
              {resolvingAddress ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Resolving address…
                </p>
              ) : addressParts.length > 0 ? (
                <>
                  <p className="text-sm font-medium leading-relaxed text-foreground">{addressParts[0]}</p>
                  {addressParts.length > 1 && (
                    <p className="text-sm text-muted-foreground leading-relaxed">{addressParts.slice(1).join(', ')}</p>
                  )}
                </>
              ) : address ? (
                <p className="text-sm font-medium leading-relaxed">{address}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Address unavailable</p>
              )}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs font-mono text-muted-foreground">
                  {lat.toFixed(6)}, {lng.toFixed(6)}
                </span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copyCoords} title="Copy coordinates">
                  {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Key metrics */}
        <div className="p-4 grid grid-cols-2 gap-2 border-b border-border/50">
          <Metric
            label="Speed"
            value={liveSpeed != null ? `${Math.round(liveSpeed)} km/h` : '0 km/h'}
            icon={Gauge}
          />
          <Metric label="Fuel" value={fuelDisplay} icon={Fuel} />
          <Metric
            label="Odometer"
            value={detail?.counters?.mileage != null ? `${Math.round(detail.counters.mileage)} km` : '—'}
            icon={Navigation}
          />
          <Metric
            label="Engine hours"
            value={detail?.counters?.engineHours != null ? `${detail.counters.engineHours.toFixed(1)} h` : '—'}
            icon={Clock}
          />
          {satellites != null && (
            <Metric label="Satellites" value={String(satellites)} icon={Satellite} />
          )}
          {altitude != null && (
            <Metric label="Altitude" value={`${Math.round(altitude)} m`} icon={Mountain} />
          )}
          {battery != null && (
            <Metric label="Battery" value={`${battery} V`} icon={Battery} />
          )}
          {detail?.uid && (
            <Metric label="Device ID" value={detail.uid} icon={Radio} />
          )}
        </div>

        {/* Fuel operations — Wialon fuel settings + tank sensors */}
        {(fuelTanks.length > 0 || fuelInfo?.consumption) && (
          <div className="p-4 border-b border-border/50 bg-muted/10">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
              <Fuel className="h-3.5 w-3.5" />
              Fuel
            </h4>
            {fuelInfo.settings?.calcTypeLabels?.length ? (
              <p className="text-xs text-muted-foreground mb-2">
                Methods: {fuelInfo.settings.calcTypeLabels.join(', ')}
              </p>
            ) : null}
            {fuelInfo.rates && (fuelInfo.rates.consSummer != null || fuelInfo.rates.consWinter != null) && (
              <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                {fuelInfo.rates.consSummer != null && (
                  <div className="rounded-md border border-border/50 bg-card px-2 py-1.5">
                    <p className="text-muted-foreground">Summer rate</p>
                    <p className="font-semibold">{fuelInfo.rates.consSummer} L/100km</p>
                  </div>
                )}
                {fuelInfo.rates.consWinter != null && (
                  <div className="rounded-md border border-border/50 bg-card px-2 py-1.5">
                    <p className="text-muted-foreground">Winter rate</p>
                    <p className="font-semibold">{fuelInfo.rates.consWinter} L/100km</p>
                  </div>
                )}
              </div>
            )}
            {fuelTanks.length > 0 && (
              <ul className="space-y-0 divide-y divide-border/40 mb-3">
                {fuelTanks.map((t, i) => (
                  <li key={`${t.name}-${i}`} className="flex justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                    <span className="text-muted-foreground min-w-0 truncate">{t.name}</span>
                    <span className="font-semibold shrink-0 text-right">
                      {t.value}
                      {t.unit ? <span className="font-normal text-muted-foreground"> {t.unit}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {fuelInfo.consumption && (
              <div className="grid grid-cols-3 gap-2 text-xs">
                {fuelInfo.consumption.idling != null && (
                  <div className="rounded-md border border-border/50 bg-card px-2 py-1.5">
                    <p className="text-muted-foreground">Idle</p>
                    <p className="font-semibold">{fuelInfo.consumption.idling} L/h</p>
                  </div>
                )}
                {fuelInfo.consumption.urban != null && (
                  <div className="rounded-md border border-border/50 bg-card px-2 py-1.5">
                    <p className="text-muted-foreground">Urban</p>
                    <p className="font-semibold">{fuelInfo.consumption.urban} L/100km</p>
                  </div>
                )}
                {fuelInfo.consumption.suburban != null && (
                  <div className="rounded-md border border-border/50 bg-card px-2 py-1.5">
                    <p className="text-muted-foreground">Highway</p>
                    <p className="font-semibold">{fuelInfo.consumption.suburban} L/100km</p>
                  </div>
                )}
              </div>
            )}
            {(fuelInfo.minFillingVolume != null || fuelInfo.minTheftVolume != null) && (
              <p className="text-[11px] text-muted-foreground mt-2">
                {fuelInfo.minFillingVolume != null && `Min fill: ${fuelInfo.minFillingVolume} L`}
                {fuelInfo.minFillingVolume != null && fuelInfo.minTheftVolume != null && ' · '}
                {fuelInfo.minTheftVolume != null && `Min theft: ${fuelInfo.minTheftVolume} L`}
              </p>
            )}
          </div>
        )}

        {/* Status row */}
        <div className="px-4 py-3 flex flex-wrap gap-x-4 gap-y-1 text-sm border-b border-border/50">
          {detail?.lastUpdateAge && (
            <span className="text-muted-foreground">
              Updated <span className="text-foreground font-medium">{detail.lastUpdateAge}</span>
            </span>
          )}
          {tripState && (
            <span className="text-muted-foreground">
              Trip <span className="text-foreground font-medium">{tripState}</span>
            </span>
          )}
          {detail?.trip?.ignitionOn != null && (
            <span className="text-muted-foreground">
              Ignition <span className="text-foreground font-medium">{detail.trip.ignitionOn ? 'ON' : 'OFF'}</span>
            </span>
          )}
          {liveCourse != null && status === 'moving' && (
            <span className="text-muted-foreground">
              Heading <span className="text-foreground font-medium">{Math.round(liveCourse)}°</span>
            </span>
          )}
          {live && (
            <span className="inline-flex items-center gap-1 text-status-moving text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-status-moving animate-pulse" />
              Live
            </span>
          )}
          {detail?.netconn != null && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              {detail.netconn ? <Wifi className="h-3.5 w-3.5 text-green-600" /> : <WifiOff className="h-3.5 w-3.5" />}
              <span className="text-foreground font-medium">{detail.netconn ? 'Online' : 'Offline'}</span>
            </span>
          )}
        </div>

        {/* Sensors */}
        {detailPending && !sensors.length && !detail ? (
          <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading sensors…
          </div>
        ) : null}

        {sensors.length > 0 && (
          <div className="p-4 border-b border-border/50">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Sensors</h4>
            <ul className="space-y-0 divide-y divide-border/40">
              {sensors.map((s, i) => (
                <li key={`${s.name}-${i}`} className="flex justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                  <span className="text-muted-foreground min-w-0 truncate">{s.name}</span>
                  <span className="font-semibold shrink-0 text-right">
                    {s.value}
                    {s.unit ? <span className="font-normal text-muted-foreground"> {s.unit}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {customFields.length > 0 && (
          <div className="p-4 border-b border-border/50">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Custom fields</h4>
            <ul className="space-y-0 divide-y divide-border/40">
              {customFields.map((f) => (
                <li key={f.name} className="flex justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                  <span className="text-muted-foreground min-w-0 truncate">{f.name}</span>
                  <span className="font-medium shrink-0 text-right">{f.value}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(ioInputs.length > 0 || ioOutputs.length > 0) && (
          <div className="p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">I/O</h4>
            <ul className="space-y-0 divide-y divide-border/40">
              {[...ioInputs, ...ioOutputs].map((io) => (
                <li key={io.key} className="flex justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                  <span className="text-muted-foreground">{io.label}</span>
                  <span className="font-semibold">{io.state}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {onOpenPanel && (
        <div className="p-3 border-t border-border/60 bg-muted/10 shrink-0">
          <Button variant="secondary" size="sm" className="w-full" onClick={onOpenPanel}>
            Open full detail panel
          </Button>
        </div>
      )}
    </div>
  );
}
