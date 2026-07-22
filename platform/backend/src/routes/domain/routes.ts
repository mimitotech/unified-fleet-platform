import { Router } from 'express';
import { query } from '../../config/database.js';
import { requireTenant, type TenantRequest } from '../../middleware/tenant.js';
import { requireModule, requireWriteAccess } from '../../middleware/rbac.js';
import { success, error } from '../../utils/response.js';
import { toCamelRows } from '../../utils/mapper.js';

const router = Router();
const mod = requireModule('routes');

router.get('/', requireTenant, mod, async (req: TenantRequest, res) => {
  const status = req.query.status as string | undefined;
  let sql = `SELECT * FROM fleet_routes WHERE tenant_id = $1 AND deleted_at IS NULL`;
  const params: unknown[] = [req.tenantId];
  if (status) {
    sql += ` AND status = $2`;
    params.push(status);
  }
  sql += ` ORDER BY start_time DESC`;
  const { rows } = await query(sql, params);
  return success(res, toCamelRows(rows));
});

router.get('/stats', requireTenant, mod, async (req: TenantRequest, res) => {
  const { rows } = await query(
    `SELECT
       COUNT(*)::int as total,
       COUNT(*) FILTER (WHERE status = 'scheduled')::int as scheduled,
       COUNT(*) FILTER (WHERE status = 'in-progress')::int as in_progress,
       COUNT(*) FILTER (WHERE status = 'completed')::int as completed,
       COALESCE(SUM(distance), 0)::float as total_distance
     FROM fleet_routes WHERE tenant_id = $1 AND deleted_at IS NULL`,
    [req.tenantId]
  );
  return success(res, toCamelRows(rows)[0]);
});

router.get('/trips', requireTenant, mod, async (req: TenantRequest, res) => {
  const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
  const from = req.query.from ? String(req.query.from) : undefined;
  const to = req.query.to ? String(req.query.to) : undefined;

  const params: unknown[] = [req.tenantId];
  let sql = `SELECT * FROM trip_summaries WHERE tenant_id = $1`;

  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    params.push(`${from} 00:00:00`);
    sql += ` AND departure_time >= $${params.length}`;
  }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    params.push(`${to} 23:59:59`);
    sql += ` AND departure_time <= $${params.length}`;
  }

  params.push(limit);
  sql += ` ORDER BY departure_time DESC LIMIT $${params.length}`;

  const { rows } = await query(sql, params);
  return success(res, toCamelRows(rows));
});

router.post('/', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  const {
    name, status, assetId, assetName, assetPlate, driverId, driverName,
    startTime, distance, waypoints, eta, color, estimatedDuration, notes,
  } = req.body;
  if (!name) return error(res, 'name required');
  const { rows } = await query(
    `INSERT INTO fleet_routes (tenant_id, name, status, asset_id, asset_name, asset_plate, driver_id, driver_name,
       start_time, distance, waypoints, eta, color, estimated_duration, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [
      req.tenantId, name, status || 'scheduled', assetId, assetName, assetPlate,
      driverId, driverName, startTime || new Date(), distance || 0,
      JSON.stringify(waypoints || []), eta, color || 'blue', estimatedDuration || 0, notes,
    ]
  );
  return success(res, toCamelRows(rows)[0], 201);
});

router.patch('/:id', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  const { status, endTime, actualStartTime, actualDuration, fuelUsage, notes } = req.body;
  const { rows } = await query(
    `UPDATE fleet_routes SET
       status = COALESCE($3, status),
       end_time = COALESCE($4, end_time),
       actual_start_time = COALESCE($5, actual_start_time),
       actual_duration = COALESCE($6, actual_duration),
       fuel_usage = COALESCE($7, fuel_usage),
       notes = COALESCE($8, notes),
       updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING *`,
    [req.params.id, req.tenantId, status, endTime, actualStartTime, actualDuration, fuelUsage, notes]
  );
  if (!rows[0]) return error(res, 'Route not found', 404);
  return success(res, toCamelRows(rows)[0]);
});

router.delete('/:id', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  await query(`UPDATE fleet_routes SET deleted_at = NOW() WHERE id = $1 AND tenant_id = $2`, [
    req.params.id, req.tenantId,
  ]);
  return success(res, { deleted: true });
});

export default router;
