export const SYSTEM_ROLES = ['super_admin', 'platform_admin'] as const;
export const TENANT_ROLES = ['tenant_admin', 'manager', 'operator', 'viewer'] as const;

export type SystemRole = (typeof SYSTEM_ROLES)[number];
export type TenantRole = (typeof TENANT_ROLES)[number];

export function isSystemRole(role?: string | null): boolean {
  return SYSTEM_ROLES.includes(role as SystemRole);
}

export function isSuperAdmin(role?: string | null): boolean {
  return role === 'super_admin';
}

export function canAccessAdminPanel(role?: string | null): boolean {
  return isSystemRole(role);
}
