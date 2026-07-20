export const SYSTEM_ROLES = ['super_admin', 'platform_admin'] as const;
export const TENANT_ROLES = ['tenant_admin', 'manager', 'operator', 'viewer'] as const;

export function isSystemRole(role?: string | null): boolean {
  return SYSTEM_ROLES.includes(role as (typeof SYSTEM_ROLES)[number]);
}

export function isSuperAdmin(role?: string | null): boolean {
  return role === 'super_admin';
}

export function canAccessAdminPanel(role?: string | null): boolean {
  return isSystemRole(role);
}

export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  platform_admin: 'Platform Admin',
  tenant_admin: 'Tenant Admin',
  manager: 'Manager',
  operator: 'Operator',
  viewer: 'Viewer',
};
