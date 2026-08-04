export const SYSTEM_ROLES = ['super_admin', 'platform_admin'];
export const TENANT_ROLES = ['tenant_admin', 'manager', 'operator', 'viewer'];
export function isSystemRole(role) {
    return SYSTEM_ROLES.includes(role);
}
export function isSuperAdmin(role) {
    return role === 'super_admin';
}
export function canAccessAdminPanel(role) {
    return isSystemRole(role);
}
