import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Fuel,
  Gauge,
  Route,
  Satellite,
  Truck,
  Users,
  Video,
  Wrench,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/app/AppLayout";
import { MetricCard } from "@/components/app/MetricCard";
import { WialonContextBanner } from "@/components/app/WialonContextBanner";
import { AnimatedPage } from "@/components/shared/PageLoader";
import { BrandedPageLoader } from "@/components/shared/BrandedPageLoader";
import { QueryErrorBanner } from "@/components/shared/QueryErrorBanner";
import {
  DashboardSectionLabel,
  DashboardWidget,
} from "@/components/dashboard/DashboardWidget";
import {
  CompactBars,
  CompactComposed,
  CompactDonut,
  CompactDualAxis,
  CompactMultiLine,
  CompactRadial,
  CompactStackedHBars,
  CompactStageBars,
  LegendDots,
  alertSeveritySlices,
  fleetStatusSlices,
} from "@/components/dashboard/DashboardCharts";
import {
  aggregateUnitFuelColumns,
  computePeriodFuelKpis,
} from "@/components/fuel/fuelColumnMetrics";
import { filterFuelTransactionsByDate } from "@/components/fuel/fuelTransactionFilters";
import {
  DashboardQuickAccess,
  moduleEnabledSet,
} from "@/components/dashboard/DashboardQuickAccess";
import {
  DashboardArrangeBoard,
  DashboardArrangeItem,
} from "@/components/dashboard/DashboardArrangeBoard";
import { DashboardToolbar } from "@/components/dashboard/DashboardToolbar";
import {
  type PeriodPreset,
  shiftDays,
  localDateIso,
} from "@/components/shared/PeriodAssetControls";
import { useFleetUnits } from "@/hooks/useFleetUnits";
import { useAlerts } from "@/hooks/useAlerts";
import { useModules } from "@/hooks/useModules";
import { useTenantBranding } from "@/hooks/useTenantBranding";
import { useAuth } from "@/providers/AuthProvider";
import { useWialonContext } from "@/hooks/useWialon";
import { useFleetAssetProfile } from "@/hooks/useFleetAssetProfile";
import {
  useDriverStats,
  useGeofences,
  useRouteStats,
  useVideoStreams,
  useWorkshopKpis,
} from "@/hooks/useDomain";
import {
  useFuelTransactions,
  useGeneratorFuelTransactions,
  useMachineryFuelTransactions,
  useFuelFleetSummary,
  useLiveFuelLevels,
  fleetQueryKeys,
} from "@/services/fleet";
import { applyPriceToKpis } from "@/components/fuel/fuelReportStats";
import { useWialonGeofencesLive } from "@/hooks/useWialonLive";
import { clientApi, getTenantSlug } from "@/lib/api";
import { ALERT_SEVERITY, FLEET_STATUS } from "@/lib/chartColors";
import {
  defaultDashboardLayout,
  loadDashboardLayout,
  saveDashboardLayout,
  type DashboardLayoutState,
} from "@/lib/dashboardLayoutPrefs";
import {
  isWidgetVisible,
  loadWidgetVisibility,
  resolveDashboardFuelPrice,
  saveWidgetVisibility,
  type DashboardWidgetId,
  type DashboardWidgetVisibility,
} from "@/lib/dashboardWidgetPrefs";
import type { FleetUnit } from "@/lib/fleetUnits";
import { LIVE_POLL, livePollLabel } from "@/lib/liveRefresh";
import { safeArray } from "@/lib/safeArray";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { SectionPrintButtons } from "@/components/shared/SectionPrintButtons";

const SECTION = "space-y-2.5";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmt(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function fmtUgx(n: number): string {
  return new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: "UGX",
    maximumFractionDigits: 0,
  }).format(n);
}

function shortName(name: string, max = 18): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

function todayIso(): string {
  // Local calendar day — must match Fuel module (not UTC, which lags in UTC+).
  return localDateIso();
}

function unitParam(unit: FleetUnit, ...keys: string[]): number | null {
  const params = unit.lmsg?.params || {};
  for (const k of keys) {
    const v = params[k];
    if (v != null && v !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  for (const p of unit.prms || []) {
    if (keys.includes(p.key) && Number.isFinite(Number(p.value)))
      return Number(p.value);
  }
  for (const s of unit.sens || []) {
    const name = String(s.name || "").toLowerCase();
    const type = String(s.type || "").toLowerCase();
    const hit = keys.some(
      (k) => name.includes(k.toLowerCase()) || type.includes(k.toLowerCase()),
    );
    if (!hit) continue;
    const paramKey = s.param;
    if (
      paramKey &&
      params[paramKey] != null &&
      Number.isFinite(Number(params[paramKey]))
    ) {
      return Number(params[paramKey]);
    }
  }
  return null;
}

function healthBucket(u: FleetUnit): "healthy" | "attention" | "unhealthy" {
  if (u.status === "offline" || !u.lastUpdate) return "unhealthy";
  const age = Date.now() - u.lastUpdate.getTime();
  const lowFuel = u.fuelLevel != null && u.fuelLevel > 0 && u.fuelLevel < 15;
  if (age > 24 * 60 * 60_000 || (lowFuel && age > 60 * 60_000))
    return "unhealthy";
  if (
    age > 60 * 60_000 ||
    (u.fuelLevel != null && u.fuelLevel > 0 && u.fuelLevel < 25)
  ) {
    return "attention";
  }
  return "healthy";
}

export default function Dashboard() {
  const { user } = useAuth();
  const branding = useTenantBranding();
  const brand = branding.primaryColor;
  const accent = branding.accentColor;
  const secondary = branding.secondaryColor;
  const isAdmin =
    user?.role === "tenant_admin" || user?.role === "platform_admin";
  const { modules } = useModules();
  const enabled = useMemo(
    () => moduleEnabledSet(modules, isAdmin),
    [modules, isAdmin],
  );

  const hasMonitoring = enabled.has("monitoring");
  const hasAlerts = enabled.has("alerts");
  const hasFuel = enabled.has("fuel");
  const hasWorkshop = enabled.has("workshop");
  const hasDrivers = enabled.has("drivers");
  const hasRoutes = enabled.has("routes");
  const hasCommands = enabled.has("commands");
  const hasSurveillance = enabled.has("surveillance");
  const hasGeofencing = enabled.has("geofencing");

  const queryClient = useQueryClient();
  const todayStr = useMemo(() => todayIso(), []);
  const [draftPreset, setDraftPreset] = useState<PeriodPreset | "custom">("7d");
  const [draftFrom, setDraftFrom] = useState(() => shiftDays(todayIso(), -6));
  const [draftTo, setDraftTo] = useState(() => todayIso());
  const [applied, setApplied] = useState(() => ({
    from: shiftDays(todayIso(), -6),
    to: todayIso(),
  }));
  const [executing, setExecuting] = useState(false);
  const [executeFlash, setExecuteFlash] = useState(0);

  const [visibility, setVisibility] = useState<DashboardWidgetVisibility>(() =>
    loadWidgetVisibility(getTenantSlug()),
  );
  const [layout, setLayout] = useState<DashboardLayoutState>(() =>
    loadDashboardLayout(getTenantSlug()),
  );
  const [arrangeMode, setArrangeMode] = useState(false);

  const show = useCallback(
    (id: DashboardWidgetId) => isWidgetVisible(visibility, id),
    [visibility],
  );

  const toggleWidget = useCallback((id: DashboardWidgetId, next: boolean) => {
    setVisibility((prev) => {
      const updated = { ...prev, [id]: next };
      saveWidgetVisibility(updated, getTenantSlug());
      return updated;
    });
  }, []);

  const updateLayout = useCallback((next: DashboardLayoutState) => {
    setLayout(next);
    saveDashboardLayout(next, getTenantSlug());
  }, []);

  const resetLayout = useCallback(() => {
    const next = defaultDashboardLayout();
    setLayout(next);
    saveDashboardLayout(next, getTenantSlug());
  }, []);

  const onExecute = useCallback(async () => {
    const from = draftFrom <= draftTo ? draftFrom : draftTo;
    const to = draftFrom <= draftTo ? draftTo : draftFrom;
    setExecuting(true);
    setApplied({ from, to });
    setExecuteFlash((n) => n + 1);
    try {
      // Invalidate the same fleet query keys the Fuel module tabs use.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: fleetQueryKeys.fuel() }),
        queryClient.invalidateQueries({ queryKey: fleetQueryKeys.fuelFleetSummary() }),
        queryClient.invalidateQueries({ queryKey: ["alerts"] }),
        queryClient.invalidateQueries({ queryKey: ["trips", "dashboard"] }),
      ]);
      await Promise.all([
        queryClient.refetchQueries({
          queryKey: fleetQueryKeys.fuelTransactions(),
          type: "active",
        }),
        queryClient.refetchQueries({
          queryKey: fleetQueryKeys.generatorFuelTransactions(),
          type: "active",
        }),
        queryClient.refetchQueries({
          queryKey: fleetQueryKeys.machineryFuelTransactions(),
          type: "active",
        }),
        queryClient.refetchQueries({
          queryKey: fleetQueryKeys.fuelLevels(),
          type: "active",
        }),
        hasAlerts
          ? queryClient.refetchQueries({ queryKey: ["alerts"], type: "active" })
          : Promise.resolve(),
      ]);
    } finally {
      window.setTimeout(() => setExecuting(false), 300);
    }
  }, [draftFrom, draftTo, queryClient, hasAlerts]);

  // Local wall-clock bounds — same encoding as the Alerts module so the same
  // calendar day never drifts across midnight timezone conversion.
  const alertFromIso = useMemo(() => `${applied.from}T00:00:00`, [applied.from]);
  const alertToIso = useMemo(() => `${applied.to}T23:59:59`, [applied.to]);

  const {
    units,
    counts,
    statuses,
    live,
    isLoading: fleetLoading,
  } = useFleetUnits();
  const {
    connected,
    configured,
    ctx,
    tierName,
    counts: wialonCounts,
  } = useWialonContext();
  const assetProfile = useFleetAssetProfile();
  const accountName = ctx?.accountName || "";
  const accountUnitCount =
    (ctx?.sessionMeta as { scopedAccountId?: number } | undefined)?.scopedAccountId
      ? ctx?.previewAssetCount ?? wialonCounts?.units
      : wialonCounts?.units ?? ctx?.previewAssetCount;
  const {
    data: alerts,
    isError: alertsError,
    refetch: refetchAlerts,
  } = useAlerts(2000, hasAlerts, {
    from: alertFromIso,
    to: alertToIso,
  });
  const alertList = useMemo(
    () =>
      safeArray<{
        id?: string;
        title?: string;
        severity?: string;
        type?: string;
        timestamp?: string;
        acknowledged?: boolean;
        assetId?: string;
      }>(alerts).filter((a) => {
        if (!a.timestamp) return true;
        const t = new Date(a.timestamp).getTime();
        if (!Number.isFinite(t)) return false;
        // Hide future period-end stamps from dashboard critical / charts.
        return t <= Date.now() + 60_000;
      }),
    [alerts],
  );

  // Fuel totals must match the Fuel module exactly: fetch the SAME category-scoped
  // transactions the Fuel tabs use and merge them, instead of the fleet-wide
  // unscoped harvest (which inflates via group summaries + balance-derived used).
  const { data: fuelSummary } = useFuelFleetSummary();
  const fuelSupport = fuelSummary?.supportedCategories;
  // Only pull categories this account actually exposes on the Fuel tabs.
  // Never guess from name heuristics while support is loading — that briefly
  // enabled empty generator/machinery queries that returned the full fleet and
  // stacked the same fills onto Dashboard KPIs.
  const wantVehicleFuel = hasFuel && (fuelSupport ? fuelSupport.vehicle !== false : true);
  const wantGeneratorFuel =
    hasFuel && fuelSupport?.generator === true && (fuelSummary?.generators ?? 0) > 0;
  const wantMachineryFuel =
    hasFuel && fuelSupport?.machinery === true && (fuelSummary?.machinery ?? 0) > 0;

  // Same React Query keys the Fuel module tabs use, so refresh / warming / invalidation
  // keep Dashboard and Fuel on identical transaction sets for the same period.
  const vehicleFuelTx = useFuelTransactions(
    { startDate: applied.from, endDate: applied.to, assetCategory: "vehicle" },
    { enabled: wantVehicleFuel },
  );
  const generatorFuelTx = useGeneratorFuelTransactions(
    { startDate: applied.from, endDate: applied.to },
    { enabled: wantGeneratorFuel },
  );
  const machineryFuelTx = useMachineryFuelTransactions(
    { startDate: applied.from, endDate: applied.to },
    { enabled: wantMachineryFuel },
  );

  const fuelTxError =
    (wantVehicleFuel && vehicleFuelTx.isError) ||
    (wantGeneratorFuel && generatorFuelTx.isError) ||
    (wantMachineryFuel && machineryFuelTx.isError);

  const refetchFuelTx = useCallback(() => {
    if (wantVehicleFuel) void vehicleFuelTx.refetch();
    if (wantGeneratorFuel) void generatorFuelTx.refetch();
    if (wantMachineryFuel) void machineryFuelTx.refetch();
  }, [
    wantVehicleFuel,
    wantGeneratorFuel,
    wantMachineryFuel,
    vehicleFuelTx,
    generatorFuelTx,
    machineryFuelTx,
  ]);

  const fuelTransactions = useMemo(
    () => [
      ...(wantVehicleFuel ? vehicleFuelTx.data?.transactions ?? [] : []),
      ...(wantGeneratorFuel ? generatorFuelTx.data?.transactions ?? [] : []),
      ...(wantMachineryFuel ? machineryFuelTx.data?.transactions ?? [] : []),
    ],
    [
      wantVehicleFuel,
      wantGeneratorFuel,
      wantMachineryFuel,
      vehicleFuelTx.data,
      generatorFuelTx.data,
      machineryFuelTx.data,
    ],
  );
  const { data: workshopKpis } = useWorkshopKpis(hasWorkshop);
  const { data: driverStats } = useDriverStats(hasDrivers);
  const { data: routeStats } = useRouteStats(hasRoutes);
  const { data: videoStreams } = useVideoStreams(hasSurveillance);
  const { data: geofencesDb } = useGeofences(hasGeofencing);
  const { data: geofencesLive } = useWialonGeofencesLive(
    hasGeofencing && connected,
  );
  const { data: trips } = useQuery({
    queryKey: ["trips", "dashboard", applied.from, applied.to],
    queryFn: () =>
      clientApi.getTrips(200, { from: applied.from, to: applied.to }),
    enabled: hasRoutes,
    staleTime: 90_000,
  });
  const { data: tenantUsers } = useQuery({
    queryKey: ["tenantUsers", "dashboard"],
    queryFn: () => clientApi.getTenantUsers(),
    enabled: isAdmin,
    staleTime: 120_000,
  });
  const { data: commandHistory } = useQuery({
    queryKey: ["commandHistory", "dashboard"],
    queryFn: () => clientApi.getCommandHistory(),
    enabled: hasCommands,
    staleTime: 90_000,
  });

  const [fuelPrice, setFuelPrice] = useState(() => resolveDashboardFuelPrice());
  useEffect(() => {
    const sync = () => setFuelPrice(resolveDashboardFuelPrice());
    window.addEventListener("mams:fuel-price", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("mams:fuel-price", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const onlineCount = Math.max(0, counts.total - counts.offline);

  const ignitionById = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const s of statuses ?? []) {
      map.set(String(s.assetId), Boolean(s.wialon?.trip?.ignitionOn));
    }
    return map;
  }, [statuses]);

  const statusSlices = useMemo(() => fleetStatusSlices(counts), [counts]);

  const connectionSlices = useMemo(
    () =>
      [
        { name: "Online", value: onlineCount, color: brand },
        { name: "Offline", value: counts.offline, color: FLEET_STATUS.offline },
      ].filter((s) => s.value > 0),
    [onlineCount, counts.offline, brand],
  );

  const healthSlices = useMemo(() => {
    const buckets = { healthy: 0, attention: 0, unhealthy: 0 };
    for (const u of units ?? []) {
      buckets[healthBucket(u)] += 1;
    }
    return [
      { name: "Healthy", value: buckets.healthy, color: FLEET_STATUS.moving },
      {
        name: "Need attention",
        value: buckets.attention,
        color: ALERT_SEVERITY.warning,
      },
      {
        name: "Unhealthy",
        value: buckets.unhealthy,
        color: ALERT_SEVERITY.critical,
      },
    ].filter((s) => s.value > 0);
  }, [units]);

  const motionIgnition = useMemo(() => {
    const buckets = {
      Moving: { withIgn: 0, withoutIgn: 0 },
      Idle: { withIgn: 0, withoutIgn: 0 },
      Stopped: { withIgn: 0, withoutIgn: 0 },
    };
    for (const u of units ?? []) {
      if (u.status === "offline") continue;
      const ign = ignitionById.get(String(u.id)) ?? false;
      const key =
        u.status === "moving"
          ? "Moving"
          : u.status === "idle"
            ? "Idle"
            : "Stopped";
      if (ign) buckets[key].withIgn += 1;
      else buckets[key].withoutIgn += 1;
    }
    return (["Moving", "Idle", "Stopped"] as const).map((name) => ({
      name,
      withIgn: buckets[name].withIgn,
      withoutIgn: buckets[name].withoutIgn,
    }));
  }, [units, ignitionById]);

  const motionStateSlices = useMemo(() => {
    let movingIgn = 0;
    let moving = 0;
    let stationaryIgn = 0;
    let stationary = 0;
    let noCoords = 0;
    let noState = 0;
    for (const u of units ?? []) {
      const hasCoords = u.lat != null && u.lng != null;
      if (!hasCoords) {
        noCoords += 1;
        continue;
      }
      if (u.status === "offline") {
        noState += 1;
        continue;
      }
      const ign = ignitionById.get(String(u.id)) ?? false;
      if (u.status === "moving") {
        if (ign) movingIgn += 1;
        else moving += 1;
      } else if (ign) {
        stationaryIgn += 1;
      } else {
        stationary += 1;
      }
    }
    return [
      { name: "Moving + ign", value: movingIgn, color: FLEET_STATUS.moving },
      { name: "Moving", value: moving, color: brand },
      {
        name: "Stationary + ign",
        value: stationaryIgn,
        color: FLEET_STATUS.idle,
      },
      { name: "Stationary", value: stationary, color: FLEET_STATUS.stopped },
      { name: "No coordinates", value: noCoords, color: "#94a3b8" },
      { name: "No actual state", value: noState, color: FLEET_STATUS.offline },
    ].filter((s) => s.value > 0);
  }, [units, ignitionById, brand]);

  const mileageLeaders = useMemo(
    () =>
      (units ?? [])
        .filter((u) => num(u.mileage) > 0)
        .map((u, i) => ({
          name: shortName(u.name),
          value: Math.round(num(u.mileage)),
          fill: i % 2 === 0 ? brand : accent,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
    [units, brand, accent],
  );

  const totalMileage = useMemo(
    () => (units ?? []).reduce((s, u) => s + num(u.mileage), 0),
    [units],
  );

  const batteryBars = useMemo(() => {
    // Battery % only — do not mix with internal voltage (pwr_int).
    const rows = (units ?? [])
      .map((u) => {
        const v = unitParam(u, "battery");
        if (v == null || v <= 0 || v > 100) return null;
        return {
          name: shortName(u.name),
          fullName: u.name,
          value: Math.round(v * 10) / 10,
          fill: brand,
        };
      })
      .filter(Boolean) as Array<{
      name: string;
      fullName: string;
      value: number;
      fill: string;
    }>;
    return rows.sort((a, b) => a.value - b.value).slice(0, 8);
  }, [units, brand]);

  const voltageBars = useMemo(() => {
    // External / supply / internal voltage sensors (volts) — separate from battery %.
    const rows = (units ?? [])
      .map((u) => {
        const v = unitParam(
          u,
          "pwr_ext",
          "ext_voltage",
          "external_voltage",
          "battery_voltage",
          "pwr_int",
        );
        if (v == null || v <= 0) return null;
        return {
          name: shortName(u.name),
          fullName: u.name,
          value: Math.round(v * 10) / 10,
          fill: accent,
        };
      })
      .filter(Boolean) as Array<{
      name: string;
      fullName: string;
      value: number;
      fill: string;
    }>;
    return rows.sort((a, b) => a.value - b.value).slice(0, 8);
  }, [units, accent]);

  const geofenceCount = useMemo(() => {
    const liveList = safeArray(geofencesLive?.geofences);
    if (liveList.length) return liveList.length;
    return safeArray(geofencesDb).length;
  }, [geofencesLive, geofencesDb]);

  /* —— Alerts —— */

  const severitySlices = useMemo(
    () => alertSeveritySlices(alertList),
    [alertList],
  );
  const openCount = useMemo(
    () => alertList.filter((a) => !a.acknowledged).length,
    [alertList],
  );
  const ackedCount = Math.max(0, alertList.length - openCount);
  const criticalCount = useMemo(
    () =>
      alertList.filter((a) => {
        if (a.acknowledged) return false;
        const s = String(a.severity || "").toLowerCase();
        return s === "critical" || s === "emergency";
      }).length,
    [alertList],
  );

  const ackSlices = useMemo(
    () =>
      [
        { name: "Open", value: openCount, color: ALERT_SEVERITY.warning },
        { name: "Acknowledged", value: ackedCount, color: brand },
      ].filter((s) => s.value > 0),
    [openCount, ackedCount, brand],
  );

  const alertTimeline = useMemo(() => {
    const days = new Map<
      string,
      { critical: number; warning: number; info: number }
    >();
    const localDay = (iso: string) => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    // Seed calendar days from YYYY-MM-DD strings (local calendar, no UTC shift).
    const [fy, fm, fd] = applied.from.split("-").map(Number);
    const [ty, tm, td] = applied.to.split("-").map(Number);
    if (fy && fm && fd && ty && tm && td) {
      const cur = new Date(fy, fm - 1, fd);
      const end = new Date(ty, tm - 1, td);
      while (cur <= end) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
        days.set(key, { critical: 0, warning: 0, info: 0 });
        cur.setDate(cur.getDate() + 1);
      }
    }

    for (const a of alertList) {
      if (!a.timestamp) continue;
      const day = localDay(a.timestamp);
      const bucket = days.get(day);
      if (!bucket) continue;
      const s = String(a.severity || "info").toLowerCase();
      if (s === "critical" || s === "emergency") bucket.critical += 1;
      else if (s === "warning") bucket.warning += 1;
      else bucket.info += 1;
    }
    return [...days.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, v]) => ({ name: day.slice(5), ...v }));
  }, [alertList, applied.from, applied.to]);

  const alertTypeBars = useMemo(() => {
    const byType = new Map<string, { full: string; value: number }>();
    for (const a of alertList) {
      const raw = String(a.type || a.title || "event")
        .replace(/^wialon[_-]?/i, "")
        .replace(/_/g, " ")
        .trim();
      const full = raw.split(/\s+/).slice(0, 4).join(" ") || "event";
      const key = full.toLowerCase();
      const cur = byType.get(key) ?? { full, value: 0 };
      cur.value += 1;
      byType.set(key, cur);
    }
    const palette = [
      ALERT_SEVERITY.critical,
      ALERT_SEVERITY.warning,
      accent,
      brand,
      "#0284c7",
    ];
    return [...byType.values()]
      .map((row, i) => ({
        name: shortName(row.full, 16),
        fullName: row.full,
        value: row.value,
        fill: palette[i % palette.length],
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [alertList, accent, brand]);

  const speedingBars = useMemo(() => {
    const nameById = new Map((units ?? []).map((u) => [u.id, u.name]));
    const byUnit = new Map<string, { fullName: string; value: number }>();
    for (const a of alertList) {
      const t = String(a.type || a.title || "").toLowerCase();
      if (!/speed/.test(t)) continue;
      const fullName =
        (a.assetId && nameById.get(a.assetId)) ||
        String(a.title || a.type || "Speeding")
          .replace(/^wialon[_-]?/i, "")
          .trim() ||
        "Speeding";
      const key = a.assetId || fullName.toLowerCase();
      const cur = byUnit.get(key) ?? { fullName, value: 0 };
      cur.value += 1;
      byUnit.set(key, cur);
    }
    return [...byUnit.values()]
      .map((row, i) => ({
        name: shortName(row.fullName, 16),
        fullName: row.fullName,
        value: row.value,
        fill: i % 2 === 0 ? ALERT_SEVERITY.critical : ALERT_SEVERITY.warning,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [alertList, units]);

  const notificationBars = useMemo(() => {
    // Count by alert type in period — equal-height fake bars were misleading.
    const byType = new Map<
      string,
      { full: string; value: number; severity: string }
    >();
    for (const a of alertList) {
      const full =
        String(a.type || a.title || "Alert")
          .replace(/^wialon[_-]?/i, "")
          .replace(/_/g, " ")
          .trim() || "Alert";
      const key = full.toLowerCase();
      const cur = byType.get(key) ?? {
        full,
        value: 0,
        severity: String(a.severity || "info"),
      };
      cur.value += 1;
      byType.set(key, cur);
    }
    return [...byType.values()]
      .map((row, i) => {
        const s = row.severity.toLowerCase();
        const fill =
          s === "critical" || s === "emergency"
            ? ALERT_SEVERITY.critical
            : s === "warning"
              ? ALERT_SEVERITY.warning
              : i % 2 === 0
                ? accent
                : brand;
        return {
          name: shortName(row.full, 16),
          fullName: row.full,
          value: row.value,
          fill,
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [alertList, accent, brand]);

  /* —— Fuel —— */
  // Literally the same map object the Fuel tabs read, from the one shared
  // fuel-assets cache. Deriving it here from the monitoring snapshot instead
  // let the two screens anchor balance-derived consumption on levels captured
  // at different poll ticks, so the same period agreed only intermittently.
  const { data: liveLevelsByName } = useLiveFuelLevels();

  const allStationary = useMemo(
    () =>
      (units?.length ?? 0) > 0 &&
      (units ?? []).every(
        (u) =>
          u.stationary === true ||
          u.assetCategory === "generator" ||
          u.assetCategory === "machinery",
      ),
    [units],
  );

  const fuelRosterNames = useMemo(() => {
    const names = new Set<string>();
    for (const tx of fuelTransactions) {
      if (tx.unitName?.trim()) names.add(tx.unitName.trim());
    }
    if (liveLevelsByName) {
      for (const name of liveLevelsByName.keys()) {
        if (name?.trim()) names.add(name.trim());
      }
    }
    if (!names.size) {
      for (const u of units ?? []) {
        if (u.name?.trim()) names.add(u.name.trim());
      }
    }
    return [...names];
  }, [fuelTransactions, liveLevelsByName, units]);

  // Period KPIs from the same transactions + live levels as the Fuel module,
  // so dashboard totals always match the Fuel page for the same date range.
  // For single-category clients (e.g. Mimito vehicles-only) this is exactly the
  // Vehicles tab. For multi-category accounts it is the sum of each Fuel tab.
  const periodFuelKpis = useMemo(
    () =>
      computePeriodFuelKpis(
        fuelTransactions,
        applied.from,
        applied.to,
        liveLevelsByName,
        fuelRosterNames,
      ),
    [fuelTransactions, applied.from, applied.to, liveLevelsByName, fuelRosterNames],
  );
  // Single source of truth: derive every fuel tile from the SAME per-category
  // transactions + live levels the Fuel module uses. Never fall back to the
  // unscoped /fuel/kpis endpoint — it double counts group summaries and inflates.
  const fuelFilled = num(periodFuelKpis.totalFilled);
  const fuelUsed = num(periodFuelKpis.totalConsumed);
  const fuelTheftLiters = num(periodFuelKpis.theftVolume);
  const fuelTracked = num(periodFuelKpis.vehiclesTracked);
  const avgConsumption = num(periodFuelKpis.avgConsumption);
  const priced = applyPriceToKpis(periodFuelKpis, fuelPrice);
  const fuelCost = priced.usageCost;
  const fuelFillCost = priced.fillCost;

  // avg L/100km is meaningless for generators/machinery (no mileage) — fall
  // back to plain consumed litres so the insight is never "avg 0 L/100".
  const fuelTrackedInsight =
    fuelTracked > 0
      ? avgConsumption > 0 && !allStationary
        ? `${fuelTracked} assets tracked · avg ${avgConsumption} L/100km`
        : `${fuelTracked} assets tracked · ${fmt(fuelUsed, 1)} L used`
      : "";

  /** Live tank volume from the same fuel-assets levels as the Fuel module. */
  const totalCurrentFuel = useMemo(() => {
    if (liveLevelsByName && liveLevelsByName.size > 0) {
      let sum = 0;
      for (const v of liveLevelsByName.values()) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) sum += n;
      }
      if (sum > 0) return sum;
    }
    return (units ?? []).reduce((sum, u) => {
      const liters = num(u.fuelLiters);
      return sum + (liters > 0 ? liters : 0);
    }, 0);
  }, [liveLevelsByName, units]);

  const fuelKpiBars = useMemo(
    () => [
      { name: "Filled", value: Math.round(fuelFilled), fill: brand },
      { name: "Consumed", value: Math.round(fuelUsed), fill: accent },
      {
        name: "Theft (L)",
        value: Math.round(fuelTheftLiters),
        fill: ALERT_SEVERITY.critical,
      },
    ],
    [fuelFilled, fuelUsed, fuelTheftLiters, brand, accent],
  );

  const fuelMonetaryBars = useMemo(
    () => [
      {
        name: "Fleet",
        liters: Math.round(fuelUsed * 10) / 10,
        costK: Math.round(fuelCost / 1000),
      },
    ],
    [fuelUsed, fuelCost],
  );

  const fuelChangeBars = useMemo(
    () => [
      { name: "Fillings", value: Math.round(fuelFilled), fill: brand },
      { name: "Consumed", value: Math.round(fuelUsed), fill: accent },
      {
        name: "Drains / theft",
        value: Math.round(fuelTheftLiters),
        fill: ALERT_SEVERITY.critical,
      },
    ],
    [fuelFilled, fuelUsed, fuelTheftLiters, brand, accent],
  );

  const fuelTrendRows = useMemo(() => {
    // Derive month buckets from the SAME aggregation as the KPI tiles so the
    // trend always sums to the totals. (The monthly trend API double-counts
    // nested Wialon group summaries and was producing inflated bars.)
    const [fy, fm] = applied.from.split("-").map(Number);
    const [ty, tm] = applied.to.split("-").map(Number);
    if (!fy || !fm || !ty || !tm) return [];
    const months: string[] = [];
    let y = fy;
    let m = fm;
    while ((y < ty || (y === ty && m <= tm)) && months.length < 24) {
      months.push(`${y}-${String(m).padStart(2, "0")}`);
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    return months
      .map((month) => {
        const [yy, mm] = month.split("-").map(Number);
        const monthFirst = `${month}-01`;
        const lastDay = new Date(yy, mm, 0).getDate();
        const monthLast = `${month}-${String(lastDay).padStart(2, "0")}`;
        const from = applied.from > monthFirst ? applied.from : monthFirst;
        const to = applied.to < monthLast ? applied.to : monthLast;
        const k = computePeriodFuelKpis(
          fuelTransactions,
          from,
          to,
          liveLevelsByName,
        );
        return {
          name: month.slice(2),
          month,
          filled: k.totalFilled,
          consumed: k.totalConsumed,
        };
      })
      .filter((r) => r.filled > 0 || r.consumed > 0)
      .slice(-8);
  }, [fuelTransactions, applied.from, applied.to, liveLevelsByName]);

  const tankRiskBars = useMemo(() => {
    const withPct = (units ?? [])
      .filter(
        (u) => u.fuelLevel != null && u.fuelLevel > 0 && u.fuelLevel <= 100,
      )
      .map((u) => ({
        name: shortName(u.name),
        fullName: u.name,
        value: Math.round(num(u.fuelLevel)),
        fill:
          num(u.fuelLevel) < 25
            ? ALERT_SEVERITY.critical
            : num(u.fuelLevel) < 50
              ? ALERT_SEVERITY.warning
              : brand,
      }))
      .sort((a, b) => a.value - b.value)
      .slice(0, 8);
    if (withPct.length) return { kind: "pct" as const, rows: withPct };
    const withL = (units ?? [])
      .filter((u) => num(u.fuelLiters) > 0)
      .map((u, i) => ({
        name: shortName(u.name),
        fullName: u.name,
        value: Math.round(num(u.fuelLiters) * 10) / 10,
        fill: i % 2 === 0 ? accent : brand,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    if (withL.length) return { kind: "liters" as const, rows: withL };
    return {
      kind: "none" as const,
      rows: [] as Array<{
        name: string;
        fullName: string;
        value: number;
        fill: string;
      }>,
    };
  }, [units, brand, accent]);

  const perAssetFuel = useMemo(() => {
    const ranged = filterFuelTransactionsByDate(
      fuelTransactions,
      applied.from,
      applied.to,
    );
    const names = new Set<string>();
    for (const t of ranged) if (t.unitName) names.add(t.unitName);
    const rows = [...names].map((unitName) => {
      const cols = aggregateUnitFuelColumns(
        ranged.filter((t) => t.unitName === unitName),
        {
          fromDate: applied.from,
          toDate: applied.to,
          liveLevel: liveLevelsByName.get(unitName),
        },
      );
      const filled = cols.filledMain + cols.filledReserve;
      const used = cols.totalUsed;
      // Always price × liters — fill and use stay separate (never mixed).
      const fillCost = filled * fuelPrice;
      const usedCost = used * fuelPrice;
      return {
        name: shortName(unitName, 16),
        fullName: unitName,
        filled: Math.round(filled * 10) / 10,
        used: Math.round(used * 10) / 10,
        fillCost: Math.round(fillCost),
        usedCost: Math.round(usedCost),
      };
    });
    return rows.filter(
      (r) => r.filled > 0 || r.used > 0 || r.fillCost > 0 || r.usedCost > 0,
    );
  }, [fuelTransactions, applied.from, applied.to, fuelPrice, liveLevelsByName]);

  const topFuelBars = useMemo(
    () =>
      [...perAssetFuel]
        .filter((r) => r.used > 0)
        .sort((a, b) => b.used - a.used)
        .slice(0, 10)
        .map((r, i) => ({
          name: r.name,
          fullName: r.fullName,
          value: r.used,
          fill: i % 2 === 0 ? brand : accent,
        })),
    [perAssetFuel, brand, accent],
  );

  const assetMoneyBars = useMemo(
    () =>
      [...perAssetFuel]
        .filter((r) => r.fillCost > 0 || r.usedCost > 0)
        .sort((a, b) => b.usedCost + b.fillCost - (a.usedCost + a.fillCost))
        .slice(0, 10)
        .map((r) => ({
          name: r.name,
          fullName: r.fullName,
          fillCost: r.fillCost,
          usedCost: r.usedCost,
        })),
    [perAssetFuel],
  );

  const assetConsumeBars = useMemo(
    () =>
      [...perAssetFuel]
        .filter((r) => r.filled > 0 || r.used > 0)
        .sort((a, b) => b.used - a.used)
        .slice(0, 10)
        .map((r) => ({
          name: r.name,
          fullName: r.fullName,
          filled: r.filled,
          used: r.used,
        })),
    [perAssetFuel],
  );

  /* —— Ops —— */

  const tripRows = useMemo(() => {
    const list = safeArray<{
      unitName?: string;
      mileage?: number;
      fuelUsed?: number;
    }>(trips);
    const byUnit = new Map<string, { distance: number; fuel: number }>();
    for (const t of list) {
      const name = t.unitName || "—";
      if (name === "—") continue;
      const row = byUnit.get(name) ?? { distance: 0, fuel: 0 };
      row.distance += num(t.mileage);
      row.fuel += num(t.fuelUsed);
      byUnit.set(name, row);
    }
    return [...byUnit.entries()]
      .map(([name, v]) => ({
        name: shortName(name),
        fullName: name,
        distance: Math.round(v.distance),
        fuel: Math.round(v.fuel * 10) / 10,
      }))
      .filter((r) => r.distance > 0 || r.fuel > 0)
      .sort((a, b) => b.distance - a.distance)
      .slice(0, 8);
  }, [trips]);

  const routeStages = useMemo(() => {
    if (!routeStats || num(routeStats.total) <= 0) return [];
    return [
      {
        name: "Scheduled",
        value: num(routeStats.scheduled),
        color: FLEET_STATUS.idle,
      },
      { name: "In progress", value: num(routeStats.inProgress), color: brand },
      { name: "Completed", value: num(routeStats.completed), color: accent },
    ].filter((s) => s.value > 0);
  }, [routeStats, brand, accent]);

  const driverSlices = useMemo(() => {
    if (!driverStats || num(driverStats.total) <= 0) return [];
    return [
      {
        name: "Available",
        value: num(driverStats.available),
        color: FLEET_STATUS.moving,
      },
      { name: "Driving", value: num(driverStats.driving), color: brand },
      {
        name: "Off duty",
        value: num(driverStats.offDuty),
        color: FLEET_STATUS.offline,
      },
    ].filter((s) => s.value > 0);
  }, [driverStats, brand]);

  const workshopBars = useMemo(() => {
    if (!workshopKpis) return [];
    return [
      {
        name: "Pending",
        value: num(workshopKpis.pendingMaintenance),
        fill: ALERT_SEVERITY.warning,
      },
      {
        name: "Done (mo)",
        value: num(workshopKpis.completedThisMonth),
        fill: brand,
      },
      {
        name: "Breakdowns",
        value: num(workshopKpis.openBreakdowns),
        fill: ALERT_SEVERITY.critical,
      },
      {
        name: "Inspections",
        value: num(workshopKpis.inspectionsDue),
        fill: accent,
      },
    ].filter((r) => r.value > 0);
  }, [workshopKpis, brand, accent]);

  const userSlices = useMemo(() => {
    const list = safeArray<{ role?: string; is_active?: boolean }>(tenantUsers);
    const byRole = new Map<string, number>();
    for (const u of list) {
      const role = String(u.role || "viewer").replace(/_/g, " ");
      byRole.set(role, (byRole.get(role) ?? 0) + 1);
    }
    const palette = [brand, accent, secondary, "#0284c7", "#0d9488"];
    return [...byRole.entries()].map(([name, value], i) => ({
      name,
      value,
      color: palette[i % palette.length],
    }));
  }, [tenantUsers, brand, accent, secondary]);

  const activeUsers = useMemo(
    () =>
      safeArray<{ is_active?: boolean }>(tenantUsers).filter(
        (u) => u.is_active !== false,
      ).length,
    [tenantUsers],
  );

  const commandBars = useMemo(() => {
    const list = safeArray<Record<string, unknown>>(commandHistory);
    const byAsset = new Map<string, number>();
    for (const row of list) {
      const name = String(row.assetName || row.asset_name || "—");
      if (name === "—") continue;
      byAsset.set(name, (byAsset.get(name) ?? 0) + 1);
    }
    return [...byAsset.entries()]
      .map(([name, value], i) => ({
        name: shortName(name),
        value,
        fill: i % 2 === 0 ? brand : accent,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [commandHistory, brand, accent]);

  const utilization = pct(counts.moving + counts.idle, counts.total);
  const ackRate = pct(ackedCount, alertList.length);
  const onlinePct = pct(onlineCount, counts.total);

  const moduleCount = enabled.size;
  const showLoader = fleetLoading && !units?.length;
  const periodLabel = `${applied.from} → ${applied.to}`;

  const chartsUpdating = executing;
  const printContentRef = useRef<HTMLDivElement>(null);

  const toolbar = (
    <DashboardToolbar
      todayStr={todayStr}
      draftFrom={draftFrom}
      draftTo={draftTo}
      draftPreset={draftPreset}
      onDraftFrom={setDraftFrom}
      onDraftTo={setDraftTo}
      onDraftPreset={setDraftPreset}
      onExecute={() => void onExecute()}
      executing={executing}
      visibility={visibility}
      onToggleWidget={toggleWidget}
      enabledModules={enabled}
      isAdmin={isAdmin}
      arrangeMode={arrangeMode}
      onArrangeMode={setArrangeMode}
      onResetLayout={resetLayout}
      printActions={
        <SectionPrintButtons
          contentRef={printContentRef}
          title={`${branding.name || "Client"} Dashboard ${applied.from} to ${applied.to}`}
          filename={`${branding.name || "Dashboard"}_dashboard_${applied.from}_${applied.to}`}
          primaryColor={brand}
          size="sm"
        />
      }
    />
  );

  if (showLoader) {
    return (
      <AppLayout title="Dashboard" subtitle="Operations command center">
        <BrandedPageLoader label="Loading your fleet dashboard..." />
      </AppLayout>
    );
  }

  const showFleetSection =
    hasMonitoring &&
    counts.total > 0 &&
    (show("health_check") ||
      show("connection_status") ||
      show("motion_state") ||
      show("fleet_status") ||
      show("top_mileage") ||
      show("mileage") ||
      show("fleet_utilization") ||
      show("device_battery") ||
      show("voltage_level") ||
      (show("geofences") && hasGeofencing));

  const showAlertsSection =
    hasAlerts &&
    (show("alerts_trend") ||
      show("alerts_ack") ||
      show("alerts_severity") ||
      show("alerts_types") ||
      show("notifications") ||
      show("speedings"));

  const showFuelSection =
    hasFuel &&
    (show("fuel_consumed_monetary") ||
      show("fuel_totals") ||
      show("fuel_trend") ||
      show("consumed_by_fls") ||
      show("fuel_data_changes") ||
      show("top_fuel_consumption") ||
      show("tank_risk") ||
      show("burn_vs_fill"));

  const showOpsSection =
    (show("trip_performance") && tripRows.length > 0) ||
    (show("route_pipeline") && routeStages.length > 0) ||
    (show("driver_duty") && driverSlices.length > 0) ||
    (show("workshop_load") && workshopBars.length > 0) ||
    (show("commands") && commandBars.length > 0) ||
    (show("users_by_role") && userSlices.length > 0);

  return (
    <AppLayout
      title="Dashboard"
      subtitle="Live operational picture across your enabled modules"
    >
      <div className="mb-1" data-no-print>
        {toolbar}
      </div>
      <div ref={printContentRef} className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground tabular-nums">
        {connected && accountName && (
          <>
            <span className="inline-flex items-center gap-1.5 text-foreground font-medium">
              <Satellite className="h-3.5 w-3.5 text-primary" />
              {accountName}
            </span>
            {tierName && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium">
                {tierName}
              </Badge>
            )}
            {accountUnitCount != null && (
              <span>
                {accountUnitCount} {assetProfile.unitLabelPlural}
              </span>
            )}
            <span className="hidden sm:inline text-border">·</span>
          </>
        )}
        <span>Showing {periodLabel}</span>
        {chartsUpdating && (
          <span className="inline-flex items-center gap-1.5 text-primary font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Updating charts…
          </span>
        )}
        <span className="hidden sm:inline text-border">·</span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5",
            live || connected ? "text-status-moving" : "",
          )}
          title={
            live
              ? `Snapshot refreshes ${livePollLabel(LIVE_POLL.fleet)}`
              : ctx?.accountName
                ? String(ctx.accountName)
                : undefined
          }
        >
          <span
            className={cn(
              "inline-flex h-1.5 w-1.5 rounded-full",
              live || connected
                ? "bg-status-moving animate-pulse"
                : "bg-muted-foreground/40",
            )}
          />
          {live || connected ? "Live" : configured ? "Idle" : "Offline"}
        </span>
        <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-medium">
          {moduleCount} module{moduleCount === 1 ? "" : "s"}
        </Badge>
        {hasMonitoring && (
          <Badge
            variant="outline"
            className="h-5 px-1.5 text-[10px] font-medium"
          >
            {onlinePct}% online
          </Badge>
        )}
        {hasAlerts && criticalCount > 0 && (
          <Badge className="h-5 px-1.5 text-[10px] bg-destructive text-destructive-foreground">
            {criticalCount} critical
          </Badge>
        )}
        {connected && (
          <Badge
            variant="outline"
            className="h-5 px-1.5 text-[10px] text-primary border-primary/30"
          >
            Linked
          </Badge>
        )}
      </div>
      {(fuelTxError || alertsError) && (
        <div data-no-print>
          <QueryErrorBanner
            message="Some dashboard widgets could not load."
            onRetry={() => {
              refetchFuelTx();
              void refetchAlerts();
            }}
            className="mb-4"
          />
        </div>
      )}

      <AnimatedPage
        key={`dash-period-${applied.from}-${applied.to}-${executeFlash}`}
        className={cn(
          "space-y-4 transition-opacity duration-300",
          chartsUpdating && "opacity-60 pointer-events-none",
        )}
      >
        <WialonContextBanner errorOnly />

        <div className="stat-strip" data-print-keep>
          {hasMonitoring && (
            <MetricCard
              title="Assets"
              value={counts.total}
              icon={Truck}
              variant="primary"
              size="xxs"
            />
          )}
          {hasMonitoring && (
            <MetricCard
              title="Online"
              value={onlineCount}
              icon={Activity}
              variant="success"
              size="xxs"
            />
          )}
          {hasMonitoring && (
            <MetricCard
              title="Utilization"
              value={`${utilization}%`}
              icon={Gauge}
              variant="info"
              size="xxs"
            />
          )}
          {hasAlerts && (
            <MetricCard
              title="Open alerts"
              value={openCount}
              icon={AlertTriangle}
              variant="destructive"
              size="xxs"
            />
          )}
          {hasFuel && (
            <MetricCard
              title="Current fuel"
              value={`${fmt(totalCurrentFuel, 1)} L`}
              icon={Fuel}
              variant="success"
              size="xxs"
            />
          )}
          {hasFuel && (
            <MetricCard
              title="Fuel filled"
              value={`${fmt(fuelFilled)} L`}
              icon={Fuel}
              variant="success"
              size="xxs"
            />
          )}
          {hasFuel && (
            <MetricCard
              title="Fuel used"
              value={`${fmt(fuelUsed)} L`}
              icon={Fuel}
              variant="info"
              size="xxs"
            />
          )}
          {hasFuel && (
            <MetricCard
              title="Fill cost"
              value={fmtUgx(fuelFillCost)}
              icon={Fuel}
              variant="success"
              size="xxs"
            />
          )}
          {hasFuel && (
            <MetricCard
              title="Use cost"
              value={fmtUgx(fuelCost)}
              icon={Fuel}
              variant="warning"
              size="xxs"
            />
          )}
          {hasDrivers && num(driverStats?.total) > 0 && (
            <MetricCard
              title="Drivers"
              value={num(driverStats?.total)}
              icon={Users}
              variant="default"
              size="xxs"
            />
          )}
          {hasRoutes && num(routeStats?.total) > 0 && (
            <MetricCard
              title="Routes"
              value={num(routeStats?.total)}
              icon={Route}
              variant="warning"
              size="xxs"
            />
          )}
          {hasWorkshop && (
            <MetricCard
              title="Maint. pending"
              value={num(workshopKpis?.pendingMaintenance)}
              icon={Wrench}
              variant="warning"
              size="xxs"
            />
          )}
          {hasSurveillance && safeArray(videoStreams).length > 0 && (
            <MetricCard
              title="Streams"
              value={safeArray(videoStreams).length}
              icon={Video}
              variant="info"
              size="xxs"
            />
          )}
        </div>

        {(showFleetSection ||
          showAlertsSection ||
          showFuelSection ||
          showOpsSection) && (
          <div className={SECTION}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <DashboardSectionLabel color={brand}>
                Charts
              </DashboardSectionLabel>
              {arrangeMode && (
                <p className="text-[11px] text-muted-foreground">
                  Drag the grip to move · wider/narrower and Tall/Short to
                  resize · saved on this device
                </p>
              )}
            </div>
            <DashboardArrangeBoard
              layout={layout}
              editMode={arrangeMode}
              onLayoutChange={updateLayout}
            >
              {hasMonitoring && counts.total > 0 && show("health_check") && (
                <DashboardArrangeItem id="health_check">
                  <DashboardWidget
                    title="Health check status"
                    subtitle="Live connection · freshness · fuel risk"
                    href="/app/monitoring"
                    brandColor={brand}
                    tone="primary"
                    insight={
                      healthSlices.length
                        ? healthSlices
                            .map((s) => `${s.value} ${s.name.toLowerCase()}`)
                            .join(" · ")
                        : "No fleet health signal yet"
                    }
                  >
                    <CompactDonut
                      data={healthSlices}
                      centerValue={counts.total}
                      centerLabel="assets"
                    />
                    <LegendDots
                      items={healthSlices.map((s) => ({
                        label: s.name,
                        color: s.color,
                        value: s.value,
                      }))}
                    />
                  </DashboardWidget>
                </DashboardArrangeItem>
              )}
              {hasMonitoring &&
                counts.total > 0 &&
                show("connection_status") && (
                  <DashboardArrangeItem id="connection_status">
                    <DashboardWidget
                      title="Connection status"
                      subtitle="Live online vs offline"
                      href="/app/monitoring"
                      brandColor={brand}
                      tone="teal"
                      insight={`${onlinePct}% of the fleet is online right now`}
                    >
                      <CompactDonut
                        data={connectionSlices}
                        centerValue={`${onlinePct}%`}
                        centerLabel="online"
                      />
                      <LegendDots
                        items={connectionSlices.map((s) => ({
                          label: s.name,
                          color: s.color,
                          value: s.value,
                        }))}
                      />
                    </DashboardWidget>
                  </DashboardArrangeItem>
                )}
              {hasMonitoring && counts.total > 0 && show("motion_state") && (
                <DashboardArrangeItem id="motion_state">
                  <DashboardWidget
                    title="Motion state"
                    subtitle="Live motion × ignition · not period-filtered"
                    href="/app/monitoring"
                    brandColor={accent}
                    tone="accent"
                    insight={`${onlineCount} online · ${fmt(counts.total)} total`}
                  >
                    {motionStateSlices.length ? (
                      <>
                        <CompactDonut
                          data={motionStateSlices}
                          centerValue={counts.total}
                          centerLabel="assets"
                        />
                        <LegendDots
                          items={motionStateSlices.map((s) => ({
                            label: s.name,
                            color: s.color,
                            value: s.value,
                          }))}
                        />
                      </>
                    ) : (
                      <CompactStackedHBars
                        data={motionIgnition}
                        series={[
                          {
                            key: "withIgn",
                            label: "Ignition on",
                            color: FLEET_STATUS.moving,
                          },
                          {
                            key: "withoutIgn",
                            label: "Ignition off",
                            color: "#94a3b8",
                          },
                        ]}
                        height={180}
                      />
                    )}
                  </DashboardWidget>
                </DashboardArrangeItem>
              )}
              {hasMonitoring && counts.total > 0 && show("fleet_status") && (
                <DashboardArrangeItem id="fleet_status">
                  <DashboardWidget
                    title="Fleet status"
                    subtitle="Live partition · not period-filtered"
                    href="/app/monitoring"
                    brandColor={brand}
                    tone="primary"
                    insight={`${counts.moving} moving · ${counts.idle} idle · ${counts.stopped} stopped · ${counts.offline} offline`}
                  >
                    <CompactDonut
                      data={statusSlices}
                      centerValue={counts.total}
                      centerLabel="assets"
                    />
                    <LegendDots
                      items={statusSlices.map((s) => ({
                        label: s.name,
                        color: s.color,
                        value: s.value,
                      }))}
                    />
                  </DashboardWidget>
                </DashboardArrangeItem>
              )}
              {hasMonitoring &&
                counts.total > 0 &&
                show("mileage") &&
                !allStationary &&
                totalMileage > 0 && (
                  <DashboardArrangeItem id="mileage">
                    <DashboardWidget
                      title="Mileage"
                      subtitle="Live odometer total · not period-filtered"
                      href="/app/monitoring?view=list"
                      brandColor={accent}
                      tone="accent"
                      insight={`${fmt(Math.round(totalMileage))} km across ${counts.total} assets`}
                    >
                      {mileageLeaders.length > 0 ? (
                        <CompactBars
                          data={mileageLeaders.slice(0, 5)}
                          horizontal
                          unit="km"
                          color={accent}
                        />
                      ) : (
                        <CompactBars
                          data={[
                            {
                              name: "Fleet",
                              value: Math.round(totalMileage),
                              fill: accent,
                            },
                          ]}
                          includeZeros
                          unit="km"
                          color={accent}
                        />
                      )}
                    </DashboardWidget>
                  </DashboardArrangeItem>
                )}
              {hasMonitoring &&
                counts.total > 0 &&
                show("top_mileage") &&
                mileageLeaders.length > 0 && (
                  <DashboardArrangeItem id="top_mileage">
                    <DashboardWidget
                      title="Top units by mileage"
                      subtitle="Live odometer leaders · not period-filtered"
                      href="/app/monitoring?view=list"
                      brandColor={brand}
                      tone="teal"
                      insight={`Top asset: ${mileageLeaders[0].name} · ${fmt(mileageLeaders[0].value)} km`}
                    >
                      <CompactBars
                        data={mileageLeaders}
                        horizontal
                        unit="km"
                        color={brand}
                      />
                    </DashboardWidget>
                  </DashboardArrangeItem>
                )}
              {hasMonitoring &&
                counts.total > 0 &&
                show("fleet_utilization") && (
                  <DashboardArrangeItem id="fleet_utilization">
                    <DashboardWidget
                      title="Fleet utilization"
                      subtitle="Live moving + idle share · not period-filtered"
                      brandColor={accent}
                      tone="accent"
                      insight={`${counts.moving + counts.idle} of ${counts.total} assets are active (${utilization}%)`}
                    >
                      <CompactRadial
                        value={utilization}
                        label="active"
                        color={accent}
                      />
                    </DashboardWidget>
                  </DashboardArrangeItem>
                )}
              {hasMonitoring &&
                counts.total > 0 &&
                show("geofences") &&
                hasGeofencing && (
                  <DashboardArrangeItem id="geofences">
                    <DashboardWidget
                      title="Geofences"
                      subtitle="Configured zones · not period-filtered"
                      href="/app/geofencing"
                      brandColor={secondary}
                      tone="secondary"
                      insight={
                        geofenceCount > 0
                          ? `${geofenceCount} geofence${geofenceCount === 1 ? "" : "s"} available`
                          : "No geofences configured yet"
                      }
                    >
                      <CompactDonut
                        data={[
                          {
                            name: "Zones",
                            value: Math.max(geofenceCount, 1),
                            color: geofenceCount > 0 ? secondary : "#e2e8f0",
                          },
                        ]}
                        centerValue={geofenceCount}
                        centerLabel="zones"
                      />
                    </DashboardWidget>
                  </DashboardArrangeItem>
                )}
              {hasMonitoring &&
                counts.total > 0 &&
                show("device_battery") &&
                batteryBars.length > 0 && (
                  <DashboardArrangeItem id="device_battery">
                    <DashboardWidget
                      title="Device battery level"
                      subtitle="Live battery % · not period-filtered"
                      href="/app/monitoring"
                      brandColor={ALERT_SEVERITY.warning}
                      tone="amber"
                      insight={`Lowest: ${batteryBars[0].fullName || batteryBars[0].name} · ${batteryBars[0].value}%`}
                    >
                      <CompactBars
                        data={batteryBars}
                        horizontal
                        unit="%"
                        color={brand}
                      />
                    </DashboardWidget>
                  </DashboardArrangeItem>
                )}
              {hasMonitoring &&
                counts.total > 0 &&
                show("voltage_level") &&
                voltageBars.length > 0 && (
                  <DashboardArrangeItem id="voltage_level">
                    <DashboardWidget
                      title="Voltage level"
                      subtitle="Live supply / internal voltage · not period-filtered"
                      href="/app/monitoring"
                      brandColor={brand}
                      tone="sky"
                      insight={`Lowest: ${voltageBars[0].fullName || voltageBars[0].name} · ${voltageBars[0].value} V`}
                    >
                      <CompactBars
                        data={voltageBars}
                        horizontal
                        unit="V"
                        color={accent}
                      />
                    </DashboardWidget>
                  </DashboardArrangeItem>
                )}
              {hasAlerts && show("alerts_trend") && (
                <DashboardArrangeItem id="alerts_trend">
                  <DashboardWidget
                    title="Alert activity"
                    subtitle={`Events in ${periodLabel}`}
                    href="/app/alerts"
                    brandColor={ALERT_SEVERITY.critical}
                    tone="rose"
                    insight={
                      alertList.length
                        ? `${alertList.length} events in view · ${criticalCount} critical`
                        : "No alerts in the current window"
                    }
                  >
                    <CompactMultiLine
                      data={alertTimeline}
                      series={[
                        {
                          key: "critical",
                          label: "Critical",
                          color: ALERT_SEVERITY.critical,
                        },
                        {
                          key: "warning",
                          label: "Warning",
                          color: ALERT_SEVERITY.warning,
                        },
                        { key: "info", label: "Info", color: accent },
                      ]}
                      height={180}
                    />
                    <LegendDots
                      items={[
                        { label: "Critical", color: ALERT_SEVERITY.critical },
                        { label: "Warning", color: ALERT_SEVERITY.warning },
                        { label: "Info", color: accent },
                      ]}
                    />
                  </DashboardWidget>
                </DashboardArrangeItem>
              )}
              {hasAlerts && show("alerts_ack") && (
                <DashboardArrangeItem id="alerts_ack">
                  <DashboardWidget
                    title="Open vs acknowledged"
                    subtitle={`Response state in ${periodLabel}`}
                    href="/app/alerts"
                    brandColor={brand}
                    tone="primary"
                    insight={
                      alertList.length
                        ? `${ackRate}% acknowledged`
                        : "Inbox is clear"
                    }
                  >
                    {ackSlices.length ? (
                      <>
                        <CompactDonut
                          data={ackSlices}
                          centerValue={`${ackRate}%`}
                          centerLabel="acked"
                        />
                        <LegendDots
                          items={ackSlices.map((s) => ({
                            label: s.name,
                            color: s.color,
                            value: s.value,
                          }))}
                        />
                      </>
                    ) : (
                      <CompactDonut
                        data={[
                          { name: "No alerts", value: 1, color: "#e2e8f0" },
                        ]}
                        centerValue={0}
                        centerLabel="events"
                      />
                    )}
                  </DashboardWidget>
                </DashboardArrangeItem>
              )}
              {hasAlerts && show("alerts_severity") && (
                <DashboardArrangeItem id="alerts_severity">
                  <DashboardWidget
                    title="Severity mix"
                    subtitle="Critical · warning · info"
                    href="/app/alerts"
                    brandColor={ALERT_SEVERITY.warning}
                    tone="amber"
                    insight={
                      severitySlices.length
                        ? severitySlices
                            .map((s) => `${s.value} ${s.name.toLowerCase()}`)
                            .join(" · ")
                        : "No severity data yet"
                    }
                  >
                    {severitySlices.length ? (
                      <>
                        <CompactDonut
                          data={severitySlices}
                          centerValue={alertList.length}
                          centerLabel="events"
                        />
                        <LegendDots
                          items={severitySlices.map((s) => ({
                            label: s.name,
                            color: s.color,
                            value: s.value,
                          }))}
                        />
                      </>
                    ) : (
                      <CompactBars
                        data={[{ name: "None", value: 0, fill: "#e2e8f0" }]}
                        includeZeros
                        color="#e2e8f0"
                      />
                    )}
                  </DashboardWidget>
                </DashboardArrangeItem>
              )}
              {hasAlerts && show("alerts_types") && (
                <DashboardArrangeItem id="alerts_types">
                  <DashboardWidget
                    title="Top alert types"
                    subtitle={`Most frequent categories in ${periodLabel}`}
                    href="/app/alerts"
                    brandColor={accent}
                    tone="accent"
                    insight={
                      alertTypeBars[0]
                        ? `Leading type: ${alertTypeBars[0].fullName || alertTypeBars[0].name} (${alertTypeBars[0].value})`
                        : "No typed alerts yet"
                    }
                  >
                    {alertTypeBars.length ? (
                      <CompactBars
                        data={alertTypeBars}
                        horizontal
                        color={accent}
                        height={180}
                      />
                    ) : (
                      <CompactBars
                        data={[{ name: "No types", value: 0, fill: "#e2e8f0" }]}
                        includeZeros
                        color="#e2e8f0"
                      />
                    )}
                  </DashboardWidget>
                </DashboardArrangeItem>
              )}
              {hasAlerts && show("notifications") && (
                <DashboardArrangeItem id="notifications">
                  <DashboardWidget
                    title="Notifications"
                    subtitle={`Alert types in ${periodLabel}`}
                    href="/app/alerts"
                    brandColor={ALERT_SEVERITY.warning}
                    tone="amber"
                    insight={
                      notificationBars.length
                        ? `${notificationBars.reduce((s, r) => s + r.value, 0)} events across ${notificationBars.length} types`
                        : "No notifications in this period"
                    }
                  >
                    {notificationBars.length ? (
                      <CompactBars
                        data={notificationBars}
                        horizontal
                        includeZeros
                        color={accent}
                      />
                    ) : (
                      <CompactBars
                        data={[{ name: "None", value: 0, fill: "#e2e8f0" }]}
                        includeZeros
                        color="#e2e8f0"
                      />
                    )}
                  </DashboardWidget>
                </DashboardArrangeItem>
              )}
              {hasAlerts && show("speedings") && (
                <DashboardArrangeItem id="speedings">
                  <DashboardWidget
                    title="Speedings"
                    subtitle="Speeding-related alerts in period"
                    href="/app/alerts"
                    brandColor={ALERT_SEVERITY.critical}
                    tone="rose"
                    insight={
                      speedingBars.length
                        ? `${speedingBars.reduce((s, r) => s + r.value, 0)} speeding events`
                        : "No speeding alerts in this period"
                    }
                  >
                    {speedingBars.length ? (
                      <CompactBars
                        data={speedingBars}
                        horizontal
                        color={ALERT_SEVERITY.critical}
                      />
                    ) : (
                      <CompactBars
                        data={[{ name: "None", value: 0, fill: "#e2e8f0" }]}
                        includeZeros
                        color="#e2e8f0"
                      />
                    )}
                  </DashboardWidget>
                </DashboardArrangeItem>
              )}
              {hasFuel && show("fuel_consumed_monetary") && (
                <DashboardArrangeItem id="fuel_consumed_monetary">
                  <DashboardWidget
                    title="Fuel consumed + monetary"
                    subtitle={`Period KPIs × ${fmt(fuelPrice)} UGX/L · dual axis`}
                    href="/app/fuel"
                    brandColor={ALERT_SEVERITY.critical}
                    tone="rose"
                    insight={`${fmt(fuelUsed, 1)} L consumed ≈ ${fmtUgx(fuelCost)}`}
                  >
                    {fuelUsed > 0 || fuelCost > 0 ? (
                      <>
                        <CompactDualAxis
                          data={fuelMonetaryBars}
                          leftKey="liters"
                          rightKey="costK"
                          leftLabel="Consumed (L)"
                          rightLabel="Cost (k UGX)"
                          leftColor={brand}
                          rightColor={accent}
                          height={188}
                        />
                        <LegendDots
                          items={[
                            {
                              label: "Consumed (L)",
                              color: brand,
                              value: fmt(fuelUsed, 1),
                            },
                            {
                              label: "Est. cost",
                              color: accent,
                              value: fmtUgx(fuelCost),
                            },
                          ]}
                        />
                      </>
                    ) : (
                      <CompactBars
                        data={[{ name: "No data", value: 0, fill: "#e2e8f0" }]}
                        includeZeros
                        color="#e2e8f0"
                        height={188}
                      />
                    )}
                  </DashboardWidget>
                </DashboardArrangeItem>
              )}
              {hasFuel && show("consumed_by_fls") && (
                <DashboardArrangeItem id="consumed_by_fls">
                  <DashboardWidget
                    title="Consumed by FLS"
                    subtitle={
                      fuelFilled > 0
                        ? `Used / filled in ${periodLabel}`
                        : `Consumed volume in ${periodLabel}`
                    }
                    href="/app/fuel"
                    brandColor={brand}
                    tone="primary"
                    insight={
                      fuelTracked > 0
                        ? fuelTrackedInsight
                        : fuelFilled > 0
                          ? `${pct(fuelUsed, fuelFilled)}% of filled was consumed`
                          : `${fmt(fuelUsed, 1)} L consumed in period`
                    }
                  >
                    <CompactRadial
                      value={fuelFilled > 0 ? pct(fuelUsed, fuelFilled) : 0}
                      label={`${fmt(fuelUsed, 1)} L`}
                      color={brand}
                    />
                  </DashboardWidget>
                </DashboardArrangeItem>
              )}
              {hasFuel && show("fuel_totals") && (
                <DashboardArrangeItem id="fuel_totals">
                  <DashboardWidget
                    title="Fuel totals"
                    subtitle="Filled · consumed · theft (period KPIs)"
                    href="/app/fuel"
                    brandColor={brand}
                    tone="primary"
                    insight={
                      fuelTracked > 0
                        ? fuelTrackedInsight
                        : `${fmt(fuelFilled, 1)} L filled · ${fmt(fuelUsed, 1)} L consumed`
                    }
                  >
                    <CompactBars
                      data={fuelKpiBars}
                      includeZeros
                      color={brand}
                    />
                    <LegendDots
                      items={fuelKpiBars.map((b) => ({
                        label: b.name,
                        color: String(b.fill),
                        value: b.value,
                      }))}
                    />
                  </DashboardWidget>
                </DashboardArrangeItem>
              )}
              {hasFuel && show("top_fuel_consumption") && (
                <DashboardArrangeItem id="fuel_assets_consume">
                  <DashboardWidget
                    title="Assets vs fuel consumption"
                    subtitle="Filled vs used (L) from fuel reports in period"
                    href="/app/fuel"
                    brandColor={accent}
                    tone="accent"
                    insight={
                      assetConsumeBars.length
                        ? `Top: ${assetConsumeBars[0].fullName} · ${assetConsumeBars[0].used} L used`
                        : "No consumption rows in this period — run Execute after fuel sync"
                    }
                  >
                    {assetConsumeBars.length ? (
                      <>
                        <CompactComposed
                          data={assetConsumeBars}
                          bars={[
                            {
                              key: "filled",
                              label: "Filled (L)",
                              color: brand,
                            },
                            { key: "used", label: "Used (L)", color: accent },
                          ]}
                          height={200}
                        />
                        <LegendDots
                          items={[
                            { label: "Filled (L)", color: brand },
                            { label: "Used (L)", color: accent },
                          ]}
                        />
                      </>
                    ) : (
                      <CompactBars
                        data={[{ name: "No data", value: 0, fill: "#e2e8f0" }]}
                        includeZeros
                        color="#e2e8f0"
                        height={200}
                      />
                    )}
                  </DashboardWidget>
                </DashboardArrangeItem>
              )}
              {hasFuel && show("fuel_consumed_monetary") && (
                <DashboardArrangeItem id="fuel_assets_money">
                  <DashboardWidget
                    title="Assets vs fuel money"
                    subtitle={`Fill cost vs use cost @ ${fmt(fuelPrice)} UGX/L · separate`}
                    href="/app/fuel"
                    brandColor={ALERT_SEVERITY.warning}
                    tone="amber"
                    insight={
                      assetMoneyBars.length
                        ? `Top use cost: ${assetMoneyBars[0].fullName} · ${fmtUgx(assetMoneyBars[0].usedCost)}`
                        : "No costable fuel events in this period"
                    }
                  >
                    {assetMoneyBars.length ? (
                      <>
                        <CompactComposed
                          data={assetMoneyBars}
                          bars={[
                            {
                              key: "fillCost",
                              label: "Fill cost",
                              color: brand,
                            },
                            {
                              key: "usedCost",
                              label: "Use cost",
                              color: accent,
                            },
                          ]}
                          height={200}
                        />
                        <LegendDots
                          items={[
                            { label: "Fill cost", color: brand },
                            { label: "Use cost", color: accent },
                          ]}
                        />
                      </>
                    ) : (
                      <CompactBars
                        data={[{ name: "No data", value: 0, fill: "#e2e8f0" }]}
                        includeZeros
                        color="#e2e8f0"
                        height={200}
                      />
                    )}
                  </DashboardWidget>
                </DashboardArrangeItem>
              )}
              {hasFuel && show("fuel_trend") && (
                <DashboardArrangeItem id="fuel_trend">
                  <DashboardWidget
                    title="Monthly fill vs consumption"
                    subtitle="Trend from fuel reports (months overlapping period)"
                    href="/app/fuel"
                    brandColor={accent}
                    tone="accent"
                    insight={
                      fuelTrendRows.some((r) => r.filled > 0 || r.consumed > 0)
                        ? `Showing ${fuelTrendRows.length} months of fill and burn`
                        : fuelUsed > 0 || fuelFilled > 0
                          ? "Period totals available · monthly leaf trend still syncing"
                          : "Trend appears after fuel reports sync into the database"
                    }
                  >
                    {fuelTrendRows.some(
                      (r) => r.filled > 0 || r.consumed > 0,
                    ) ? (
                      <>
                        <CompactComposed
                          data={fuelTrendRows}
                          bars={[
                            {
                              key: "filled",
                              label: "Filled (L)",
                              color: brand,
                            },
                          ]}
                          lines={[
                            {
                              key: "consumed",
                              label: "Consumed (L)",
                              color: accent,
                            },
                          ]}
                          height={180}
                        />
                        <LegendDots
                          items={[
                            { label: "Filled (L)", color: brand },
                            { label: "Consumed (L)", color: accent },
                          ]}
                        />
                      </>
                    ) : fuelUsed > 0 || fuelFilled > 0 ? (
                      <CompactBars
                        data={fuelKpiBars}
                        includeZeros
                        color={accent}
                        height={180}
                      />
                    ) : (
                      <CompactBars
                        data={[{ name: "No data", value: 0, fill: "#e2e8f0" }]}
                        includeZeros
                        color="#e2e8f0"
                        height={180}
                      />
                    )}
                  </DashboardWidget>
                </DashboardArrangeItem>
              )}
              {hasFuel && show("fuel_data_changes") && (
                <DashboardArrangeItem id="fuel_data_changes">
                  <DashboardWidget
                    title="Fuel data changes"
                    subtitle="Fillings · consumption · drains"
                    href="/app/fuel"
                    brandColor={ALERT_SEVERITY.warning}
                    tone="amber"
                    insight={`${fmt(fuelFilled, 1)} L filled · ${fmt(fuelTheftLiters, 1)} L loss`}
                  >
                    <CompactBars
                      data={fuelChangeBars}
                      includeZeros
                      color={brand}
                    />
                  </DashboardWidget>
                </DashboardArrangeItem>
              )}
              {hasFuel &&
                show("top_fuel_consumption") &&
                topFuelBars.length > 0 && (
                  <DashboardArrangeItem id="top_fuel_leaders">
                    <DashboardWidget
                      title="Top units by consumption"
                      subtitle="Highest burn from fuel reports (period)"
                      href="/app/fuel"
                      brandColor={accent}
                      tone="accent"
                      insight={`Top: ${topFuelBars[0].fullName || topFuelBars[0].name} · ${topFuelBars[0].value} L`}
                    >
                      <CompactBars
                        data={topFuelBars}
                        horizontal
                        unit="L"
                        color={accent}
                        height={200}
                      />
                    </DashboardWidget>
                  </DashboardArrangeItem>
                )}
              {hasFuel && show("tank_risk") && tankRiskBars.rows.length > 0 && (
                <DashboardArrangeItem id="tank_risk">
                  <DashboardWidget
                    title={
                      tankRiskBars.kind === "pct"
                        ? "Tank risk — lowest levels"
                        : "Live tank litres"
                    }
                    subtitle={
                      tankRiskBars.kind === "pct"
                        ? "Live fuel % (lowest first) · not period-filtered"
                        : "Live tank litres · not period-filtered"
                    }
                    href="/app/fuel"
                    brandColor={ALERT_SEVERITY.warning}
                    tone="amber"
                    insight={
                      tankRiskBars.kind === "pct"
                        ? `${tankRiskBars.rows.filter((r) => r.value < 25).length} assets below 25%`
                        : `Highest live tank: ${tankRiskBars.rows[0]?.value} L`
                    }
                  >
                    <CompactBars
                      data={tankRiskBars.rows}
                      horizontal
                      unit={tankRiskBars.kind === "pct" ? "%" : "L"}
                      color={accent}
                      height={180}
                    />
                  </DashboardWidget>
                </DashboardArrangeItem>
              )}
              {hasFuel &&
                show("burn_vs_fill") &&
                (fuelFilled > 0 || fuelUsed > 0) && (
                  <DashboardArrangeItem id="burn_vs_fill">
                    <DashboardWidget
                      title="Burn vs fill"
                      subtitle={`Consumed as share of filled · ${periodLabel}`}
                      brandColor={brand}
                      tone="teal"
                      insight={
                        fuelFilled > 0
                          ? `${pct(fuelUsed, fuelFilled)}% of filled volume was consumed`
                          : `${fmt(fuelUsed, 1)} L consumed with no fill volume in period`
                      }
                    >
                      <CompactRadial
                        value={fuelFilled > 0 ? pct(fuelUsed, fuelFilled) : 0}
                        label={
                          fuelFilled > 0
                            ? `${pct(fuelUsed, fuelFilled)}%`
                            : `${fmt(fuelUsed, 1)} L`
                        }
                        color={brand}
                      />
                    </DashboardWidget>
                  </DashboardArrangeItem>
                )}
              {show("trip_performance") && tripRows.length > 0 && (
                <DashboardArrangeItem id="trip_performance">
                  <DashboardWidget
                    title="Trip performance"
                    subtitle={`Distance + fuel in ${periodLabel}`}
                    href="/app/routes"
                    brandColor={brand}
                    tone="sky"
                    insight={`${tripRows.length} assets with trip data`}
                  >
                    <CompactDualAxis
                      data={tripRows}
                      leftKey="distance"
                      rightKey="fuel"
                      leftLabel="Distance (km)"
                      rightLabel="Fuel (L)"
                      leftColor={brand}
                      rightColor={accent}
                      height={188}
                    />
                    <LegendDots
                      items={[
                        { label: "Distance (km)", color: brand },
                        { label: "Fuel (L)", color: accent },
                      ]}
                    />
                  </DashboardWidget>
                </DashboardArrangeItem>
              )}
              {show("route_pipeline") && routeStages.length > 0 && (
                <DashboardArrangeItem id="route_pipeline">
                  <DashboardWidget
                    title="Route pipeline"
                    subtitle="Current route statuses · not period-filtered"
                    href="/app/routes"
                    brandColor={accent}
                    tone="accent"
                    insight={`${num(routeStats?.total)} routes in total`}
                  >
                    <CompactStageBars stages={routeStages} />
                  </DashboardWidget>
                </DashboardArrangeItem>
              )}
              {show("driver_duty") && driverSlices.length > 0 && (
                <DashboardArrangeItem id="driver_duty">
                  <DashboardWidget
                    title="Driver duty"
                    subtitle="Live roster · not period-filtered"
                    href="/app/drivers"
                    brandColor={brand}
                    tone="teal"
                    insight={`${num(driverStats?.total)} drivers on roster`}
                  >
                    <CompactDonut
                      data={driverSlices}
                      centerValue={num(driverStats?.total)}
                      centerLabel="drivers"
                    />
                    <LegendDots
                      items={driverSlices.map((s) => ({
                        label: s.name,
                        color: s.color,
                        value: s.value,
                      }))}
                    />
                  </DashboardWidget>
                </DashboardArrangeItem>
              )}
              {show("workshop_load") && workshopBars.length > 0 && (
                <DashboardArrangeItem id="workshop_load">
                  <DashboardWidget
                    title="Workshop load"
                    subtitle="Open jobs · not period-filtered"
                    href="/app/workshop"
                    brandColor={ALERT_SEVERITY.warning}
                    tone="amber"
                    insight={`${num(workshopKpis?.pendingMaintenance)} pending maintenance`}
                  >
                    <CompactBars data={workshopBars} color={brand} />
                  </DashboardWidget>
                </DashboardArrangeItem>
              )}
              {show("commands") && commandBars.length > 0 && (
                <DashboardArrangeItem id="commands">
                  <DashboardWidget
                    title="Commands"
                    subtitle="Remote commands per asset"
                    href="/app/commands"
                    brandColor={secondary}
                    tone="secondary"
                    insight={`${commandBars.reduce((s, r) => s + r.value, 0)} commands logged`}
                  >
                    <CompactBars data={commandBars} horizontal color={brand} />
                  </DashboardWidget>
                </DashboardArrangeItem>
              )}
              {show("users_by_role") && userSlices.length > 0 && (
                <DashboardArrangeItem id="users_by_role">
                  <DashboardWidget
                    title="Users by role"
                    subtitle={`${activeUsers} active accounts`}
                    href="/app/settings"
                    brandColor={brand}
                    tone="primary"
                    insight={`${safeArray(tenantUsers).length} users total`}
                  >
                    <CompactDonut
                      data={userSlices}
                      centerValue={safeArray(tenantUsers).length}
                      centerLabel="users"
                    />
                    <LegendDots
                      items={userSlices.map((s) => ({
                        label: s.name,
                        color: s.color,
                        value: s.value,
                      }))}
                    />
                  </DashboardWidget>
                </DashboardArrangeItem>
              )}
            </DashboardArrangeBoard>
          </div>
        )}

        <DashboardQuickAccess enabledKeys={enabled} />
      </AnimatedPage>
      </div>
    </AppLayout>
  );
}
