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
import {
  emitBreakdownAlert,
  emitInspectionAlert,
  emitMaintenanceAlert,
  emitServiceDueAlert,
  safeWorkshopAlert,
  syncOpenWorkshopAlerts,
} from '../../services/workshopAlertService.js';
import { isUuid, resolveTenantAssetId } from '../../services/resolveTenantAssetId.js';

const router = Router();
const mod = requireModule('workshop');

/** Resolve optional asset UUID; map external id via asset_mappings when possible. */
async function resolveWorkshopAssetId(
  tenantId: string,
  assetId: unknown,
  vehicleId: unknown,
): Promise<string | null> {
  const rawAsset = assetId != null ? String(assetId).trim() : '';
  if (rawAsset) {
    return resolveTenantAssetId(tenantId, rawAsset, { createIfMissing: true });
  }
  if (vehicleId != null && String(vehicleId).trim() !== '') {
    return resolveTenantAssetId(tenantId, vehicleId, { createIfMissing: true });
  }
  return null;
}

function sanitizeDriverId(driverId: unknown): string | null {
  if (driverId == null || String(driverId).trim() === '') return null;
  return isUuid(driverId) ? String(driverId).trim() : null;
}

function sanitizeUuid(value: unknown): string | null {
  if (value == null || String(value).trim() === '') return null;
  return isUuid(value) ? String(value).trim() : null;
}

function asJson(value: unknown, fallback: unknown) {
  if (value == null) return JSON.stringify(fallback);
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/** Persist newer workshop columns without rewriting every INSERT $N index. */
async function patchWorkshopExtras(
  table: 'vehicle_inspections' | 'maintenance_logs' | 'breakdown_reports',
  id: string,
  tenantId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (!entries.length) return;
  const sets: string[] = [];
  const params: unknown[] = [id, tenantId];
  for (const [col, val] of entries) {
    params.push(val);
    const idx = params.length;
    if (col === 'checklist_sections') {
      sets.push(`${col} = $${idx}::jsonb`);
    } else {
      sets.push(`${col} = $${idx}`);
    }
  }
  try {
    await query(
      `UPDATE ${table} SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      params,
    );
  } catch (e) {
    console.warn(`[workshop] extras ${table}:`, (e as Error).message);
  }
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
    `SELECT
       (SELECT COUNT(*) FROM maintenance_logs
         WHERE tenant_id = $1 AND deleted_at IS NULL AND status IN ('pending','in-progress')) AS pending_maintenance,
       (SELECT COUNT(*) FROM maintenance_logs
         WHERE tenant_id = $1 AND deleted_at IS NULL AND status = 'completed'
           AND start_date >= DATE_FORMAT(NOW(), '%Y-%m-01')) AS completed_this_month,
       (SELECT COUNT(*) FROM breakdown_reports
         WHERE tenant_id = $1 AND deleted_at IS NULL AND resolution_time IS NULL) AS open_breakdowns,
       (SELECT COUNT(*) FROM vehicle_inspections
         WHERE tenant_id = $1 AND deleted_at IS NULL
           AND inspection_date >= NOW() - INTERVAL 30 DAY
           AND overall_status = 'needs-attention') AS inspections_due,
       (SELECT COALESCE(SUM(total_cost), 0) FROM maintenance_logs
         WHERE tenant_id = $1 AND deleted_at IS NULL) AS total_maintenance_cost,
       (SELECT COALESCE(SUM(total_cost), 0) FROM breakdown_reports
         WHERE tenant_id = $1 AND deleted_at IS NULL) AS total_breakdown_cost,
       (SELECT COUNT(DISTINCT vehicle_id) FROM maintenance_logs
         WHERE tenant_id = $1 AND deleted_at IS NULL AND status IN ('pending','in-progress')) AS vehicles_needing_service,
       (SELECT COUNT(*) FROM maintenance_logs
         WHERE tenant_id = $1 AND deleted_at IS NULL AND status IN ('pending','in-progress')) AS active_maintenance_jobs,
       (SELECT COALESCE(AVG(
           TIMESTAMPDIFF(SECOND, start_date, COALESCE(end_date, start_date)) / 3600.0
         ), 0)
         FROM maintenance_logs
         WHERE tenant_id = $1 AND deleted_at IS NULL AND status = 'completed') AS avg_repair_time,
       (SELECT CASE WHEN COUNT(*) = 0 THEN 0
           ELSE ROUND(100.0 * SUM(CASE WHEN overall_status = 'pass' THEN 1 ELSE 0 END) / COUNT(*))
         END
         FROM vehicle_inspections
         WHERE tenant_id = $1 AND deleted_at IS NULL
           AND inspection_date >= NOW() - INTERVAL 90 DAY) AS inspection_pass_rate,
       (SELECT GREATEST(0, LEAST(100,
           100
           - (SELECT COUNT(*) FROM maintenance_logs
                WHERE tenant_id = $1 AND deleted_at IS NULL AND status IN ('pending','in-progress')) * 5
           - (SELECT COUNT(*) FROM breakdown_reports
                WHERE tenant_id = $1 AND deleted_at IS NULL AND resolution_time IS NULL) * 10
           - (SELECT COUNT(*) FROM vehicle_inspections
                WHERE tenant_id = $1 AND deleted_at IS NULL
                  AND overall_status = 'fail'
                  AND inspection_date >= NOW() - INTERVAL 30 DAY) * 8
         ))) AS fleet_health_score`,
    [req.tenantId]
  );
  const row = toCamelRows(rows)[0] || {};
  const n = (v: unknown) => {
    const x = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(x) ? x : 0;
  };
  // Keep Inbox in sync with open workshop work (deduped by external_id).
  safeWorkshopAlert(syncOpenWorkshopAlerts(req.tenantId!));
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
  const purposeRaw = String(req.query.purpose || 'inspection').toLowerCase();
  const purpose = purposeRaw === 'maintenance' ? 'maintenance' : 'inspection';
  if (categoryParam) {
    const category = sanitizeWorkshopAssetCategory(categoryParam);
    const tpl = await getChecklistTemplateForCategory(req.tenantId!, category, purpose);
    return success(res, {
      ...tpl,
      failureSystems: FAILURE_SYSTEMS[category],
    });
  }
  const all = await Promise.all(
    WORKSHOP_ASSET_CATEGORIES.map(async (category) => {
      const tpl = await getChecklistTemplateForCategory(req.tenantId!, category, purpose);
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
    inspectorDate, inspectorSignature,
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
  const created = rows[0];
  if (created) {
    await patchWorkshopExtras('vehicle_inspections', String(created.id), req.tenantId!, {
      inspector_date: inspectorDate || null,
      inspector_signature:
        inspectorSignature ||
        (inspectorName ? String(inspectorName).trim().toLowerCase() : null),
    });
    safeWorkshopAlert(
      emitInspectionAlert({
        tenantId: req.tenantId!,
        inspectionId: String(created.id),
        assetId: created.asset_id ? String(created.asset_id) : null,
        vehicleName: String(created.vehicle_name || vehicleName),
        overallStatus: String(created.overall_status || overallStatus || 'pass'),
        notes: created.notes != null ? String(created.notes) : notes || null,
        inspectionType: String(created.inspection_type || inspectionType),
        inspectionDate: (created.inspection_date as Date) || null,
      }),
    );
  }
  const { rows: fresh } = await query(
    `SELECT * FROM vehicle_inspections WHERE id = $1 AND tenant_id = $2`,
    [created?.id, req.tenantId],
  );
  return success(res, toCamelRows(fresh.length ? fresh : rows)[0], 201);
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
  const updated = rows[0];
  await patchWorkshopExtras('vehicle_inspections', String(updated.id), req.tenantId!, {
    inspector_date: b.inspectorDate,
    inspector_signature:
      b.inspectorSignature !== undefined
        ? b.inspectorSignature
        : b.inspectorName
          ? String(b.inspectorName).trim().toLowerCase()
          : undefined,
  });
  safeWorkshopAlert(
    emitInspectionAlert({
      tenantId: req.tenantId!,
      inspectionId: String(updated.id),
      assetId: updated.asset_id ? String(updated.asset_id) : null,
      vehicleName: String(updated.vehicle_name || 'Asset'),
      overallStatus: String(updated.overall_status || 'pass'),
      notes: updated.notes != null ? String(updated.notes) : null,
      inspectionType: updated.inspection_type != null ? String(updated.inspection_type) : null,
      inspectionDate: (updated.inspection_date as Date) || null,
    }),
  );
  const { rows: fresh } = await query(
    `SELECT * FROM vehicle_inspections WHERE id = $1 AND tenant_id = $2`,
    [updated.id, req.tenantId],
  );
  return success(res, toCamelRows(fresh.length ? fresh : rows)[0]);
});

router.delete('/inspections/:id', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  const { rowCount } = await query(
    `UPDATE vehicle_inspections SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [req.params.id, req.tenantId]
  );
  if (!rowCount) return error(res, 'Inspection not found', 404);
  safeWorkshopAlert(
    emitInspectionAlert({
      tenantId: req.tenantId!,
      inspectionId: String(req.params.id),
      vehicleName: 'Asset',
      overallStatus: 'pass',
    }),
  );
  return success(res, { deleted: true });
});

router.post('/maintenance', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  const {
    vehicleId, vehicleName, vehiclePlate, assetId, driverId, driverName,
    inspectionId, breakdownId, maintenanceType, priority, description, mechanicName,
    startDate, endDate, laborHours, laborCost, partsCost, totalCost, partsUsed,
    status, notes, odometerReading, nextServiceKm, nextServiceHours, nextServiceDays,
    assetCategory, engineHours, checklistSections, mechanicDate, mechanicSignature,
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
  const created = rows[0];
  if (created) {
    await patchWorkshopExtras('maintenance_logs', String(created.id), req.tenantId!, {
      checklist_sections: checklistSections != null ? asJson(checklistSections, []) : undefined,
      mechanic_date: mechanicDate || null,
      mechanic_signature:
        mechanicSignature ||
        (mechanicName ? String(mechanicName).trim().toLowerCase() : null),
    });
    safeWorkshopAlert(
      emitMaintenanceAlert({
        tenantId: req.tenantId!,
        maintenanceId: String(created.id),
        assetId: created.asset_id ? String(created.asset_id) : null,
        vehicleName: String(created.vehicle_name || vehicleName),
        priority: String(created.priority || priority || 'medium'),
        description: String(created.description || description),
        status: String(created.status || status || 'pending'),
        maintenanceType: String(created.maintenance_type || maintenanceType),
        startDate: (created.start_date as Date) || null,
      }),
    );
    const days = Number(created.next_service_days ?? nextServiceDays);
    if (Number.isFinite(days) && days === 0) {
      safeWorkshopAlert(
        emitServiceDueAlert({
          tenantId: req.tenantId!,
          assetId: created.asset_id ? String(created.asset_id) : null,
          vehicleName: String(created.vehicle_name || vehicleName),
          reason: 'Service marked due (0-day interval)',
          sourceId: `maint-days:${created.id}`,
        }),
      );
    }
  }
  const { rows: fresh } = await query(
    `SELECT * FROM maintenance_logs WHERE id = $1 AND tenant_id = $2`,
    [created?.id, req.tenantId],
  );
  return success(res, toCamelRows(fresh.length ? fresh : rows)[0], 201);
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
  const updated = rows[0];
  await patchWorkshopExtras('maintenance_logs', String(updated.id), req.tenantId!, {
    checklist_sections:
      b.checklistSections != null ? asJson(b.checklistSections, []) : undefined,
    mechanic_date: b.mechanicDate,
    mechanic_signature:
      b.mechanicSignature !== undefined
        ? b.mechanicSignature
        : b.mechanicName
          ? String(b.mechanicName).trim().toLowerCase()
          : undefined,
  });
  safeWorkshopAlert(
    emitMaintenanceAlert({
      tenantId: req.tenantId!,
      maintenanceId: String(updated.id),
      assetId: updated.asset_id ? String(updated.asset_id) : null,
      vehicleName: String(updated.vehicle_name || 'Asset'),
      priority: updated.priority != null ? String(updated.priority) : null,
      description: updated.description != null ? String(updated.description) : null,
      status: updated.status != null ? String(updated.status) : null,
      maintenanceType: updated.maintenance_type != null ? String(updated.maintenance_type) : null,
      startDate: (updated.start_date as Date) || null,
    }),
  );
  const { rows: fresh } = await query(
    `SELECT * FROM maintenance_logs WHERE id = $1 AND tenant_id = $2`,
    [updated.id, req.tenantId],
  );
  return success(res, toCamelRows(fresh.length ? fresh : rows)[0]);
});

router.delete('/maintenance/:id', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  const { rowCount } = await query(
    `UPDATE maintenance_logs SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [req.params.id, req.tenantId]
  );
  if (!rowCount) return error(res, 'Maintenance log not found', 404);
  safeWorkshopAlert(
    emitMaintenanceAlert({
      tenantId: req.tenantId!,
      maintenanceId: String(req.params.id),
      vehicleName: 'Asset',
      status: 'cancelled',
    }),
  );
  return success(res, { deleted: true });
});

router.post('/breakdowns', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  const {
    vehicleId, vehicleName, vehiclePlate, assetId, driverId, driverName,
    location, breakdownTime, resolutionTime, severity, description, cause, resolution,
    downtimeHours, towingCost, repairCost, totalCost, tripId,
    assetCategory, failureSystem,
    reportedBy, reportedDate, reportedSignature,
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
  const created = rows[0];
  if (created) {
    const reporter = reportedBy || driverName || null;
    await patchWorkshopExtras('breakdown_reports', String(created.id), req.tenantId!, {
      reported_by: reporter,
      reported_date: reportedDate || null,
      reported_signature:
        reportedSignature ||
        (reporter ? String(reporter).trim().toLowerCase() : null),
    });
    safeWorkshopAlert(
      emitBreakdownAlert({
        tenantId: req.tenantId!,
        breakdownId: String(created.id),
        assetId: created.asset_id ? String(created.asset_id) : null,
        vehicleName: String(created.vehicle_name || vehicleName),
        severity: String(created.severity || severity || 'minor'),
        description: String(created.description || description),
        location: created.location,
        breakdownTime: (created.breakdown_time as Date) || null,
        resolved: Boolean(created.resolution_time),
      }),
    );
  }
  const { rows: fresh } = await query(
    `SELECT * FROM breakdown_reports WHERE id = $1 AND tenant_id = $2`,
    [created?.id, req.tenantId],
  );
  return success(res, toCamelRows(fresh.length ? fresh : rows)[0], 201);
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
  const updated = rows[0];
  const reporter =
    b.reportedBy !== undefined ? b.reportedBy : b.driverName !== undefined ? b.driverName : undefined;
  await patchWorkshopExtras('breakdown_reports', String(updated.id), req.tenantId!, {
    reported_by: reporter,
    reported_date: b.reportedDate,
    reported_signature:
      b.reportedSignature !== undefined
        ? b.reportedSignature
        : reporter
          ? String(reporter).trim().toLowerCase()
          : undefined,
  });
  safeWorkshopAlert(
    emitBreakdownAlert({
      tenantId: req.tenantId!,
      breakdownId: String(updated.id),
      assetId: updated.asset_id ? String(updated.asset_id) : null,
      vehicleName: String(updated.vehicle_name || 'Asset'),
      severity: updated.severity != null ? String(updated.severity) : null,
      description: updated.description != null ? String(updated.description) : null,
      location: updated.location,
      breakdownTime: (updated.breakdown_time as Date) || null,
      resolved: Boolean(updated.resolution_time),
    }),
  );
  const { rows: fresh } = await query(
    `SELECT * FROM breakdown_reports WHERE id = $1 AND tenant_id = $2`,
    [updated.id, req.tenantId],
  );
  return success(res, toCamelRows(fresh.length ? fresh : rows)[0]);
});

router.delete('/breakdowns/:id', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  const { rowCount } = await query(
    `UPDATE breakdown_reports SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [req.params.id, req.tenantId]
  );
  if (!rowCount) return error(res, 'Breakdown report not found', 404);
  safeWorkshopAlert(
    emitBreakdownAlert({
      tenantId: req.tenantId!,
      breakdownId: String(req.params.id),
      vehicleName: 'Asset',
      resolved: true,
    }),
  );
  return success(res, { deleted: true });
});

export default router;
