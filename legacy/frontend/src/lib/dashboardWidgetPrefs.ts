import { getTenantSlug } from '@/lib/api';

/** Stable widget IDs for dashboard chart visibility (localStorage). */
export type DashboardWidgetId =
  | 'health_check'
  | 'connection_status'
  | 'motion_state'
  | 'fleet_status'
  | 'geofences'
  | 'notifications'
  | 'mileage'
  | 'consumed_by_fls'
  | 'speedings'
  | 'top_fuel_consumption'
  | 'top_mileage'
  | 'device_battery'
  | 'voltage_level'
  | 'fuel_data_changes'
  | 'fuel_consumed_monetary'
  | 'fuel_totals'
  | 'fuel_trend'
  | 'tank_risk'
  | 'burn_vs_fill'
  | 'alerts_trend'
  | 'alerts_ack'
  | 'alerts_severity'
  | 'alerts_types'
  | 'fleet_utilization'
  | 'trip_performance'
  | 'route_pipeline'
  | 'driver_duty'
  | 'workshop_load'
  | 'commands'
  | 'users_by_role';

export type DashboardWidgetDef = {
  id: DashboardWidgetId;
  label: string;
  /** Module gate — when set, only list/show when that module is enabled (or admin). */
  module?: string;
};

/** Catalog shown in the ⋮ menu (Wialon-like + MAMS charts). */
export const DASHBOARD_WIDGET_DEFS: DashboardWidgetDef[] = [
  { id: 'health_check', label: 'Health check status', module: 'monitoring' },
  { id: 'connection_status', label: 'Connection status', module: 'monitoring' },
  { id: 'motion_state', label: 'Motion state', module: 'monitoring' },
  { id: 'fleet_status', label: 'Fleet status', module: 'monitoring' },
  { id: 'geofences', label: 'Geofences', module: 'geofencing' },
  { id: 'notifications', label: 'Notifications', module: 'alerts' },
  { id: 'mileage', label: 'Mileage', module: 'monitoring' },
  { id: 'consumed_by_fls', label: 'Consumed by FLS', module: 'fuel' },
  { id: 'speedings', label: 'Speedings', module: 'alerts' },
  { id: 'top_fuel_consumption', label: 'Top units by fuel consumption', module: 'fuel' },
  { id: 'top_mileage', label: 'Top units by mileage', module: 'monitoring' },
  { id: 'device_battery', label: 'Device battery level', module: 'monitoring' },
  { id: 'voltage_level', label: 'Voltage level', module: 'monitoring' },
  { id: 'fuel_data_changes', label: 'Fuel data changes', module: 'fuel' },
  { id: 'fuel_consumed_monetary', label: 'Fuel consumed + monetary', module: 'fuel' },
  { id: 'fuel_totals', label: 'Fuel totals', module: 'fuel' },
  { id: 'fuel_trend', label: 'Fuel fill vs consumption trend', module: 'fuel' },
  { id: 'tank_risk', label: 'Tank risk / live levels', module: 'fuel' },
  { id: 'burn_vs_fill', label: 'Burn vs fill', module: 'fuel' },
  { id: 'alerts_trend', label: 'Alerts trend', module: 'alerts' },
  { id: 'alerts_ack', label: 'Open vs acknowledged', module: 'alerts' },
  { id: 'alerts_severity', label: 'Alert severity mix', module: 'alerts' },
  { id: 'alerts_types', label: 'Top alert types', module: 'alerts' },
  { id: 'fleet_utilization', label: 'Fleet utilization', module: 'monitoring' },
  { id: 'trip_performance', label: 'Trip performance', module: 'routes' },
  { id: 'route_pipeline', label: 'Route pipeline', module: 'routes' },
  { id: 'driver_duty', label: 'Driver duty', module: 'drivers' },
  { id: 'workshop_load', label: 'Workshop load', module: 'workshop' },
  { id: 'commands', label: 'Commands', module: 'commands' },
  { id: 'users_by_role', label: 'Users by role' },
];

export type DashboardWidgetVisibility = Record<DashboardWidgetId, boolean>;

const DEFAULT_OFF = new Set<DashboardWidgetId>([
  'device_battery',
  'voltage_level',
  'commands',
  'users_by_role',
  'burn_vs_fill',
]);

export function defaultWidgetVisibility(): DashboardWidgetVisibility {
  const out = {} as DashboardWidgetVisibility;
  for (const def of DASHBOARD_WIDGET_DEFS) {
    out[def.id] = !DEFAULT_OFF.has(def.id);
  }
  return out;
}

function storageKey(slug?: string | null): string {
  return `mams_dashboard_widgets:${slug || getTenantSlug() || 'default'}`;
}

/** Default UGX/L when tenant has not set a fuel price. */
export const DEFAULT_FUEL_PRICE_UGX = 5200;

const PRICE_KEY_LEGACY = 'mams.fuel.pricePerLiter';

function analyticsPriceKey(slug?: string | null): string {
  return `mams_fuel_price_${slug || getTenantSlug() || 'default'}`;
}

/** Resolve fuel price — one value used by Dashboard, Fuel costing, and all money charts. */
export function resolveDashboardFuelPrice(): number {
  const slug = getTenantSlug() || 'default';
  try {
    const candidates = [
      localStorage.getItem(analyticsPriceKey(slug)),
      localStorage.getItem(PRICE_KEY_LEGACY),
    ];
    for (const raw of candidates) {
      if (!raw) continue;
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_FUEL_PRICE_UGX;
}

/**
 * Save fuel price once — writes both legacy keys so every monetization surface
 * (dashboard tiles, costing panel, asset money charts) stays in sync.
 */
export function saveFuelPrice(pricePerLiter: number): number {
  const n = Number(pricePerLiter);
  const value = Number.isFinite(n) && n > 0 ? n : DEFAULT_FUEL_PRICE_UGX;
  try {
    const raw = String(value);
    localStorage.setItem(analyticsPriceKey(), raw);
    localStorage.setItem(PRICE_KEY_LEGACY, raw);
    window.dispatchEvent(
      new CustomEvent('mams:fuel-price', { detail: { pricePerLiter: value } }),
    );
  } catch {
    /* ignore */
  }
  return value;
}

export function loadWidgetVisibility(slug?: string | null): DashboardWidgetVisibility {
  const defaults = defaultWidgetVisibility();
  try {
    const raw = localStorage.getItem(storageKey(slug));
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Record<string, boolean>>;
    const out = { ...defaults };
    for (const def of DASHBOARD_WIDGET_DEFS) {
      if (typeof parsed[def.id] === 'boolean') out[def.id] = parsed[def.id]!;
    }
    return out;
  } catch {
    return defaults;
  }
}

export function saveWidgetVisibility(
  visibility: DashboardWidgetVisibility,
  slug?: string | null,
): void {
  try {
    localStorage.setItem(storageKey(slug), JSON.stringify(visibility));
  } catch {
    /* ignore quota / private mode */
  }
}

export function isWidgetVisible(
  visibility: DashboardWidgetVisibility,
  id: DashboardWidgetId,
): boolean {
  return visibility[id] !== false;
}
