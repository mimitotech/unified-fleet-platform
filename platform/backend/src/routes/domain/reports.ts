import { Router } from 'express';
import { query } from '../../config/database.js';
import { requireTenant, type TenantRequest } from '../../middleware/tenant.js';
import { success } from '../../utils/response.js';
import { DashboardOrchestrator } from '../../orchestrators/DashboardOrchestrator.js';
import { FuelDbReadService } from '../../services/FuelDbReadService.js';

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
      const to = new Date().toISOString().slice(0, 10);
      const fromDate = new Date();
      fromDate.setUTCDate(fromDate.getUTCDate() - 30);
      const from = fromDate.toISOString().slice(0, 10);
      const report = await FuelDbReadService.getTransactions(tenantId, { from, to });
      return success(res, report.transactions);
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
      const from = new Date();
      const fromStr = `${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, '0')}-01`;
      const toStr = new Date().toISOString().slice(0, 10);
      const report = await FuelDbReadService.getTransactions(tenantId, { from: fromStr, to: toStr });
      return success(res, {
        kpis,
        totalFuel: report.kpis.totalConsumed,
        fuel: report.kpis,
        period: { from: fromStr, to: toStr },
      });
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
