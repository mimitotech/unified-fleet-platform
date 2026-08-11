import cron from 'node-cron';
import { query } from '../config/database.js';
import { AssetOrchestrator } from '../orchestrators/AssetOrchestrator.js';
import { AlertOrchestrator } from '../orchestrators/AlertOrchestrator.js';
import { FuelSyncService } from './FuelSyncService.js';
import { DomainSyncService } from './DomainSyncService.js';
import { delayBetweenTenants } from './wialonLoginGate.js';
import { listActiveTenants } from './tenantSyncStatus.js';
import { logger } from '../config/logger.js';

let tenantCycleRunning = false;
let fuelDbCycleRunning = false;
let alertCycleRunning = false;
let domainCycleRunning = false;

let lastTenantCycleAt: string | null = null;
let lastFuelCycleAt: string | null = null;
let lastAlertCycleAt: string | null = null;
let lastDomainCycleAt: string | null = null;
let lastTenantCycleError: string | null = null;
let lastAlertCycleError: string | null = null;

export function getSyncSchedulerStatus() {
  return {
    tenantCycleRunning,
    fuelDbCycleRunning,
    alertCycleRunning,
    domainCycleRunning,
    lastTenantCycleAt,
    lastFuelCycleAt,
    lastAlertCycleAt,
    lastDomainCycleAt,
    lastTenantCycleError,
    lastAlertCycleError,
  };
}

/**
 * Single Node process on Hostinger — in-process cycle flags already serialize.
 * Do not use MySQL GET_LOCK across the pool (connection-scoped; breaks sync).
 */
async function withMysqlLock(_name: string, work: () => Promise<void>): Promise<boolean> {
  await work();
  return true;
}

async function runTenantCycle(): Promise<void> {
  if (tenantCycleRunning) {
    logger.debug('[SyncScheduler] tenant cycle already running — skip');
    return;
  }
  tenantCycleRunning = true;
  lastTenantCycleError = null;
  try {
    await withMysqlLock('mams_tenant_sync', async () => {
      const tenants = await listActiveTenants();
      let assetCount = 0;
      let snapshotCount = 0;

      for (const tenant of tenants) {
        try {
          await delayBetweenTenants();
          const orch = new AssetOrchestrator(tenant.id);
          await orch.initialize();
          await orch.getUnifiedAssets();
          await query(
            `UPDATE data_sources SET last_sync_at = NOW() WHERE tenant_id = $1 AND is_active = true`,
            [tenant.id],
          );
          assetCount++;
        } catch (err) {
          logger.warn(`[SyncScheduler] asset sync skipped for tenant ${tenant.id}`, err);
        }

        if (tenant.sources.includes('wialon')) {
          try {
            await delayBetweenTenants();
            await FuelSyncService.syncTenantLiveSnapshots(tenant.id);
            snapshotCount++;
          } catch (err) {
            logger.warn(`[SyncScheduler] live snapshot skipped for tenant ${tenant.id}`, err);
          }
        }
      }

      if (assetCount > 0) logger.info(`Synced assets for ${assetCount} tenants`);
      if (snapshotCount > 0) logger.info(`[FuelSync] stored live fuel snapshots for ${snapshotCount} tenants`);
    });
    lastTenantCycleAt = new Date().toISOString();
  } catch (err) {
    lastTenantCycleError = (err as Error).message;
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
    await withMysqlLock('mams_fuel_db_sync', async () => {
      const count = await FuelSyncService.syncAllConnectedTenantsToDb();
      if (count > 0) logger.info(`[FuelSync] synced fuel reports to database for ${count} tenants`);
    });
    lastFuelCycleAt = new Date().toISOString();
  } catch (err) {
    logger.error('[FuelSync] scheduler error', err);
  } finally {
    fuelDbCycleRunning = false;
  }
}

async function runDomainCycle(): Promise<void> {
  if (domainCycleRunning) {
    logger.debug('[DomainSync] cycle already running — skip');
    return;
  }
  domainCycleRunning = true;
  try {
    await withMysqlLock('mams_domain_sync', async () => {
      const count = await DomainSyncService.syncAllConnectedTenants();
      if (count > 0) logger.info(`[DomainSync] synced trips/eco for ${count} Wialon tenants`);
    });
    lastDomainCycleAt = new Date().toISOString();
  } catch (err) {
    logger.error('[DomainSync] scheduler error', err);
  } finally {
    domainCycleRunning = false;
  }
}

/** Pull telematics alerts into the tenant inbox (Wialon, TrackSolid, LocoNav). */
async function runAlertCycle(): Promise<void> {
  if (alertCycleRunning) {
    logger.debug('[AlertSync] cycle already running — skip');
    return;
  }
  alertCycleRunning = true;
  lastAlertCycleError = null;
  try {
    await withMysqlLock('mams_alert_sync', async () => {
      const purged = await AlertOrchestrator.purgeNoiseAlertsGlobally();
      if (purged > 0) {
        logger.info(`[AlertSync] purged ${purged} Engine_Hours / counter noise alerts`);
      }

      const tenants = await listActiveTenants(['wialon', 'tracksolid', 'loconav']);
      let synced = 0;
      let inserted = 0;
      for (const tenant of tenants) {
        try {
          await delayBetweenTenants();
          const orch = new AlertOrchestrator(tenant.id);
          const n = await orch.syncFromAdapters();
          synced++;
          inserted += n;
        } catch (err) {
          logger.warn(`[AlertSync] skipped tenant ${tenant.id}`, err);
        }
      }
      if (synced > 0) {
        logger.info(`[AlertSync] checked ${synced} tenants, inserted ${inserted} new alerts`);
      }
    });
    lastAlertCycleAt = new Date().toISOString();
  } catch (err) {
    lastAlertCycleError = (err as Error).message;
    logger.error('[AlertSync] scheduler error', err);
  } finally {
    alertCycleRunning = false;
  }
}

export function startSyncScheduler(): void {
  cron.schedule('*/5 * * * *', () => {
    void runTenantCycle();
  });

  cron.schedule('*/15 * * * *', () => {
    void runFuelDbCycle();
  });

  cron.schedule('*/30 * * * *', () => {
    void runDomainCycle();
  });

  // Every 2 minutes — was every minute; reduces Wialon + MySQL pressure under many tenants
  cron.schedule('*/2 * * * *', () => {
    void runAlertCycle();
  });

  setTimeout(() => {
    void runAlertCycle();
  }, 15_000);
}
