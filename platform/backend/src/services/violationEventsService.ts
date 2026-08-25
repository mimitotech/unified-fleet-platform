import { query } from '../config/database.js';
import { toCamelRows } from '../utils/mapper.js';
import { isDrivingViolationType } from './ecoViolationPersist.js';

export type ViolationEventRow = {
  id: string;
  title: string;
  type?: string;
  violationType?: string;
  severity?: string;
  occurredAt?: string;
  unitId?: string;
  unitName?: string;
  assetId?: string;
  driverName?: string;
  source: 'eco' | 'alert' | 'video';
  videoUrl?: string;
  category: 'eco' | 'alert' | 'video';
};

const DRIVING_ALERT_TYPES = [
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
  'license_expiry',
  'fleet_event',
];

function eventDedupKey(row: ViolationEventRow): string {
  const t = new Date(String(row.occurredAt || 0)).getTime();
  const bucket = Number.isFinite(t) ? Math.floor(t / 300_000) : 0;
  const type = String(row.violationType || row.type || '').toLowerCase();
  const unit = String(row.unitId || row.unitName || '').toLowerCase();
  return `${unit}:${bucket}:${type}`;
}

function normalizeEcoRow(raw: Record<string, unknown>): ViolationEventRow {
  const type = String(raw.violationType || raw.type || 'eco_violation');
  return {
    id: String(raw.id || ''),
    title: type.replace(/_/g, ' '),
    type,
    violationType: type,
    severity: raw.severity != null ? String(raw.severity) : undefined,
    occurredAt: raw.occurredAt != null ? String(raw.occurredAt) : undefined,
    unitId: raw.unitId != null ? String(raw.unitId) : undefined,
    unitName: raw.unitName != null ? String(raw.unitName) : undefined,
    assetId: raw.assetId != null ? String(raw.assetId) : undefined,
    driverName: raw.driverName != null ? String(raw.driverName) : undefined,
    source: 'eco',
    category: 'eco',
  };
}

function normalizeAlertRow(raw: Record<string, unknown>): ViolationEventRow | null {
  const type = String(raw.violationType || raw.type || 'alert');
  const title = String(raw.title || type.replace(/_/g, ' '));
  if (!isDrivingViolationType(type, title, raw.description != null ? String(raw.description) : undefined)) {
    if (!raw.videoUrl) return null;
  }
  const category = raw.videoUrl ? 'video' : 'alert';
  return {
    id: String(raw.id || ''),
    title,
    type,
    violationType: type,
    severity: raw.severity != null ? String(raw.severity) : undefined,
    occurredAt: raw.occurredAt != null ? String(raw.occurredAt) : undefined,
    unitId: raw.unitId != null ? String(raw.unitId) : undefined,
    unitName: raw.unitName != null ? String(raw.unitName) : undefined,
    assetId: raw.assetId != null ? String(raw.assetId) : undefined,
    driverName: raw.driverName != null ? String(raw.driverName) : undefined,
    source: category === 'video' ? 'video' : 'alert',
    videoUrl: raw.videoUrl != null ? String(raw.videoUrl) : undefined,
    category,
  };
}

/** Merge eco_driving_violations + driving/camera alerts for any tenant user surface. */
export async function fetchMergedViolationEvents(
  tenantId: string,
  opts?: { limit?: number; days?: number },
): Promise<ViolationEventRow[]> {
  const limit = Math.min(500, Math.max(1, opts?.limit ?? 120));
  const days = Math.min(90, Math.max(1, opts?.days ?? 30));

  const { rows: eco } = await query(
    `SELECT id, unit_id, unit_name, asset_id, violation_type, severity, occurred_at, driver_name, 'eco' as source
     FROM eco_driving_violations
     WHERE tenant_id = $1 AND occurred_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)
     ORDER BY occurred_at DESC
     LIMIT $2`,
    [tenantId, limit * 2],
  ).catch(() => ({ rows: [] as Array<Record<string, unknown>> }));

  const typeList = DRIVING_ALERT_TYPES.map((t) => `'${t}'`).join(', ');
  const { rows: alerts } = await query(
    `SELECT a.id, a.title, a.description, a.type, a.severity, a.occurred_at, a.video_url, a.asset_id,
            COALESCE(am.external_id, a.asset_id) as unit_id,
            COALESCE(ast.registration_plate, ast.name) as unit_name,
            'alert' as source
     FROM alerts a
     LEFT JOIN assets ast ON ast.id = a.asset_id
     LEFT JOIN asset_mappings am ON am.asset_id = a.asset_id AND am.source_type = 'wialon'
     WHERE a.tenant_id = $1
       AND a.occurred_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)
       AND (
         a.type IN (${typeList})
         OR LOWER(COALESCE(a.type, '')) LIKE '%fatigue%'
         OR LOWER(COALESCE(a.type, '')) LIKE '%camera%'
         OR LOWER(COALESCE(a.type, '')) LIKE '%video%'
         OR LOWER(COALESCE(a.type, '')) LIKE '%unauth%'
         OR LOWER(COALESCE(a.type, '')) LIKE '%speed%'
         OR LOWER(COALESCE(a.type, '')) LIKE '%eco%'
         OR LOWER(COALESCE(a.type, '')) LIKE '%harsh%'
         OR LOWER(COALESCE(a.type, '')) LIKE '%brak%'
         OR LOWER(COALESCE(a.type, '')) LIKE '%accel%'
         OR LOWER(COALESCE(a.title, '')) REGEXP 'harsh|speeding|eco|brake|accel|corner|idle|overspeed|violation|fatigue|camera|unauth'
         OR a.video_url IS NOT NULL
       )
     ORDER BY a.occurred_at DESC
     LIMIT $2`,
    [tenantId, limit * 2],
  ).catch(() => ({ rows: [] as Array<Record<string, unknown>> }));

  const seen = new Set<string>();
  const merged: ViolationEventRow[] = [];

  for (const raw of toCamelRows(eco) as Array<Record<string, unknown>>) {
    const row = normalizeEcoRow(raw);
    if (!row.id) continue;
    const key = eventDedupKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }

  for (const raw of toCamelRows(alerts) as Array<Record<string, unknown>>) {
    const row = normalizeAlertRow(raw);
    if (!row) continue;
    const key = eventDedupKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }

  merged.sort((a, b) => {
    const ta = new Date(String(a.occurredAt || 0)).getTime();
    const tb = new Date(String(b.occurredAt || 0)).getTime();
    return tb - ta;
  });

  return merged.slice(0, limit);
}
