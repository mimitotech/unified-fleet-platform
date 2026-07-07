import { TENANT_ROLES } from '@/lib/systemRoles';

export const ROLE_ACCESS: Record<
  string,
  { description: string; modules: string[] | '*'; canWrite: boolean; canCommand: boolean }
> = {
  tenant_admin: {
    description: 'Full access to all tenant modules, settings, and user management.',
    modules: '*',
    canWrite: true,
    canCommand: true,
  },
  manager: {
    description: 'Operational access — fleet, drivers, routes, fuel, workshop, geofencing, reports, and commands.',
    modules: [
      'dashboard', 'monitoring', 'surveillance', 'drivers', 'routes', 'fuel',
      'emissions', 'workshop', 'reports', 'alerts', 'trailers', 'sensors', 'geofencing',
    ],
    canWrite: true,
    canCommand: true,
  },
  operator: {
    description: 'Day-to-day monitoring — dashboard, live map, alerts, and routes (read-focused).',
    modules: ['dashboard', 'monitoring', 'alerts', 'routes'],
    canWrite: false,
    canCommand: false,
  },
  viewer: {
    description: 'Read-only — dashboard, monitoring, alerts, and reports.',
    modules: ['dashboard', 'monitoring', 'alerts', 'reports'],
    canWrite: false,
    canCommand: false,
  },
};

export const TENANT_ROLE_OPTIONS = TENANT_ROLES.map((role) => ({
  value: role,
  ...ROLE_ACCESS[role],
}));

export function defaultModulesForRole(role: string): string[] {
  const access = ROLE_ACCESS[role];
  if (!access || access.modules === '*') return [];
  return [...access.modules];
}

export function modulesApplyToRole(role: string): boolean {
  return role !== 'tenant_admin';
}
