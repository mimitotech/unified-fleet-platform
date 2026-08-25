import { Router } from 'express';
import { query } from '../../config/database.js';
import { requireTenant, type TenantRequest } from '../../middleware/tenant.js';
import { requireModule, requireWriteAccess } from '../../middleware/rbac.js';
import { success, error } from '../../utils/response.js';
import { toCamelRows } from '../../utils/mapper.js';
import { DriverScoringService } from '../../services/DriverScoringService.js';
import { resolveTenantAssetId } from '../../services/resolveTenantAssetId.js';

const router = Router();
const mod = requireModule('drivers');

const LATEST_PERF_JOIN = `
  LEFT JOIN (
    SELECT s1.*
    FROM driver_performance_snapshots s1
    INNER JOIN (
      SELECT driver_id, MAX(snapshot_date) AS max_date
      FROM driver_performance_snapshots
      WHERE tenant_id = $1
      GROUP BY driver_id
    ) latest ON latest.driver_id = s1.driver_id AND latest.max_date = s1.snapshot_date
    WHERE s1.tenant_id = $1
  ) perf ON perf.driver_id = d.id`;

router.get('/', requireTenant, mod, async (req: TenantRequest, res) => {
  await DriverScoringService.ensureSchema();
  const { rows } = await query(
    `SELECT d.*, a.name as assigned_asset_name, a.registration_plate as assigned_asset_plate,
            perf.safety_score, perf.grade, perf.penalty_points, perf.violations_count,
            perf.trips_count, perf.total_distance, perf.snapshot_date
     FROM drivers d
     LEFT JOIN assets a ON a.id = d.assigned_asset_id
     ${LATEST_PERF_JOIN}
     WHERE d.tenant_id = $1 AND d.deleted_at IS NULL
     ORDER BY d.name`,
    [req.tenantId]
  );
  return success(res, toCamelRows(rows));
});

router.get('/stats', requireTenant, mod, async (req: TenantRequest, res) => {
  await DriverScoringService.ensureSchema();
  const { rows } = await query(
    `SELECT
       COUNT(*) FILTER (WHERE d.status = 'available')::int as available,
       COUNT(*) FILTER (WHERE d.status = 'driving')::int as driving,
       COUNT(*) FILTER (WHERE d.status = 'off-duty')::int as off_duty,
       COUNT(*)::int as total,
       COUNT(*) FILTER (WHERE d.license_expiry_date IS NOT NULL AND d.license_expiry_date < CURDATE())::int as expired_licenses,
       COUNT(*) FILTER (
         WHERE d.license_expiry_date IS NOT NULL
           AND d.license_expiry_date >= CURDATE()
           AND d.license_expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
       )::int as expiring_licenses,
       COUNT(*) FILTER (
         WHERE d.license_expiry_date IS NOT NULL
           AND d.license_expiry_date >= CURDATE()
           AND d.license_expiry_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
       )::int as expiring_7d_licenses,
       COUNT(*) FILTER (
         WHERE d.license_expiry_date IS NULL
       )::int as no_expiry_licenses,
       COUNT(*) FILTER (WHERE perf.grade = 'good')::int as grade_good,
       COUNT(*) FILTER (WHERE perf.grade = 'bad')::int as grade_bad,
       COUNT(*) FILTER (WHERE perf.grade = 'ugly')::int as grade_ugly,
       COUNT(*) FILTER (WHERE perf.safety_score IS NOT NULL)::int as scored
     FROM drivers d
     ${LATEST_PERF_JOIN}
     WHERE d.tenant_id = $1 AND d.deleted_at IS NULL`,
    [req.tenantId]
  );
  return success(
    res,
    toCamelRows(rows)[0] || {
      total: 0,
      available: 0,
      driving: 0,
      offDuty: 0,
      expiredLicenses: 0,
      expiringLicenses: 0,
      expiring7dLicenses: 0,
      noExpiryLicenses: 0,
      gradeGood: 0,
      gradeBad: 0,
      gradeUgly: 0,
      scored: 0,
    }
  );
});

router.get('/performance', requireTenant, mod, async (req: TenantRequest, res) => {
  await DriverScoringService.ensureSchema();
  const { rows } = await query(
    `SELECT perf.*, d.name as driver_name, d.fuel_card_number, d.assigned_asset_id,
            a.registration_plate as assigned_asset_plate, a.name as assigned_asset_name
     FROM drivers d
     INNER JOIN (
       SELECT s1.*
       FROM driver_performance_snapshots s1
       INNER JOIN (
         SELECT driver_id, MAX(snapshot_date) AS max_date
         FROM driver_performance_snapshots
         WHERE tenant_id = $1
         GROUP BY driver_id
       ) latest ON latest.driver_id = s1.driver_id AND latest.max_date = s1.snapshot_date
       WHERE s1.tenant_id = $1
     ) perf ON perf.driver_id = d.id
     LEFT JOIN assets a ON a.id = d.assigned_asset_id
     WHERE d.tenant_id = $1 AND d.deleted_at IS NULL
     ORDER BY perf.safety_score ASC`,
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
    const days = Math.min(90, Math.max(7, parseInt(String(req.body?.days || '30'), 10) || 30));
    const recompute = await DriverScoringService.recomputeTenant(String(req.tenantId), days);
    return success(res, { ...config, recompute });
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.post('/sync-wialon', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  try {
    const { WialonDriverImportService } = await import('../../services/WialonDriverImportService.js');
    const result = await WialonDriverImportService.importTenantDrivers(String(req.tenantId));
    return success(res, result);
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.post('/sync-violations', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  try {
    const { DomainSyncService } = await import('../../services/DomainSyncService.js');
    const eco = await DomainSyncService.syncTenantEcoViolations(String(req.tenantId), { force: true });
    await DriverScoringService.linkEcoViolationsAllDrivers(String(req.tenantId)).catch(() => undefined);
    const scoring = await DriverScoringService.recomputeTenant(String(req.tenantId), 30);
    return success(res, { eco, drivers: scoring.drivers });
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

router.get('/violations-feed', requireTenant, mod, async (req: TenantRequest, res) => {
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '80'), 10) || 80));
  const days = Math.min(90, Math.max(1, parseInt(String(req.query.days || '30'), 10) || 30));
  const { fetchMergedViolationEvents } = await import('../../services/violationEventsService.js');
  const events = await fetchMergedViolationEvents(String(req.tenantId), { limit, days });
  return success(res, events);
});

router.get('/:id', requireTenant, mod, async (req: TenantRequest, res) => {
  await DriverScoringService.ensureSchema();
  const days = Math.min(90, Math.max(1, parseInt(String(req.query.days || '30'), 10) || 30));
  const { rows } = await query(
    `SELECT d.*, a.name as assigned_asset_name, a.registration_plate as assigned_asset_plate,
            perf.safety_score, perf.grade, perf.penalty_points, perf.violations_count,
            perf.trips_count, perf.total_distance, perf.snapshot_date
     FROM drivers d
     LEFT JOIN assets a ON a.id = d.assigned_asset_id
     ${LATEST_PERF_JOIN}
     WHERE d.id = $2 AND d.tenant_id = $1 AND d.deleted_at IS NULL`,
    [req.tenantId, req.params.id]
  );
  if (!rows[0]) return error(res, 'Driver not found', 404);

  const d = rows[0] as {
    id: string;
    name: string;
    assigned_asset_id: string | null;
  };
  const config = await DriverScoringService.getConfig(String(req.tenantId));
  const sinceIso = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');

  const { rows: ecos } = d.assigned_asset_id
    ? await query<{ violation_type: string }>(
        `SELECT violation_type FROM eco_driving_violations
         WHERE tenant_id = $1 AND occurred_at >= $2 AND asset_id = $3`,
        [req.tenantId, sinceIso, d.assigned_asset_id],
      ).catch(() => ({ rows: [] as Array<{ violation_type: string }> }))
    : { rows: [] as Array<{ violation_type: string }> };

  const { rows: alertRows } = d.assigned_asset_id
    ? await query<{ type: string }>(
        `SELECT type FROM alerts
         WHERE tenant_id = $1 AND occurred_at >= $2 AND asset_id = $3
           AND (
             type IN ('fatigue', 'camera', 'video', 'unauthorized', 'overspeed', 'speeding')
             OR LOWER(COALESCE(type, '')) LIKE '%fatigue%'
             OR LOWER(COALESCE(type, '')) LIKE '%camera%'
             OR LOWER(COALESCE(type, '')) LIKE '%video%'
             OR LOWER(COALESCE(type, '')) LIKE '%unauth%'
             OR video_url IS NOT NULL
           )
         LIMIT 500`,
        [req.tenantId, sinceIso, d.assigned_asset_id]
      ).catch(() => ({ rows: [] as Array<{ type: string }> }))
    : { rows: [] as Array<{ type: string }> };

  const types = [
    ...ecos.map((e) => e.violation_type),
    ...alertRows.map((a) => a.type || 'camera'),
  ];
  const scored = DriverScoringService.scoreViolations(config, types);

  const driver = toCamelRows(rows)[0] as Record<string, unknown>;
  return success(res, {
    ...driver,
    violationBreakdown: scored.byType,
    projectedScore: scored.score,
    projectedGrade: scored.grade,
    scoringWindowDays: days,
  });
});

router.post('/:id/recompute-score', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  try {
    const days = Math.min(90, Math.max(7, parseInt(String(req.body?.days || '30'), 10) || 30));
    const result = await DriverScoringService.recomputeDriver(String(req.tenantId), String(req.params.id), days);
    return success(res, result);
  } catch (e) {
    const msg = (e as Error).message || '';
    if (/not found/i.test(msg)) return error(res, msg, 404);
    return error(res, msg);
  }
});

router.get('/:id/violations', requireTenant, mod, async (req: TenantRequest, res) => {
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
  const days = Math.min(90, Math.max(1, parseInt(String(req.query.days || '30'), 10) || 30));
  const { rows: driverRows } = await query<{ id: string; name: string; assigned_asset_id: string | null }>(
    `SELECT id, name, assigned_asset_id FROM drivers WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [req.params.id, req.tenantId]
  );
  if (!driverRows[0]) return error(res, 'Driver not found', 404);
  const d = driverRows[0];
  const { rows: eco } = d.assigned_asset_id
    ? await query(
        `SELECT id, unit_name, violation_type, severity, occurred_at, driver_name, value, 'eco' as source
         FROM eco_driving_violations
         WHERE tenant_id = $1
           AND occurred_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)
           AND asset_id = $2
         ORDER BY occurred_at DESC
         LIMIT $3`,
        [req.tenantId, d.assigned_asset_id, limit],
      ).catch(() => ({ rows: [] as Array<Record<string, unknown>> }))
    : { rows: [] as Array<Record<string, unknown>> };

  const { rows: alerts } = d.assigned_asset_id
    ? await query(
        `SELECT a.id, COALESCE(ast.registration_plate, ast.name) as unit_name, a.type as violation_type,
                a.severity, a.occurred_at, $3 as driver_name, NULL as value, 'alert' as source
         FROM alerts a
         LEFT JOIN assets ast ON ast.id = a.asset_id
         WHERE a.tenant_id = $1 AND a.asset_id = $2
           AND a.occurred_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)
           AND (
             a.type IN ('fatigue', 'camera', 'video', 'unauthorized', 'overspeed', 'speeding', 'license_expiry')
             OR LOWER(COALESCE(a.type, '')) LIKE '%fatigue%'
             OR LOWER(COALESCE(a.type, '')) LIKE '%camera%'
             OR LOWER(COALESCE(a.type, '')) LIKE '%video%'
             OR LOWER(COALESCE(a.type, '')) LIKE '%unauth%'
             OR LOWER(COALESCE(a.type, '')) LIKE '%speed%'
             OR a.video_url IS NOT NULL
           )
         ORDER BY a.occurred_at DESC
         LIMIT $4`,
        [req.tenantId, d.assigned_asset_id, d.name, limit]
      ).catch(() => ({ rows: [] as Array<Record<string, unknown>> }))
    : { rows: [] as Array<Record<string, unknown>> };

  const combined = [...toCamelRows(eco), ...toCamelRows(alerts)].sort((a, b) => {
    const ta = new Date(String((a as { occurredAt?: string }).occurredAt || 0)).getTime();
    const tb = new Date(String((b as { occurredAt?: string }).occurredAt || 0)).getTime();
    return tb - ta;
  });
  return success(res, combined.slice(0, limit));
});

router.post('/', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  await DriverScoringService.ensureSchema();
  const {
    name, licenseNumber, phone, email, status, assignedAssetId, fuelCardNumber, hireDate,
    permitClass, licenseExpiryDate, assignedAssetName, assignedAssetPlate,
  } = req.body;
  if (!name || !licenseNumber) return error(res, 'name and licenseNumber required');
  try {
    const resolvedAssetId = await resolveTenantAssetId(String(req.tenantId), assignedAssetId, {
      name: assignedAssetName,
      plate: assignedAssetPlate,
    });
    const { rows } = await query(
      `INSERT INTO drivers (
         tenant_id, name, license_number, phone, email, status, assigned_asset_id,
         fuel_card_number, hire_date, permit_class, license_expiry_date
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        req.tenantId,
        name,
        licenseNumber,
        phone || '',
        email || null,
        status || 'available',
        resolvedAssetId,
        fuelCardNumber || null,
        hireDate || null,
        permitClass || null,
        licenseExpiryDate || null,
      ]
    );
    const created = toCamelRows(rows)[0] as { id: string };
    const score = await DriverScoringService.recomputeDriver(String(req.tenantId), created.id, 30).catch(
      () => null
    );
    await DriverScoringService.syncLicenseExpiryAlerts(String(req.tenantId)).catch(() => undefined);
    return success(res, { ...created, ...(score ? { safetyScore: score.score, grade: score.grade } : {}) }, 201);
  } catch (e) {
    const msg = (e as Error).message || '';
    if (/duplicate|unique|uq_drivers/i.test(msg)) {
      return error(res, 'A driver with this license number already exists', 409);
    }
    if (/foreign key|fk_drivers_asset/i.test(msg)) {
      return error(
        res,
        'Assigned vehicle was not found in the fleet assets list. Clear the vehicle or pick another.',
        400,
      );
    }
    return error(res, msg);
  }
});

router.patch('/:id', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  await DriverScoringService.ensureSchema();
  const {
    name, phone, email, status, assignedAssetId, fuelCardNumber, hireDate, licenseNumber,
    permitClass, licenseExpiryDate, assignedAssetName, assignedAssetPlate,
  } = req.body;
  // Explicit null clears assignment / fuel card; omit key to leave unchanged
  const clearAsset = Object.prototype.hasOwnProperty.call(req.body, 'assignedAssetId');
  const clearFuel = Object.prototype.hasOwnProperty.call(req.body, 'fuelCardNumber');
  const clearHire = Object.prototype.hasOwnProperty.call(req.body, 'hireDate');
  const clearPermitClass = Object.prototype.hasOwnProperty.call(req.body, 'permitClass');
  const clearLicenseExpiry = Object.prototype.hasOwnProperty.call(req.body, 'licenseExpiryDate');

  let resolvedAssetId: string | null = null;
  if (clearAsset) {
    resolvedAssetId = await resolveTenantAssetId(String(req.tenantId), assignedAssetId, {
      name: assignedAssetName,
      plate: assignedAssetPlate,
    });
  }

  try {
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
         permit_class = CASE WHEN $14 = 1 THEN $15 ELSE permit_class END,
         license_expiry_date = CASE WHEN $16 = 1 THEN $17 ELSE license_expiry_date END,
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
        clearAsset ? resolvedAssetId : null,
        clearFuel ? 1 : 0,
        clearFuel ? fuelCardNumber || null : null,
        clearHire ? 1 : 0,
        clearHire ? hireDate || null : null,
        licenseNumber ?? null,
        clearPermitClass ? 1 : 0,
        clearPermitClass ? permitClass || null : null,
        clearLicenseExpiry ? 1 : 0,
        clearLicenseExpiry ? licenseExpiryDate || null : null,
      ]
    );
    if (!rows[0]) return error(res, 'Driver not found', 404);
    const updated = toCamelRows(rows)[0] as { id: string };
    const score = await DriverScoringService.recomputeDriver(String(req.tenantId), updated.id, 30).catch(
      () => null
    );
    await DriverScoringService.syncLicenseExpiryAlerts(String(req.tenantId)).catch(() => undefined);
    return success(res, {
      ...updated,
      ...(score ? { safetyScore: score.score, grade: score.grade } : {}),
    });
  } catch (e) {
    const msg = (e as Error).message || '';
    if (/foreign key|fk_drivers_asset/i.test(msg)) {
      return error(
        res,
        'Assigned vehicle was not found in the fleet assets list. Clear the vehicle or pick another.',
        400,
      );
    }
    return error(res, msg);
  }
});

router.delete('/:id', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  await query(
    `UPDATE drivers SET deleted_at = NOW() WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.tenantId]
  );
  return success(res, { deleted: true });
});

export default router;
