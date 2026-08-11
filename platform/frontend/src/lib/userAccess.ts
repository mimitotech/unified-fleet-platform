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
    description: 'Operational access — fleet, drivers, routes, fuel, workshop, geofencing, and commands.',
    modules: [
      'dashboard', 'monitoring', 'surveillance', 'drivers', 'routes', 'fuel',
      'emissions', 'workshop', 'alerts', 'trailers', 'sensors', 'geofencing',
    ],
    canWrite: true,
    canCommand: true,
  },
  operator: {
    description:
      'Day-to-day operations — live map, alerts, routes, and workshop (inspections, maintenance, breakdowns).',
    modules: ['dashboard', 'monitoring', 'alerts', 'routes', 'workshop'],
    canWrite: true,
    canCommand: false,
  },
  viewer: {
    description: 'Read-only — dashboard, monitoring, and alerts (reports live inside each module).',
    modules: ['dashboard', 'monitoring', 'alerts'],
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
