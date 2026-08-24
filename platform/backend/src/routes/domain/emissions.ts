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

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fuelDateSql(columnAlias: string, from?: string, to?: string, startIndex = 2): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  let sql = '';
  let i = startIndex;
  if (from) {
    params.push(from);
    sql += ` AND DATE(FROM_UNIXTIME(CASE WHEN ${columnAlias} > 1e12 THEN ${columnAlias}/1000 ELSE ${columnAlias} END)) >= $${i}`;
    i += 1;
  }
  if (to) {
    params.push(to);
    sql += ` AND DATE(FROM_UNIXTIME(CASE WHEN ${columnAlias} > 1e12 THEN ${columnAlias}/1000 ELSE ${columnAlias} END)) <= $${i}`;
  }
  return { sql, params };
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
  const { rows: trips } = await query(tripSql, tripParams);

  const fuelDate = fuelDateSql('timestamp', from, to, 2);
  const fuelParams: unknown[] = [req.tenantId, ...fuelDate.params];
  const fuelSql = `SELECT COALESCE(SUM(fuel_used), 0)::float as fuel_used, COALESCE(SUM(mileage), 0)::float as mileage
     FROM fuel_transactions WHERE tenant_id = $1 AND section = 'consumption'${fuelDate.sql}`;
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
  const tripMileage = Number(trips[0]?.mileage) || 0;
  const fuelFuel = Number(fuel[0]?.fuel_used) || 0;
  const fuelMileage = Number(fuel[0]?.mileage) || 0;

  // Keep fuel and mileage from the same source so CO₂/km is physically consistent.
  const useFuelTx = fuelFuel > tripFuel;
  const totalFuel = useFuelTx ? fuelFuel : tripFuel;
  const totalMileage = useFuelTx ? fuelMileage : tripMileage;
  const co2Kg = totalFuel * EMISSION_FACTOR;
  const co2PerKm = totalMileage > 0 ? co2Kg / totalMileage : 0;
  const violationCount = Number(violations[0]?.count) || 0;

  let complianceStatus: 'good' | 'moderate' | 'poor' = 'good';
  if (co2PerKm >= 0.35 || violationCount > 40) complianceStatus = 'poor';
  else if (co2PerKm >= 0.25 || violationCount > 15) complianceStatus = 'moderate';

  return success(res, {
    totalFuelLiters: round1(totalFuel),
    totalMileageKm: round1(totalMileage),
    co2Kg: Math.round(co2Kg),
    co2PerKm: round2(co2PerKm),
    violationCount,
    emissionFactor: EMISSION_FACTOR,
    complianceStatus,
    source: useFuelTx ? 'fuel_transactions' : 'trip_summaries',
    from: from || null,
    to: to || null,
  });
});

router.get('/by-vehicle', requireTenant, mod, async (req: TenantRequest, res) => {
  const { from, to } = dateBounds(req);

  const tripParams: unknown[] = [req.tenantId];
  let tripSql = `SELECT unit_name, COALESCE(SUM(fuel_used), 0)::float as fuel_used, COALESCE(SUM(mileage), 0)::float as mileage
     FROM trip_summaries WHERE tenant_id = $1`;
  if (from) {
    tripParams.push(`${from} 00:00:00`);
    tripSql += ` AND departure_time >= $${tripParams.length}`;
  }
  if (to) {
    tripParams.push(`${to} 23:59:59`);
    tripSql += ` AND departure_time <= $${tripParams.length}`;
  }
  tripSql += ` GROUP BY unit_name`;
  const { rows: tripRows } = await query<{ unit_name: string; fuel_used: number; mileage: number }>(tripSql, tripParams);

  const fuelDate = fuelDateSql('timestamp', from, to, 2);
  const fuelParams: unknown[] = [req.tenantId, ...fuelDate.params];
  const fuelSql = `SELECT unit_name, COALESCE(SUM(fuel_used), 0)::float as fuel_used, COALESCE(SUM(mileage), 0)::float as mileage
     FROM fuel_transactions WHERE tenant_id = $1 AND section = 'consumption'${fuelDate.sql}
     GROUP BY unit_name`;
  const { rows: fuelRows } = await query<{ unit_name: string; fuel_used: number; mileage: number }>(
    fuelSql,
    fuelParams
  ).catch(() => ({ rows: [] as Array<{ unit_name: string; fuel_used: number; mileage: number }> }));

  const merged = new Map<string, { fuelUsed: number; mileage: number; source: string }>();
  for (const r of tripRows) {
    const name = String(r.unit_name || '').trim() || 'Unknown';
    merged.set(name, {
      fuelUsed: Number(r.fuel_used) || 0,
      mileage: Number(r.mileage) || 0,
      source: 'trips',
    });
  }
  for (const r of fuelRows) {
    const name = String(r.unit_name || '').trim() || 'Unknown';
    const fuelUsed = Number(r.fuel_used) || 0;
    const mileage = Number(r.mileage) || 0;
    const prev = merged.get(name);
    if (!prev || fuelUsed > prev.fuelUsed) {
      merged.set(name, { fuelUsed, mileage, source: 'fuel' });
    }
  }

  const rows = [...merged.entries()]
    .map(([vehicle, v]) => ({
      vehicle,
      fuelUsed: round1(v.fuelUsed),
      mileage: round1(v.mileage),
      co2Kg: Math.round(v.fuelUsed * EMISSION_FACTOR),
      co2PerKm: v.mileage > 0 ? round2((v.fuelUsed * EMISSION_FACTOR) / v.mileage) : 0,
      source: v.source,
    }))
    .filter((r) => r.fuelUsed > 0 || r.mileage > 0)
    .sort((a, b) => b.co2Kg - a.co2Kg);

  return success(res, rows);
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
