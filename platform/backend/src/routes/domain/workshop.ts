import { Router } from 'express';
import { query } from '../../config/database.js';
import { requireTenant, type TenantRequest } from '../../middleware/tenant.js';
import { requireModule, requireWriteAccess } from '../../middleware/rbac.js';
import { success, error } from '../../utils/response.js';
import { toCamelRows } from '../../utils/mapper.js';
import { getChecklistTemplateForCategory } from '../../services/WorkshopSchema.js';
import {
  FAILURE_SYSTEMS,
  sanitizeWorkshopAssetCategory,
  WORKSHOP_ASSET_CATEGORIES,
  type WorkshopAssetCategory,
} from '../../services/WorkshopChecklistTemplates.js';

const router = Router();
const mod = requireModule('workshop');

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Resolve optional asset UUID; map external id via asset_mappings when possible. */
async function resolveWorkshopAssetId(
  tenantId: string,
  assetId: unknown,
  vehicleId: unknown,
): Promise<string | null> {
  const rawAsset = assetId != null ? String(assetId).trim() : '';
  if (rawAsset && UUID_RE.test(rawAsset)) return rawAsset;

  const external =
    (vehicleId != null && /^\d+$/.test(String(vehicleId).trim()) ? String(vehicleId).trim() : '') ||
    (rawAsset && /^\d+$/.test(rawAsset) ? rawAsset : '');
  if (!external) return null;

  try {
    const { rows } = await query<{ asset_id: string }>(
      `SELECT am.asset_id
       FROM asset_mappings am
       INNER JOIN assets a ON a.id = am.asset_id
       WHERE a.tenant_id = $1 AND am.source_type = 'wialon' AND am.external_id = $2
       LIMIT 1`,
      [tenantId, external],
    );
    return rows[0]?.asset_id ?? null;
  } catch {
    return null;
  }
}

function sanitizeDriverId(driverId: unknown): string | null {
  if (driverId == null || String(driverId).trim() === '') return null;
  return UUID_RE.test(String(driverId).trim()) ? String(driverId).trim() : null;
}

function sanitizeUuid(value: unknown): string | null {
  if (value == null || String(value).trim() === '') return null;
  return UUID_RE.test(String(value).trim()) ? String(value).trim() : null;
}

function asJson(value: unknown, fallback: unknown) {
  if (value == null) return JSON.stringify(fallback);
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

async function persistAssetCategory(assetId: string | null, category: WorkshopAssetCategory) {
  if (!assetId) return;
  try {
    await query(`UPDATE assets SET asset_category = $2, updated_at = NOW() WHERE id = $1`, [
      assetId,
      category,
    ]);
  } catch {
    /* column may be missing until migrate */
  }
}

/** Split flexible sections into legacy truck/trailer JSON columns for older clients. */
function legacyChecklistsFromSections(sections: unknown): { truck: unknown; trailer: unknown } {
  if (!Array.isArray(sections)) return { truck: [], trailer: [] };
  const truck: unknown[] = [];
  const trailer: unknown[] = [];
  for (const sec of sections) {
    const s = sec as { id?: string; items?: unknown[] };
    const items = Array.isArray(s.items) ? s.items : [];
    if (s.id === 'truck-head' || s.id === 'powertrain' || s.id === 'engine') {
      truck.push(...items);
    } else {
      trailer.push(...items);
    }
  }
  if (truck.length === 0 && trailer.length === 0) {
    for (const sec of sections) {
      const items = Array.isArray((sec as { items?: unknown[] }).items)
        ? (sec as { items: unknown[] }).items
        : [];
      truck.push(...items);
    }
  }
  return { truck, trailer };
}

router.get('/kpis', requireTenant, mod, async (req: TenantRequest, res) => {
  const { rows } = await query(
    `WITH maint AS (
       SELECT * FROM maintenance_logs WHERE tenant_id = $1 AND deleted_at IS NULL
     ),
     brk AS (
       SELECT * FROM breakdown_reports WHERE tenant_id = $1 AND deleted_at IS NULL
     ),
     insp AS (
       SELECT * FROM vehicle_inspections WHERE tenant_id = $1 AND deleted_at IS NULL
     )
     SELECT
       (SELECT COUNT(*)::int FROM maint WHERE status IN ('pending','in-progress')) AS pending_maintenance,
       (SELECT COUNT(*)::int FROM maint WHERE status = 'completed' AND start_date >= date_trunc('month', NOW())) AS completed_this_month,
       (SELECT COUNT(*)::int FROM brk WHERE resolution_time IS NULL) AS open_breakdowns,
       (SELECT COUNT(*)::int FROM insp WHERE inspection_date >= NOW() - INTERVAL '30 days' AND overall_status = 'needs-attention') AS inspections_due,
       (SELECT COALESCE(SUM(total_cost), 0)::float FROM maint) AS total_maintenance_cost,
       (SELECT COALESCE(SUM(total_cost), 0)::float FROM brk) AS total_breakdown_cost,
       (SELECT COUNT(DISTINCT vehicle_id)::int FROM maint WHERE status IN ('pending','in-progress')) AS vehicles_needing_service,
       (SELECT COUNT(*)::int FROM maint WHERE status IN ('pending','in-progress')) AS active_maintenance_jobs,
       (
         SELECT COALESCE(AVG(
           EXTRACT(EPOCH FROM (COALESCE(end_date, start_date) - start_date)) / 3600.0
         ), 0)::float
         FROM maint WHERE status = 'completed'
       ) AS avg_repair_time,
       (
         SELECT CASE WHEN COUNT(*) = 0 THEN 0
           ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE overall_status = 'pass') / COUNT(*))::int
         END
         FROM insp WHERE inspection_date >= NOW() - INTERVAL '90 days'
       ) AS inspection_pass_rate,
       (
         SELECT GREATEST(0, LEAST(100,
           100
           - (SELECT COUNT(*)::int FROM maint WHERE status IN ('pending','in-progress')) * 5
           - (SELECT COUNT(*)::int FROM brk WHERE resolution_time IS NULL) * 10
           - (SELECT COUNT(*)::int FROM insp WHERE overall_status = 'fail' AND inspection_date >= NOW() - INTERVAL '30 days') * 8
         ))
       ) AS fleet_health_score`,
    [req.tenantId]
  );
  const row = toCamelRows(rows)[0] || {};
  const n = (v: unknown) => {
    const x = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(x) ? x : 0;
  };
  return success(res, {
    ...row,
    pendingMaintenance: n(row.pendingMaintenance),
    completedThisMonth: n(row.completedThisMonth),
    openBreakdowns: n(row.openBreakdowns),
    inspectionsDue: n(row.inspectionsDue),
    totalMaintenanceCost: n(row.totalMaintenanceCost),
    totalBreakdownCost: n(row.totalBreakdownCost),
    vehiclesNeedingService: n(row.vehiclesNeedingService),
    activeMaintenanceJobs: n(row.activeMaintenanceJobs),
    avgRepairTime: n(row.avgRepairTime),
    inspectionPassRate: n(row.inspectionPassRate),
    fleetHealthScore: n(row.fleetHealthScore),
  });
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

router.get('/checklist-templates', requireTenant, mod, async (req: TenantRequest, res) => {
  const categoryParam = req.query.assetCategory ?? req.query.category;
  if (categoryParam) {
    const category = sanitizeWorkshopAssetCategory(categoryParam);
    const tpl = await getChecklistTemplateForCategory(req.tenantId!, category);
    return success(res, {
      ...tpl,
      failureSystems: FAILURE_SYSTEMS[category],
    });
  }
  const all = await Promise.all(
    WORKSHOP_ASSET_CATEGORIES.map(async (category) => {
      const tpl = await getChecklistTemplateForCategory(req.tenantId!, category);
      return { ...tpl, failureSystems: FAILURE_SYSTEMS[category] };
    }),
  );
  return success(res, all);
});

router.post('/inspections', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  const {
    vehicleId, vehicleName, vehiclePlate, assetId, driverId, driverName,
    inspectionType, inspectionDate, odometerReading, nextServiceMileage,
    truckHeadChecklist, trailerChecklist, overallStatus, notes, inspectorName,
    assetCategory, engineHours, checklistSections,
  } = req.body;
  if (!vehicleName || !inspectionType) return error(res, 'vehicleName and inspectionType required');
  const resolvedAssetId = await resolveWorkshopAssetId(req.tenantId!, assetId, vehicleId);
  const category = sanitizeWorkshopAssetCategory(assetCategory);
  const sections =
    checklistSections ??
    (truckHeadChecklist || trailerChecklist
      ? [
          ...(Array.isArray(truckHeadChecklist) && truckHeadChecklist.length
            ? [{ id: 'truck-head', title: 'Systems', items: truckHeadChecklist }]
            : []),
          ...(Array.isArray(trailerChecklist) && trailerChecklist.length
            ? [{ id: 'trailer-safety', title: 'Safety', items: trailerChecklist }]
            : []),
        ]
      : null);
  const legacy = legacyChecklistsFromSections(sections);
  await persistAssetCategory(resolvedAssetId, category);
  const { rows } = await query(
    `INSERT INTO vehicle_inspections (
       tenant_id, asset_id, vehicle_id, vehicle_name, vehicle_plate, driver_id, driver_name,
       inspection_type, inspection_date, odometer_reading, next_service_mileage,
       truck_head_checklist, trailer_checklist, overall_status, notes, inspector_name,
       asset_category, engine_hours, checklist_sections
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15,$16,$17,$18,$19::jsonb) RETURNING *`,
    [
      req.tenantId,
      resolvedAssetId,
      vehicleId || vehicleName,
      vehicleName,
      vehiclePlate || '',
      sanitizeDriverId(driverId),
      driverName || null,
      inspectionType,
      inspectionDate || new Date(),
      odometerReading ?? 0,
      nextServiceMileage ?? null,
      asJson(truckHeadChecklist ?? legacy.truck, []),
      asJson(trailerChecklist ?? legacy.trailer, []),
      overallStatus || 'pass',
      notes || null,
      inspectorName || null,
      category,
      engineHours ?? null,
      asJson(sections, []),
    ]
  );
  return success(res, toCamelRows(rows)[0], 201);
});

router.patch('/inspections/:id', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  const b = req.body;
  const resolvedAssetId =
    b.assetId != null || b.vehicleId != null
      ? await resolveWorkshopAssetId(req.tenantId!, b.assetId, b.vehicleId)
      : undefined;
  const category =
    b.assetCategory != null ? sanitizeWorkshopAssetCategory(b.assetCategory) : null;
  if (resolvedAssetId && category) await persistAssetCategory(resolvedAssetId, category);
  const sectionsJson =
    b.checklistSections != null
      ? asJson(b.checklistSections, [])
      : null;
  const legacy =
    b.checklistSections != null ? legacyChecklistsFromSections(b.checklistSections) : null;
  const { rows } = await query(
    `UPDATE vehicle_inspections SET
       asset_id = COALESCE($3, asset_id),
       vehicle_id = COALESCE($4, vehicle_id),
       vehicle_name = COALESCE($5, vehicle_name),
       vehicle_plate = COALESCE($6, vehicle_plate),
       driver_id = CASE WHEN $17::boolean THEN $7 ELSE driver_id END,
       driver_name = COALESCE($8, driver_name),
       inspection_type = COALESCE($9, inspection_type),
       inspection_date = COALESCE($10, inspection_date),
       odometer_reading = COALESCE($11, odometer_reading),
       next_service_mileage = COALESCE($12, next_service_mileage),
       truck_head_checklist = COALESCE($13::jsonb, truck_head_checklist),
       trailer_checklist = COALESCE($14::jsonb, trailer_checklist),
       overall_status = COALESCE($15, overall_status),
       notes = COALESCE($16, notes),
       inspector_name = COALESCE($18, inspector_name),
       asset_category = COALESCE($19, asset_category),
       engine_hours = COALESCE($20, engine_hours),
       checklist_sections = COALESCE($21::jsonb, checklist_sections),
       updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING *`,
    [
      req.params.id,
      req.tenantId,
      resolvedAssetId ?? null,
      b.vehicleId ?? null,
      b.vehicleName ?? null,
      b.vehiclePlate ?? null,
      sanitizeDriverId(b.driverId),
      b.driverName ?? null,
      b.inspectionType ?? null,
      b.inspectionDate ?? null,
      b.odometerReading ?? null,
      b.nextServiceMileage ?? null,
      b.truckHeadChecklist != null
        ? asJson(b.truckHeadChecklist, [])
        : legacy
          ? asJson(legacy.truck, [])
          : null,
      b.trailerChecklist != null
        ? asJson(b.trailerChecklist, [])
        : legacy
          ? asJson(legacy.trailer, [])
          : null,
      b.overallStatus ?? null,
      b.notes ?? null,
      Object.prototype.hasOwnProperty.call(b, 'driverId'),
      b.inspectorName ?? null,
      category,
      b.engineHours ?? null,
      sectionsJson,
    ]
  );
  if (!rows[0]) return error(res, 'Inspection not found', 404);
  return success(res, toCamelRows(rows)[0]);
});

router.delete('/inspections/:id', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  const { rowCount } = await query(
    `UPDATE vehicle_inspections SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [req.params.id, req.tenantId]
  );
  if (!rowCount) return error(res, 'Inspection not found', 404);
  return success(res, { deleted: true });
});

router.post('/maintenance', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  const {
    vehicleId, vehicleName, vehiclePlate, assetId, driverId, driverName,
    inspectionId, breakdownId, maintenanceType, priority, description, mechanicName,
    startDate, endDate, laborHours, laborCost, partsCost, totalCost, partsUsed,
    status, notes, odometerReading, nextServiceKm, nextServiceHours, nextServiceDays,
    assetCategory, engineHours,
  } = req.body;
  if (!vehicleName || !maintenanceType || !description || !mechanicName) {
    return error(res, 'vehicleName, maintenanceType, description and mechanicName required');
  }
  const resolvedAssetId = await resolveWorkshopAssetId(req.tenantId!, assetId, vehicleId);
  const category = sanitizeWorkshopAssetCategory(assetCategory);
  await persistAssetCategory(resolvedAssetId, category);
  const { rows } = await query(
    `INSERT INTO maintenance_logs (
       tenant_id, asset_id, vehicle_id, vehicle_name, vehicle_plate, driver_id, driver_name,
       inspection_id, breakdown_id, maintenance_type, priority, description, mechanic_name,
       start_date, end_date, labor_hours, labor_cost, parts_cost, total_cost, parts_used,
       status, notes, odometer_reading, next_service_km, next_service_hours, next_service_days,
       asset_category, engine_hours
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21,$22,$23,$24,$25,$26,$27,$28)
     RETURNING *`,
    [
      req.tenantId,
      resolvedAssetId,
      vehicleId || vehicleName,
      vehicleName,
      vehiclePlate || '',
      sanitizeDriverId(driverId),
      driverName || null,
      sanitizeUuid(inspectionId),
      sanitizeUuid(breakdownId),
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
      asJson(partsUsed, []),
      status || 'pending',
      notes || null,
      odometerReading ?? null,
      nextServiceKm ?? null,
      nextServiceHours ?? null,
      nextServiceDays ?? null,
      category,
      engineHours ?? null,
    ]
  );
  return success(res, toCamelRows(rows)[0], 201);
});

router.patch('/maintenance/:id', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  const b = req.body;
  const resolvedAssetId =
    b.assetId != null || b.vehicleId != null
      ? await resolveWorkshopAssetId(req.tenantId!, b.assetId, b.vehicleId)
      : undefined;
  const category =
    b.assetCategory != null ? sanitizeWorkshopAssetCategory(b.assetCategory) : null;
  if (resolvedAssetId && category) await persistAssetCategory(resolvedAssetId, category);
  const { rows } = await query(
    `UPDATE maintenance_logs SET
       asset_id = COALESCE($3, asset_id),
       vehicle_id = COALESCE($4, vehicle_id),
       vehicle_name = COALESCE($5, vehicle_name),
       vehicle_plate = COALESCE($6, vehicle_plate),
       driver_id = CASE WHEN $27::boolean THEN $7 ELSE driver_id END,
       driver_name = COALESCE($8, driver_name),
       inspection_id = COALESCE($9, inspection_id),
       breakdown_id = COALESCE($10, breakdown_id),
       maintenance_type = COALESCE($11, maintenance_type),
       priority = COALESCE($12, priority),
       description = COALESCE($13, description),
       mechanic_name = COALESCE($14, mechanic_name),
       start_date = COALESCE($15, start_date),
       end_date = COALESCE($16, end_date),
       labor_hours = COALESCE($17, labor_hours),
       labor_cost = COALESCE($18, labor_cost),
       parts_cost = COALESCE($19, parts_cost),
       total_cost = COALESCE($20, total_cost),
       parts_used = COALESCE($21::jsonb, parts_used),
       status = COALESCE($22, status),
       notes = COALESCE($23, notes),
       odometer_reading = COALESCE($24, odometer_reading),
       next_service_km = COALESCE($25, next_service_km),
       next_service_hours = COALESCE($26, next_service_hours),
       next_service_days = COALESCE($28, next_service_days),
       asset_category = COALESCE($29, asset_category),
       engine_hours = COALESCE($30, engine_hours),
       updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING *`,
    [
      req.params.id,
      req.tenantId,
      resolvedAssetId ?? null,
      b.vehicleId ?? null,
      b.vehicleName ?? null,
      b.vehiclePlate ?? null,
      sanitizeDriverId(b.driverId),
      b.driverName ?? null,
      sanitizeUuid(b.inspectionId),
      sanitizeUuid(b.breakdownId),
      b.maintenanceType ?? null,
      b.priority ?? null,
      b.description ?? null,
      b.mechanicName ?? null,
      b.startDate ?? null,
      b.endDate ?? null,
      b.laborHours ?? null,
      b.laborCost ?? null,
      b.partsCost ?? null,
      b.totalCost ?? null,
      b.partsUsed != null ? asJson(b.partsUsed, []) : null,
      b.status ?? null,
      b.notes ?? null,
      b.odometerReading ?? null,
      b.nextServiceKm ?? null,
      b.nextServiceHours ?? null,
      Object.prototype.hasOwnProperty.call(b, 'driverId'),
      b.nextServiceDays ?? null,
      category,
      b.engineHours ?? null,
    ]
  );
  if (!rows[0]) return error(res, 'Maintenance log not found', 404);
  return success(res, toCamelRows(rows)[0]);
});

router.delete('/maintenance/:id', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  const { rowCount } = await query(
    `UPDATE maintenance_logs SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [req.params.id, req.tenantId]
  );
  if (!rowCount) return error(res, 'Maintenance log not found', 404);
  return success(res, { deleted: true });
});

router.post('/breakdowns', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  const {
    vehicleId, vehicleName, vehiclePlate, assetId, driverId, driverName,
    location, breakdownTime, resolutionTime, severity, description, cause, resolution,
    downtimeHours, towingCost, repairCost, totalCost, tripId,
    assetCategory, failureSystem,
  } = req.body;
  if (!vehicleName || !description) return error(res, 'vehicleName and description required');
  const resolvedAssetId = await resolveWorkshopAssetId(req.tenantId!, assetId, vehicleId);
  const category = sanitizeWorkshopAssetCategory(assetCategory);
  await persistAssetCategory(resolvedAssetId, category);
  const { rows } = await query(
    `INSERT INTO breakdown_reports (
       tenant_id, asset_id, vehicle_id, vehicle_name, vehicle_plate, driver_id, driver_name,
       location, breakdown_time, resolution_time, severity, description, cause, resolution,
       downtime_hours, towing_cost, repair_cost, total_cost, trip_id,
       asset_category, failure_system
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
    [
      req.tenantId,
      resolvedAssetId,
      vehicleId || vehicleName,
      vehicleName,
      vehiclePlate || '',
      sanitizeDriverId(driverId),
      driverName || null,
      asJson(location, { lat: 0, lng: 0, address: '' }),
      breakdownTime || new Date(),
      resolutionTime || null,
      severity || 'minor',
      description,
      cause || null,
      resolution || null,
      downtimeHours ?? 0,
      towingCost ?? 0,
      repairCost ?? 0,
      totalCost ?? 0,
      tripId || null,
      category,
      failureSystem || null,
    ]
  );
  return success(res, toCamelRows(rows)[0], 201);
});

router.patch('/breakdowns/:id', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  const b = req.body;
  const resolvedAssetId =
    b.assetId != null || b.vehicleId != null
      ? await resolveWorkshopAssetId(req.tenantId!, b.assetId, b.vehicleId)
      : undefined;
  const category =
    b.assetCategory != null ? sanitizeWorkshopAssetCategory(b.assetCategory) : null;
  if (resolvedAssetId && category) await persistAssetCategory(resolvedAssetId, category);
  const { rows } = await query(
    `UPDATE breakdown_reports SET
       asset_id = COALESCE($3, asset_id),
       vehicle_id = COALESCE($4, vehicle_id),
       vehicle_name = COALESCE($5, vehicle_name),
       vehicle_plate = COALESCE($6, vehicle_plate),
       driver_id = CASE WHEN $20::boolean THEN $7 ELSE driver_id END,
       driver_name = COALESCE($8, driver_name),
       location = COALESCE($9::jsonb, location),
       breakdown_time = COALESCE($10, breakdown_time),
       resolution_time = COALESCE($11, resolution_time),
       severity = COALESCE($12, severity),
       description = COALESCE($13, description),
       cause = COALESCE($14, cause),
       resolution = COALESCE($15, resolution),
       downtime_hours = COALESCE($16, downtime_hours),
       towing_cost = COALESCE($17, towing_cost),
       repair_cost = COALESCE($18, repair_cost),
       total_cost = COALESCE($19, total_cost),
       trip_id = COALESCE($21, trip_id),
       asset_category = COALESCE($22, asset_category),
       failure_system = COALESCE($23, failure_system),
       updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING *`,
    [
      req.params.id,
      req.tenantId,
      resolvedAssetId ?? null,
      b.vehicleId ?? null,
      b.vehicleName ?? null,
      b.vehiclePlate ?? null,
      sanitizeDriverId(b.driverId),
      b.driverName ?? null,
      b.location != null ? asJson(b.location, { lat: 0, lng: 0, address: '' }) : null,
      b.breakdownTime ?? null,
      b.resolutionTime ?? null,
      b.severity ?? null,
      b.description ?? null,
      b.cause ?? null,
      b.resolution ?? null,
      b.downtimeHours ?? null,
      b.towingCost ?? null,
      b.repairCost ?? null,
      b.totalCost ?? null,
      Object.prototype.hasOwnProperty.call(b, 'driverId'),
      b.tripId ?? null,
      category,
      b.failureSystem ?? null,
    ]
  );
  if (!rows[0]) return error(res, 'Breakdown report not found', 404);
  return success(res, toCamelRows(rows)[0]);
});

router.delete('/breakdowns/:id', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  const { rowCount } = await query(
    `UPDATE breakdown_reports SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [req.params.id, req.tenantId]
  );
  if (!rowCount) return error(res, 'Breakdown report not found', 404);
  return success(res, { deleted: true });
});

export default router;
