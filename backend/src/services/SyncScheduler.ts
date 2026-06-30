import cron from 'node-cron';
import { query } from '../config/database.js';
import { AssetOrchestrator } from '../orchestrators/AssetOrchestrator.js';
import { logger } from '../config/logger.js';

export function startSyncScheduler(): void {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const { rows } = await query<{ id: string }>(`SELECT id FROM tenants WHERE is_active = true`);
      for (const tenant of rows) {
        const orch = new AssetOrchestrator(tenant.id);
        await orch.initialize();
        await orch.getUnifiedAssets();
        await query(`UPDATE data_sources SET last_sync_at = NOW() WHERE tenant_id = $1`, [tenant.id]);
      }
      logger.info(`Synced assets for ${rows.length} tenants`);
    } catch (err) {
      logger.error('Sync scheduler error', err);
    }
  });
}
