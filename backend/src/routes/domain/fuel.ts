import { Router } from 'express';
import { query } from '../../config/database.js';
import { requireTenant, type TenantRequest } from '../../middleware/tenant.js';
import { success } from '../../utils/response.js';
import { toCamelRows } from '../../utils/mapper.js';

const router = Router();

router.get('/transactions', requireTenant, async (req: TenantRequest, res) => {
  const from = req.query.from ? parseInt(String(req.query.from), 10) : undefined;
  const to = req.query.to ? parseInt(String(req.query.to), 10) : undefined;
  let sql = `SELECT * FROM fuel_transactions WHERE tenant_id = $1`;
  const params: unknown[] = [req.tenantId];
  if (from) { sql += ` AND timestamp >= $${params.length + 1}`; params.push(from); }
  if (to) { sql += ` AND timestamp <= $${params.length + 1}`; params.push(to); }
  sql += ` ORDER BY timestamp DESC LIMIT 200`;
  const { rows } = await query(sql, params);
  return success(res, toCamelRows(rows));
});

router.get('/kpis', requireTenant, async (req: TenantRequest, res) => {
  const { rows } = await query(
    `SELECT
       COALESCE(SUM(filled), 0)::float as total_filled,
       COALESCE(SUM(fuel_used), 0)::float as total_consumed,
       COALESCE(SUM(mileage), 0)::float as total_mileage,
       COUNT(*) FILTER (WHERE section = 'theft')::int as theft_events,
       COUNT(DISTINCT unit_id)::int as vehicles_tracked
     FROM fuel_transactions WHERE tenant_id = $1`,
    [req.tenantId]
  );
  const r = toCamelRows(rows)[0] as Record<string, number>;
  const avgConsumption = r.totalMileage > 0 ? (r.totalConsumed / r.totalMileage) * 100 : 0;
  return success(res, { ...r, avgConsumption: Math.round(avgConsumption * 10) / 10 });
});

router.get('/monthly-trend', requireTenant, async (req: TenantRequest, res) => {
  const { rows } = await query(
    `SELECT
       to_char(to_timestamp(timestamp), 'YYYY-MM') as month,
       COALESCE(SUM(filled), 0)::float as filled,
       COALESCE(SUM(fuel_used), 0)::float as consumed
     FROM fuel_transactions
     WHERE tenant_id = $1
     GROUP BY 1 ORDER BY 1 DESC LIMIT 12`,
    [req.tenantId]
  );
  return success(res, toCamelRows(rows).reverse());
});

export default router;
