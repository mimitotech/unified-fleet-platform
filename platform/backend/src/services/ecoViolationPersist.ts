import type { FleetAlert } from '@ufp/shared';
import { query } from '../config/database.js';
import { logger } from '../config/logger.js';

const DRIVING_VIOLATION_TYPES = new Set([
  'harsh_braking',
  'harsh_acceleration',
  'harsh_cornering',
  'speeding',
  'overspeed',
  'idling',
  'eco_violation',
  'towing',
  'geofence',
  'fatigue',
  'camera',
  'video',
  'unauthorized',
  'driving',
]);

function mapEcoSeverity(
  severity: FleetAlert['severity'],
): 'low' | 'medium' | 'high' | 'critical' {
  if (severity === 'critical' || severity === 'emergency') return 'critical';
  if (severity === 'warning') return 'high';
  return 'medium';
}

async function resolveAssetId(tenantId: string, unitId: string): Promise<string | null> {
  if (!unitId || unitId === '0') return null;
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

async function resolveDriverForAsset(
  tenantId: string,
  assetId: string | null,
): Promise<{ driverId: string | null; driverName: string | null }> {
  if (!assetId) return { driverId: null, driverName: null };
  const { rows } = await query<{ id: string; name: string }>(
    `SELECT id, name FROM drivers
     WHERE tenant_id = $1 AND assigned_asset_id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [tenantId, assetId],
  ).catch(() => ({ rows: [] as Array<{ id: string; name: string }> }));
  if (!rows[0]) return { driverId: null, driverName: null };
  return { driverId: rows[0].id, driverName: rows[0].name };
}

/** True when an alert / message should count as a driving safety violation. */
export function isDrivingViolationType(type: string, title?: string, description?: string): boolean {
  const normalized = String(type || '').toLowerCase();
  if (DRIVING_VIOLATION_TYPES.has(normalized)) return true;
  const blob = `${normalized} ${title || ''} ${description || ''}`.toLowerCase();
  return /harsh|speed|eco|brake|accel|corner|idle|overspeed|violation|fatigue|camera|unauth|oversped|reckless/.test(
    blob,
  );
}

async function resolveWialonUnitId(
  tenantId: string,
  assetOrUnitId: string | null | undefined,
): Promise<string | null> {
  if (!assetOrUnitId) return null;
  const raw = String(assetOrUnitId);
  if (/^\d+$/.test(raw)) return raw;
  const { rows } = await query<{ external_id: string }>(
    `SELECT am.external_id
     FROM asset_mappings am
     INNER JOIN assets a ON a.id = am.asset_id
     WHERE a.tenant_id = $1 AND am.source_type = 'wialon' AND am.asset_id = $2
     LIMIT 1`,
    [tenantId, raw],
  ).catch(() => ({ rows: [] as Array<{ external_id: string }> }));
  return rows[0]?.external_id ?? null;
}

/** Upsert one harvested alert row into eco_driving_violations. */
export async function upsertEcoViolationFromFleetAlert(
  tenantId: string,
  alert: FleetAlert,
  unitNameById: Map<number, string>,
): Promise<boolean> {
  const externalId = alert.externalId || alert.id;
  if (!externalId) return false;

  const unitId = (await resolveWialonUnitId(tenantId, alert.assetId)) || '0';
  const unitName =
    (unitId !== '0' ? unitNameById.get(Number(unitId)) : undefined) ||
    alert.title?.split('·').pop()?.trim() ||
    (unitId !== '0' ? unitId : 'Fleet');
  const assetId = unitId !== '0' ? await resolveAssetId(tenantId, unitId) : null;
  const { driverId, driverName } = await resolveDriverForAsset(tenantId, assetId);
  const occurredAt =
    alert.timestamp instanceof Date ? alert.timestamp : new Date(alert.timestamp);
  if (Number.isNaN(occurredAt.getTime())) return false;

  try {
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
        alert.type || 'eco_violation',
        mapEcoSeverity(alert.severity),
        occurredAt.toISOString(),
        alert.latitude ?? null,
        alert.longitude ?? null,
        driverName,
        driverId,
        externalId,
      ],
    );
    return true;
  } catch (err) {
    logger.debug(`[EcoViolationPersist] upsert failed tenant=${tenantId}`, err);
    return false;
  }
}

export async function persistFleetAlertsAsEcoViolations(
  tenantId: string,
  alerts: FleetAlert[],
  unitNameById: Map<number, string>,
  opts?: { drivingOnly?: boolean },
): Promise<number> {
  let upserted = 0;
  for (const alert of alerts) {
    if (opts?.drivingOnly !== false && !isDrivingViolationType(alert.type, alert.title, alert.description)) {
      continue;
    }
    if (await upsertEcoViolationFromFleetAlert(tenantId, alert, unitNameById)) {
      upserted++;
    }
  }
  return upserted;
}

/**
 * PHP DomainSync parity: when eco reports are empty, mirror recent driving alerts
 * from the alerts inbox into eco_driving_violations.
 */
export async function mirrorAlertsToEcoViolations(tenantId: string, days = 30): Promise<number> {
  const windowDays = Math.min(90, Math.max(1, days));
  let upserted = 0;
  const pageSize = 500;
  for (let offset = 0; offset < 5000; offset += pageSize) {
    const { rows } = await query<{
      id: string;
      type: string;
      severity: string;
      title: string;
      description: string | null;
      occurred_at: string;
      latitude: number | null;
      longitude: number | null;
      asset_id: string | null;
      external_id: string | null;
    }>(
      `SELECT id, type, severity, title, description, occurred_at, latitude, longitude, asset_id, external_id
       FROM alerts
       WHERE tenant_id = $1
         AND occurred_at >= DATE_SUB(NOW(), INTERVAL ${windowDays} DAY)
         AND (
           type IN (
             'harsh_braking', 'harsh_acceleration', 'harsh_cornering', 'speeding', 'overspeed',
             'idling', 'eco_violation', 'towing', 'geofence', 'fatigue', 'camera', 'video',
             'unauthorized', 'driving', 'fleet_event'
           )
           OR title REGEXP 'harsh|speeding|eco|brake|accel|corner|idle|overspeed|violation|fatigue|camera|unauth'
           OR description REGEXP 'harsh|speeding|eco|brake|accel|corner|idle|overspeed|violation|fatigue|camera|unauth'
         )
       ORDER BY occurred_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      [tenantId],
    ).catch(() => ({ rows: [] }));

    if (!rows.length) break;

    for (const row of rows) {
      const externalId = row.external_id ? `alert:${row.external_id}` : `alert:${row.id}`;
      const alert: FleetAlert = {
        id: externalId,
        type: row.type || 'eco_violation',
        severity: row.severity as FleetAlert['severity'],
        title: row.title,
        description: row.description || undefined,
        latitude: row.latitude ?? undefined,
        longitude: row.longitude ?? undefined,
        timestamp: new Date(row.occurred_at),
        sourceType: 'wialon',
        externalId,
        assetId: row.asset_id || undefined,
        acknowledged: false,
      };
      if (
        !isDrivingViolationType(alert.type, alert.title, alert.description) &&
        !/camera|video|fatigue/i.test(`${alert.type} ${alert.title}`)
      ) {
        continue;
      }
      if (await upsertEcoViolationFromFleetAlert(tenantId, alert, new Map())) {
        upserted++;
      }
    }

    if (rows.length < pageSize) break;
  }
  return upserted;
}
