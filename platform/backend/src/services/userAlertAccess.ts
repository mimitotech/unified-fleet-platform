import { query } from '../config/database.js';
import { classifyWialonAlertType, isNoiseAlert } from './wialonAlertClassify.js';
import { WORKSHOP_BUILTIN_ALERT_TYPES } from './workshopAlertService.js';
import type { FleetAlert } from '@ufp/shared';

export type AllowedAlertType = {
  /** Stable key — normalized event name, or classified type. */
  key: string;
  /** Client-facing label. */
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
    id: 'workshop',
    label: 'Workshop',
    match: (t) => /workshop_/.test(t),
  },
  {
    id: 'sensors',
    label: 'Sensors',
    match: (t) => /sensor|temperature|door|connection|maintenance/.test(t) && !/workshop_/.test(t),
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

export function prettyAlertTypeLabel(typeOrName?: string): string {
  if (!typeOrName) return 'Fleet event';
  const raw = String(typeOrName).trim();
  if (!raw) return 'Fleet event';
  // Already a human label (has spaces / caps) — keep, just tidy.
  if (/[A-Z]/.test(raw) || raw.includes(' ') || /[^a-z0-9_]/i.test(raw)) {
    return raw.replace(/\s{2,}/g, ' ').trim();
  }
  return (
    raw
      .replace(/^wialon[_-]?/i, '')
      .replace(/^fleet[_-]?/i, 'fleet ')
      .replace(/_/g, ' ')
      .trim() || 'Fleet event'
  );
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
    const name = String(row.name ?? '').trim();
    const key =
      normalizeAlertTypeKey(String(row.key ?? '')) ||
      normalizeAlertTypeKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, name: name || prettyAlertTypeLabel(key) });
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

/**
 * Strict ACL: only the exact alert names enabled for the user.
 * Never match on classified type alone — that incorrectly pulls in other
 * same-group alerts (e.g. enabling "Fuel filling" must not show "GENSET LOW FUEL").
 */
export function alertMatchesAllowedTypes(
  alert: FleetAlert,
  allowed: AllowedAlertType[],
): boolean {
  if (!allowed.length) return false;
  const bare = normalizeAlertTypeKey(bareAlertTitle(alert.title));
  if (!bare) return false;
  for (const a of allowed) {
    const key = normalizeAlertTypeKey(a.key);
    const nameKey = normalizeAlertTypeKey(a.name);
    if (key && bare === key) return true;
    if (nameKey && bare === nameKey) return true;
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
  const names = new Set(opts.allowed.map((a) => normalizeAlertTypeKey(a.name)));
  return rows.filter((r) => {
    const rowKey = normalizeAlertTypeKey(r.key);
    const rowName = normalizeAlertTypeKey(r.name);
    return keys.has(rowKey) || names.has(rowKey) || keys.has(rowName) || names.has(rowName);
  });
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

function upsertType(
  byKey: Map<string, TenantAlertTypeRow & { _score: number }>,
  input: {
    name: string;
    type: string;
    eventCount: number;
    lastSeen: string | null;
  },
) {
  const display = prettyAlertTypeLabel(input.name || input.type);
  const key =
    normalizeAlertTypeKey(input.name) ||
    normalizeAlertTypeKey(input.type);
  if (!key) return;

  const type = String(input.type || classifyWialonAlertType(display) || 'fleet_event')
    .trim()
    .toLowerCase();
  const cat = categoryOfAlertType(type);
  // Prefer a more specific classified type over fleet_event when merging.
  const score = type === 'fleet_event' ? 0 : 2;

  const prev = byKey.get(key);
  if (prev) {
    prev.eventCount += input.eventCount;
    if (!prev.lastSeen || (input.lastSeen && input.lastSeen > prev.lastSeen)) {
      prev.lastSeen = input.lastSeen;
    }
    if (score > prev._score) {
      prev.type = type;
      prev.category = cat.id;
      prev.categoryLabel = cat.label;
      prev._score = score;
    }
    if (display.length > prev.name.length) prev.name = display;
    return;
  }

  byKey.set(key, {
    key,
    name: display,
    type,
    category: cat.id,
    categoryLabel: cat.label,
    eventCount: input.eventCount,
    lastSeen: input.lastSeen,
    _score: score,
  });
}

/**
 * Full alert-type catalog for a client:
 * — Every distinct Inbox event name (what each alert row shows before the unit)
 * — Plus configured rule names for this client that have not fired yet
 * Structured with the same groups as Inbox (Fuel, Driving, Power, …).
 */
export async function listTenantAlertTypes(
  tenantId: string,
  configuredNames: string[] = [],
): Promise<TenantAlertTypeRow[]> {
  // Aggregate all rows for the tenant — do not sample / truncate.
  const { rows } = await query<{
    bare_title: string;
    type: string;
    event_count: number | string;
    last_seen: string | null;
  }>(
    `SELECT
       TRIM(SUBSTRING_INDEX(title, ' · ', 1)) AS bare_title,
       LOWER(TRIM(type)) AS type,
       COUNT(*) AS event_count,
       MAX(occurred_at) AS last_seen
     FROM alerts
     WHERE tenant_id = $1
       AND title IS NOT NULL
       AND TRIM(title) <> ''
     GROUP BY TRIM(SUBSTRING_INDEX(title, ' · ', 1)), LOWER(TRIM(type))`,
    [tenantId],
  );

  const byKey = new Map<string, TenantAlertTypeRow & { _score: number }>();

  for (const row of rows) {
    const bare = bareAlertTitle(row.bare_title);
    const type = String(row.type || '').trim().toLowerCase() || 'fleet_event';
    const count = Number(row.event_count) || 0;
    if (!bare) continue;

    const fake: FleetAlert = {
      id: 'x',
      type,
      severity: 'info',
      title: bare,
      timestamp: new Date(row.last_seen || Date.now()),
      sourceType: 'wialon',
      acknowledged: false,
    };
    if (isNoiseAlert(fake)) continue;

    // One row per distinct Inbox event name (before · unit) — nothing collapsed.
    upsertType(byKey, {
      name: bare,
      type: type || classifyWialonAlertType(bare),
      eventCount: count,
      lastSeen: row.last_seen ? String(row.last_seen) : null,
    });
  }

  // 3) Configured rule names for this client that may not have fired yet
  for (const rawName of configuredNames) {
    const name = bareAlertTitle(rawName);
    if (!name) continue;
    const type = classifyWialonAlertType(name);
    const fake: FleetAlert = {
      id: 'x',
      type,
      severity: 'info',
      title: name,
      timestamp: new Date(),
      sourceType: 'wialon',
      acknowledged: false,
    };
    if (isNoiseAlert(fake)) continue;
    const key = normalizeAlertTypeKey(name);
    if (byKey.has(key)) continue;
    upsertType(byKey, {
      name,
      type,
      eventCount: 0,
      lastSeen: null,
    });
  }

  // 4) Workshop builtins — always available for ACL even before first event
  for (const builtin of WORKSHOP_BUILTIN_ALERT_TYPES) {
    upsertType(byKey, {
      name: builtin.name,
      type: builtin.type,
      eventCount: 0,
      lastSeen: null,
    });
  }

  const categoryOrder = new Map(CATEGORY_DEFS.map((c, i) => [c.id, i]));

  return [...byKey.values()]
    .map(({ _score: _s, ...row }) => row)
    .sort((a, b) => {
      const ao = categoryOrder.get(a.category) ?? 99;
      const bo = categoryOrder.get(b.category) ?? 99;
      if (ao !== bo) return ao - bo;
      if (b.eventCount !== a.eventCount) return b.eventCount - a.eventCount;
      return a.name.localeCompare(b.name);
    });
}
