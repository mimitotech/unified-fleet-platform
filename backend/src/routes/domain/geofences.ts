import { Router } from 'express';
import { query } from '../../config/database.js';
import { requireTenant, type TenantRequest } from '../../middleware/tenant.js';
import { success, error } from '../../utils/response.js';
import { toCamelRows } from '../../utils/mapper.js';

const router = Router();

router.get('/', requireTenant, async (req: TenantRequest, res) => {
  const { rows } = await query(
    `SELECT * FROM geofences WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name`,
    [req.tenantId]
  );
  return success(res, toCamelRows(rows));
});

router.post('/', requireTenant, async (req: TenantRequest, res) => {
  const { name, type, center, radius, points, color, isActive } = req.body;
  if (!name || !type) return error(res, 'name and type required');
  const { rows } = await query(
    `INSERT INTO geofences (tenant_id, name, type, center, radius, points, color, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [req.tenantId, name, type, center ? JSON.stringify(center) : null, radius, points ? JSON.stringify(points) : null, color || '#3B82F6', isActive !== false]
  );
  return success(res, toCamelRows(rows)[0], 201);
});

router.delete('/:id', requireTenant, async (req: TenantRequest, res) => {
  await query(`UPDATE geofences SET deleted_at = NOW() WHERE id = $1 AND tenant_id = $2`, [
    req.params.id, req.tenantId,
  ]);
  return success(res, { deleted: true });
});

export default router;
