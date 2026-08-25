import { query } from '../config/database.js';
import { WialonAdapter } from '../adapters/WialonAdapter.js';
import { loadTenantWialonCreds } from './tenantWialonCredentials.js';
import { isWialonTenantConnected } from './wialonConnectionStatus.js';
import { withWialonClient } from './WialonSessionService.js';
import { WialonFleetService } from './WialonFleetService.js';
import { logger } from '../config/logger.js';

export type WialonDriverRow = {
  wialonDriverId: string;
  wialonResourceId?: number;
  name: string;
  phone: string;
  licenseNumber: string;
  wialonUnitId?: string;
};

type UnitDriverEntry = { id: string | number; nm?: string; ph?: string; c?: string };

const UNIT_BATCH = 12;

async function resolveAssetId(tenantId: string, wialonUnitId: string): Promise<string | null> {
  const { rows } = await query<{ asset_id: string }>(
    `SELECT am.asset_id
     FROM asset_mappings am
     INNER JOIN assets a ON a.id = am.asset_id
     WHERE a.tenant_id = $1 AND am.source_type = 'wialon' AND am.external_id = $2
     LIMIT 1`,
    [tenantId, wialonUnitId],
  );
  return rows[0]?.asset_id ?? null;
}

export class WialonDriverImportService {
  static async ensureSchema(): Promise<void> {
    await query(`ALTER TABLE drivers ADD COLUMN wialon_driver_id VARCHAR(64) NULL`).catch(() => undefined);
    await query(`ALTER TABLE drivers ADD COLUMN wialon_resource_id INT NULL`).catch(() => undefined);
    await query(
      `ALTER TABLE drivers ADD UNIQUE KEY uq_drivers_tenant_wialon (tenant_id, wialon_driver_id)`,
    ).catch(() => undefined);
    await query(
      `ALTER TABLE drivers ADD KEY idx_drivers_wialon (tenant_id, wialon_driver_id)`,
    ).catch(() => undefined);
  }

  /** Import Wialon resource drivers and unit assignments into the tenant roster. */
  static async importTenantDrivers(tenantId: string): Promise<{
    imported: number;
    updated: number;
    assigned: number;
  }> {
    await this.ensureSchema();

    const { rows: ds } = await query<{
      is_active: boolean;
      connection_verified_at: string | null;
      wialon_resource_id: number | null;
    }>(
      `SELECT is_active, connection_verified_at, wialon_resource_id FROM data_sources
       WHERE tenant_id = $1 AND source_type = 'wialon' AND is_active = true`,
      [tenantId],
    );
    if (!isWialonTenantConnected(ds[0])) {
      throw new Error('Wialon is not connected for this tenant');
    }

    const creds = await loadTenantWialonCreds(tenantId);
    const accountId = ds[0]?.wialon_resource_id;
    const scopedCreds = {
      ...creds,
      accountId: accountId != null ? String(accountId) : creds.accountId,
    };

    const adapter = new WialonAdapter(scopedCreds);
    await adapter.connect();

    const rosterDrivers: WialonDriverRow[] = [];
    try {
      const resourceDrivers = await adapter.getDrivers();
      for (const d of resourceDrivers) {
        rosterDrivers.push({
          wialonDriverId: d.id,
          wialonResourceId: d.resourceId,
          name: d.name,
          phone: d.phone || '',
          licenseNumber: d.licenseNumber || `W-${d.id}`,
        });
      }
    } catch (err) {
      logger.warn(`[WialonDriverImport] resource drivers failed tenant=${tenantId}`, err);
    }

    const snap = await WialonFleetService.getCachedLiveFleet(tenantId);
    const unitIds = snap.units.map((u) => u.id);

    const unitToDriver = new Map<string, UnitDriverEntry>();
    await withWialonClient(scopedCreds, async (client) => {
      for (let i = 0; i < unitIds.length; i += UNIT_BATCH) {
        const batch = unitIds.slice(i, i + UNIT_BATCH);
        await Promise.all(
          batch.map(async (unitId) => {
            try {
              const raw = await client.request<Record<string, UnitDriverEntry[]>>(
                'resource/get_unit_drivers',
                { unitId },
              );
              for (const drivers of Object.values(raw || {})) {
                const list = Array.isArray(drivers) ? drivers : [];
                if (list[0]?.id != null) {
                  unitToDriver.set(String(unitId), list[0]);
                }
              }
            } catch {
              /* unit may lack driver ACL */
            }
          }),
        );
      }
    });

    await adapter.disconnect().catch(() => undefined);

    for (const [unitId, drv] of unitToDriver) {
      const wialonDriverId = String(drv.id);
      const existing = rosterDrivers.find((d) => d.wialonDriverId === wialonDriverId);
      if (existing) {
        existing.wialonUnitId = unitId;
        if (drv.nm) existing.name = drv.nm;
        if (drv.ph) existing.phone = drv.ph;
      } else {
        rosterDrivers.push({
          wialonDriverId,
          name: drv.nm || `Driver ${wialonDriverId}`,
          phone: drv.ph || '',
          licenseNumber: drv.c?.trim() || `W-${wialonDriverId}`,
          wialonUnitId: unitId,
        });
      }
    }

    let imported = 0;
    let updated = 0;
    let assigned = 0;

    for (const d of rosterDrivers) {
      const assetId = d.wialonUnitId ? await resolveAssetId(tenantId, d.wialonUnitId) : null;
      if (assetId) assigned += 1;

      const { rows: byWialon } = await query<{ id: string }>(
        `SELECT id FROM drivers
         WHERE tenant_id = $1 AND wialon_driver_id = $2 AND deleted_at IS NULL
         LIMIT 1`,
        [tenantId, d.wialonDriverId],
      );

      if (byWialon[0]) {
        await query(
          `UPDATE drivers SET
             name = $3,
             phone = COALESCE(NULLIF($4, ''), phone),
             license_number = CASE
               WHEN license_number LIKE 'W-%' OR license_number = $5 THEN $5
               ELSE license_number
             END,
             assigned_asset_id = COALESCE($6, assigned_asset_id),
             wialon_resource_id = COALESCE($7, wialon_resource_id),
             updated_at = NOW()
           WHERE id = $1 AND tenant_id = $2`,
          [
            byWialon[0].id,
            tenantId,
            d.name,
            d.phone,
            d.licenseNumber,
            assetId,
            d.wialonResourceId ?? null,
          ],
        );
        updated += 1;
        continue;
      }

      const { rows: byLicense } = await query<{ id: string }>(
        `SELECT id FROM drivers
         WHERE tenant_id = $1 AND license_number = $2 AND deleted_at IS NULL
         LIMIT 1`,
        [tenantId, d.licenseNumber],
      );

      if (byLicense[0]) {
        await query(
          `UPDATE drivers SET
             name = $3,
             phone = COALESCE(NULLIF($4, ''), phone),
             wialon_driver_id = $5,
             wialon_resource_id = COALESCE($6, wialon_resource_id),
             assigned_asset_id = COALESCE($7, assigned_asset_id),
             updated_at = NOW()
           WHERE id = $1 AND tenant_id = $2`,
          [
            byLicense[0].id,
            tenantId,
            d.name,
            d.phone,
            d.wialonDriverId,
            d.wialonResourceId ?? null,
            assetId,
          ],
        );
        updated += 1;
        continue;
      }

      try {
        await query(
          `INSERT INTO drivers (
             tenant_id, name, license_number, phone, status,
             assigned_asset_id, wialon_driver_id, wialon_resource_id
           ) VALUES ($1, $2, $3, $4, 'available', $5, $6, $7)`,
          [
            tenantId,
            d.name,
            d.licenseNumber,
            d.phone || '',
            assetId,
            d.wialonDriverId,
            d.wialonResourceId ?? null,
          ],
        );
        imported += 1;
      } catch (err) {
        logger.debug(`[WialonDriverImport] insert skipped ${d.name}`, err);
      }
    }

    try {
      const { DriverScoringService } = await import('./DriverScoringService.js');
      await DriverScoringService.linkEcoViolationsAllDrivers(tenantId);
      await DriverScoringService.recomputeTenant(tenantId, 30);
    } catch (err) {
      logger.warn(`[WialonDriverImport] scoring skipped tenant=${tenantId}`, err);
    }

    return { imported, updated, assigned };
  }
}
