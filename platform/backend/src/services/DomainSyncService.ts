import type { FleetAlert } from '@ufp/shared';
import { query } from '../config/database.js';
import { isWialonTenantConnected } from './wialonConnectionStatus.js';
import { loadTenantWialonCreds } from './tenantWialonCredentials.js';
import { WialonFleetService } from './WialonFleetService.js';
import { WialonLiveService } from './WialonLiveService.js';
import { fetchTripsForUnits } from './wialonLiveReportRows.js';
import { harvestEcoReportAlerts } from './wialonAlertHarvest.js';
import { withWialonClient } from './WialonSessionService.js';
import { delayBetweenTenants } from './wialonLoginGate.js';
import { listWialonConnectedTenantIds } from './tenantSyncStatus.js';
import { logger } from '../config/logger.js';

const TRIP_WINDOW_DAYS = 7;
const ECO_WINDOW_DAYS = 7;
const TRIP_SYNC_INTERVAL_MS = 30 * 60 * 1000;

function mapEcoSeverity(
  severity: FleetAlert['severity'],
): 'low' | 'medium' | 'high' | 'critical' {
  if (severity === 'critical' || severity === 'emergency') return 'critical';
  if (severity === 'warning') return 'high';
  return 'medium';
}

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

  /** Persist eco / safety report rows into eco_driving_violations. */
  static async syncTenantEcoViolations(tenantId: string): Promise<number> {
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

    const creds = await loadTenantWialonCreds(tenantId);
    const snap = await WialonFleetService.getCachedLiveFleet(tenantId);
    const unitIds = snap.units.map((u) => u.id);
    const unitNameById = new Map(snap.units.map((u) => [u.id, u.name]));

    const timeTo = Math.floor(Date.now() / 1000);
    const timeFrom = timeTo - ECO_WINDOW_DAYS * 24 * 3600;

    const alerts = await withWialonClient(creds, async (client) =>
      harvestEcoReportAlerts(
        creds,
        client,
        `eco-db:${tenantId}`,
        timeFrom,
        timeTo,
        unitIds,
        unitNameById,
      ),
    );

    let upserted = 0;
    for (const alert of alerts) {
      const externalId = alert.externalId || alert.id;
      if (!externalId) continue;

      const unitId = alert.assetId ? String(alert.assetId) : '';
      const unitName =
        (unitId ? unitNameById.get(Number(unitId)) : undefined) ||
        unitId ||
        'Unknown';
      const assetId = unitId ? await resolveAssetId(tenantId, unitId) : null;
      const occurredAt =
        alert.timestamp instanceof Date ? alert.timestamp : new Date(alert.timestamp);

      let driverId: string | null = null;
      let driverName: string | null = null;
      if (assetId) {
        const { rows: drv } = await query<{ id: string; name: string }>(
          `SELECT id, name FROM drivers
           WHERE tenant_id = $1 AND assigned_asset_id = $2 AND deleted_at IS NULL
           LIMIT 1`,
          [tenantId, assetId]
        ).catch(() => ({ rows: [] as Array<{ id: string; name: string }> }));
        if (drv[0]) {
          driverId = drv[0].id;
          driverName = drv[0].name;
        }
      }

      await query(
        `INSERT INTO eco_driving_violations (
           tenant_id, asset_id, unit_id, unit_name, violation_type, severity,
           occurred_at, latitude, longitude, driver_name, driver_id, external_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (tenant_id, external_id) WHERE external_id IS NOT NULL DO UPDATE SET
           violation_type = EXCLUDED.violation_type,
           severity = EXCLUDED.severity,
           occurred_at = EXCLUDED.occurred_at,
           unit_name = EXCLUDED.unit_name,
           asset_id = COALESCE(EXCLUDED.asset_id, eco_driving_violations.asset_id),
           driver_name = COALESCE(EXCLUDED.driver_name, eco_driving_violations.driver_name),
           driver_id = COALESCE(EXCLUDED.driver_id, eco_driving_violations.driver_id)`,
        [
          tenantId,
          assetId,
          unitId || '0',
          unitName,
          alert.type,
          mapEcoSeverity(alert.severity),
          occurredAt.toISOString(),
          alert.latitude ?? null,
          alert.longitude ?? null,
          driverName,
          driverId,
          externalId,
        ],
      );
      upserted++;
    }

    return upserted;
  }

  static async syncTenant(tenantId: string): Promise<{ trips: number; eco: number }> {
    const trips = await this.syncTenantTrips(tenantId);
    const eco = await this.syncTenantEcoViolations(tenantId);
    if (eco > 0 || trips > 0) {
      try {
        const { DriverScoringService } = await import('./DriverScoringService.js');
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
}
