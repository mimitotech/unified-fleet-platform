import { Router } from 'express';
import { query } from '../../config/database.js';
import { requireTenant, type TenantRequest } from '../../middleware/tenant.js';
import { success } from '../../utils/response.js';
import { toCamelRows } from '../../utils/mapper.js';
import { FuelDbReadService } from '../../services/FuelDbReadService.js';
import { WialonFuelLiveSnapshotService } from '../../services/WialonFuelLiveSnapshotService.js';
import type { FuelAssetCategory } from '../../services/wialonAssetCategory.js';

const router = Router();

function monthStartIso(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

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
  const from = req.query.from ? String(req.query.from) : monthStartIso();
  const to = req.query.to ? String(req.query.to) : todayIso();

  const report = await FuelDbReadService.getTransactions(req.tenantId!, {
    from,
    to,
    queueSync: false,
  });
  return success(res, report.kpis);
});

router.get('/monthly-trend', requireTenant, async (req: TenantRequest, res) => {
  const { rows } = await query(
    `SELECT
       DATE_FORMAT(FROM_UNIXTIME(timestamp), '%Y-%m') as month,
       COALESCE(SUM(CASE WHEN section = 'filling' THEN filled ELSE 0 END), 0) as filled,
       COALESCE(SUM(CASE WHEN section = 'consumption' THEN fuel_used ELSE 0 END), 0) as consumed
     FROM fuel_transactions
     WHERE tenant_id = $1
       AND timestamp >= UNIX_TIMESTAMP(DATE_SUB(CURRENT_DATE, INTERVAL 12 MONTH))
       AND COALESCE(sensor, '') NOT LIKE 'wialon_group_summary%'
       AND COALESCE(sensor, '') <> 'balance'
     GROUP BY 1
     ORDER BY 1 ASC
     LIMIT 12`,
    [req.tenantId],
  );
  return success(res, toCamelRows(rows));
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
     ORDER BY last_synced_at DESC`,
    [req.tenantId],
  );
  return success(res, toCamelRows(rows));
});

router.post('/sync', requireTenant, async (req: TenantRequest, res) => {
  const { FuelSyncService } = await import('../../services/FuelSyncService.js');
  void FuelSyncService.syncTenantToDb(req.tenantId!);
  return success(res, { started: true });
});

/** FLS vs petrol-station variance (requires admin-uploaded station sheets + variance column). */
router.get('/variance', requireTenant, async (req: TenantRequest, res) => {
  const from = String(req.query.from || req.query.startDate || '');
  const to = String(req.query.to || req.query.endDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return success(res, {
      fromDate: from,
      toDate: to,
      summary: { stationLiters: 0, flsLiters: 0, variance: 0, assets: 0, stationFills: 0 },
      assets: [],
      details: [],
      error: 'from and to dates (YYYY-MM-DD) required',
    });
  }
  const { FuelVarianceService } = await import('../../services/FuelVarianceService.js');
  const data = await FuelVarianceService.getVarianceReport(req.tenantId!, from, to);
  return success(res, data);
});

export default router;
