import { query } from '../config/database.js';
import { classifyWialonAlertType } from './wialonAlertClassify.js';
import type { FleetAlert } from '@ufp/shared';

export type AllowedAlertType = {
  /** Stable key: `${resourceId}:${notificationId}` */
  key: string;
  /** Exact Wialon notification rule name */
  name: string;
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

export function normalizeAlertTypeName(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/\s*·\s*[^·]+$/u, '')
    .replace(/[!?.]+$/g, '')
    .replace(/\s+/g, ' ')
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
    const key = String(row.key ?? '').trim() || (name ? `name:${normalizeAlertTypeName(name)}` : '');
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

/** Generic classify results that would over-match if used alone. */
const WEAK_TYPES = new Set(['fleet_event', 'sensor', 'connection', 'maintenance']);

export function alertMatchesAllowedTypes(
  alert: FleetAlert,
  allowed: AllowedAlertType[],
): boolean {
  if (!allowed.length) return false;

  const bareTitle = normalizeAlertTypeName(alert.title || '');
  const desc = normalizeAlertTypeName(alert.description || '');

  for (const entry of allowed) {
    const name = normalizeAlertTypeName(entry.name);
    if (!name) continue;
    if (bareTitle === name || bareTitle.startsWith(name) || name.startsWith(bareTitle)) {
      return true;
    }
    if (bareTitle.includes(name) || desc.includes(name)) return true;

    const classified = classifyWialonAlertType(entry.name);
    if (!WEAK_TYPES.has(classified) && classified === alert.type) return true;
  }
  return false;
}

export function filterAlertsForUser(
  alerts: FleetAlert[],
  opts: { role?: string | null; allowed: AllowedAlertType[] | null },
): FleetAlert[] {
  if (roleBypassesAlertAcl(opts.role)) return alerts;
  // Strict: non-admins see nothing until an admin enables specific types.
  if (!opts.allowed?.length) return [];
  return alerts.filter((a) => alertMatchesAllowedTypes(a, opts.allowed!));
}

export function filterNotificationRowsForUser<T extends { resourceId: number; id: number; name: string }>(
  rows: T[],
  opts: { role?: string | null; allowed: AllowedAlertType[] | null },
): T[] {
  if (roleBypassesAlertAcl(opts.role)) return rows;
  if (!opts.allowed?.length) return [];
  const keys = new Set(opts.allowed.map((a) => a.key));
  const names = new Set(opts.allowed.map((a) => normalizeAlertTypeName(a.name)));
  return rows.filter((r) => {
    const key = `${r.resourceId}:${r.id}`;
    if (keys.has(key)) return true;
    return names.has(normalizeAlertTypeName(r.name));
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
