import { Router } from 'express';
import { query } from '../../config/database.js';
import { requireTenant, type TenantRequest } from '../../middleware/tenant.js';
import { success, error } from '../../utils/response.js';
import { toCamelRows } from '../../utils/mapper.js';

const router = Router();

router.get('/', requireTenant, async (req: TenantRequest, res) => {
  const { rows } = await query(
    `SELECT d.*, a.name as assigned_asset_name, a.registration_plate as assigned_asset_plate
     FROM drivers d
     LEFT JOIN assets a ON a.id = d.assigned_asset_id
     WHERE d.tenant_id = $1 AND d.deleted_at IS NULL
     ORDER BY d.name`,
    [req.tenantId]
  );
  return success(res, toCamelRows(rows));
});

router.get('/stats', requireTenant, async (req: TenantRequest, res) => {
  const { rows } = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'available')::int as available,
       COUNT(*) FILTER (WHERE status = 'driving')::int as driving,
       COUNT(*) FILTER (WHERE status = 'off-duty')::int as off_duty,
       COUNT(*)::int as total
     FROM drivers WHERE tenant_id = $1 AND deleted_at IS NULL`,
    [req.tenantId]
  );
  return success(res, toCamelRows(rows)[0] || { total: 0, available: 0, driving: 0, offDuty: 0 });
});

router.get('/performance', requireTenant, async (req: TenantRequest, res) => {
  const { rows } = await query(
    `SELECT s.*, d.name as driver_name
     FROM driver_performance_snapshots s
     JOIN drivers d ON d.id = s.driver_id
     WHERE s.tenant_id = $1
     ORDER BY s.snapshot_date DESC LIMIT 30`,
    [req.tenantId]
  );
  return success(res, toCamelRows(rows));
});

router.post('/', requireTenant, async (req: TenantRequest, res) => {
  const { name, licenseNumber, phone, email, status, assignedAssetId } = req.body;
  if (!name || !licenseNumber) return error(res, 'name and licenseNumber required');
  const { rows } = await query(
    `INSERT INTO drivers (tenant_id, name, license_number, phone, email, status, assigned_asset_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [req.tenantId, name, licenseNumber, phone || '', email, status || 'available', assignedAssetId || null]
  );
  return success(res, toCamelRows(rows)[0], 201);
});

router.patch('/:id', requireTenant, async (req: TenantRequest, res) => {
  const { name, phone, email, status, assignedAssetId } = req.body;
  const { rows } = await query(
    `UPDATE drivers SET
       name = COALESCE($3, name),
       phone = COALESCE($4, phone),
       email = COALESCE($5, email),
       status = COALESCE($6, status),
       assigned_asset_id = COALESCE($7, assigned_asset_id),
       updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING *`,
    [req.params.id, req.tenantId, name, phone, email, status, assignedAssetId]
  );
  if (!rows[0]) return error(res, 'Driver not found', 404);
  return success(res, toCamelRows(rows)[0]);
});

router.delete('/:id', requireTenant, async (req: TenantRequest, res) => {
  await query(
    `UPDATE drivers SET deleted_at = NOW() WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.tenantId]
  );
  return success(res, { deleted: true });
});

export default router;
