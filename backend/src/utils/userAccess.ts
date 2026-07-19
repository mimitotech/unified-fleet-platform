import { query } from '../config/database.js';
import { canAccessTenant } from '../middleware/tenantAccess.js';
import type { AuthRequest } from '../middleware/auth.js';
import { isSuperAdmin } from './systemRoles.js';

export const TENANT_USER_ROLES = ['tenant_admin', 'manager', 'operator', 'viewer'] as const;
export const SYSTEM_USER_ROLES = ['super_admin', 'platform_admin'] as const;

export type TenantUserRole = (typeof TENANT_USER_ROLES)[number];

export function isValidTenantRole(role: string): role is TenantUserRole {
  return (TENANT_USER_ROLES as readonly string[]).includes(role);
}

export async function getClientUserScope(userId: string): Promise<{
  id: string;
  tenant_id: string;
  role: string;
  email: string;
} | null> {
  const { rows } = await query<{
    id: string;
    tenant_id: string;
    role: string;
    email: string;
  }>(
    `SELECT id, tenant_id, role, email FROM users
     WHERE id = $1 AND tenant_id IS NOT NULL
       AND role NOT IN ('super_admin', 'platform_admin')`,
    [userId]
  );
  return rows[0] || null;
}

/** Ensures platform admins can only manage users on assigned tenants. */
export async function assertCanManageClientUser(req: AuthRequest, userId: string) {
  const user = await getClientUserScope(userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  if (isSuperAdmin(req.user?.role)) return user;

  if (req.user?.role === 'platform_admin') {
    const allowed = await canAccessTenant(req.user.id, req.user.role, user.tenant_id);
    if (!allowed) {
      throw Object.assign(new Error('This user belongs to a tenant not assigned to you'), { status: 403 });
    }
    return user;
  }

  throw Object.assign(new Error('Forbidden'), { status: 403 });
}

export async function filterClientUserIdsForAdmin(
  req: AuthRequest,
  userIds: string[]
): Promise<string[]> {
  if (isSuperAdmin(req.user?.role)) return userIds;
  if (req.user?.role !== 'platform_admin') return [];

  const { rows } = await query<{ id: string }>(
    `SELECT u.id FROM users u
     INNER JOIN tenants t ON t.id = u.tenant_id
     WHERE u.id = ANY($1::uuid[])
       AND u.tenant_id IS NOT NULL
       AND t.assigned_manager_id = $2`,
    [userIds, req.user.id]
  );
  return rows.map((r) => r.id);
}

export async function getUserModules(userId: string): Promise<string[]> {
  const { rows } = await query<{ module_key: string }>(
    `SELECT module_key FROM user_modules WHERE user_id = $1 AND is_enabled = true ORDER BY module_key`,
    [userId]
  );
  return rows.map((r) => r.module_key);
}
