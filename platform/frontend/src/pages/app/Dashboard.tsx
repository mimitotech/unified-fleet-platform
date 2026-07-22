import { useCallback, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Fuel,
  Gauge,
  Radio,
  Route,
  Truck,
  Users,
  Video,
  Wrench,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { AppLayout } from '@/components/app/AppLayout';
import { MetricCard } from '@/components/app/MetricCard';
import { WialonContextBanner } from '@/components/app/WialonContextBanner';
import { AnimatedPage, PageLoader } from '@/components/shared/PageLoader';
import { QueryErrorBanner } from '@/components/shared/QueryErrorBanner';
import {
  DashboardSectionLabel,
  DashboardWidget,
} from '@/components/dashboard/DashboardWidget';
import {
  CompactBars,
  CompactComposed,
  CompactDonut,
  CompactMultiLine,
  CompactRadial,
  CompactStackedHBars,
  CompactStageBars,
  LegendDots,
  alertSeveritySlices,
  fleetStatusSlices,
} from '@/components/dashboard/DashboardCharts';
import {
  DashboardQuickAccess,
  moduleEnabledSet,
} from '@/components/dashboard/DashboardQuickAccess';
import { DashboardToolbar } from '@/components/dashboard/DashboardToolbar';
import { type PeriodPreset, shiftDays } from '@/components/shared/PeriodAssetControls';
import { useFleetUnits } from '@/hooks/useFleetUnits';
import { useAlerts } from '@/hooks/useAlerts';
import { useModules } from '@/hooks/useModules';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { useAuth } from '@/providers/AuthProvider';
import { useWialonContext } from '@/hooks/useWialon';
import {
  useDriverStats,
  useFuelKpis,
  useFuelTrend,
  useGeofences,
  useRouteStats,
  useVideoStreams,
  useWorkshopKpis,
} from '@/hooks/useDomain';
import { useWialonGeofencesLive } from '@/hooks/useWialonLive';
import { clientApi, getTenantSlug } from '@/lib/api';
import { ALERT_SEVERITY, FLEET_STATUS } from '@/lib/chartColors';
import {
  isWidgetVisible,
  loadWidgetVisibility,
  resolveDashboardFuelPrice,
  saveWidgetVisibility,
  type DashboardWidgetId,
  type DashboardWidgetVisibility,
} from '@/lib/dashboardWidgetPrefs';
import type { FleetUnit } from '@/lib/fleetUnits';
import { lightenHex } from '@/lib/tenantBranding';
import { LIVE_POLL, livePollLabel } from '@/lib/liveRefresh';
import { safeArray } from '@/lib/safeArray';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const SECTION = 'space-y-2.5';

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmt(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function fmtUgx(n: number): string {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    maximumFractionDigits: 0,
  }).format(n);
}

function shortName(name: string, max = 14): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function unitParam(unit: FleetUnit, ...keys: string[]): number | null {
  const params = unit.lmsg?.params || {};
  for (const k of keys) {
    const v = params[k];
    if (v != null && v !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  for (const p of unit.prms || []) {
    if (keys.includes(p.key) && Number.isFinite(Number(p.value))) return Number(p.value);
  }
  for (const s of unit.sens || []) {
    const name = String(s.name || '').toLowerCase();
    const type = String(s.type || '').toLowerCase();
    const hit = keys.some((k) => name.includes(k.toLowerCase()) || type.includes(k.toLowerCase()));
    if (!hit) continue;
    const paramKey = s.param;
    if (paramKey && params[paramKey] != null && Number.isFinite(Number(params[paramKey]))) {
      return Number(params[paramKey]);
    }
  }
  return null;
}

function healthBucket(u: FleetUnit): 'healthy' | 'attention' | 'unhealthy' {
  if (u.status === 'offline' || !u.lastUpdate) return 'unhealthy';
  const age = Date.now() - u.lastUpdate.getTime();
  const lowFuel = u.fuelLevel != null && u.fuelLevel > 0 && u.fuelLevel < 15;
  if (age > 24 * 60 * 60_000 || (lowFuel && age > 60 * 60_000)) return 'unhealthy';
  if (age > 60 * 60_000 || (u.fuelLevel != null && u.fuelLevel > 0 && u.fuelLevel < 25)) {
    return 'attention';
  }
  return 'healthy';
}

export default function Dashboard() {
  const { user } = useAuth();
  const branding = useTenantBranding();
  const brand = branding.primaryColor;
  const accent = branding.accentColor;
  const secondary = branding.secondaryColor;
  const isAdmin = user?.role === 'tenant_admin' || user?.role === 'platform_admin';
  const { modules } = useModules();
  const enabled = useMemo(() => moduleEnabledSet(modules, isAdmin), [modules, isAdmin]);

  const hasMonitoring = enabled.has('monitoring');
  const hasAlerts = enabled.has('alerts');
  const hasFuel = enabled.has('fuel');
  const hasWorkshop = enabled.has('workshop');
  const hasDrivers = enabled.has('drivers');
  const hasRoutes = enabled.has('routes');
  const hasCommands = enabled.has('commands');
  const hasSurveillance = enabled.has('surveillance');
  const hasGeofencing = enabled.has('geofencing');

  const todayStr = useMemo(() => todayIso(), []);
  const [draftPreset, setDraftPreset] = useState<PeriodPreset | 'custom'>('7d');
  const [draftFrom, setDraftFrom] = useState(() => shiftDays(todayIso(), -6));
  const [draftTo, setDraftTo] = useState(() => todayIso());
  const [applied, setApplied] = useState(() => ({
    from: shiftDays(todayIso(), -6),
    to: todayIso(),
  }));

  const [visibility, setVisibility] = useState<DashboardWidgetVisibility>(() =>
    loadWidgetVisibility(getTenantSlug()),
  );

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

  const onExecute = useCallback(() => {
    const from = draftFrom <= draftTo ? draftFrom : draftTo;
    const to = draftFrom <= draftTo ? draftTo : draftFrom;
    setApplied({ from, to });
  }, [draftFrom, draftTo]);

  const alertFromIso = useMemo(() => `${applied.from}T00:00:00.000Z`, [applied.from]);
  const alertToIso = useMemo(() => `${applied.to}T23:59:59.999Z`, [applied.to]);

  const { units, counts, statuses, live, isLoading: fleetLoading } = useFleetUnits();
  const { connected, configured, ctx } = useWialonContext();
  const { data: alerts, isError: alertsError, refetch: refetchAlerts } = useAlerts(200, hasAlerts, {
    from: alertFromIso,
    to: alertToIso,
  });
  const alertList = safeArray<{
    id?: string;
    title?: string;
    severity?: string;
    type?: string;
    timestamp?: string;
    acknowledged?: boolean;
  }>(alerts);

  const {
    data: fuelKpis,
    isError: fuelKpisError,
    refetch: refetchFuelKpis,
  } = useFuelKpis(hasFuel, { from: applied.from, to: applied.to });
  const { data: fuelTrend } = useFuelTrend(hasFuel, { from: applied.from, to: applied.to });
  const { data: workshopKpis } = useWorkshopKpis(hasWorkshop);
  const { data: driverStats } = useDriverStats(hasDrivers);
  const { data: routeStats } = useRouteStats(hasRoutes);
  const { data: videoStreams } = useVideoStreams(hasSurveillance);
  const { data: geofencesDb } = useGeofences(hasGeofencing);
  const { data: geofencesLive } = useWialonGeofencesLive(hasGeofencing && connected);
  const { data: trips } = useQuery({
    queryKey: ['trips', 'dashboard', applied.from, applied.to],
    queryFn: () => clientApi.getTrips(40),
    enabled: hasRoutes,
    staleTime: 90_000,
  });
  const { data: tenantUsers } = useQuery({
    queryKey: ['tenantUsers', 'dashboard'],
    queryFn: () => clientApi.getTenantUsers(),
    enabled: isAdmin,
    staleTime: 120_000,
  });
  const { data: commandHistory } = useQuery({
    queryKey: ['commandHistory', 'dashboard'],
    queryFn: () => clientApi.getCommandHistory(),
    enabled: hasCommands,
    staleTime: 90_000,
  });

  const fuelPrice = useMemo(() => resolveDashboardFuelPrice(), [applied.from, applied.to]);

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
        { name: 'Online', value: onlineCount, color: brand },
        { name: 'Offline', value: counts.offline, color: FLEET_STATUS.offline },
      ].filter((s) => s.value > 0),
    [onlineCount, counts.offline, brand],
  );

  const healthSlices = useMemo(() => {
    const buckets = { healthy: 0, attention: 0, unhealthy: 0 };
    for (const u of units ?? []) {
      buckets[healthBucket(u)] += 1;
    }
    return [
      { name: 'Healthy', value: buckets.healthy, color: FLEET_STATUS.moving },
      { name: 'Need attention', value: buckets.attention, color: ALERT_SEVERITY.warning },
      { name: 'Unhealthy', value: buckets.unhealthy, color: ALERT_SEVERITY.critical },
    ].filter((s) => s.value > 0);
  }, [units]);

  const motionIgnition = useMemo(() => {
    const buckets = {
      Moving: { withIgn: 0, withoutIgn: 0 },
      Idle: { withIgn: 0, withoutIgn: 0 },
      Stopped: { withIgn: 0, withoutIgn: 0 },
    };
    for (const u of units ?? []) {
      if (u.status === 'offline') continue;
      const ign = ignitionById.get(String(u.id)) ?? false;
      const key = u.status === 'moving' ? 'Moving' : u.status === 'idle' ? 'Idle' : 'Stopped';
      if (ign) buckets[key].withIgn += 1;
      else buckets[key].withoutIgn += 1;
    }
    return (['Moving', 'Idle', 'Stopped'] as const).map((name) => ({
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
      if (u.status === 'offline') {
        noState += 1;
        continue;
      }
      const ign = ignitionById.get(String(u.id)) ?? false;
      if (u.status === 'moving') {
        if (ign) movingIgn += 1;
        else moving += 1;
      } else if (ign) {
        stationaryIgn += 1;
      } else {
        stationary += 1;
      }
    }
    return [
      { name: 'Moving + ign', value: movingIgn, color: FLEET_STATUS.moving },
      { name: 'Moving', value: moving, color: brand },
      { name: 'Stationary + ign', value: stationaryIgn, color: FLEET_STATUS.idle },
      { name: 'Stationary', value: stationary, color: FLEET_STATUS.stopped },
      { name: 'No coordinates', value: noCoords, color: '#94a3b8' },
      { name: 'No actual state', value: noState, color: FLEET_STATUS.offline },
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
    const rows = (units ?? [])
      .map((u) => {
        const v = unitParam(u, 'battery', 'battery_voltage', 'pwr_int');
        return v != null && v > 0
          ? { name: shortName(u.name), value: Math.round(v * 10) / 10, fill: brand }
          : null;
      })
      .filter(Boolean) as Array<{ name: string; value: number; fill: string }>;
    return rows.sort((a, b) => a.value - b.value).slice(0, 8);
  }, [units, brand]);

  const voltageBars = useMemo(() => {
    const rows = (units ?? [])
      .map((u) => {
        const v = unitParam(u, 'pwr_ext', 'voltage', 'ext_voltage', 'external_voltage');
        return v != null && v > 0
          ? { name: shortName(u.name), value: Math.round(v * 10) / 10, fill: accent }
          : null;
      })
      .filter(Boolean) as Array<{ name: string; value: number; fill: string }>;
    return rows.sort((a, b) => a.value - b.value).slice(0, 8);
  }, [units, accent]);

  const geofenceCount = useMemo(() => {
    const liveList = safeArray(geofencesLive?.geofences);
    if (liveList.length) return liveList.length;
    return safeArray(geofencesDb).length;
  }, [geofencesLive, geofencesDb]);

  /* —— Alerts —— */

  const severitySlices = useMemo(() => alertSeveritySlices(alertList), [alertList]);
  const openCount = useMemo(() => alertList.filter((a) => !a.acknowledged).length, [alertList]);
  const ackedCount = Math.max(0, alertList.length - openCount);
  const criticalCount = useMemo(
    () =>
      alertList.filter((a) => {
        const s = String(a.severity || '').toLowerCase();
        return s === 'critical' || s === 'emergency';
      }).length,
    [alertList],
  );

  const ackSlices = useMemo(
    () =>
      [
        { name: 'Open', value: openCount, color: ALERT_SEVERITY.warning },
        { name: 'Acknowledged', value: ackedCount, color: brand },
      ].filter((s) => s.value > 0),
    [openCount, ackedCount, brand],
  );

  const alertTimeline = useMemo(() => {
    const days = new Map<string, { critical: number; warning: number; info: number }>();
    const start = new Date(`${applied.from}T12:00:00`);
    const end = new Date(`${applied.to}T12:00:00`);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.set(d.toISOString().slice(0, 10), { critical: 0, warning: 0, info: 0 });
    }
    for (const a of alertList) {
      if (!a.timestamp) continue;
      const day = new Date(a.timestamp).toISOString().slice(0, 10);
      const bucket = days.get(day);
      if (!bucket) continue;
      const s = String(a.severity || 'info').toLowerCase();
      if (s === 'critical' || s === 'emergency') bucket.critical += 1;
      else if (s === 'warning') bucket.warning += 1;
      else bucket.info += 1;
    }
    return [...days.entries()].map(([day, v]) => ({ name: day.slice(5), ...v }));
  }, [alertList, applied.from, applied.to]);

  const alertTypeBars = useMemo(() => {
    const byType = new Map<string, number>();
    for (const a of alertList) {
      const raw = String(a.type || a.title || 'event')
        .replace(/^wialon[_-]?/i, '')
        .replace(/_/g, ' ')
        .trim();
      const t = raw.split(/\s+/).slice(0, 3).join(' ') || 'event';
      byType.set(t, (byType.get(t) ?? 0) + 1);
    }
    const palette = [ALERT_SEVERITY.critical, ALERT_SEVERITY.warning, accent, brand, '#0284c7'];
    return [...byType.entries()]
      .map(([name, value], i) => ({
        name: shortName(name, 16),
        value,
        fill: palette[i % palette.length],
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [alertList, accent, brand]);

  const speedingBars = useMemo(() => {
    const byUnit = new Map<string, number>();
    for (const a of alertList) {
      const t = String(a.type || a.title || '').toLowerCase();
      if (!/speed/.test(t)) continue;
      const name = shortName(String(a.title || a.type || 'Speeding').replace(/^wialon[_-]?/i, ''), 16);
      byUnit.set(name, (byUnit.get(name) ?? 0) + 1);
    }
    return [...byUnit.entries()]
      .map(([name, value], i) => ({
        name,
        value,
        fill: i % 2 === 0 ? ALERT_SEVERITY.critical : ALERT_SEVERITY.warning,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [alertList]);

  const notificationBars = useMemo(() => {
    const recent = [...alertList]
      .filter((a) => a.timestamp)
      .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
      .slice(0, 8);
    return recent.map((a, i) => {
      const s = String(a.severity || 'info').toLowerCase();
      const fill =
        s === 'critical' || s === 'emergency'
          ? ALERT_SEVERITY.critical
          : s === 'warning'
            ? ALERT_SEVERITY.warning
            : accent;
      return {
        name: shortName(String(a.title || a.type || 'Alert'), 16),
        value: 1,
        fill: i % 2 === 0 ? fill : brand,
      };
    });
  }, [alertList, accent, brand]);

  /* —— Fuel —— */

  const fuelFilled = num((fuelKpis as Record<string, number> | undefined)?.totalFilled);
  const fuelUsed = num((fuelKpis as Record<string, number> | undefined)?.totalConsumed);
  const fuelTheftLiters = num(
    (fuelKpis as Record<string, number> | undefined)?.totalTheftLiters
      ?? (fuelKpis as Record<string, number> | undefined)?.theftLiters,
  );
  const fuelTracked = num((fuelKpis as Record<string, number> | undefined)?.vehiclesTracked);
  const avgConsumption = num((fuelKpis as Record<string, number> | undefined)?.avgConsumption);
  const fuelCost = Math.round(fuelUsed * fuelPrice);

  const fuelKpiBars = useMemo(
    () => [
      { name: 'Filled', value: Math.round(fuelFilled), fill: brand },
      { name: 'Consumed', value: Math.round(fuelUsed), fill: accent },
      { name: 'Theft (L)', value: Math.round(fuelTheftLiters), fill: ALERT_SEVERITY.critical },
    ],
    [fuelFilled, fuelUsed, fuelTheftLiters, brand, accent],
  );

  const fuelMonetaryBars = useMemo(
    () => [
      { name: 'Consumed (L)', value: Math.round(fuelUsed), fill: brand },
      {
        name: 'Cost (k UGX)',
        value: Math.round(fuelCost / 1000),
        fill: accent,
      },
    ],
    [fuelUsed, fuelCost, brand, accent],
  );

  const fuelChangeBars = useMemo(
    () => [
      { name: 'Fillings', value: Math.round(fuelFilled), fill: brand },
      { name: 'Consumed', value: Math.round(fuelUsed), fill: accent },
      { name: 'Drains / theft', value: Math.round(fuelTheftLiters), fill: ALERT_SEVERITY.critical },
    ],
    [fuelFilled, fuelUsed, fuelTheftLiters, brand, accent],
  );

  const fuelTrendRows = useMemo(() => {
    const rows = safeArray<{ month?: string; filled?: number; consumed?: number }>(fuelTrend);
    return rows.slice(-8).map((r) => ({
      name: String(r.month || '—').slice(2),
      filled: num(r.filled),
      consumed: num(r.consumed),
    }));
  }, [fuelTrend]);

  const tankRiskBars = useMemo(() => {
    const withPct = (units ?? [])
      .filter((u) => u.fuelLevel != null && u.fuelLevel > 0 && u.fuelLevel <= 100)
      .map((u) => ({
        name: shortName(u.name),
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
    if (withPct.length) return { kind: 'pct' as const, rows: withPct };
    const withL = (units ?? [])
      .filter((u) => num(u.fuelLiters) > 0)
      .map((u, i) => ({
        name: shortName(u.name),
        value: Math.round(num(u.fuelLiters) * 10) / 10,
        fill: i % 2 === 0 ? accent : brand,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    if (withL.length) return { kind: 'liters' as const, rows: withL };
    return { kind: 'none' as const, rows: [] as Array<{ name: string; value: number; fill: string }> };
  }, [units, brand, accent]);

  /* —— Ops —— */

  const tripRows = useMemo(() => {
    const list = safeArray<{ unitName?: string; mileage?: number; fuelUsed?: number }>(trips);
    const byUnit = new Map<string, { distance: number; fuel: number }>();
    for (const t of list) {
      const name = t.unitName || '—';
      if (name === '—') continue;
      const row = byUnit.get(name) ?? { distance: 0, fuel: 0 };
      row.distance += num(t.mileage);
      row.fuel += num(t.fuelUsed);
      byUnit.set(name, row);
    }
    return [...byUnit.entries()]
      .map(([name, v]) => ({
        name: shortName(name),
        distance: Math.round(v.distance),
        fuel: Math.round(v.fuel * 10) / 10,
      }))
      .filter((r) => r.distance > 0 || r.fuel > 0)
      .sort((a, b) => b.distance - a.distance)
      .slice(0, 8);
  }, [trips]);

  const topFuelBars = useMemo(
    () =>
      [...tripRows]
        .filter((r) => r.fuel > 0)
        .sort((a, b) => b.fuel - a.fuel)
        .slice(0, 8)
        .map((r, i) => ({
          name: r.name,
          value: r.fuel,
          fill: i % 2 === 0 ? brand : accent,
        })),
    [tripRows, brand, accent],
  );

  const routeStages = useMemo(() => {
    if (!routeStats || num(routeStats.total) <= 0) return [];
    return [
      { name: 'Scheduled', value: num(routeStats.scheduled), color: FLEET_STATUS.idle },
      { name: 'In progress', value: num(routeStats.inProgress), color: brand },
      { name: 'Completed', value: num(routeStats.completed), color: accent },
    ].filter((s) => s.value > 0);
  }, [routeStats, brand, accent]);

  const driverSlices = useMemo(() => {
    if (!driverStats || num(driverStats.total) <= 0) return [];
    return [
      { name: 'Available', value: num(driverStats.available), color: FLEET_STATUS.moving },
      { name: 'Driving', value: num(driverStats.driving), color: brand },
      { name: 'Off duty', value: num(driverStats.offDuty), color: FLEET_STATUS.offline },
    ].filter((s) => s.value > 0);
  }, [driverStats, brand]);

  const workshopBars = useMemo(() => {
    if (!workshopKpis) return [];
    return [
      { name: 'Pending', value: num(workshopKpis.pendingMaintenance), fill: ALERT_SEVERITY.warning },
      { name: 'Done (mo)', value: num(workshopKpis.completedThisMonth), fill: brand },
      { name: 'Breakdowns', value: num(workshopKpis.openBreakdowns), fill: ALERT_SEVERITY.critical },
      { name: 'Inspections', value: num(workshopKpis.inspectionsDue), fill: accent },
    ].filter((r) => r.value > 0);
  }, [workshopKpis, brand, accent]);

  const userSlices = useMemo(() => {
    const list = safeArray<{ role?: string; is_active?: boolean }>(tenantUsers);
    const byRole = new Map<string, number>();
    for (const u of list) {
      const role = String(u.role || 'viewer').replace(/_/g, ' ');
      byRole.set(role, (byRole.get(role) ?? 0) + 1);
    }
    const palette = [brand, accent, secondary, '#0284c7', '#0d9488'];
    return [...byRole.entries()].map(([name, value], i) => ({
      name,
      value,
      color: palette[i % palette.length],
    }));
  }, [tenantUsers, brand, accent, secondary]);

  const activeUsers = useMemo(
    () => safeArray<{ is_active?: boolean }>(tenantUsers).filter((u) => u.is_active !== false).length,
    [tenantUsers],
  );

  const commandBars = useMemo(() => {
    const list = safeArray<Record<string, unknown>>(commandHistory);
    const byAsset = new Map<string, number>();
    for (const row of list) {
      const name = String(row.assetName || row.asset_name || '—');
      if (name === '—') continue;
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
  const showLoader = fleetLoading && !(units?.length);
  const periodLabel = `${applied.from} → ${applied.to}`;

  const toolbar = (
    <DashboardToolbar
      todayStr={todayStr}
      draftFrom={draftFrom}
      draftTo={draftTo}
      draftPreset={draftPreset}
      onDraftFrom={setDraftFrom}
      onDraftTo={setDraftTo}
      onDraftPreset={setDraftPreset}
      onExecute={onExecute}
      visibility={visibility}
      onToggleWidget={toggleWidget}
      enabledModules={enabled}
      isAdmin={isAdmin}
    />
  );

  if (showLoader) {
    return (
      <AppLayout title="Dashboard" subtitle="Operations command center" actions={toolbar}>
        <PageLoader />
      </AppLayout>
    );
  }

  const showFleetSection =
    hasMonitoring &&
    counts.total > 0 &&
    (show('health_check') ||
      show('connection_status') ||
      show('motion_state') ||
      show('fleet_status') ||
      show('top_mileage') ||
      show('mileage') ||
      show('fleet_utilization') ||
      show('device_battery') ||
      show('voltage_level') ||
      (show('geofences') && hasGeofencing));

  const showAlertsSection =
    hasAlerts &&
    (show('alerts_trend') ||
      show('alerts_ack') ||
      show('alerts_severity') ||
      show('alerts_types') ||
      show('notifications') ||
      show('speedings'));

  const showFuelSection =
    hasFuel &&
    (show('fuel_consumed_monetary') ||
      show('fuel_totals') ||
      show('fuel_trend') ||
      show('consumed_by_fls') ||
      show('fuel_data_changes') ||
      show('top_fuel_consumption') ||
      show('tank_risk') ||
      show('burn_vs_fill'));

  const showOpsSection =
    (show('trip_performance') && tripRows.length > 0) ||
    (show('route_pipeline') && routeStages.length > 0) ||
    (show('driver_duty') && driverSlices.length > 0) ||
    (show('workshop_load') && workshopBars.length > 0) ||
    (show('commands') && commandBars.length > 0) ||
    (show('users_by_role') && userSlices.length > 0);

  return (
    <AppLayout
      title="Dashboard"
      subtitle="Live operational picture across your enabled modules"
      actions={toolbar}
    >
      {(fuelKpisError || alertsError) && (
        <QueryErrorBanner
          message="Some dashboard widgets could not load."
          onRetry={() => {
            void refetchFuelKpis();
            void refetchAlerts();
          }}
          className="mb-4"
        />
      )}

      <AnimatedPage className="space-y-6">
        <WialonContextBanner />

        <div
          className="flex flex-wrap items-center gap-3 py-3 px-4 rounded-xl border"
          style={{
            borderColor: `${brand}33`,
            background: `linear-gradient(120deg, ${lightenHex(brand, 0.9)} 0%, #ffffff 55%, ${lightenHex(accent, 0.88)} 100%)`,
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={cn(
                'inline-flex h-2.5 w-2.5 rounded-full',
                live || connected ? 'bg-status-moving animate-pulse' : 'bg-muted-foreground/40',
              )}
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">
                {live || connected ? 'System live' : configured ? 'Link idle' : 'Telematics not linked'}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {live
                  ? `Snapshot refreshes ${livePollLabel(LIVE_POLL.fleet)} · ${fmt(counts.total)} assets · period ${periodLabel}`
                  : ctx?.accountName
                    ? String(ctx.accountName)
                    : 'Connect a source in Admin for live counts'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 ml-auto">
            <Badge variant="outline" className="text-[10px] font-medium">
              {moduleCount} module{moduleCount === 1 ? '' : 's'}
            </Badge>
            {hasMonitoring && (
              <Badge variant="outline" className="text-[10px] font-medium">
                {onlinePct}% online
              </Badge>
            )}
            {hasAlerts && criticalCount > 0 && (
              <Badge className="text-[10px] bg-destructive text-destructive-foreground">
                {criticalCount} critical
              </Badge>
            )}
            {connected && (
              <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                <Radio className="h-3 w-3 mr-1" />
                Linked
              </Badge>
            )}
          </div>
        </div>

        <div className="stat-strip">
          {hasMonitoring && (
            <MetricCard title="Assets" value={counts.total} icon={Truck} variant="primary" size="xxs" />
          )}
          {hasMonitoring && (
            <MetricCard title="Online" value={onlineCount} icon={Activity} variant="success" size="xxs" />
          )}
          {hasMonitoring && (
            <MetricCard title="Utilization" value={`${utilization}%`} icon={Gauge} variant="info" size="xxs" />
          )}
          {hasAlerts && (
            <MetricCard title="Open alerts" value={openCount} icon={AlertTriangle} variant="destructive" size="xxs" />
          )}
          {hasFuel && (
            <MetricCard title="Fuel used" value={`${fmt(fuelUsed)} L`} icon={Fuel} variant="info" size="xxs" />
          )}
          {hasDrivers && num(driverStats?.total) > 0 && (
            <MetricCard title="Drivers" value={num(driverStats?.total)} icon={Users} variant="default" size="xxs" />
          )}
          {hasRoutes && num(routeStats?.total) > 0 && (
            <MetricCard title="Routes" value={num(routeStats?.total)} icon={Route} variant="warning" size="xxs" />
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

        {showFleetSection && (
          <div className={SECTION}>
            <DashboardSectionLabel color={brand}>Fleet pulse</DashboardSectionLabel>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {show('health_check') && (
                <DashboardWidget
                  title="Health check status"
                  subtitle="Connection · freshness · fuel risk"
                  href="/app/monitoring"
                  brandColor={brand}
                  tone="primary"
                  insight={
                    healthSlices.length
                      ? healthSlices.map((s) => `${s.value} ${s.name.toLowerCase()}`).join(' · ')
                      : 'No fleet health signal yet'
                  }
                >
                  <CompactDonut data={healthSlices} centerValue={counts.total} centerLabel="assets" />
                  <LegendDots
                    items={healthSlices.map((s) => ({ label: s.name, color: s.color, value: s.value }))}
                  />
                </DashboardWidget>
              )}

              {show('connection_status') && (
                <DashboardWidget
                  title="Connection status"
                  subtitle="Online vs offline"
                  href="/app/monitoring"
                  brandColor={brand}
                  tone="teal"
                  insight={`${onlinePct}% of the fleet is online right now`}
                >
                  <CompactDonut data={connectionSlices} centerValue={`${onlinePct}%`} centerLabel="online" />
                  <LegendDots
                    items={connectionSlices.map((s) => ({ label: s.name, color: s.color, value: s.value }))}
                  />
                </DashboardWidget>
              )}

              {show('motion_state') && (
                <DashboardWidget
                  title="Motion state"
                  subtitle="Wialon-style motion × ignition"
                  href="/app/monitoring"
                  brandColor={accent}
                  tone="accent"
                  insight={`${onlineCount} online · ${fmt(counts.total)} total`}
                >
                  {motionStateSlices.length ? (
                    <>
                      <CompactDonut data={motionStateSlices} centerValue={counts.total} centerLabel="assets" />
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
                        { key: 'withIgn', label: 'Ignition on', color: FLEET_STATUS.moving },
                        { key: 'withoutIgn', label: 'Ignition off', color: '#94a3b8' },
                      ]}
                      height={180}
                    />
                  )}
                </DashboardWidget>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {show('fleet_status') && (
                <DashboardWidget
                  title="Fleet status"
                  subtitle="Live partition of the whole fleet"
                  href="/app/monitoring"
                  brandColor={brand}
                  tone="primary"
                  insight={`${counts.moving} moving · ${counts.idle} idle · ${counts.stopped} stopped · ${counts.offline} offline`}
                >
                  <CompactDonut data={statusSlices} centerValue={counts.total} centerLabel="assets" />
                  <LegendDots items={statusSlices.map((s) => ({ label: s.name, color: s.color, value: s.value }))} />
                </DashboardWidget>
              )}

              {show('mileage') && (
                <DashboardWidget
                  title="Mileage"
                  subtitle="Fleet odometer total"
                  href="/app/monitoring?view=list"
                  brandColor={accent}
                  tone="accent"
                  insight={`${fmt(Math.round(totalMileage))} km across ${counts.total} assets`}
                >
                  {mileageLeaders.length > 0 ? (
                    <CompactBars data={mileageLeaders.slice(0, 5)} horizontal unit="km" color={accent} />
                  ) : (
                    <CompactBars
                      data={[{ name: 'Fleet', value: Math.round(totalMileage), fill: accent }]}
                      includeZeros
                      unit="km"
                      color={accent}
                    />
                  )}
                </DashboardWidget>
              )}

              {show('top_mileage') && mileageLeaders.length > 0 && (
                <DashboardWidget
                  title="Top units by mileage"
                  subtitle="Highest recorded odometer"
                  href="/app/monitoring?view=list"
                  brandColor={brand}
                  tone="teal"
                  insight={`Top asset: ${mileageLeaders[0].name} · ${fmt(mileageLeaders[0].value)} km`}
                >
                  <CompactBars data={mileageLeaders} horizontal unit="km" color={brand} />
                </DashboardWidget>
              )}

              {show('fleet_utilization') && (
                <DashboardWidget
                  title="Fleet utilization"
                  subtitle="Moving + idle share of all assets"
                  brandColor={accent}
                  tone="accent"
                  insight={`${counts.moving + counts.idle} of ${counts.total} assets are active (${utilization}%)`}
                >
                  <CompactRadial value={utilization} label="active" color={accent} />
                </DashboardWidget>
              )}

              {show('geofences') && hasGeofencing && (
                <DashboardWidget
                  title="Geofences"
                  subtitle="Configured zones"
                  href="/app/geofencing"
                  brandColor={secondary}
                  tone="secondary"
                  insight={
                    geofenceCount > 0
                      ? `${geofenceCount} geofence${geofenceCount === 1 ? '' : 's'} available`
                      : 'No geofences configured yet'
                  }
                >
                  <CompactDonut
                    data={[
                      {
                        name: 'Zones',
                        value: Math.max(geofenceCount, 1),
                        color: geofenceCount > 0 ? secondary : '#e2e8f0',
                      },
                    ]}
                    centerValue={geofenceCount}
                    centerLabel="zones"
                  />
                </DashboardWidget>
              )}

              {show('device_battery') && batteryBars.length > 0 && (
                <DashboardWidget
                  title="Device battery level"
                  subtitle="Lowest reported battery / internal power"
                  href="/app/monitoring"
                  brandColor={ALERT_SEVERITY.warning}
                  tone="amber"
                  insight={`Lowest: ${batteryBars[0].name} · ${batteryBars[0].value}`}
                >
                  <CompactBars data={batteryBars} horizontal unit="V" color={brand} />
                </DashboardWidget>
              )}

              {show('voltage_level') && voltageBars.length > 0 && (
                <DashboardWidget
                  title="Voltage level"
                  subtitle="External / supply voltage"
                  href="/app/monitoring"
                  brandColor={brand}
                  tone="sky"
                  insight={`Lowest: ${voltageBars[0].name} · ${voltageBars[0].value} V`}
                >
                  <CompactBars data={voltageBars} horizontal unit="V" color={accent} />
                </DashboardWidget>
              )}
            </div>
          </div>
        )}

        {showAlertsSection && (
          <div className={SECTION}>
            <DashboardSectionLabel color={ALERT_SEVERITY.warning}>Alerts</DashboardSectionLabel>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {show('alerts_trend') && (
                <DashboardWidget
                  className="md:col-span-2"
                  title="Alert activity"
                  subtitle={`Events in ${periodLabel}`}
                  href="/app/alerts"
                  brandColor={ALERT_SEVERITY.critical}
                  tone="rose"
                  insight={
                    alertList.length
                      ? `${alertList.length} events in view · ${criticalCount} critical`
                      : 'No alerts in the current window'
                  }
                >
                  <CompactMultiLine
                    data={alertTimeline}
                    series={[
                      { key: 'critical', label: 'Critical', color: ALERT_SEVERITY.critical },
                      { key: 'warning', label: 'Warning', color: ALERT_SEVERITY.warning },
                      { key: 'info', label: 'Info', color: accent },
                    ]}
                    height={180}
                  />
                  <LegendDots
                    items={[
                      { label: 'Critical', color: ALERT_SEVERITY.critical },
                      { label: 'Warning', color: ALERT_SEVERITY.warning },
                      { label: 'Info', color: accent },
                    ]}
                  />
                </DashboardWidget>
              )}

              {show('alerts_ack') && (
                <DashboardWidget
                  title="Open vs acknowledged"
                  subtitle="Response state of loaded alerts"
                  href="/app/alerts"
                  brandColor={brand}
                  tone="primary"
                  insight={alertList.length ? `${ackRate}% acknowledged` : 'Inbox is clear'}
                >
                  {ackSlices.length ? (
                    <>
                      <CompactDonut data={ackSlices} centerValue={`${ackRate}%`} centerLabel="acked" />
                      <LegendDots items={ackSlices.map((s) => ({ label: s.name, color: s.color, value: s.value }))} />
                    </>
                  ) : (
                    <CompactDonut
                      data={[{ name: 'No alerts', value: 1, color: '#e2e8f0' }]}
                      centerValue={0}
                      centerLabel="events"
                    />
                  )}
                </DashboardWidget>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {show('alerts_severity') && (
                <DashboardWidget
                  title="Severity mix"
                  subtitle="Critical · warning · info"
                  href="/app/alerts"
                  brandColor={ALERT_SEVERITY.warning}
                  tone="amber"
                  insight={
                    severitySlices.length
                      ? severitySlices.map((s) => `${s.value} ${s.name.toLowerCase()}`).join(' · ')
                      : 'No severity data yet'
                  }
                >
                  {severitySlices.length ? (
                    <>
                      <CompactDonut data={severitySlices} centerValue={alertList.length} centerLabel="events" />
                      <LegendDots
                        items={severitySlices.map((s) => ({ label: s.name, color: s.color, value: s.value }))}
                      />
                    </>
                  ) : (
                    <CompactBars
                      data={[{ name: 'None', value: 0, fill: '#e2e8f0' }]}
                      includeZeros
                      color="#e2e8f0"
                    />
                  )}
                </DashboardWidget>
              )}

              {show('alerts_types') && (
                <DashboardWidget
                  className="md:col-span-2"
                  title="Top alert types"
                  subtitle="Most frequent categories in the loaded set"
                  href="/app/alerts"
                  brandColor={accent}
                  tone="accent"
                  insight={
                    alertTypeBars[0]
                      ? `Leading type: ${alertTypeBars[0].name} (${alertTypeBars[0].value})`
                      : 'No typed alerts yet'
                  }
                >
                  {alertTypeBars.length ? (
                    <CompactBars data={alertTypeBars} horizontal color={accent} height={180} />
                  ) : (
                    <CompactBars
                      data={[{ name: 'No types', value: 0, fill: '#e2e8f0' }]}
                      includeZeros
                      color="#e2e8f0"
                    />
                  )}
                </DashboardWidget>
              )}

              {show('notifications') && (
                <DashboardWidget
                  title="Notifications"
                  subtitle="Latest events in period"
                  href="/app/alerts"
                  brandColor={ALERT_SEVERITY.warning}
                  tone="amber"
                  insight={
                    notificationBars.length
                      ? `${notificationBars.length} most recent notifications`
                      : 'No notifications in this period'
                  }
                >
                  {notificationBars.length ? (
                    <CompactBars data={notificationBars} horizontal includeZeros color={accent} />
                  ) : (
                    <CompactBars
                      data={[{ name: 'None', value: 0, fill: '#e2e8f0' }]}
                      includeZeros
                      color="#e2e8f0"
                    />
                  )}
                </DashboardWidget>
              )}

              {show('speedings') && (
                <DashboardWidget
                  title="Speedings"
                  subtitle="Speeding-related alerts in period"
                  href="/app/alerts"
                  brandColor={ALERT_SEVERITY.critical}
                  tone="rose"
                  insight={
                    speedingBars.length
                      ? `${speedingBars.reduce((s, r) => s + r.value, 0)} speeding events`
                      : 'No speeding alerts in this period'
                  }
                >
                  {speedingBars.length ? (
                    <CompactBars data={speedingBars} horizontal color={ALERT_SEVERITY.critical} />
                  ) : (
                    <CompactBars
                      data={[{ name: 'None', value: 0, fill: '#e2e8f0' }]}
                      includeZeros
                      color="#e2e8f0"
                    />
                  )}
                </DashboardWidget>
              )}
            </div>
          </div>
        )}

        {showFuelSection && (
          <div className={SECTION}>
            <DashboardSectionLabel color={brand}>Fuel</DashboardSectionLabel>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {show('fuel_consumed_monetary') && (
                <DashboardWidget
                  className="md:col-span-2"
                  title="Fuel consumed + monetary"
                  subtitle={`Period KPIs × ${fmt(fuelPrice)} UGX/L`}
                  href="/app/fuel"
                  brandColor={ALERT_SEVERITY.critical}
                  tone="rose"
                  insight={`${fmt(fuelUsed)} L consumed ≈ ${fmtUgx(fuelCost)}`}
                >
                  <CompactBars data={fuelMonetaryBars} includeZeros color={brand} height={180} />
                  <LegendDots
                    items={[
                      { label: 'Consumed (L)', color: brand, value: Math.round(fuelUsed) },
                      { label: 'Est. cost', color: accent, value: fmtUgx(fuelCost) },
                    ]}
                  />
                </DashboardWidget>
              )}

              {show('consumed_by_fls') && (
                <DashboardWidget
                  title="Consumed by FLS"
                  subtitle="Fuel level sensor consumption"
                  href="/app/fuel"
                  brandColor={brand}
                  tone="primary"
                  insight={
                    fuelTracked > 0
                      ? `${fuelTracked} assets tracked · avg ${avgConsumption || 0} L/100`
                      : `${fmt(fuelUsed)} L consumed in period`
                  }
                >
                  <CompactRadial
                    value={fuelFilled > 0 ? pct(fuelUsed, fuelFilled) : Math.min(100, Math.round(fuelUsed) ? 64 : 0)}
                    label={`${fmt(fuelUsed)} L`}
                    color={brand}
                  />
                </DashboardWidget>
              )}

              {show('fuel_totals') && (
                <DashboardWidget
                  title="Fuel totals"
                  subtitle="Filled · consumed · theft (period KPIs)"
                  href="/app/fuel"
                  brandColor={brand}
                  tone="primary"
                  insight={
                    fuelTracked > 0
                      ? `${fuelTracked} assets tracked · avg ${avgConsumption || 0} L/100`
                      : `${fmt(fuelFilled)} L filled · ${fmt(fuelUsed)} L consumed`
                  }
                >
                  <CompactBars data={fuelKpiBars} includeZeros color={brand} />
                  <LegendDots
                    items={fuelKpiBars.map((b) => ({
                      label: b.name,
                      color: String(b.fill),
                      value: b.value,
                    }))}
                  />
                </DashboardWidget>
              )}

              {show('fuel_trend') && (
                <DashboardWidget
                  className="md:col-span-2"
                  title="Monthly fill vs consumption"
                  subtitle="Trend from fuel reports (months overlapping period)"
                  href="/app/fuel"
                  brandColor={accent}
                  tone="accent"
                  insight={
                    fuelTrendRows.length
                      ? `Showing ${fuelTrendRows.length} months of fill and burn`
                      : 'Trend appears after fuel reports sync into the database'
                  }
                >
                  {fuelTrendRows.some((r) => r.filled > 0 || r.consumed > 0) ? (
                    <>
                      <CompactComposed
                        data={fuelTrendRows}
                        bars={[{ key: 'filled', label: 'Filled (L)', color: brand }]}
                        lines={[{ key: 'consumed', label: 'Consumed (L)', color: accent }]}
                        height={180}
                      />
                      <LegendDots
                        items={[
                          { label: 'Filled (L)', color: brand },
                          { label: 'Consumed (L)', color: accent },
                        ]}
                      />
                    </>
                  ) : (
                    <CompactBars data={fuelKpiBars} includeZeros color={accent} height={180} />
                  )}
                </DashboardWidget>
              )}

              {show('fuel_data_changes') && (
                <DashboardWidget
                  title="Fuel data changes"
                  subtitle="Fillings · consumption · drains"
                  href="/app/fuel"
                  brandColor={ALERT_SEVERITY.warning}
                  tone="amber"
                  insight={`${fmt(fuelFilled)} L filled · ${fmt(fuelTheftLiters)} L loss`}
                >
                  <CompactBars data={fuelChangeBars} includeZeros color={brand} />
                </DashboardWidget>
              )}

              {show('top_fuel_consumption') && topFuelBars.length > 0 && (
                <DashboardWidget
                  title="Top units by fuel consumption"
                  subtitle="Highest burn from trip data"
                  href="/app/fuel"
                  brandColor={accent}
                  tone="accent"
                  insight={`Top: ${topFuelBars[0].name} · ${topFuelBars[0].value} L`}
                >
                  <CompactBars data={topFuelBars} horizontal unit="L" color={accent} />
                </DashboardWidget>
              )}
            </div>

            {tankRiskBars.rows.length > 0 && (show('tank_risk') || show('burn_vs_fill')) && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {show('tank_risk') && (
                  <DashboardWidget
                    className="md:col-span-2"
                    title={tankRiskBars.kind === 'pct' ? 'Tank risk — lowest levels' : 'Live tank litres'}
                    subtitle={
                      tankRiskBars.kind === 'pct'
                        ? 'Assets with live fuel % (lowest first)'
                        : 'Assets reporting live tank litres'
                    }
                    href="/app/fuel"
                    brandColor={ALERT_SEVERITY.warning}
                    tone="amber"
                    insight={
                      tankRiskBars.kind === 'pct'
                        ? `${tankRiskBars.rows.filter((r) => r.value < 25).length} assets below 25%`
                        : `Highest live tank: ${tankRiskBars.rows[0]?.value} L`
                    }
                  >
                    <CompactBars
                      data={tankRiskBars.rows}
                      horizontal
                      unit={tankRiskBars.kind === 'pct' ? '%' : 'L'}
                      color={accent}
                      height={180}
                    />
                  </DashboardWidget>
                )}

                {show('burn_vs_fill') && (
                  <DashboardWidget
                    title="Burn vs fill"
                    subtitle="Consumed as share of filled"
                    brandColor={brand}
                    tone="teal"
                    insight={
                      fuelFilled > 0
                        ? `${pct(fuelUsed, fuelFilled)}% of filled volume was consumed`
                        : 'No fill volume in KPI window'
                    }
                  >
                    <CompactRadial
                      value={fuelFilled > 0 ? pct(fuelUsed, fuelFilled) : 0}
                      label="used / filled"
                      color={brand}
                    />
                  </DashboardWidget>
                )}
              </div>
            )}
          </div>
        )}

        {showOpsSection && (
          <div className={SECTION}>
            <DashboardSectionLabel color={secondary}>Operations</DashboardSectionLabel>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {show('trip_performance') && tripRows.length > 0 && (
                <DashboardWidget
                  title="Trip performance"
                  subtitle="Distance with fuel used"
                  href="/app/routes"
                  brandColor={brand}
                  tone="sky"
                  insight={`${tripRows.length} assets with trip data`}
                >
                  <CompactComposed
                    data={tripRows}
                    bars={[{ key: 'distance', label: 'Distance (km)', color: brand }]}
                    lines={[{ key: 'fuel', label: 'Fuel (L)', color: accent }]}
                  />
                </DashboardWidget>
              )}
              {show('route_pipeline') && routeStages.length > 0 && (
                <DashboardWidget
                  title="Route pipeline"
                  subtitle="Scheduled → in progress → done"
                  href="/app/routes"
                  brandColor={accent}
                  tone="accent"
                  insight={`${num(routeStats?.total)} routes in total`}
                >
                  <CompactStageBars stages={routeStages} />
                </DashboardWidget>
              )}
              {show('driver_duty') && driverSlices.length > 0 && (
                <DashboardWidget
                  title="Driver duty"
                  subtitle="Roster availability"
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
                    items={driverSlices.map((s) => ({ label: s.name, color: s.color, value: s.value }))}
                  />
                </DashboardWidget>
              )}
              {show('workshop_load') && workshopBars.length > 0 && (
                <DashboardWidget
                  title="Workshop load"
                  subtitle="Jobs and inspections"
                  href="/app/workshop"
                  brandColor={ALERT_SEVERITY.warning}
                  tone="amber"
                  insight={`${num(workshopKpis?.pendingMaintenance)} pending maintenance`}
                >
                  <CompactBars data={workshopBars} color={brand} />
                </DashboardWidget>
              )}
              {show('commands') && commandBars.length > 0 && (
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
              )}
              {show('users_by_role') && userSlices.length > 0 && (
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
                    items={userSlices.map((s) => ({ label: s.name, color: s.color, value: s.value }))}
                  />
                </DashboardWidget>
              )}
            </div>
          </div>
        )}

        <DashboardQuickAccess enabledKeys={enabled} />
      </AnimatedPage>
    </AppLayout>
  );
}
