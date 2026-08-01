import type { Response, NextFunction } from 'express';
import { query } from '../config/database.js';
import type { AuthRequest } from './auth.js';
import { isSuperAdmin, isSystemRole } from '../utils/systemRoles.js';

export async function canAccessTenant(
  userId: string,
  role: string,
  tenantId: string
): Promise<boolean> {
  if (isSuperAdmin(role)) return true;
  if (role === 'platform_admin') {
    const { rows } = await query<{ ok: number }>(
      `SELECT 1 as ok FROM tenants WHERE id = $1 AND assigned_manager_id = $2`,
      [tenantId, userId]
    );
    return !!rows[0];
  }
  return false;
}

/** Restrict platform admins to tenants assigned to them (super admin bypasses). */
export function requireTenantAccess(paramName = 'id') {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (isSuperAdmin(req.user.role)) return next();

    const tenantId = String(req.params[paramName] || req.params.tenantId || '');
    if (!tenantId) return next();

    if (!isSystemRole(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const allowed = await canAccessTenant(req.user.id, req.user.role, tenantId);
    if (!allowed) {
      return res.status(403).json({
        success: false,
        error: 'This tenant is not assigned to you. Contact a super administrator.',
      });
    }
    return next();
  };
}
