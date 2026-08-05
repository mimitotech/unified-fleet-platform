import { query } from '../config/database.js';
import { isSystemRole } from '../utils/systemRoles.js';
export async function tenantMiddleware(req, res, next) {
    if (req.tenantId)
        return next();
    const slugHeader = req.headers['x-tenant-slug'] || undefined;
    if (isSystemRole(req.user?.role) && slugHeader) {
        const { rows } = await query(`SELECT id, slug FROM tenants WHERE slug = $1 AND is_active = true`, [slugHeader]);
        if (rows[0]) {
            req.tenantId = rows[0].id;
            req.tenantSlug = rows[0].slug;
        }
    }
    else if (req.user?.tenantId) {
        req.tenantId = req.user.tenantId;
        const { rows } = await query(`SELECT slug FROM tenants WHERE id = $1`, [
            req.user.tenantId,
        ]);
        req.tenantSlug = rows[0]?.slug;
    }
    if (!req.tenantId && !isSystemRole(req.user?.role)) {
        return res.status(400).json({ success: false, error: 'Tenant context required' });
    }
    next();
}
export function requireTenant(req, res, next) {
    if (!req.tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant not resolved' });
    }
    next();
}
