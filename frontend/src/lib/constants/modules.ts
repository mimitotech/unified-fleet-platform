import type { TenantModule } from '@/lib/api';

export const MODULE_ICONS: Record<string, string> = {
  dashboard: 'LayoutDashboard',
  monitoring: 'Map',
  surveillance: 'Video',
  drivers: 'Users',
  routes: 'Route',
  fuel: 'Fuel',
  emissions: 'Leaf',
  workshop: 'Wrench',
  reports: 'BarChart3',
  alerts: 'Bell',
  trailers: 'Truck',
  sensors: 'Gauge',
  geofencing: 'MapPin',
  commands: 'Terminal',
};

/** Fallback when modules API is unavailable */
export const DEFAULT_MODULES: TenantModule[] = [
  { moduleKey: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard', sources: [], isEnabled: true, isVisible: true, sortOrder: 1 },
  { moduleKey: 'monitoring', label: 'Monitoring', icon: 'Map', sources: ['wialon', 'tracksolid'], isEnabled: true, isVisible: true, sortOrder: 2 },
  { moduleKey: 'surveillance', label: 'Surveillance', icon: 'Video', sources: ['wialon', 'tracksolid'], isEnabled: true, isVisible: true, sortOrder: 3 },
  { moduleKey: 'alerts', label: 'Alerts', icon: 'Bell', sources: [], isEnabled: true, isVisible: true, sortOrder: 10 },
];

export function sortModules(modules: TenantModule[]): TenantModule[] {
  return [...modules].sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));
}

export const MODULE_LABELS: Record<string, string> = Object.fromEntries(
  DEFAULT_MODULES.map((m) => [m.moduleKey, m.label])
);
