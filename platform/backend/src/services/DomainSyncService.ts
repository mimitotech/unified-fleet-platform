import { query } from '../config/database.js';
import { isWialonTenantConnected } from './wialonConnectionStatus.js';
import { loadTenantWialonCreds } from './tenantWialonCredentials.js';
import { WialonFleetService } from './WialonFleetService.js';
import { WialonLiveService } from './WialonLiveService.js';
import { fetchTripsForUnits } from './wialonLiveReportRows.js';
import { harvestEcoReportAlerts, harvestTaskMessageAlerts, harvestUnitEventAndNotificationAlerts } from './wialonAlertHarvest.js';
import {
  mirrorAlertsToEcoViolations,
  persistFleetAlertsAsEcoViolations,
} from './ecoViolationPersist.js';
import { withWialonClient } from './WialonSessionService.js';
import { delayBetweenTenants } from './wialonLoginGate.js';
import { listWialonConnectedTenantIds } from './tenantSyncStatus.js';
import { logger } from '../config/logger.js';

const TRIP_WINDOW_DAYS = 7;
const ECO_WINDOW_DAYS = 30;
const TRIP_SYNC_INTERVAL_MS = 30 * 60 * 1000;
const ECO_SYNC_INTERVAL_MS = 15 * 60 * 1000;

async function resolveAssetId(tenantId: string, unitId: string): Promise<string | null> {
  if (!unitId) return null;
  const { rows } = await query<{ asset_id: string }>(
    `SELECT am.asset_id
     FROM asset_mappings am
     INNER JOIN assets a ON a.id = am.asset_id
     WHERE a.tenant_id = $1 AND am.source_type = 'wialon' AND am.external_id = $2
     LIMIT 1`,
    [tenantId, unitId],
  );
  return rows[0]?.asset_id ?? null;
}

export class DomainSyncService {
  /** Persist Wialon unit trips into trip_summaries (rolling window). */
  static async syncTenantTrips(tenantId: string): Promise<number> {
    const { rows: ds } = await query<{
      is_active: boolean;
      connection_verified_at: string | null;
      wialon_resource_id: number | null;
    }>(
      `SELECT is_active, connection_verified_at, wialon_resource_id FROM data_sources
       WHERE tenant_id = $1 AND source_type = 'wialon' AND is_active = true`,
      [tenantId],
    );
    if (!isWialonTenantConnected(ds[0])) return 0;

    const cursorKey = `domain:trips:${TRIP_WINDOW_DAYS}d`;
    const { rows: cursor } = await query<{ last_success_at: string | null }>(
      `SELECT last_success_at FROM fuel_sync_cursor WHERE tenant_id = $1 AND cursor_key = $2`,
      [tenantId, cursorKey],
    );
    const last = cursor[0]?.last_success_at;
    if (last && Date.now() - new Date(last).getTime() < TRIP_SYNC_INTERVAL_MS) return 0;

    const creds = await loadTenantWialonCreds(tenantId);
    const snap = await WialonFleetService.getCachedLiveFleet(tenantId);
    const to = new Date();
    const from = new Date(Date.now() - TRIP_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const units = snap.units.slice(0, 120).map((u) => ({
      id: u.id,
      name: u.name,
      plate: u.plate,
    }));

    const parsed = await fetchTripsForUnits(
      (id, f, t) => WialonLiveService.getUnitTrips(creds, id, f, t),
      units,
      from,
      to,
      6,
    );

    let upserted = 0;
    for (const row of parsed) {
      const unitId = String(row.unitId ?? '');
      const startIso = row.startTime ? String(row.startTime) : '';
      if (!unitId || !startIso) continue;

      const endIso = row.endTime ? String(row.endTime) : startIso;
      const departure = new Date(startIso);
      const arrival = new Date(endIso);
      if (Number.isNaN(departure.getTime())) continue;

      const durationMin = Number(row.durationMin);
      const durationSec = Number.isFinite(durationMin) ? Math.round(durationMin * 60) : 0;
      const mileage = Number(row.distanceKm) || 0;
      const fuelUsed = Number(row.fuelUsedLiters) || 0;
      const avgSpeed = Number(row.avgSpeedKmh) || 0;
      const maxSpeed = Number(row.maxSpeedKmh) || 0;
      const unitName = String(row.unitName || unitId);
      const tripId = `${unitId}:${departure.toISOString()}`;
      const assetId = await resolveAssetId(tenantId, unitId);

      await query(
        `INSERT INTO trip_summaries (
           tenant_id, trip_id, asset_id, unit_id, unit_name,
           departure_time, arrival_time, mileage, duration, fuel_used,
           avg_speed, max_speed, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
         ON CONFLICT (tenant_id, unit_id, departure_time) DO UPDATE SET
           trip_id = EXCLUDED.trip_id,
           asset_id = COALESCE(EXCLUDED.asset_id, trip_summaries.asset_id),
           unit_name = EXCLUDED.unit_name,
           arrival_time = EXCLUDED.arrival_time,
           mileage = EXCLUDED.mileage,
           duration = EXCLUDED.duration,
           fuel_used = EXCLUDED.fuel_used,
           avg_speed = EXCLUDED.avg_speed,
           max_speed = EXCLUDED.max_speed,
           updated_at = NOW()`,
        [
          tenantId,
          tripId,
          assetId,
          unitId,
          unitName,
          departure.toISOString(),
          Number.isNaN(arrival.getTime()) ? departure.toISOString() : arrival.toISOString(),
          mileage,
          durationSec,
          fuelUsed,
          avgSpeed,
          maxSpeed,
        ],
      );
      upserted++;
    }

    const now = new Date().toISOString();
    await query(
      `INSERT INTO fuel_sync_cursor (tenant_id, cursor_key, last_synced_at, last_success_at, row_count, last_error)
       VALUES ($1, $2, $3, $3, $4, NULL)
       ON CONFLICT (tenant_id, cursor_key) DO UPDATE SET
         last_synced_at = EXCLUDED.last_synced_at,
         last_success_at = EXCLUDED.last_success_at,
         row_count = EXCLUDED.row_count,
         last_error = NULL`,
      [tenantId, cursorKey, now, upserted],
    );

    return upserted;
  }

  /** Persist eco / safety violations from Wialon reports, unit messages, and alert inbox mirror. */
  static async syncTenantEcoViolations(
    tenantId: string,
    opts?: { force?: boolean },
  ): Promise<number> {
    const { rows: ds } = await query<{
      is_active: boolean;
      connection_verified_at: string | null;
      wialon_resource_id: number | null;
    }>(
      `SELECT is_active, connection_verified_at, wialon_resource_id FROM data_sources
       WHERE tenant_id = $1 AND source_type = 'wialon' AND is_active = true`,
      [tenantId],
    );
    if (!isWialonTenantConnected(ds[0])) return 0;

    const cursorKey = 'domain:eco:30d';
    if (!opts?.force) {
      const { rows: cursor } = await query<{ last_success_at: string | null }>(
        `SELECT last_success_at FROM fuel_sync_cursor WHERE tenant_id = $1 AND cursor_key = $2`,
        [tenantId, cursorKey],
      );
      const last = cursor[0]?.last_success_at;
      if (last && Date.now() - new Date(last).getTime() < ECO_SYNC_INTERVAL_MS) return 0;
    }

    const creds = await loadTenantWialonCreds(tenantId);
    const snap = await WialonFleetService.getCachedLiveFleet(tenantId);
    const unitIds = snap.units.map((u) => u.id);
    const unitNameById = new Map(snap.units.map((u) => [u.id, u.name]));

    const timeTo = Math.floor(Date.now() / 1000);
    const timeFrom = timeTo - ECO_WINDOW_DAYS * 24 * 3600;

    let upserted = 0;

    const harvested = await withWialonClient(creds, async (client) => {
      const reportAlerts = await harvestEcoReportAlerts(
        creds,
        client,
        `eco-db:${tenantId}`,
        timeFrom,
        timeTo,
        unitIds,
        unitNameById,
        { skipCooldown: opts?.force === true, maxUnits: opts?.force ? unitIds.length : undefined },
      );

      const taskAlerts = await harvestTaskMessageAlerts(
        client,
        unitIds,
        unitNameById,
        timeFrom,
        timeTo,
      );
      const eventAlerts = await harvestUnitEventAndNotificationAlerts(
        client,
        `eco-msg:${tenantId}`,
        unitIds,
        unitNameById,
        timeFrom,
        timeTo,
      );

      return [...reportAlerts, ...taskAlerts, ...eventAlerts];
    });

    upserted += await persistFleetAlertsAsEcoViolations(tenantId, harvested, unitNameById, {
      drivingOnly: true,
    });

    // Old MAMS fallback when eco report template is missing or returns no rows.
    upserted += await mirrorAlertsToEcoViolations(tenantId, ECO_WINDOW_DAYS);

    try {
      const { DriverScoringService } = await import('./DriverScoringService.js');
      await DriverScoringService.linkEcoViolationsAllDrivers(tenantId);
    } catch (err) {
      logger.warn(`[DomainSync] driver link skipped tenant=${tenantId}`, err);
    }

    const now = new Date().toISOString();
    await query(
      `INSERT INTO fuel_sync_cursor (tenant_id, cursor_key, last_synced_at, last_success_at, row_count, last_error)
       VALUES ($1, $2, $3, $3, $4, NULL)
       ON CONFLICT (tenant_id, cursor_key) DO UPDATE SET
         last_synced_at = EXCLUDED.last_synced_at,
         last_success_at = EXCLUDED.last_success_at,
         row_count = EXCLUDED.row_count,
         last_error = NULL`,
      [tenantId, cursorKey, now, upserted],
    ).catch(() => undefined);

    return upserted;
  }

  static async syncTenant(tenantId: string): Promise<{ trips: number; eco: number }> {
    const trips = await this.syncTenantTrips(tenantId);
    const eco = await this.syncTenantEcoViolations(tenantId);
    if (eco > 0 || trips > 0) {
      try {
        const { DriverScoringService } = await import('./DriverScoringService.js');
        await DriverScoringService.linkEcoViolationsAllDrivers(tenantId);
        await DriverScoringService.recomputeTenant(tenantId, 30);
      } catch (err) {
        logger.warn(`[DomainSync] driver scoring skipped tenant=${tenantId}`, err);
      }
    }
    return { trips, eco };
  }

  static async syncAllConnectedTenants(): Promise<number> {
    const tenantIds = await listWialonConnectedTenantIds();
    let count = 0;
    for (const tenantId of tenantIds) {
      try {
        await delayBetweenTenants();
        await this.syncTenant(tenantId);
        count++;
      } catch (err) {
        logger.warn(`[DomainSync] skipped tenant ${tenantId}`, err);
      }
    }
    return count;
  }

  /** Mirror inbox driving alerts into eco table for every active tenant (all telematics sources). */
  static async mirrorViolationsAllTenants(): Promise<number> {
    const { listActiveTenants } = await import('./tenantSyncStatus.js');
    const tenants = await listActiveTenants();
    let total = 0;
    for (const tenant of tenants) {
      try {
        await delayBetweenTenants();
        total += await mirrorAlertsToEcoViolations(tenant.id, ECO_WINDOW_DAYS);
        const { DriverScoringService } = await import('./DriverScoringService.js');
        await DriverScoringService.linkEcoViolationsAllDrivers(tenant.id).catch(() => undefined);
      } catch (err) {
        logger.warn(`[DomainSync] mirror skipped tenant ${tenant.id}`, err);
      }
    }
    return total;
  }
}
