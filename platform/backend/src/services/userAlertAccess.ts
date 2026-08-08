import { query } from '../config/database.js';
import { isNoiseAlert } from './wialonAlertClassify.js';
import type { FleetAlert } from '@ufp/shared';

export type AllowedAlertType = {
  /** Classified alert type key — same as alerts.type / Inbox badge (e.g. fuel_filling). */
  key: string;
  /** Client-facing label (e.g. "fuel filling"). */
  name: string;
};

export type TenantAlertTypeRow = {
  key: string;
  name: string;
  type: string;
  category: string;
  categoryLabel: string;
  eventCount: number;
  lastSeen: string | null;
};

const ADMIN_ROLES = new Set(['tenant_admin', 'platform_admin', 'super_admin']);

/** Mirrors frontend Alerts Inbox category filters exactly. */
const CATEGORY_DEFS: Array<{ id: string; label: string; match: (type: string) => boolean }> = [
  {
    id: 'safety',
    label: 'Driving',
    match: (t) => /harsh_|speeding|eco_violation|idling|towing|sos/.test(t),
  },
  { id: 'fuel', label: 'Fuel', match: (t) => /fuel_/.test(t) },
  {
    id: 'power',
    label: 'Power',
    match: (t) => /generator|power_cut|power_restore|battery/.test(t),
  },
  { id: 'geofence', label: 'Geofence', match: (t) => t === 'geofence' },
  { id: 'engine', label: 'Engine', match: (t) => /ignition_/.test(t) },
  {
    id: 'sensors',
    label: 'Sensors',
    match: (t) => /sensor|temperature|door|connection|maintenance/.test(t),
  },
];

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

export function categoryOfAlertType(type?: string): { id: string; label: string } {
  const t = String(type || '');
  const found = CATEGORY_DEFS.find((c) => c.match(t));
  if (found) return { id: found.id, label: found.label };
  return { id: 'other', label: 'Other' };
}

export function prettyAlertTypeLabel(type?: string): string {
  if (!type) return 'Fleet event';
  return (
    String(type)
      .replace(/^wialon[_-]?/i, '')
      .replace(/^fleet[_-]?/i, 'fleet ')
      .replace(/_/g, ' ')
      .trim() || 'Fleet event'
  );
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
    const key = String(row.key ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_|_$/g, '');
    if (!key || seen.has(key)) continue;
    const name = String(row.name ?? '').trim() || prettyAlertTypeLabel(key);
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

/** Strict: allow only when the inbox classified type matches an enabled key. */
export function alertMatchesAllowedTypes(
  alert: FleetAlert,
  allowed: AllowedAlertType[],
): boolean {
  if (!allowed.length) return false;
  const type = String(alert.type || '')
    .trim()
    .toLowerCase();
  if (!type) return false;
  return allowed.some((a) => a.key === type);
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
  const keys = new Set(opts.allowed.map((a) => a.key));
  return rows.filter((r) => keys.has(r.key));
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
 * Alert types = distinct classified `alerts.type` values for this client.
 * Same set types Inbox shows on each row (e.g. fuel_filling → "fuel filling"),
 * falling into the same groups (Fuel, Driving, Power, …).
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
  const byType = new Map<string, Acc>();

  for (const row of rows) {
    const type = String(row.type || '')
      .trim()
      .toLowerCase();
    if (!type) continue;

    const fake: FleetAlert = {
      id: 'x',
      type,
      severity: 'info',
      title: String(row.title || ''),
      timestamp: new Date(row.occurred_at),
      sourceType: 'wialon',
      acknowledged: false,
    };
    if (isNoiseAlert(fake)) continue;

    const prev = byType.get(type);
    if (prev) {
      prev.eventCount += 1;
      if (!prev.lastSeen || String(row.occurred_at) > prev.lastSeen) {
        prev.lastSeen = String(row.occurred_at);
      }
      continue;
    }
    byType.set(type, {
      key: type,
      name: prettyAlertTypeLabel(type),
      type,
      eventCount: 1,
      lastSeen: row.occurred_at ? String(row.occurred_at) : null,
    });
  }

  const categoryOrder = new Map(CATEGORY_DEFS.map((c, i) => [c.id, i]));

  return [...byType.values()]
    .map((r) => {
      const cat = categoryOfAlertType(r.type);
      return {
        ...r,
        category: cat.id,
        categoryLabel: cat.label,
      };
    })
    .sort((a, b) => {
      const ao = categoryOrder.get(a.category) ?? 99;
      const bo = categoryOrder.get(b.category) ?? 99;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name);
    });
}
