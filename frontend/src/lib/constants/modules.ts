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

export const DEFAULT_MODULES: TenantModule[] = [
  { moduleKey: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard', sources: [], isEnabled: true },
  { moduleKey: 'monitoring', label: 'Monitoring', icon: 'Map', sources: ['wialon', 'tracksolid'], isEnabled: true },
  { moduleKey: 'surveillance', label: 'Surveillance', icon: 'Video', sources: ['loconav', 'tracksolid'], isEnabled: true },
  { moduleKey: 'alerts', label: 'Alerts', icon: 'Bell', sources: [], isEnabled: true },
];
