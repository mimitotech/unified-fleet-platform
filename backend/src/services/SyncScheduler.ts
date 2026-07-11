import cron from 'node-cron';
import { query } from '../config/database.js';
import { AssetOrchestrator } from '../orchestrators/AssetOrchestrator.js';
import { FuelSyncService } from './FuelSyncService.js';
import { isWialonTenantConnected } from './wialonConnectionStatus.js';
import { delayBetweenTenants } from './wialonLoginGate.js';
import { logger } from '../config/logger.js';

type ConnectedTenant = {
  id: string;
  is_active: boolean;
  connection_verified_at: string | null;
  wialon_resource_id: number | null;
};

let tenantCycleRunning = false;
let fuelDbCycleRunning = false;

async function listConnectedTenants(): Promise<ConnectedTenant[]> {
  const { rows } = await query<ConnectedTenant>(
    `SELECT t.id, ds.is_active, ds.connection_verified_at, ds.wialon_resource_id
     FROM tenants t
     INNER JOIN data_sources ds ON ds.tenant_id = t.id AND ds.source_type = 'wialon'
     WHERE t.is_active = true`,
  );
  return rows.filter((row) => isWialonTenantConnected(row));
}

async function runTenantCycle(): Promise<void> {
  if (tenantCycleRunning) {
    logger.debug('[SyncScheduler] tenant cycle already running — skip');
    return;
  }
  tenantCycleRunning = true;
  try {
    const tenants = await listConnectedTenants();
    let assetCount = 0;
    let snapshotCount = 0;

    for (const tenant of tenants) {
      try {
        await delayBetweenTenants();
        const orch = new AssetOrchestrator(tenant.id);
        await orch.initialize();
        await orch.getUnifiedAssets();
        await query(`UPDATE data_sources SET last_sync_at = NOW() WHERE tenant_id = $1`, [tenant.id]);
        assetCount++;
      } catch (err) {
        logger.warn(`[SyncScheduler] asset sync skipped for tenant ${tenant.id}`, err);
      }

      try {
        await delayBetweenTenants();
        await FuelSyncService.syncTenantLiveSnapshots(tenant.id);
        snapshotCount++;
      } catch (err) {
        logger.warn(`[SyncScheduler] live snapshot skipped for tenant ${tenant.id}`, err);
      }
    }

    if (assetCount > 0) logger.info(`Synced assets for ${assetCount} tenants`);
    if (snapshotCount > 0) logger.info(`[FuelSync] stored live fuel snapshots for ${snapshotCount} tenants`);
  } catch (err) {
    logger.error('Sync scheduler error', err);
  } finally {
    tenantCycleRunning = false;
  }
}

async function runFuelDbCycle(): Promise<void> {
  if (fuelDbCycleRunning) {
    logger.debug('[FuelSync] db cycle already running — skip');
    return;
  }
  fuelDbCycleRunning = true;
  try {
    const count = await FuelSyncService.syncAllConnectedTenantsToDb();
    if (count > 0) logger.info(`[FuelSync] synced fuel reports to database for ${count} tenants`);
  } catch (err) {
    logger.error('[FuelSync] scheduler error', err);
  } finally {
    fuelDbCycleRunning = false;
  }
}

export function startSyncScheduler(): void {
  // One sequential tenant loop every 5 minutes (assets + live snapshots).
  cron.schedule('*/5 * * * *', () => {
    void runTenantCycle();
  });

  // Fuel report → Postgres every 15 minutes (today only; rolling history hourly per tenant).
  cron.schedule('*/15 * * * *', () => {
    void runFuelDbCycle();
  });
}
