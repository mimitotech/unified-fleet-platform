import { Router } from 'express';
import { query } from '../../config/database.js';
import { requireTenant, type TenantRequest } from '../../middleware/tenant.js';
import { success } from '../../utils/response.js';
import { toCamelRows } from '../../utils/mapper.js';
import { FuelDbReadService } from '../../services/FuelDbReadService.js';
import { WialonFuelLiveSnapshotService } from '../../services/WialonFuelLiveSnapshotService.js';
import type { FuelAssetCategory } from '../../services/wialonAssetCategory.js';

const router = Router();

router.get('/transactions', requireTenant, async (req: TenantRequest, res) => {
  const refresh = req.query.refresh === 'true';
  const assetCategory = req.query.assetCategory
    ? (String(req.query.assetCategory) as FuelAssetCategory)
    : undefined;
  const from = req.query.from
    ? String(req.query.from)
    : req.query.startDate
      ? String(req.query.startDate)
      : undefined;
  const to = req.query.to ? String(req.query.to) : req.query.endDate ? String(req.query.endDate) : undefined;
  const unitId = req.query.unitId ? Number(req.query.unitId) : undefined;

  const data = await FuelDbReadService.getTransactions(req.tenantId!, {
    from,
    to,
    refresh,
    assetCategory,
    unitId: Number.isFinite(unitId) ? unitId : undefined,
  });

  return success(res, data);
});

router.get('/kpis', requireTenant, async (req: TenantRequest, res) => {
  const from = req.query.from ? String(req.query.from) : undefined;
  const to = req.query.to ? String(req.query.to) : undefined;

  if (from && to) {
    const report = await FuelDbReadService.getTransactions(req.tenantId!, { from, to });
    return success(res, report.kpis);
  }

  const { rows } = await query(
    `SELECT
       COALESCE(SUM(filled), 0)::float as total_filled,
       COALESCE(SUM(fuel_used), 0)::float as total_consumed,
       COALESCE(SUM(mileage), 0)::float as total_mileage,
       COUNT(*) FILTER (WHERE section = 'theft')::int as theft_events,
       COUNT(DISTINCT unit_id)::int as vehicles_tracked
     FROM fuel_transactions WHERE tenant_id = $1`,
    [req.tenantId],
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
    [req.tenantId],
  );
  return success(res, toCamelRows(rows).reverse());
});

/** Latest stored sensor snapshots (historical). Live tank levels still come from Wialon. */
router.get('/live-snapshots', requireTenant, async (req: TenantRequest, res) => {
  const rows = await WialonFuelLiveSnapshotService.getLatestByTenant(req.tenantId!);
  return success(res, toCamelRows(rows));
});

router.get('/sync-status', requireTenant, async (req: TenantRequest, res) => {
  const { rows } = await query(
    `SELECT cursor_key, last_synced_at, last_success_at, row_count, last_error
     FROM fuel_sync_cursor
     WHERE tenant_id = $1
     ORDER BY last_synced_at DESC NULLS LAST`,
    [req.tenantId],
  );
  return success(res, toCamelRows(rows));
});

router.post('/sync', requireTenant, async (req: TenantRequest, res) => {
  const { FuelSyncService } = await import('../../services/FuelSyncService.js');
  void FuelSyncService.syncTenantToDb(req.tenantId!);
  return success(res, { started: true });
});

export default router;
