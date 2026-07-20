import { Router } from 'express';
import { query } from '../../config/database.js';
import { requireTenant, type TenantRequest } from '../../middleware/tenant.js';
import { requireModule, requireWriteAccess } from '../../middleware/rbac.js';
import { success, error } from '../../utils/response.js';
import { toCamelRows } from '../../utils/mapper.js';

const router = Router();
const mod = requireModule('workshop');

router.get('/kpis', requireTenant, mod, async (req: TenantRequest, res) => {
  const { rows } = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM maintenance_logs WHERE tenant_id = $1 AND status IN ('pending','in-progress') AND deleted_at IS NULL) as pending_maintenance,
       (SELECT COUNT(*)::int FROM maintenance_logs WHERE tenant_id = $1 AND status = 'completed' AND start_date >= date_trunc('month', NOW()) AND deleted_at IS NULL) as completed_this_month,
       (SELECT COUNT(*)::int FROM breakdown_reports WHERE tenant_id = $1 AND resolution_time IS NULL AND deleted_at IS NULL) as open_breakdowns,
       (SELECT COUNT(*)::int FROM vehicle_inspections WHERE tenant_id = $1 AND inspection_date >= NOW() - INTERVAL '30 days' AND overall_status = 'needs-attention' AND deleted_at IS NULL) as inspections_due,
       (SELECT COALESCE(SUM(total_cost), 0)::float FROM maintenance_logs WHERE tenant_id = $1 AND deleted_at IS NULL) as total_maintenance_cost`,
    [req.tenantId]
  );
  return success(res, toCamelRows(rows)[0]);
});

router.get('/inspections', requireTenant, mod, async (req: TenantRequest, res) => {
  const { rows } = await query(
    `SELECT * FROM vehicle_inspections WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY inspection_date DESC LIMIT 100`,
    [req.tenantId]
  );
  return success(res, toCamelRows(rows));
});

router.get('/maintenance', requireTenant, mod, async (req: TenantRequest, res) => {
  const { rows } = await query(
    `SELECT * FROM maintenance_logs WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY start_date DESC LIMIT 100`,
    [req.tenantId]
  );
  return success(res, toCamelRows(rows));
});

router.get('/breakdowns', requireTenant, mod, async (req: TenantRequest, res) => {
  const { rows } = await query(
    `SELECT * FROM breakdown_reports WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY breakdown_time DESC LIMIT 100`,
    [req.tenantId]
  );
  return success(res, toCamelRows(rows));
});

router.get('/mechanics', requireTenant, mod, async (req: TenantRequest, res) => {
  const { rows } = await query(
    `SELECT * FROM mechanics WHERE tenant_id = $1 AND deleted_at IS NULL AND is_active = true ORDER BY name`,
    [req.tenantId]
  );
  return success(res, toCamelRows(rows));
});

router.post('/inspections', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  const {
    vehicleId, vehicleName, vehiclePlate, assetId, driverId, driverName,
    inspectionType, inspectionDate, odometerReading, overallStatus, notes, inspectorName,
  } = req.body;
  if (!vehicleName || !inspectionType) return error(res, 'vehicleName and inspectionType required');
  const { rows } = await query(
    `INSERT INTO vehicle_inspections (
       tenant_id, asset_id, vehicle_id, vehicle_name, vehicle_plate, driver_id, driver_name,
       inspection_type, inspection_date, odometer_reading, overall_status, notes, inspector_name
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [
      req.tenantId,
      assetId || null,
      vehicleId || vehicleName,
      vehicleName,
      vehiclePlate || '',
      driverId || null,
      driverName || null,
      inspectionType,
      inspectionDate || new Date(),
      odometerReading ?? 0,
      overallStatus || 'pass',
      notes || null,
      inspectorName || null,
    ]
  );
  return success(res, toCamelRows(rows)[0], 201);
});

router.post('/maintenance', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  const {
    vehicleId, vehicleName, vehiclePlate, assetId, driverId, driverName,
    maintenanceType, priority, description, mechanicName, startDate, endDate,
    laborHours, laborCost, partsCost, totalCost, status, notes,
  } = req.body;
  if (!vehicleName || !maintenanceType || !description || !mechanicName) {
    return error(res, 'vehicleName, maintenanceType, description and mechanicName required');
  }
  const { rows } = await query(
    `INSERT INTO maintenance_logs (
       tenant_id, asset_id, vehicle_id, vehicle_name, vehicle_plate, driver_id, driver_name,
       maintenance_type, priority, description, mechanic_name, start_date, end_date,
       labor_hours, labor_cost, parts_cost, total_cost, status, notes
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
    [
      req.tenantId,
      assetId || null,
      vehicleId || vehicleName,
      vehicleName,
      vehiclePlate || '',
      driverId || null,
      driverName || null,
      maintenanceType,
      priority || 'medium',
      description,
      mechanicName,
      startDate || new Date(),
      endDate || null,
      laborHours ?? 0,
      laborCost ?? 0,
      partsCost ?? 0,
      totalCost ?? 0,
      status || 'pending',
      notes || null,
    ]
  );
  return success(res, toCamelRows(rows)[0], 201);
});

router.post('/breakdowns', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  const {
    vehicleId, vehicleName, vehiclePlate, assetId, driverId, driverName,
    location, breakdownTime, severity, description, cause, totalCost,
  } = req.body;
  if (!vehicleName || !description) return error(res, 'vehicleName and description required');
  const { rows } = await query(
    `INSERT INTO breakdown_reports (
       tenant_id, asset_id, vehicle_id, vehicle_name, vehicle_plate, driver_id, driver_name,
       location, breakdown_time, severity, description, cause, total_cost
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [
      req.tenantId,
      assetId || null,
      vehicleId || vehicleName,
      vehicleName,
      vehiclePlate || '',
      driverId || null,
      driverName || null,
      JSON.stringify(location || { lat: 0, lng: 0, address: '' }),
      breakdownTime || new Date(),
      severity || 'minor',
      description,
      cause || null,
      totalCost ?? 0,
    ]
  );
  return success(res, toCamelRows(rows)[0], 201);
});

export default router;
