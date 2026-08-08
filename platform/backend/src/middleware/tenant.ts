import type { Response, NextFunction } from 'express';
import { query } from '../config/database.js';
import type { AuthRequest } from './auth.js';
import { isSystemRole } from '../utils/systemRoles.js';

export interface TenantRequest extends AuthRequest {
  tenantId?: string;
  tenantSlug?: string;
}

export async function tenantMiddleware(req: TenantRequest, res: Response, next: NextFunction) {
  if (req.tenantId) return next();

  const slugHeader = (req.headers['x-tenant-slug'] as string) || undefined;

  if (isSystemRole(req.user?.role) && slugHeader) {
    // System staff may preview draft/inactive clients via View Client (?tenant=slug).
    const { rows } = await query<{ id: string; slug: string }>(
      `SELECT id, slug FROM tenants WHERE slug = $1`,
      [slugHeader]
    );
    if (rows[0]) {
      req.tenantId = rows[0].id;
      req.tenantSlug = rows[0].slug;
    }
  } else if (req.user?.tenantId) {
    req.tenantId = req.user.tenantId;
    const { rows } = await query<{ slug: string }>(`SELECT slug FROM tenants WHERE id = $1`, [
      req.user.tenantId,
    ]);
    req.tenantSlug = rows[0]?.slug;
  }

  if (!req.tenantId && !isSystemRole(req.user?.role)) {
    return res.status(400).json({ success: false, error: 'Tenant context required' });
  }
  next();
}

export function requireTenant(req: TenantRequest, res: Response, next: NextFunction) {
  if (!req.tenantId) {
    return res.status(400).json({ success: false, error: 'Tenant not resolved' });
  }
  next();
}
