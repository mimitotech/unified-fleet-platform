import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  X,
  Gauge,
  MapPin,
  Clock,
  History,
  Fuel,
  Navigation,
  Compass,
  Video,
  Loader2,
  Radio,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { UnitTypeIcon } from "@/components/fleet/UnitTypeIcon";
import { WialonCommandButton } from "@/components/fleet/WialonCommandButton";
import {
  hasEngineHoursData,
  formatFuelDisplay,
  isFleetVideoDevice,
  type FleetUnit,
} from "@/lib/fleetUnits";
import { cn } from "@/lib/utils";
import { safeArray } from "@/lib/safeArray";
import {
  useWialonUnitCommands,
  useWialonUnitDetail,
} from "@/hooks/useWialonLive";
import { useWialonGeocode } from "@/hooks/useWialonGeocode";

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

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded border border-border/40 bg-muted/20 px-1.5 py-1 min-w-0">
      <div className="flex items-center gap-0.5 text-[9px] text-muted-foreground uppercase tracking-wide leading-none">
        <Icon className="h-2.5 w-2.5 shrink-0 opacity-70" />
        <span className="truncate">{label}</span>
      </div>
      <p className="text-[11px] font-semibold leading-tight tabular-nums truncate mt-0.5">
        {value}
      </p>
    </div>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1">
      <h4 className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
        {title}
      </h4>
      {children}
    </section>
  );
}

type SensorRow = {
  name: string;
  value: string | number;
  unit?: string;
  type?: string;
};

function sensorGroup(name: string, type?: string): string {
  const blob = `${name} ${type || ""}`.toLowerCase();
  if (/fuel|lls|tank|litre|liter/.test(blob)) return "Fuel";
  if (/ignition|acc|engine\s*on|engine\s*off|rpm|moto/.test(blob))
    return "Powertrain";
  if (/batter|voltage|pwr|power|volt|amp/.test(blob)) return "Power / Battery";
  if (/temp|coolant|thermo|ambient/.test(blob)) return "Temperature";
  if (/door|hatch|boot|trunk|cover/.test(blob)) return "Doors / Security";
  if (/speed|gps|sat|hdop|altitude|course|odometer|mileage/.test(blob))
    return "Location / Motion";
  if (/hour|mh\b|counter/.test(blob)) return "Counters";
  return "Other";
}

const SENSOR_GROUP_ORDER = [
  "Fuel",
  "Powertrain",
  "Power / Battery",
  "Temperature",
  "Doors / Security",
  "Location / Motion",
  "Counters",
  "Other",
];

function groupSensors(
  sensors: SensorRow[],
): Array<{ group: string; items: SensorRow[] }> {
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

function formatCounter(value?: number, unit?: "km" | "h"): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (unit === "h") return `${value.toFixed(2)} h`;
  if (value >= 1000) return `${Math.round(value)} km`;
  return `${value.toFixed(1)} km`;
}

/** Device battery may arrive as %, volts, or millivolts — never show raw ADC as "%". */
function formatBatteryReading(value: number): string {
  if (value <= 100) return `${Math.round(value)}%`;
  if (value < 60) return `${value.toFixed(1)} V`;
  if (value < 100_000) return `${(value / 1000).toFixed(2)} V`;
  return String(Math.round(value));
}

function isEmptySensorValue(value: unknown): boolean {
  const v = String(value ?? "").trim();
  return !v || v === "—" || v === "-" || v === "n/a" || v === "null";
}

function isUsefulSensor(s: SensorRow): boolean {
  if (isEmptySensorValue(s.value)) return false;
  const name = (s.name || "").toLowerCase();
  if (/^in\d+$/i.test(name) || /^out\d+$/i.test(name)) return false;
  return true;
}

function isUsefulParam(p: { key: string; value: string }): boolean {
  const key = (p.key || "").toLowerCase();
  if (/^in\d+$/.test(key) || /^out\d+$/.test(key)) return false;
  if (/^adc\d+$/.test(key) && (p.value === "0" || p.value === "0.0")) return false;
  if (isEmptySensorValue(p.value)) return false;
  return true;
}

function formatParamValue(key: string, value: string): string {
  const k = key.toLowerCase();
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if (k === "odometer" || k === "mileage") {
    if (n > 100_000) return `${Math.round(n / 1000)} km`;
    return `${Math.round(n)} km`;
  }
  if (k === "battery" || k === "pwr_int" || k === "pwr_ext") {
    return formatBatteryReading(n);
  }
  return value;
}

/** Prefer calibrated fleet litres over raw ADC from unit-detail calcSensors. */
function resolveDisplayFuel(
  unit: FleetUnit,
  detail?: {
    fuel?: { levelLiters?: number; levelFormatted?: string };
    fuelLevel?: number;
  } | null,
): Parameters<typeof formatFuelDisplay>[0] {
  const capacity = unit.tankCapacity;
  const fleetL = unit.fuelLiters;
  const detailL = detail?.fuel?.levelLiters;
  let litres = detailL ?? fleetL;

  if (fleetL != null && Number.isFinite(fleetL)) {
    if (detailL == null) {
      litres = fleetL;
    } else if (capacity && capacity > 0) {
      if (detailL > capacity * 1.5 && fleetL <= capacity * 1.25) litres = fleetL;
    } else if (detailL > 800 && fleetL < 500 && detailL / Math.max(fleetL, 1) > 4) {
      litres = fleetL;
    }
  }

  return {
    fuelLiters: litres,
    fuelFormatted:
      litres === fleetL
        ? unit.fuelFormatted
        : detail?.fuel?.levelFormatted ?? unit.fuelFormatted,
    fuelLevel: detail?.fuelLevel ?? unit.fuelLevel,
    tankCapacity: capacity,
  };
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
  const wialonId =
    unit?.wialonId ??
    (unit && Number.isFinite(Number(unit.id)) ? Number(unit.id) : undefined);
  const enabled = showControls && wialonId != null && Number.isFinite(wialonId);
  const {
    data: detail,
    isPending: detailPending,
    isFetching: detailFetching,
    isError: detailError,
  } = useWialonUnitDetail(wialonId ?? null, enabled, live);

  const lat = detail?.position?.lat ?? unit?.lat;
  const lng = detail?.position?.lng ?? unit?.lng;
  const { data: geocode, isPending: geoPending } = useWialonGeocode(
    lat,
    lng,
    enabled && lat != null && lng != null,
    live,
  );

  // Only block the panel on the *first* load. Live polls set isFetching every few
  // seconds — showing "Loading asset data…" then makes the UI feel unstable.
  const loadingAsset = enabled && detailPending && !detail;
  const quietlyRefreshing = enabled && detailFetching && !!detail;
  const { data: commandsPayload } = useWialonUnitCommands(
    wialonId ?? null,
    enabled && !!detail,
  );
  const commands = commandsPayload?.commands;

  const address = detail?.address || geocode?.address;
  const addressParts = useMemo(
    () =>
      safeArray<string>(
        detail?.addressParts || geocode?.parts || (address ? [address] : []),
      ),
    [detail?.addressParts, geocode?.parts, address],
  );
  const resolvingAddress =
    !addressParts.length &&
    !address &&
    geoPending &&
    lat != null &&
    lng != null;
  const sensors = detail?.sensors || [];
  // Must run before any early return — React #310 if hooked only when unit is set.
  const sensorGroups = useMemo(
    () => groupSensors((sensors as SensorRow[]).filter(isUsefulSensor)),
    [sensors],
  );
  const usefulParams = useMemo(
    () =>
      safeArray<{ key: string; value: string }>(detail?.prms).filter(isUsefulParam),
    [detail?.prms],
  );

  if (!unit) {
    return (
      <div
        className={cn(
          "fleet-card flex flex-col items-center justify-center h-full min-h-[200px] text-center px-4",
          className,
        )}
      >
        <MapPin className="h-8 w-8 text-muted-foreground/40 mb-2" />
        <p className="text-muted-foreground text-sm">
          Select a unit to view live details
        </p>
      </div>
    );
  }

  const displayName = detail?.name || unit.name;
  const status = (detail?.status as FleetUnit["status"]) || unit.status;
  const motionLabel = detail?.motionState || unit.motionState;
  const speed = detail?.position?.speed ?? unit.speed;
  const course = detail?.position?.course ?? unit.course;
  const mileage = detail?.counters?.mileage ?? unit.mileage;
  const stationary =
    unit.stationary === true ||
    unit.assetCategory === "generator" ||
    unit.assetCategory === "machinery";
  const engineHours = detail?.counters?.engineHours ?? unit.engineHours;
  const lastAge = detail?.lastUpdateAge;
  const parameters = usefulParams;
  const customFields = detail?.flds || [];
  const video = detail?.video;
  const health = detail?.health as
    | {
        battery?: number;
        satellites?: number;
        hdop?: number;
        altitude?: number;
      }
    | undefined;
  const engineAsset = hasEngineHoursData({ ...unit, engineHours });
  const isVideoUnit =
    isFleetVideoDevice(unit) || Boolean(video && Object.keys(video).length);

  const fuelDisplay = formatFuelDisplay(resolveDisplayFuel(unit, detail));

  const showScrollable =
    showControls && (!compact || sensors.length > 0 || parameters.length > 0);
  const sensorLimit = compact ? 6 : 16;
  const paramLimit = compact ? 8 : 14;

  return (
    <div
      className={cn(
        "fleet-card flex flex-col h-full overflow-hidden p-0 relative",
        className,
      )}
    >
      {loadingAsset && (
        <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-3 py-2 bg-primary/8 border-b border-primary/20 text-xs text-primary backdrop-blur-sm">
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          <span>Loading asset data…</span>
        </div>
      )}
      {detailError && !loadingAsset && enabled && (
        <div className="absolute inset-x-0 top-0 z-20 px-3 py-2 bg-destructive/10 border-b border-destructive/20 text-xs text-destructive">
          Could not refresh live sensors — showing last known fleet data.
        </div>
      )}
      {/* Header — compact */}
      <div
        className={cn(
          "shrink-0 border-b border-border/50 px-2.5 py-2",
          loadingAsset && "pt-9",
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <UnitTypeIcon
            size="sm"
            wialonId={wialonId}
            iconUgi={unit.iconUgi}
            title={displayName}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <h3 className="font-semibold text-xs leading-tight truncate">
                {displayName}
              </h3>
              <StatusBadge status={status} label={motionLabel} size="sm" />
              {live && (
                <span className="inline-flex items-center gap-1 text-[9px] text-status-moving font-medium shrink-0">
                  {quietlyRefreshing ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : (
                    <span className="w-1 h-1 rounded-full bg-status-moving animate-pulse" />
                  )}
                  Live
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground truncate mt-0.5 flex items-center gap-1">
              <MapPin className="h-2.5 w-2.5 shrink-0" />
              {resolvingAddress
                ? "Resolving…"
                : addressParts[0] ||
                  address ||
                  (lat != null && lng != null
                    ? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
                    : "No position")}
              {lastAge ? <span className="opacity-70">· {lastAge}</span> : null}
            </p>
          </div>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={onClose}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Stats — dense 3-col */}
      <div className="grid grid-cols-3 gap-1 shrink-0 px-2.5 py-1.5">
        {!stationary && (
          <Stat
            icon={Gauge}
            label="Speed"
            value={speed != null ? `${Math.round(speed)} km/h` : "0 km/h"}
          />
        )}
        {!stationary && (
          <Stat
            icon={Navigation}
            label="Odo"
            value={formatCounter(mileage, "km")}
          />
        )}
        <Stat icon={Fuel} label="Fuel" value={fuelDisplay} />
        {engineAsset ? (
          <Stat
            icon={Clock}
            label="Eng hrs"
            value={formatCounter(engineHours, "h")}
          />
        ) : health?.battery != null && Number.isFinite(health.battery) ? (
          <Stat
            icon={Radio}
            label="Battery"
            value={formatBatteryReading(health.battery)}
          />
        ) : null}
        {!stationary && course != null && status === "moving" && (
          <Stat
            icon={Compass}
            label="Head"
            value={`${Math.round(course)}°`}
          />
        )}
        {health?.satellites != null && (
          <Stat
            icon={Navigation}
            label="Sats"
            value={String(health.satellites)}
          />
        )}
      </div>

      {/* Scrollable detail — only useful rows */}
      {showScrollable && (
        <div className="flex-1 overflow-auto border-t px-2.5 py-2 space-y-2.5 min-h-0 text-[11px]">
          {sensorGroups.length > 0 && (
            <DetailSection title="Sensors">
              <div className="rounded border border-border/40 divide-y divide-border/30 overflow-hidden">
                {sensorGroups.flatMap((g) =>
                  g.items
                    .slice(0, Math.max(2, Math.ceil(sensorLimit / Math.max(sensorGroups.length, 1))))
                    .map((s, i) => (
                      <div
                        key={`${g.group}-${s.name}-${i}`}
                        className="flex justify-between gap-2 px-2 py-1 bg-card/40"
                      >
                        <span className="text-muted-foreground truncate min-w-0">
                          {s.name}
                        </span>
                        <span className="font-semibold shrink-0 tabular-nums">
                          {s.value}
                          {s.unit ? ` ${s.unit}` : ""}
                        </span>
                      </div>
                    )),
                )}
              </div>
            </DetailSection>
          )}

          {parameters.length > 0 && (
            <DetailSection title="Key params">
              <div className="rounded border border-border/40 divide-y divide-border/30 overflow-hidden">
                {parameters.slice(0, paramLimit).map((p) => (
                  <div
                    key={p.key}
                    className="flex justify-between gap-2 px-2 py-1 bg-card/40 font-mono text-[10px]"
                  >
                    <span className="text-muted-foreground shrink-0 max-w-[40%] truncate">
                      {p.key}
                    </span>
                    <span className="font-medium text-right truncate">
                      {formatParamValue(p.key, p.value)}
                    </span>
                  </div>
                ))}
              </div>
            </DetailSection>
          )}

          {customFields.length > 0 && !compact && (
            <DetailSection title="Custom fields">
              <dl className="space-y-0.5">
                {customFields.slice(0, 6).map((f) => (
                  <div key={f.name} className="flex justify-between gap-2">
                    <dt className="text-muted-foreground truncate">{f.name}</dt>
                    <dd className="font-medium text-right truncate">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </DetailSection>
          )}

          {commands && commands.length > 0 && (
            <DetailSection title="Commands">
              <div className="flex flex-wrap gap-1">
                {commands
                  .slice(0, compact ? 4 : 6)
                  .map((c, i) =>
                    wialonId ? (
                      <WialonCommandButton
                        key={`${c.name}-${i}`}
                        unitId={wialonId}
                        commandName={c.name}
                        label={c.label || c.name}
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] px-1.5"
                      />
                    ) : null,
                  )}
              </div>
            </DetailSection>
          )}

          {detailPending && !detail && wialonId && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading data…
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="shrink-0 border-t bg-muted/20 flex flex-wrap gap-1 p-1.5">
        {onViewOnMap && (
          <Button
            variant="secondary"
            size="sm"
            className="h-7 text-[10px] flex-1 min-w-[4.5rem]"
            onClick={() => onViewOnMap(unit)}
          >
            <MapPin className="h-3 w-3 mr-1" />
            Map
          </Button>
        )}
        {onTripHistory && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[10px] flex-1 min-w-[4.5rem]"
            onClick={() => onTripHistory(unit)}
          >
            <History className="h-3 w-3 mr-1" />
            Track
          </Button>
        )}
        {isVideoUnit && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[10px] flex-1 min-w-[4.5rem]"
            asChild
          >
            <Link
              to={`/app/surveillance${wialonId ? `?unitId=${wialonId}` : ""}`}
            >
              <Video className="h-3 w-3 mr-1" />
              Video
            </Link>
          </Button>
        )}
        {wialonId && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[10px] flex-1 min-w-[4.5rem]"
            asChild
          >
            <Link to={`/app/commands?unit=${wialonId}`}>
              <Radio className="h-3 w-3 mr-1" />
              Commands
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
