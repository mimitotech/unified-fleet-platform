import { query } from '../config/database.js';
import { WialonFuelAnalyticsService } from './WialonFuelAnalyticsService.js';
import { WialonFuelReportService } from './WialonFuelReportService.js';
import { WialonFuelFleetService } from './WialonFuelFleetService.js';
import { WialonFuelDbSyncService } from './WialonFuelDbSyncService.js';
import { WialonFuelLiveSnapshotService } from './WialonFuelLiveSnapshotService.js';
import { isWialonTenantConnected } from './wialonConnectionStatus.js';
import {
  defaultFuelDashboardRange,
  warmCategoriesForProfile,
} from './fuelDashboardRange.js';
import { rollingFuelRange, splitDateRangeByDays } from './fuelTransactionAggregates.js';
import type { FuelAssetCategory } from './wialonAssetCategory.js';
import { delayBetweenTenants } from './wialonLoginGate.js';
import { logger } from '../config/logger.js';

const ROLLING_HISTORY_DAYS = 30;
const ROLLING_SYNC_INTERVAL_MS = 60 * 60 * 1000;

type ConnectedTenant = {
  id: string;
  is_active: boolean;
  connection_verified_at: string | null;
  wialon_resource_id: number | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function syncRangeForCategory(category: FuelAssetCategory): { from: string; to: string } {
  if (category === 'generator' || category === 'machinery') {
    return rollingFuelRange(7);
  }
  return defaultFuelDashboardRange();
}

/**
 * Background fuel sync for all connected tenants.
 * Persists report transactions + live sensor snapshots to Postgres without overloading Wialon.
 */
export class FuelSyncService {
  /** Warm current + previous calendar month (legacy analytics window). */
  static warmStandardMonths(tenantId: string): void {
    WialonFuelAnalyticsService.warmStandardMonths(tenantId);
  }

  /** Warm every calendar month overlapping a date range. */
  static warmDateRange(tenantId: string, from: string, to: string): void {
    WialonFuelAnalyticsService.warmDateRange(tenantId, from, to);
    WialonFuelReportService.warmRangeInBackground(tenantId, { from, to });
  }

  /** Warm today's dashboard window (+ per-category templates when mixed fleet). */
  static async warmTenantDashboard(tenantId: string): Promise<void> {
    const { from, to } = defaultFuelDashboardRange();
    WialonFuelAnalyticsService.warmDateRange(tenantId, from, to);
    WialonFuelReportService.warmRangeInBackground(tenantId, { from, to });

    try {
      const fleet = await WialonFuelFleetService.listAssets(tenantId);
      for (const category of warmCategoriesForProfile(fleet.summary)) {
        WialonFuelReportService.warmRangeInBackground(tenantId, { from, to, assetCategory: category });
      }
    } catch (err) {
      logger.debug(`[FuelSync] category warm skipped for tenant ${tenantId}`, err);
    }
  }

  /** Persist fuel report transactions to Postgres (per fleet category). */
  static async syncTenantTransactionsToDb(tenantId: string, refresh = false): Promise<number> {
    let total = 0;

    try {
      const fleet = await WialonFuelFleetService.listAssets(tenantId);
      const categories = warmCategoriesForProfile(fleet.summary);

      if (categories.length === 0) {
        const { from, to } = defaultFuelDashboardRange();
        const txs = await WialonFuelDbSyncService.syncRangeToDb({
          tenantId,
          from,
          to,
          refresh,
        });
        total = txs.length;
        await this.touchCursor(tenantId, `tx:all:${from}:${to}`, txs.length);
      } else {
        for (const category of categories) {
          const { from, to } = syncRangeForCategory(category);
          const txs = await WialonFuelDbSyncService.syncRangeToDb({
            tenantId,
            from,
            to,
            assetCategory: category,
            refresh,
          });
          total += txs.length;
          await this.touchCursor(tenantId, `tx:${category}:${from}:${to}`, txs.length);
          await sleep(category === 'generator' || category === 'machinery' ? 3000 : 1500);
        }
      }
    } catch (err) {
      logger.warn(`[FuelSync] category db sync failed for tenant ${tenantId}`, err);
      const { from, to } = defaultFuelDashboardRange();
      const txs = await WialonFuelDbSyncService.syncRangeToDb({
        tenantId,
        from,
        to,
        refresh,
      });
      total = txs.length;
      await this.touchCursor(tenantId, `tx:all:${from}:${to}`, txs.length);
    }

    await this.touchCursor(tenantId, 'tx:latest', total);
    return total;
  }

  /** Persist rolling history (last 30 days) in weekly chunks — at most once per hour. */
  static async syncTenantRollingHistoryToDb(tenantId: string): Promise<void> {
    const cursorKey = `tx:rolling:${ROLLING_HISTORY_DAYS}d`;
    const { rows } = await query<{ last_success_at: string | null }>(
      `SELECT last_success_at FROM fuel_sync_cursor WHERE tenant_id = $1 AND cursor_key = $2`,
      [tenantId, cursorKey],
    );
    const last = rows[0]?.last_success_at;
    if (last && Date.now() - new Date(last).getTime() < ROLLING_SYNC_INTERVAL_MS) return;

    const { from, to } = rollingFuelRange(ROLLING_HISTORY_DAYS);
    let total = 0;

    let categories: (FuelAssetCategory | undefined)[];
    try {
      const fleet = await WialonFuelFleetService.listAssets(tenantId);
      const cats = warmCategoriesForProfile(fleet.summary);
      categories = cats.length ? cats : [undefined];
    } catch {
      categories = [undefined];
    }

    for (const category of categories) {
      for (const chunk of splitDateRangeByDays(from, to, 7)) {
        const txs = await WialonFuelDbSyncService.syncRangeToDb({
          tenantId,
          from: chunk.from,
          to: chunk.to,
          refresh: false,
          assetCategory: category,
        });
        total += txs.length;
        await sleep(category === 'generator' || category === 'machinery' ? 3000 : 2000);
      }
    }
    await this.touchCursor(tenantId, cursorKey, total);
  }

  /** Snapshot live fuel sensor readings for historical charts / audit. */
  static async syncTenantLiveSnapshots(tenantId: string): Promise<number> {
    const count = await WialonFuelLiveSnapshotService.captureTenantSnapshots(tenantId);
    await this.touchCursor(tenantId, 'live:sensors', count);
    void WialonFuelLiveSnapshotService.pruneOldSnapshots(tenantId, 90);
    return count;
  }

  private static async touchCursor(tenantId: string, cursorKey: string, rowCount: number) {
    const now = new Date().toISOString();
    await query(
      `INSERT INTO fuel_sync_cursor (tenant_id, cursor_key, last_synced_at, last_success_at, row_count, last_error)
       VALUES ($1, $2, $3, $3, $4, NULL)
       ON CONFLICT (tenant_id, cursor_key) DO UPDATE SET
         last_synced_at = EXCLUDED.last_synced_at,
         last_success_at = EXCLUDED.last_success_at,
         row_count = EXCLUDED.row_count,
         last_error = NULL`,
      [tenantId, cursorKey, now, rowCount],
    );
  }

  /** User-facing / page-load sync: today only (fast). */
  static async syncTenantToDb(tenantId: string): Promise<void> {
    await this.syncTenantTransactionsToDb(tenantId, false);
  }

  /** Full sync including rolling history (manual / nightly use). */
  static async syncTenantFullToDb(tenantId: string): Promise<void> {
    await this.syncTenantTransactionsToDb(tenantId, false);
    await this.syncTenantRollingHistoryToDb(tenantId);
  }

  private static async listConnectedTenants(): Promise<ConnectedTenant[]> {
    const { rows } = await query<ConnectedTenant>(
      `SELECT t.id, ds.is_active, ds.connection_verified_at, ds.wialon_resource_id
       FROM tenants t
       INNER JOIN data_sources ds ON ds.tenant_id = t.id AND ds.source_type = 'wialon'
       WHERE t.is_active = true`,
    );
    return rows.filter((row) => isWialonTenantConnected(row));
  }

  /** Scheduler: persist today's fuel reports to DB for connected tenants (sequential). */
  static async syncAllConnectedTenantsToDb(): Promise<number> {
    const tenants = await this.listConnectedTenants();
    let count = 0;
    for (const row of tenants) {
      try {
        await delayBetweenTenants();
        await this.syncTenantTransactionsToDb(row.id, false);
        count++;
      } catch (err) {
        logger.warn(`[FuelSync] db sync skipped for tenant ${row.id}`, err);
      }
    }
    return count;
  }

  /** @deprecated Use syncAllConnectedTenantsToDb */
  static async warmAllConnectedTenants(): Promise<number> {
    return this.syncAllConnectedTenantsToDb();
  }

  /** @deprecated Scheduler handles live snapshots in tenant cycle */
  static async syncLiveSnapshotsForAllTenants(): Promise<number> {
    const tenants = await this.listConnectedTenants();
    let count = 0;
    for (const row of tenants) {
      try {
        await delayBetweenTenants();
        await this.syncTenantLiveSnapshots(row.id);
        count++;
      } catch (err) {
        logger.warn(`[FuelSync] live snapshot skipped for tenant ${row.id}`, err);
      }
    }
    return count;
  }
}
