import type { Response, NextFunction } from 'express';
import type { AuthRequest } from './auth.js';
import { query } from '../config/database.js';

const ROLE_MODULES: Record<string, string[]> = {
  super_admin: ['*'],
  platform_admin: ['*'],
  tenant_admin: ['*'],
  manager: [
    'dashboard', 'monitoring', 'surveillance', 'drivers', 'routes', 'fuel',
    'emissions', 'workshop', 'alerts', 'trailers', 'sensors', 'geofencing', 'commands',
  ],
  operator: ['dashboard', 'monitoring', 'alerts', 'routes', 'workshop'],
  viewer: ['dashboard', 'monitoring', 'alerts'],
};

// Operators write workshop records (inspections / maintenance / breakdowns) in the field.
const WRITE_ROLES = ['super_admin', 'platform_admin', 'tenant_admin', 'manager', 'operator'];
const COMMAND_ROLES = ['super_admin', 'platform_admin', 'tenant_admin', 'manager'];

const ADMIN_ROLES = new Set(['super_admin', 'platform_admin', 'tenant_admin']);

export async function getTenantModuleAccess(
  tenantId: string,
  userId: string,
  role: string,
  moduleKey: string
): Promise<{ allowed: boolean; enabled: boolean; visible: boolean; canViewData: boolean }> {
  const allowed = getAllowedModules(role);
  if (!allowed.includes('*') && !allowed.includes(moduleKey)) {
    return { allowed: false, enabled: false, visible: false, canViewData: false };
  }

  const { rows } = await query<{ is_enabled: boolean; is_visible: boolean }>(
    `SELECT is_enabled, COALESCE(is_visible, true) as is_visible
     FROM tenant_modules WHERE tenant_id = $1 AND module_key = $2`,
    [tenantId, moduleKey]
  );
  const mod = rows[0];
  if (mod && !mod.is_enabled) {
    return { allowed: false, enabled: false, visible: false, canViewData: false };
  }

  const { rows: userMod } = await query<{ is_enabled: boolean }>(
    `SELECT is_enabled FROM user_modules WHERE user_id = $1 AND module_key = $2`,
    [userId, moduleKey]
  );
  if (userMod[0] && !userMod[0].is_enabled) {
    return { allowed: false, enabled: false, visible: false, canViewData: false };
  }

  const visible = mod ? mod.is_visible : true;
  const canViewData = visible || ADMIN_ROLES.has(role);

  return { allowed: true, enabled: true, visible, canViewData };
}

export function requireModule(moduleKey: string, options?: { requireDataVisible?: boolean }) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (req.user.role === 'super_admin' || req.user.role === 'platform_admin') return next();

    const allowed = ROLE_MODULES[req.user.role] || [];
    if (!allowed.includes('*') && !allowed.includes(moduleKey)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    if (req.user.tenantId) {
      const access = await getTenantModuleAccess(
        req.user.tenantId,
        req.user.id,
        req.user.role,
        moduleKey
      );
      if (!access.enabled) {
        return res.status(403).json({ success: false, error: 'Module disabled for tenant' });
      }
      if (options?.requireDataVisible && !access.canViewData) {
        return res.status(403).json({
          success: false,
          error: 'Module data is hidden for your organization',
          code: 'MODULE_NOT_VISIBLE',
        });
      }
    }
    return next();
  };
}

export function requireWriteAccess(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (WRITE_ROLES.includes(req.user.role)) return next();
  return res.status(403).json({ success: false, error: 'Read-only access' });
}

export function requireCommandAccess(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (COMMAND_ROLES.includes(req.user.role)) return next();
  return res.status(403).json({ success: false, error: 'Commands not permitted' });
}

export function getAllowedModules(role: string): string[] {
  return ROLE_MODULES[role] || ROLE_MODULES.viewer;
}
