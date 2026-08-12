import { query } from '../config/database.js';

const inflight = new Map<string, Promise<void>>();

async function patchLinkSyncMeta(
  tenantId: string,
  patch: Record<string, unknown>
): Promise<void> {
  await query(
    `UPDATE data_sources SET
       wialon_session_meta = JSON_MERGE_PATCH(COALESCE(wialon_session_meta, '{}'), $2),
       updated_at = NOW()
     WHERE tenant_id = $1 AND source_type = 'wialon'`,
    [tenantId, JSON.stringify(patch)]
  );
}

/**
 * Fire-and-forget full Wialon sync after a fast account link.
 * Dedupes by tenant so double-clicks / create+link do not pile up work.
 */
export function queueWialonLinkSync(opts: {
  tenantId: string;
  wialonUserIds?: number[];
}): void {
  const key = opts.tenantId;
  if (inflight.has(key)) return;

  const job = (async () => {
    await patchLinkSyncMeta(opts.tenantId, {
      syncStatus: 'running',
      syncOk: false,
      syncWarning: null,
      syncStartedAt: new Date().toISOString(),
    });

    try {
      const { WialonSyncService } = await import('./WialonSyncService.js');
      const sync = await WialonSyncService.syncTenant(opts.tenantId, {
        wialonUserIds: opts.wialonUserIds,
        /** Link path: assets + users first; drivers/geofences follow via normal sync/scheduler. */
        skipOptionalDomain: true,
      });

      await patchLinkSyncMeta(opts.tenantId, {
        syncStatus: 'ok',
        syncOk: true,
        syncWarning: null,
        syncWarningAt: null,
        lastFullLinkAt: new Date().toISOString(),
        syncFinishedAt: new Date().toISOString(),
        counts: {
          units: sync.vehicles,
          users: sync.usersTotal ?? 0,
          drivers: sync.drivers,
          geofences: sync.geofences,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[WialonLinkSync] background sync failed tenant=${opts.tenantId}:`, message);
      await patchLinkSyncMeta(opts.tenantId, {
        syncStatus: 'error',
        syncOk: false,
        syncWarning: message,
        syncWarningAt: new Date().toISOString(),
        syncFinishedAt: new Date().toISOString(),
      }).catch(() => undefined);
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, job);
  void job;
}

export function isWialonLinkSyncInflight(tenantId: string): boolean {
  return inflight.has(tenantId);
}
