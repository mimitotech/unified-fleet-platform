import { Router } from 'express';
import { query } from '../../config/database.js';
import { requireTenant, type TenantRequest } from '../../middleware/tenant.js';
import { success } from '../../utils/response.js';
import { toCamelRows } from '../../utils/mapper.js';

const router = Router();

router.get('/kpis', requireTenant, async (req: TenantRequest, res) => {
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

router.get('/inspections', requireTenant, async (req: TenantRequest, res) => {
  const { rows } = await query(
    `SELECT * FROM vehicle_inspections WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY inspection_date DESC LIMIT 100`,
    [req.tenantId]
  );
  return success(res, toCamelRows(rows));
});

router.get('/maintenance', requireTenant, async (req: TenantRequest, res) => {
  const { rows } = await query(
    `SELECT * FROM maintenance_logs WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY start_date DESC LIMIT 100`,
    [req.tenantId]
  );
  return success(res, toCamelRows(rows));
});

router.get('/breakdowns', requireTenant, async (req: TenantRequest, res) => {
  const { rows } = await query(
    `SELECT * FROM breakdown_reports WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY breakdown_time DESC LIMIT 100`,
    [req.tenantId]
  );
  return success(res, toCamelRows(rows));
});

router.get('/mechanics', requireTenant, async (req: TenantRequest, res) => {
  const { rows } = await query(
    `SELECT * FROM mechanics WHERE tenant_id = $1 AND deleted_at IS NULL AND is_active = true ORDER BY name`,
    [req.tenantId]
  );
  return success(res, toCamelRows(rows));
});

export default router;
