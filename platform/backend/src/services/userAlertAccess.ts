import { query } from '../config/database.js';
import { isNoiseAlert } from './wialonAlertClassify.js';
import type { FleetAlert } from '@ufp/shared';

export type AllowedAlertType = {
  /** Stable key — normalized bare alert title, or classified type. */
  key: string;
  /** Client-facing label shown in Settings / Alert types. */
  name: string;
};

export type TenantAlertTypeRow = {
  key: string;
  name: string;
  type: string;
  category: string;
  eventCount: number;
  lastSeen: string | null;
};

const ADMIN_ROLES = new Set(['tenant_admin', 'platform_admin', 'super_admin']);

let schemaReady = false;

export async function ensureUserAlertAccessSchema(): Promise<void> {
  if (schemaReady) return;
  try {
    await query(`ALTER TABLE users ADD COLUMN allowed_alert_types JSON NULL`);
  } catch (e) {
    const msg = (e as Error).message || '';
    if (!/duplicate column|exists/i.test(msg)) {
      console.warn('[user-alert-access] ensureSchema:', msg);
    }
  }
  schemaReady = true;
}

export function roleBypassesAlertAcl(role?: string | null): boolean {
  return Boolean(role && ADMIN_ROLES.has(role));
}

/** Strip trailing ` · unit` from inbox titles. */
export function bareAlertTitle(title?: string | null): string {
  return String(title || '')
    .replace(/\s*·\s*[^·]+$/u, '')
    .replace(/\bWialon\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function normalizeAlertTypeKey(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/[!?.]+$/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .trim();
}

export function prettyAlertTypeLabel(typeOrName: string): string {
  const raw = bareAlertTitle(typeOrName);
  if (!raw) return 'Fleet event';
  if (!/^[a-z0-9_]+$/i.test(raw) || raw.includes(' ')) {
    return raw.replace(/^./, (c) => c.toUpperCase());
  }
  return (
    raw
      .replace(/^wialon[_-]?/i, '')
      .replace(/^fleet[_-]?/i, 'fleet ')
      .replace(/_/g, ' ')
      .trim()
      .replace(/^./, (c) => c.toUpperCase()) || 'Fleet event'
  );
}

export function categoryForAlertType(type?: string): string {
  const t = String(type || '');
  if (/harsh_|speeding|eco_violation|idling|towing|sos/.test(t)) return 'driving';
  if (/fuel_/.test(t)) return 'fuel';
  if (/generator|power_cut|power_restore|battery/.test(t)) return 'power';
  if (t === 'geofence') return 'geofence';
  if (/ignition_/.test(t)) return 'engine';
  if (/sensor|temperature|door|connection|maintenance/.test(t)) return 'sensors';
  return 'other';
}

export function parseAllowedAlertTypes(raw: unknown): AllowedAlertType[] | null {
  if (raw == null) return null;
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const out: AllowedAlertType[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const name = prettyAlertTypeLabel(String(row.name ?? row.key ?? '').trim());
    const key =
      normalizeAlertTypeKey(String(row.key ?? '')) ||
      normalizeAlertTypeKey(String(row.name ?? ''));
    if (!name || !key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, name });
  }
  return out;
}

/** `undefined` = leave unchanged; `null` = unrestricted; array = explicit allowlist. */
export function sanitizeAllowedAlertTypesInput(
  raw: unknown,
): AllowedAlertType[] | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  return parseAllowedAlertTypes(raw) ?? [];
}

export function alertMatchesAllowedTypes(
  alert: FleetAlert,
  allowed: AllowedAlertType[],
): boolean {
  if (!allowed.length) return false;
  const bare = bareAlertTitle(alert.title);
  const bareKey = normalizeAlertTypeKey(bare);
  const typeKey = normalizeAlertTypeKey(alert.type || '');

  for (const entry of allowed) {
    const key = normalizeAlertTypeKey(entry.key);
    const nameKey = normalizeAlertTypeKey(entry.name);
    if (key && (key === bareKey || key === typeKey || key === normalizeAlertTypeKey(alert.type || ''))) {
      return true;
    }
    if (nameKey && (nameKey === bareKey || nameKey === typeKey)) return true;
    if (entry.key === alert.type || entry.name === alert.type) return true;
  }
  return false;
}

export function filterAlertsForUser(
  alerts: FleetAlert[],
  opts: { role?: string | null; allowed: AllowedAlertType[] | null },
): FleetAlert[] {
  if (roleBypassesAlertAcl(opts.role)) return alerts;
  if (!opts.allowed?.length) return [];
  return alerts.filter((a) => alertMatchesAllowedTypes(a, opts.allowed!));
}

export function filterAlertTypeRowsForUser(
  rows: TenantAlertTypeRow[],
  opts: { role?: string | null; allowed: AllowedAlertType[] | null },
): TenantAlertTypeRow[] {
  if (roleBypassesAlertAcl(opts.role)) return rows;
  if (!opts.allowed?.length) return [];
  const keys = new Set(opts.allowed.map((a) => normalizeAlertTypeKey(a.key)));
  return rows.filter(
    (r) => keys.has(normalizeAlertTypeKey(r.key)) || keys.has(normalizeAlertTypeKey(r.type)),
  );
}

export async function loadUserAllowedAlertTypes(
  userId: string,
): Promise<{ role: string | null; allowed: AllowedAlertType[] | null }> {
  await ensureUserAlertAccessSchema();
  const { rows } = await query<{ role: string; allowed_alert_types: unknown }>(
    `SELECT role, allowed_alert_types FROM users WHERE id = $1`,
    [userId],
  );
  if (!rows[0]) return { role: null, allowed: null };
  return {
    role: rows[0].role,
    allowed: parseAllowedAlertTypes(rows[0].allowed_alert_types),
  };
}

/**
 * Alert types for a client = distinct inbox event names/types already harvested.
 * This is the same grouping operators see in Inbox (bare title + classified type).
 */
export async function listTenantAlertTypes(tenantId: string): Promise<TenantAlertTypeRow[]> {
  const { rows } = await query<{
    title: string;
    type: string;
    occurred_at: string;
  }>(
    `SELECT title, type, occurred_at FROM alerts
     WHERE tenant_id = $1
     ORDER BY occurred_at DESC
     LIMIT 5000`,
    [tenantId],
  );

  type Acc = {
    key: string;
    name: string;
    type: string;
    eventCount: number;
    lastSeen: string | null;
  };
  const byKey = new Map<string, Acc>();

  for (const row of rows) {
    const fake: FleetAlert = {
      id: 'x',
      type: String(row.type || 'fleet_event'),
      severity: 'info',
      title: String(row.title || ''),
      timestamp: new Date(row.occurred_at),
      sourceType: 'wialon',
      acknowledged: false,
    };
    if (isNoiseAlert(fake)) continue;

    const bare = bareAlertTitle(row.title);
    const type = String(row.type || 'fleet_event');
    // Prefer the fired event name (what Inbox shows); fall back to classified type.
    const display = bare || prettyAlertTypeLabel(type);
    const key = normalizeAlertTypeKey(bare) || normalizeAlertTypeKey(type);
    if (!key) continue;

    const prev = byKey.get(key);
    if (prev) {
      prev.eventCount += 1;
      if (!prev.lastSeen || String(row.occurred_at) > prev.lastSeen) {
        prev.lastSeen = String(row.occurred_at);
      }
      continue;
    }
    byKey.set(key, {
      key,
      name: prettyAlertTypeLabel(display),
      type,
      eventCount: 1,
      lastSeen: row.occurred_at ? String(row.occurred_at) : null,
    });
  }

  return [...byKey.values()]
    .map((r) => ({
      ...r,
      category: categoryForAlertType(r.type),
    }))
    .sort((a, b) => b.eventCount - a.eventCount || a.name.localeCompare(b.name));
}
