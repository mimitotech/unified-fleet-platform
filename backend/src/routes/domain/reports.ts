import { Router } from 'express';
import { query } from '../../config/database.js';
import { requireTenant, type TenantRequest } from '../../middleware/tenant.js';
import { success } from '../../utils/response.js';
import { DashboardOrchestrator } from '../../orchestrators/DashboardOrchestrator.js';

const router = Router();

router.get('/data/:type', requireTenant, async (req: TenantRequest, res) => {
  const type = req.params.type;
  const tenantId = req.tenantId!;

  switch (type) {
    case 'trips': {
      const { rows } = await query(
        `SELECT * FROM trip_summaries WHERE tenant_id = $1 ORDER BY departure_time DESC LIMIT 500`,
        [tenantId]
      );
      return success(res, rows);
    }
    case 'fuel': {
      const { rows } = await query(
        `SELECT * FROM fuel_transactions WHERE tenant_id = $1 ORDER BY timestamp DESC LIMIT 500`,
        [tenantId]
      );
      return success(res, rows);
    }
    case 'violations': {
      const { rows } = await query(
        `SELECT * FROM eco_driving_violations WHERE tenant_id = $1 ORDER BY occurred_at DESC LIMIT 500`,
        [tenantId]
      );
      return success(res, rows);
    }
    case 'drivers': {
      const { rows } = await query(
        `SELECT d.*, s.safety_score, s.fuel_efficiency, s.on_time_rate, s.violations_count
         FROM drivers d
         LEFT JOIN driver_performance_snapshots s ON s.driver_id = d.id AND s.snapshot_date = CURRENT_DATE
         WHERE d.tenant_id = $1 AND d.deleted_at IS NULL`,
        [tenantId]
      );
      return success(res, rows);
    }
    case 'workshop': {
      const { rows } = await query(
        `SELECT * FROM maintenance_logs WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY start_date DESC LIMIT 200`,
        [tenantId]
      );
      return success(res, rows);
    }
    case 'executive': {
      const dash = new DashboardOrchestrator(tenantId);
      const kpis = await dash.getKpis();
      const { rows: fuel } = await query(
        `SELECT COALESCE(SUM(fuel_used), 0)::float as total FROM fuel_transactions WHERE tenant_id = $1`,
        [tenantId]
      );
      return success(res, { kpis, totalFuel: fuel[0]?.total || 0 });
    }
    default:
      return success(res, { error: 'Unknown report type' });
  }
});

router.get('/types', requireTenant, async (req: TenantRequest, res) => {
  void req;
  return success(res, [
    { id: 'trips', label: 'Trip Log', format: 'csv' },
    { id: 'fuel', label: 'Fuel Transactions', format: 'csv' },
    { id: 'violations', label: 'Eco-Driving Violations', format: 'csv' },
    { id: 'drivers', label: 'Driver Performance', format: 'csv' },
    { id: 'workshop', label: 'Maintenance Log', format: 'csv' },
    { id: 'executive', label: 'Executive Summary', format: 'json' },
  ]);
});

export default router;
