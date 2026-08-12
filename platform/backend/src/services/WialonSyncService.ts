import { query } from '../config/database.js';
import { WialonAdapter } from '../adapters/WialonAdapter.js';
import { AssetOrchestrator } from '../orchestrators/AssetOrchestrator.js';
import { WialonHierarchyService } from './WialonHierarchyService.js';
import { WialonUserProvisionService } from './WialonUserProvisionService.js';
import { loadTenantWialonCreds } from './tenantWialonCredentials.js';
import { upsertWialonUnit } from './wialonUnitSync.js';

import type { WialonCredentialsInput } from './WialonHierarchyService.js';

export class WialonSyncService {
  static async syncTenant(
    tenantId: string,
    options?: {
      credentials?: WialonCredentialsInput;
      units?: import('../adapters/wialonUtils.js').WialonSearchItem[];
      /** When set, only these Wialon users stay active for the tenant. */
      wialonUserIds?: number[];
    }
  ): Promise<{
    vehicles: number;
    drivers: number;
    geofences: number;
    usersCreated?: number;
    usersUpdated?: number;
    usersTotal?: number;
  }> {
    await AssetOrchestrator.invalidateTenantCache(tenantId);

    const { rows: ds } = await query<{
      wialon_resource_id: number | null;
      wialon_account_name: string | null;
    }>(
      `SELECT wialon_resource_id, wialon_account_name FROM data_sources
       WHERE tenant_id = $1 AND source_type = 'wialon' AND is_active = true`,
      [tenantId]
    );

    if (!ds[0]) {
      throw new Error('Wialon integration is not configured for this tenant');
    }

    const accountId = Number(ds[0].wialon_resource_id);
    if (!accountId || Number.isNaN(accountId)) {
      throw new Error('No Wialon client account linked. Pick an account in Integrations → Link Wialon account.');
    }

    const creds = options?.credentials ?? (await loadTenantWialonCreds(tenantId));
    const scopedCreds = { ...creds, accountId: String(accountId) };

    let units = options?.units;
    if (!units) {
      try {
        units = await WialonHierarchyService.getUnitsForAccount(scopedCreds, accountId, 10_000);
      } catch (err) {
        throw new Error(`Wialon unit fetch failed: ${(err as Error).message}`);
      }
    }

    if (units.length === 0) {
      const { rows: preview } = await query<{ preview_asset_count: number | null }>(
        `SELECT preview_asset_count FROM data_sources WHERE tenant_id = $1 AND source_type = 'wialon'`,
        [tenantId]
      );
      const expected = preview[0]?.preview_asset_count || 0;
      if (expected > 0) {
        throw new Error(
          `Wialon returned 0 units for this account (expected ~${expected}). Re-save the mother token in Wialon Center and sync again.`
        );
      }
    }

    const activeExternalIds: string[] = [];

    for (const unit of units) {
      activeExternalIds.push(String(unit.id));
      await upsertWialonUnit(tenantId, unit);
    }

    await this.pruneOutOfScopeAssets(tenantId, activeExternalIds);

    let driversSynced = 0;
    let geofencesSynced = 0;
    const adapter = new WialonAdapter(scopedCreds);
    try {
      await adapter.connect();

      try {
        const drivers = await adapter.getDrivers();
        for (const d of drivers) {
          await query(
            `INSERT INTO drivers (tenant_id, name, license_number, phone, email, status)
             VALUES ($1, $2, $3, $4, $5, 'available')
             ON CONFLICT (tenant_id, license_number) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, updated_at = NOW()`,
            [tenantId, d.name, d.licenseNumber || d.id, d.phone || '', d.email || null]
          );
          driversSynced++;
        }
      } catch {
        /* optional */
      }

      try {
        const zones = await adapter.getGeofences();
        for (const z of zones) {
          const { rows: existing } = await query<{ id: string }>(
            `SELECT id FROM geofences WHERE tenant_id = $1 AND name = $2 AND deleted_at IS NULL LIMIT 1`,
            [tenantId, z.name]
          );
          if (existing[0]) {
            await query(
              `UPDATE geofences SET type = $2, center = $3, radius = $4, points = $5, updated_at = NOW() WHERE id = $1`,
              [existing[0].id, z.type, z.center ? JSON.stringify(z.center) : null, z.radius, z.points ? JSON.stringify(z.points) : null]
            );
          } else {
            await query(
              `INSERT INTO geofences (tenant_id, name, type, center, radius, points, color, is_active)
               VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
              [tenantId, z.name, z.type, z.center ? JSON.stringify(z.center) : null, z.radius, z.points ? JSON.stringify(z.points) : null, z.color || '#3B82F6']
            );
          }
          geofencesSynced++;
        }
      } catch {
        /* optional */
      }
    } catch {
      /* drivers/geofences optional when Wialon API rejects resource search */
    } finally {
      await adapter.disconnect().catch(() => undefined);
    }

    const wialonUsers = await WialonHierarchyService.getUsersForAccount(scopedCreds, accountId).catch(() => []);
    let provision = { created: 0, updated: 0, deactivated: 0, users: [] as Awaited<ReturnType<typeof WialonUserProvisionService.provisionUsers>>['users'] };
    if (wialonUsers.length) {
      const selected =
        Array.isArray(options?.wialonUserIds) && options.wialonUserIds.length
          ? options.wialonUserIds
          : wialonUsers.map((u) => u.id);
      const selectedSet = new Set(selected);
      const toProvision = wialonUsers.filter((u) => selectedSet.has(u.id));
      provision = await WialonUserProvisionService.provisionUsers(
        tenantId,
        accountId,
        toProvision,
        selected,
      );
    }

    await query(
      `UPDATE data_sources SET
         last_sync_at = NOW(),
         last_error = NULL,
         preview_asset_count = $2,
         wialon_session_meta = JSON_MERGE_PATCH(COALESCE(wialon_session_meta, '{}'), $3),
         updated_at = NOW()
       WHERE tenant_id = $1 AND source_type = 'wialon'`,
      [
        tenantId,
        units.length,
        JSON.stringify({
          scopedAccountId: accountId,
          scopedAccountName: ds[0].wialon_account_name,
          counts: { units: units.length, users: wialonUsers.length },
          lastSyncAt: new Date().toISOString(),
        }),
      ]
    );

    await AssetOrchestrator.invalidateTenantCache(tenantId);

    return {
      vehicles: units.length,
      drivers: driversSynced,
      geofences: geofencesSynced,
      usersCreated: provision.created,
      usersUpdated: provision.updated,
      usersTotal:
        Array.isArray(options?.wialonUserIds) && options.wialonUserIds.length
          ? options.wialonUserIds.length
          : wialonUsers.length,
    };
  }

  /** Remove Wialon mappings for units no longer in the scoped account sync set. */
  private static async pruneOutOfScopeAssets(tenantId: string, activeExternalIds: string[]): Promise<void> {
    if (!activeExternalIds.length) return;
    const { rows: staleMappings } = await query<{ asset_id: string; external_id: string }>(
      `SELECT am.asset_id, am.external_id FROM asset_mappings am
       JOIN assets a ON a.id = am.asset_id
       WHERE a.tenant_id = $1 AND am.source_type = 'wialon'
         AND NOT (am.external_id = ANY($2::text[]))`,
      [tenantId, activeExternalIds]
    );
    for (const row of staleMappings) {
      await query(`DELETE FROM asset_mappings WHERE asset_id = $1 AND source_type = 'wialon'`, [row.asset_id]);
      const { rows: remaining } = await query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM asset_mappings WHERE asset_id = $1`,
        [row.asset_id]
      );
      if ((remaining[0]?.n || 0) === 0) {
        await query(`DELETE FROM assets WHERE id = $1 AND tenant_id = $2`, [row.asset_id, tenantId]);
      }
    }
  }
}
