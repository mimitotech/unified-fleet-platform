import { Router } from 'express';
import { query } from '../../config/database.js';
import { requireTenant, type TenantRequest } from '../../middleware/tenant.js';
import { requireModule, requireWriteAccess } from '../../middleware/rbac.js';
import { success, error } from '../../utils/response.js';
import { toCamelRows } from '../../utils/mapper.js';
import { DriverScoringService } from '../../services/DriverScoringService.js';

const router = Router();
const mod = requireModule('drivers');

router.get('/', requireTenant, mod, async (req: TenantRequest, res) => {
  await DriverScoringService.ensureSchema();
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

router.get('/stats', requireTenant, mod, async (req: TenantRequest, res) => {
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

router.get('/performance', requireTenant, mod, async (req: TenantRequest, res) => {
  await DriverScoringService.ensureSchema();
  const { rows } = await query(
    `SELECT s.*, d.name as driver_name, d.fuel_card_number, d.assigned_asset_id,
            a.registration_plate as assigned_asset_plate, a.name as assigned_asset_name
     FROM driver_performance_snapshots s
     JOIN drivers d ON d.id = s.driver_id
     LEFT JOIN assets a ON a.id = d.assigned_asset_id
     WHERE s.tenant_id = $1
     ORDER BY s.snapshot_date DESC, s.safety_score ASC
     LIMIT 200`,
    [req.tenantId]
  );
  return success(res, toCamelRows(rows));
});

router.get('/penalties', requireTenant, mod, async (req: TenantRequest, res) => {
  const config = await DriverScoringService.getConfig(String(req.tenantId));
  return success(res, config);
});

router.put('/penalties', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  try {
    const config = await DriverScoringService.saveConfig(String(req.tenantId), {
      baseScore: req.body?.baseScore != null ? Number(req.body.baseScore) : undefined,
      penalties: req.body?.penalties,
      goodMin: req.body?.goodMin != null ? Number(req.body.goodMin) : undefined,
      badMin: req.body?.badMin != null ? Number(req.body.badMin) : undefined,
    });
    return success(res, config);
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.post('/recompute-scores', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  try {
    const days = Math.min(90, Math.max(7, parseInt(String(req.body?.days || '30'), 10) || 30));
    const result = await DriverScoringService.recomputeTenant(String(req.tenantId), days);
    const { rows } = await query(
      `SELECT s.*, d.name as driver_name
       FROM driver_performance_snapshots s
       JOIN drivers d ON d.id = s.driver_id
       WHERE s.tenant_id = $1 AND s.snapshot_date = CURDATE()
       ORDER BY s.safety_score ASC`,
      [req.tenantId]
    );
    return success(res, { ...result, snapshots: toCamelRows(rows) });
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.get('/:id/violations', requireTenant, mod, async (req: TenantRequest, res) => {
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
  const { rows: driverRows } = await query<{ id: string; name: string; assigned_asset_id: string | null }>(
    `SELECT id, name, assigned_asset_id FROM drivers WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [req.params.id, req.tenantId]
  );
  if (!driverRows[0]) return error(res, 'Driver not found', 404);
  const d = driverRows[0];
  const { rows } = await query(
    `SELECT * FROM eco_driving_violations
     WHERE tenant_id = $1
       AND (
         driver_id = $2
         OR (driver_name IS NOT NULL AND LOWER(driver_name) = LOWER($3))
         OR ($4 IS NOT NULL AND asset_id = $4)
       )
     ORDER BY occurred_at DESC
     LIMIT $5`,
    [req.tenantId, d.id, d.name, d.assigned_asset_id, limit]
  );
  return success(res, toCamelRows(rows));
});

router.post('/', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  await DriverScoringService.ensureSchema();
  const { name, licenseNumber, phone, email, status, assignedAssetId, fuelCardNumber, hireDate } = req.body;
  if (!name || !licenseNumber) return error(res, 'name and licenseNumber required');
  try {
    const { rows } = await query(
      `INSERT INTO drivers (tenant_id, name, license_number, phone, email, status, assigned_asset_id, fuel_card_number, hire_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        req.tenantId,
        name,
        licenseNumber,
        phone || '',
        email || null,
        status || 'available',
        assignedAssetId || null,
        fuelCardNumber || null,
        hireDate || null,
      ]
    );
    return success(res, toCamelRows(rows)[0], 201);
  } catch (e) {
    const msg = (e as Error).message || '';
    if (/duplicate|unique|uq_drivers/i.test(msg)) {
      return error(res, 'A driver with this license number already exists', 409);
    }
    return error(res, msg);
  }
});

router.patch('/:id', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  await DriverScoringService.ensureSchema();
  const { name, phone, email, status, assignedAssetId, fuelCardNumber, hireDate, licenseNumber } = req.body;
  // Explicit null clears assignment / fuel card; omit key to leave unchanged
  const clearAsset = Object.prototype.hasOwnProperty.call(req.body, 'assignedAssetId');
  const clearFuel = Object.prototype.hasOwnProperty.call(req.body, 'fuelCardNumber');
  const clearHire = Object.prototype.hasOwnProperty.call(req.body, 'hireDate');
  const { rows } = await query(
    `UPDATE drivers SET
       name = COALESCE($3, name),
       phone = COALESCE($4, phone),
       email = COALESCE($5, email),
       status = COALESCE($6, status),
       assigned_asset_id = CASE WHEN $7 = 1 THEN $8 ELSE assigned_asset_id END,
       fuel_card_number = CASE WHEN $9 = 1 THEN $10 ELSE fuel_card_number END,
       hire_date = CASE WHEN $11 = 1 THEN $12 ELSE hire_date END,
       license_number = COALESCE($13, license_number),
       updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING *`,
    [
      req.params.id,
      req.tenantId,
      name ?? null,
      phone ?? null,
      email ?? null,
      status ?? null,
      clearAsset ? 1 : 0,
      clearAsset ? assignedAssetId || null : null,
      clearFuel ? 1 : 0,
      clearFuel ? fuelCardNumber || null : null,
      clearHire ? 1 : 0,
      clearHire ? hireDate || null : null,
      licenseNumber ?? null,
    ]
  );
  if (!rows[0]) return error(res, 'Driver not found', 404);
  return success(res, toCamelRows(rows)[0]);
});

router.delete('/:id', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  await query(
    `UPDATE drivers SET deleted_at = NOW() WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.tenantId]
  );
  return success(res, { deleted: true });
});

export default router;
