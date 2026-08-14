import { Router } from 'express';
import { query } from '../../config/database.js';
import { requireTenant, type TenantRequest } from '../../middleware/tenant.js';
import { requireModule } from '../../middleware/rbac.js';
import { success } from '../../utils/response.js';
import { toCamelRows } from '../../utils/mapper.js';

const EMISSION_FACTOR = 2.68; // kg CO2 per liter diesel
const router = Router();
const mod = requireModule('emissions');

function dateBounds(req: TenantRequest): { from?: string; to?: string } {
  const from = req.query.from ? String(req.query.from) : undefined;
  const to = req.query.to ? String(req.query.to) : undefined;
  return {
    from: from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : undefined,
    to: to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : undefined,
  };
}

router.get('/violations', requireTenant, mod, async (req: TenantRequest, res) => {
  const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || '100'), 10) || 100));
  const { from, to } = dateBounds(req);
  const params: unknown[] = [req.tenantId];
  let sql = `SELECT * FROM eco_driving_violations WHERE tenant_id = $1`;
  if (from) {
    params.push(`${from} 00:00:00`);
    sql += ` AND occurred_at >= $${params.length}`;
  }
  if (to) {
    params.push(`${to} 23:59:59`);
    sql += ` AND occurred_at <= $${params.length}`;
  }
  params.push(limit);
  sql += ` ORDER BY occurred_at DESC LIMIT $${params.length}`;
  const { rows } = await query(sql, params);
  return success(res, toCamelRows(rows));
});

router.get('/metrics', requireTenant, mod, async (req: TenantRequest, res) => {
  const { from, to } = dateBounds(req);
  const tripParams: unknown[] = [req.tenantId];
  let tripSql = `SELECT COALESCE(SUM(mileage), 0)::float as mileage, COALESCE(SUM(fuel_used), 0)::float as fuel_used
     FROM trip_summaries WHERE tenant_id = $1`;
  if (from) {
    tripParams.push(`${from} 00:00:00`);
    tripSql += ` AND departure_time >= $${tripParams.length}`;
  }
  if (to) {
    tripParams.push(`${to} 23:59:59`);
    tripSql += ` AND departure_time <= $${tripParams.length}`;
  }

  // Prefer trip fuel to avoid double-counting with fuel_transactions consumption rows.
  const { rows: trips } = await query(tripSql, tripParams);

  const fuelParams: unknown[] = [req.tenantId];
  let fuelSql = `SELECT COALESCE(SUM(fuel_used), 0)::float as fuel_used, COALESCE(SUM(mileage), 0)::float as mileage
     FROM fuel_transactions WHERE tenant_id = $1 AND section = 'consumption'`;
  if (from) {
    // fuel_transactions.timestamp is unix ms/seconds in some rows — also filter time_str loosely via created if needed
    fuelParams.push(from);
    fuelSql += ` AND DATE(FROM_UNIXTIME(CASE WHEN timestamp > 1e12 THEN timestamp/1000 ELSE timestamp END)) >= $2`;
  }
  if (to) {
    fuelParams.push(to);
    fuelSql += ` AND DATE(FROM_UNIXTIME(CASE WHEN timestamp > 1e12 THEN timestamp/1000 ELSE timestamp END)) <= $${fuelParams.length}`;
  }

  const { rows: fuel } = await query(fuelSql, fuelParams).catch(() => ({
    rows: [{ fuel_used: 0, mileage: 0 }],
  }));

  const violParams: unknown[] = [req.tenantId];
  let violSql = `SELECT COUNT(*)::int as count FROM eco_driving_violations WHERE tenant_id = $1`;
  if (from) {
    violParams.push(`${from} 00:00:00`);
    violSql += ` AND occurred_at >= $${violParams.length}`;
  }
  if (to) {
    violParams.push(`${to} 23:59:59`);
    violSql += ` AND occurred_at <= $${violParams.length}`;
  }
  const { rows: violations } = await query(violSql, violParams);

  const tripFuel = Number(trips[0]?.fuel_used) || 0;
  const fuelFuel = Number(fuel[0]?.fuel_used) || 0;
  // Use the larger of the two sources (not sum) to limit double-count risk.
  const totalFuel = Math.max(tripFuel, fuelFuel);
  const totalMileage = Math.max(Number(trips[0]?.mileage) || 0, Number(fuel[0]?.mileage) || 0);
  const co2Kg = totalFuel * EMISSION_FACTOR;
  const co2PerKm = totalMileage > 0 ? co2Kg / totalMileage : 0;
  const violationCount = Number(violations[0]?.count) || 0;

  // Compliance blends CO2 intensity + eco violation pressure
  let complianceStatus: 'good' | 'moderate' | 'poor' = 'good';
  if (co2PerKm >= 0.35 || violationCount > 40) complianceStatus = 'poor';
  else if (co2PerKm >= 0.25 || violationCount > 15) complianceStatus = 'moderate';

  return success(res, {
    totalFuelLiters: Math.round(totalFuel * 10) / 10,
    totalMileageKm: Math.round(totalMileage * 10) / 10,
    co2Kg: Math.round(co2Kg),
    co2PerKm: Math.round(co2PerKm * 100) / 100,
    violationCount,
    emissionFactor: EMISSION_FACTOR,
    complianceStatus,
    from: from || null,
    to: to || null,
  });
});

router.get('/by-vehicle', requireTenant, mod, async (req: TenantRequest, res) => {
  const { from, to } = dateBounds(req);
  const params: unknown[] = [req.tenantId];
  let sql = `SELECT unit_name, COALESCE(SUM(fuel_used), 0)::float as fuel_used, COALESCE(SUM(mileage), 0)::float as mileage
     FROM trip_summaries WHERE tenant_id = $1`;
  if (from) {
    params.push(`${from} 00:00:00`);
    sql += ` AND departure_time >= $${params.length}`;
  }
  if (to) {
    params.push(`${to} 23:59:59`);
    sql += ` AND departure_time <= $${params.length}`;
  }
  sql += ` GROUP BY unit_name ORDER BY fuel_used DESC`;
  const { rows } = await query(sql, params);
  return success(
    res,
    toCamelRows(rows).map((r) => {
      const row = r as { unitName: string; fuelUsed: number; mileage: number };
      return {
        vehicle: row.unitName,
        fuelUsed: row.fuelUsed,
        mileage: row.mileage,
        co2Kg: Math.round(row.fuelUsed * EMISSION_FACTOR),
        co2PerKm:
          row.mileage > 0 ? Math.round((row.fuelUsed * EMISSION_FACTOR * 100) / row.mileage) / 100 : 0,
      };
    })
  );
});

router.get('/by-type', requireTenant, mod, async (req: TenantRequest, res) => {
  const { from, to } = dateBounds(req);
  const params: unknown[] = [req.tenantId];
  let sql = `SELECT violation_type, COUNT(*)::int as count
     FROM eco_driving_violations WHERE tenant_id = $1`;
  if (from) {
    params.push(`${from} 00:00:00`);
    sql += ` AND occurred_at >= $${params.length}`;
  }
  if (to) {
    params.push(`${to} 23:59:59`);
    sql += ` AND occurred_at <= $${params.length}`;
  }
  sql += ` GROUP BY violation_type ORDER BY count DESC`;
  const { rows } = await query(sql, params);
  return success(res, toCamelRows(rows));
});

export default router;
