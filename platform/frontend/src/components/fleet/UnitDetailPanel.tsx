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
  formatFuelDisplay,
  hasEngineHoursData,
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
import { formatReadingValue } from "@/lib/formatReading";
import { useAuth } from "@/providers/AuthProvider";
import { isSystemRole } from "@/lib/systemRoles";

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
  allowWrap = false,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  allowWrap?: boolean;
}) {
  return (
    <div className="rounded border border-border/40 bg-muted/20 px-1.5 py-1 min-w-0">
      <div className="flex items-center gap-0.5 text-[9px] text-muted-foreground uppercase tracking-wide leading-none">
        <Icon className="h-2.5 w-2.5 shrink-0 opacity-70" />
        <span className="truncate">{label}</span>
      </div>
      <p
        className={cn(
          "text-[11px] font-semibold leading-tight tabular-nums mt-0.5",
          allowWrap ? "whitespace-normal break-words" : "truncate",
        )}
      >
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

function KvRows({
  rows,
}: {
  rows: Array<{ key: string; value: string; mono?: boolean }>;
}) {
  if (!rows.length) return null;
  return (
    <div className="rounded border border-border/40 divide-y divide-border/30 overflow-hidden">
      {rows.map((r) => (
        <div
          key={r.key}
          className={cn(
            "flex justify-between gap-2 px-2 py-1 bg-card/40",
            r.mono && "font-mono text-[10px]",
          )}
        >
          <span className="text-muted-foreground truncate min-w-0">{r.key}</span>
          <span className="font-semibold shrink-0 text-right break-all tabular-nums">
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatCounter(value?: number, unit?: "km" | "h"): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (unit === "h") return `${value.toFixed(2)} h`;
  if (value >= 1000) return `${Math.round(value)} km`;
  return `${value.toFixed(1)} km`;
}

function isBlankValue(value: unknown): boolean {
  const v = String(value ?? "").trim();
  return !v || v === "—" || v === "-" || v === "n/a" || v === "null";
}

/** Raw port/counter keys are device plumbing, not configured asset detail. */
function isConfiguredParam(p: { key: string; value: string }): boolean {
  const key = (p.key || "").toLowerCase();
  if (isBlankValue(p.value)) return false;
  if (/^in\d+$/.test(key) || /^out\d+$/.test(key)) return false;
  if (/^adc\d+$/.test(key) && Number(p.value) === 0) return false;
  return true;
}

/**
 * Fuel from the asset's configured level sensors — the calibrated litres, with
 * percent only against a declared tank capacity. Blank when this asset has no
 * fuel monitoring configured; nothing is substituted.
 */
function configuredFuelLabel(
  detail:
    | {
        fuel?: {
          levelLiters?: number;
          levelFormatted?: string;
          level?: number | null;
        };
        fuelLevel?: number | null;
      }
    | null
    | undefined,
): string {
  if (!detail) return "—";
  const litres = detail.fuel?.levelLiters;
  const pct = detail.fuel?.level ?? detail.fuelLevel;
  if (litres != null && Number.isFinite(litres) && litres > 0) {
    const rounded = Math.round(litres * 10) / 10;
    // Compact form fits narrow tiles: "4362 L · 44%"
    return pct != null && pct > 0 && pct <= 100
      ? `${rounded} L · ${Math.round(pct)}%`
      : `${rounded} L`;
  }
  if (pct != null && pct > 0 && pct <= 100) return `${Math.round(pct)}%`;
  const fmt = (detail.fuel?.levelFormatted || "").trim();
  return fmt || "—";
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
  const { user } = useAuth();
  // Raw Live parameters (io_*, prior, …) are platform-admin only.
  // Client portal users — including tenant_admin — use Sensors instead.
  const canSeeParameters = isSystemRole(user?.role);

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

  // Prefer Wialon detail position for geocode so we resolve the live point.
  const lat = detail?.position?.lat ?? unit?.lat;
  const lng = detail?.position?.lng ?? unit?.lng;
  const { data: geocode, isPending: geoPending } = useWialonGeocode(
    lat,
    lng,
    enabled && lat != null && lng != null,
    live,
  );

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
  const fullAddress = useMemo(
    () => (addressParts.length ? addressParts.join(", ") : address || ""),
    [addressParts, address],
  );
  const resolvingAddress =
    !addressParts.length &&
    !address &&
    geoPending &&
    lat != null &&
    lng != null;

  // Configured sensors always listed — blank readings show as "—" so the
  // Sensors block does not disappear when calc is briefly empty.
  const sensors = useMemo(
    () =>
      safeArray<{
        name: string;
        value: string | number;
        unit?: string;
        type?: string;
        param?: string;
      }>(detail?.sensors)
        .map((s) => ({
          ...s,
          display: isBlankValue(s.value)
            ? "—"
            : formatReadingValue(s.name, s.value, { unit: s.unit, type: s.type }),
        })),
    [detail?.sensors],
  );
  const messageParams = useMemo(
    () => {
      if (!canSeeParameters) return [];
      return safeArray<{ key: string; value: string }>(
        detail?.messageParams?.length ? detail.messageParams : detail?.prms,
      )
        .filter(isConfiguredParam)
        .map((p) => ({
          ...p,
          display: formatReadingValue(p.key, p.value),
        }));
    },
    [detail?.messageParams, detail?.prms, canSeeParameters],
  );
  const customFields = useMemo(
    () => safeArray<{ name: string; value: string }>(detail?.flds),
    [detail?.flds],
  );
  const profileFields = useMemo(
    () => safeArray<{ name: string; value: string }>(detail?.profileFields),
    [detail?.profileFields],
  );
  const maintenance = useMemo(
    () =>
      safeArray<{ name: string; detail?: string; counter?: number; threshold?: number }>(
        detail?.maintenance,
      ),
    [detail?.maintenance],
  );
  const ioInputs = useMemo(
    () => safeArray<{ label: string; state: string }>(detail?.io?.inputs),
    [detail?.io],
  );
  const ioOutputs = useMemo(
    () => safeArray<{ label: string; state: string }>(detail?.io?.outputs),
    [detail?.io],
  );
  const fuelTanks = useMemo(
    () =>
      safeArray<{ name: string; value: string | number; unit?: string }>(
        detail?.fuel?.tanks,
      ),
    [detail?.fuel],
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

  // Once live detail is in, prefer it over the fleet snapshot for every field.
  const displayName = detail?.name || unit.name;
  const status = (detail?.status as FleetUnit["status"]) || unit.status;
  const motionLabel = detail?.motionState || unit.motionState;
  const speed = detail?.position?.speed ?? (detail ? undefined : unit.speed);
  const course = detail?.position?.course ?? (detail ? undefined : unit.course);
  const mileage = detail?.counters?.mileage ?? (detail ? undefined : unit.mileage);
  const stationary =
    unit.stationary === true ||
    unit.assetCategory === "generator" ||
    unit.assetCategory === "machinery";
  const engineHours =
    detail?.counters?.engineHours ?? (detail ? undefined : unit.engineHours);
  const lastAge = detail?.lastUpdateAge;
  const video = detail?.video;
  const health = detail?.health as
    | {
        battery?: number;
        satellites?: number;
        hdop?: number;
        altitude?: number;
      }
    | undefined;
  const engineAsset = hasEngineHoursData({
    ...unit,
    engineHours: engineHours ?? unit.engineHours,
  });
  const isVideoUnit =
    isFleetVideoDevice(unit) || Boolean(video && Object.keys(video).length);

  const fuelDisplay = detail
    ? configuredFuelLabel(detail)
    : formatFuelDisplay(unit);

  const showScrollable = showControls;

  return (
    <div
      className={cn(
        "fleet-card flex flex-col h-full overflow-hidden p-0 relative",
        className,
      )}
    >
      {loadingAsset && (
        <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-3 py-1.5 bg-primary/8 border-b border-primary/20 text-[10px] text-primary backdrop-blur-sm">
          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
          <span>Updating sensors…</span>
        </div>
      )}
      {detailError && !loadingAsset && enabled && (
        <div className="absolute inset-x-0 top-0 z-20 px-3 py-2 bg-destructive/10 border-b border-destructive/20 text-xs text-destructive">
          Could not refresh live details for this asset.
        </div>
      )}

      <div
        className={cn(
          "shrink-0 border-b border-border/50 px-2.5 py-2",
          loadingAsset && "pt-7",
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <UnitTypeIcon
            size="sm"
            wialonId={wialonId}
            iconUgi={unit.iconUgi}
            title={displayName}
          />
          <div className="min-w-0 flex-1 space-y-1">
            <h3
              className="font-semibold text-xs leading-snug break-words"
              title={displayName}
            >
              {displayName}
            </h3>
            <div className="flex flex-wrap items-center gap-1">
              <StatusBadge status={status} label={motionLabel} size="sm" />
              {live && (
                <span className="inline-flex items-center gap-1 text-[9px] text-status-moving font-medium">
                  {quietlyRefreshing ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : (
                    <span className="w-1 h-1 rounded-full bg-status-moving animate-pulse" />
                  )}
                  Live
                </span>
              )}
            </div>
            <div className="flex items-start gap-1 text-[10px] text-muted-foreground">
              <MapPin className="h-2.5 w-2.5 shrink-0 mt-[2px]" />
              <p className="min-w-0 leading-snug break-words">
                {resolvingAddress
                  ? "Resolving address…"
                  : fullAddress ||
                    (lat != null && lng != null
                      ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
                      : "No position")}
                {fullAddress && lat != null && lng != null && (
                  <span className="opacity-60">
                    {" "}
                    · {lat.toFixed(5)}, {lng.toFixed(5)}
                  </span>
                )}
                {lastAge ? <span className="opacity-70"> · {lastAge}</span> : null}
              </p>
            </div>
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

      <div className="grid grid-cols-3 gap-1 shrink-0 px-2.5 py-1.5">
        {!stationary && (
          <Stat
            icon={Gauge}
            label="Speed"
            value={speed != null ? `${Math.round(speed)} km/h` : "—"}
          />
        )}
        {!stationary && (
          <Stat icon={Navigation} label="Odo" value={formatCounter(mileage, "km")} />
        )}
        <Stat icon={Fuel} label="Fuel" value={fuelDisplay} allowWrap />
        {engineAsset ? (
          <Stat
            icon={Clock}
            label="Eng hrs"
            value={formatCounter(engineHours, "h")}
          />
        ) : health?.battery != null && Number.isFinite(health.battery) ? (
          <Stat icon={Radio} label="Battery" value={String(health.battery)} />
        ) : null}
        {!stationary && course != null && (
          <Stat icon={Compass} label="Head" value={`${Math.round(course)}°`} />
        )}
        {health?.satellites != null && (
          <Stat icon={Navigation} label="Sats" value={String(health.satellites)} />
        )}
        {health?.hdop != null && (
          <Stat icon={Radio} label="HDOP" value={String(health.hdop)} />
        )}
        {health?.altitude != null && (
          <Stat icon={Navigation} label="Alt" value={`${Math.round(health.altitude)} m`} />
        )}
      </div>

      {showScrollable && (
        <div className="flex-1 overflow-auto border-t px-2.5 py-2 space-y-2.5 min-h-0 text-[11px]">
          {detail && (
            <DetailSection title={`Sensors · ${sensors.length}`}>
              {sensors.length > 0 ? (
                <KvRows
                  rows={sensors.map((s, i) => ({
                    key: s.param ? `${s.name} (${s.param})` : s.name || `Sensor ${i + 1}`,
                    value: s.display || "—",
                  }))}
                />
              ) : (
                <p className="text-[10px] text-muted-foreground px-0.5">
                  No sensors configured on this asset.
                </p>
              )}
            </DetailSection>
          )}

          {fuelTanks.length > 0 && (
            <DetailSection title="Fuel tanks">
              <KvRows
                rows={fuelTanks.map((t) => ({
                  key: t.name,
                  value: `${t.value}${t.unit ? ` ${t.unit}` : ""}`,
                }))}
              />
            </DetailSection>
          )}

          {messageParams.length > 0 && (
            <DetailSection title={`Live parameters · ${messageParams.length}`}>
              <KvRows
                rows={messageParams.map((p) => ({
                  key: p.key,
                  value: p.display || "—",
                  mono: true,
                }))}
              />
            </DetailSection>
          )}

          {(ioInputs.length > 0 || ioOutputs.length > 0) && (
            <DetailSection title="I/O">
              <KvRows
                rows={[
                  ...ioInputs.map((i) => ({ key: i.label, value: i.state })),
                  ...ioOutputs.map((o) => ({ key: o.label, value: o.state })),
                ]}
              />
            </DetailSection>
          )}

          {customFields.length > 0 && (
            <DetailSection title={`Custom fields · ${customFields.length}`}>
              <KvRows
                rows={customFields.map((f) => ({
                  key: f.name,
                  value: f.value === "" ? "—" : f.value,
                }))}
              />
            </DetailSection>
          )}

          {profileFields.length > 0 && (
            <DetailSection title={`Profile fields · ${profileFields.length}`}>
              <KvRows
                rows={profileFields.map((f) => ({
                  key: f.name,
                  value: f.value === "" ? "—" : f.value,
                }))}
              />
            </DetailSection>
          )}

          {maintenance.length > 0 && (
            <DetailSection title="Service intervals">
              <KvRows
                rows={maintenance.map((m) => ({
                  key: m.name,
                  value:
                    m.detail ||
                    (m.counter != null && m.threshold != null
                      ? `${m.counter} / ${m.threshold}`
                      : m.counter != null
                        ? String(m.counter)
                        : "—"),
                }))}
              />
            </DetailSection>
          )}

          {commands && commands.length > 0 && (
            <DetailSection title="Commands">
              <div className="flex flex-wrap gap-1">
                {commands.map((c, i) =>
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
              Loading sensors…
            </p>
          )}

          {detail &&
            sensors.length === 0 &&
            messageParams.length === 0 &&
            customFields.length === 0 && (
              <p className="text-[10px] text-muted-foreground">
                No sensors or fields are configured for this asset.
              </p>
            )}
        </div>
      )}

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
