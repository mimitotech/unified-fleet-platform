import type { Response, NextFunction } from 'express';
import { query } from '../config/database.js';
import type { AuthRequest } from './auth.js';

export interface TenantRequest extends AuthRequest {
  tenantId?: string;
  tenantSlug?: string;
}

export async function tenantMiddleware(req: TenantRequest, res: Response, next: NextFunction) {
  const slug =
    (req.headers['x-tenant-slug'] as string) ||
    req.params.tenantSlug ||
    req.query.tenant as string;

  if (req.user?.role === 'platform_admin' && slug) {
    const { rows } = await query<{ id: string; slug: string }>(
      `SELECT id, slug FROM tenants WHERE slug = $1 AND is_active = true`,
      [slug]
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

  if (!req.tenantId && req.user?.role !== 'platform_admin') {
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
