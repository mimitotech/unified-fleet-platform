import type { TenantWialonRow } from './tenantWialonCredentials.js';

/**
 * Wialon is "connected" when the tenant account is linked and verified.
 * Sync warnings live in `last_error` / session meta — they must not block live fleet/map.
 */
export function isWialonTenantConnected(row: Pick<
  TenantWialonRow,
  'is_active' | 'connection_verified_at' | 'wialon_resource_id'
> | null | undefined): boolean {
  return Boolean(row?.is_active && row.connection_verified_at && row.wialon_resource_id);
}

/** Non-fatal sync/link warnings (shown in UI, do not affect connected). */
export function wialonSyncWarning(row: Pick<TenantWialonRow, 'last_error' | 'wialon_session_meta'> | null): string | null {
  if (!row) return null;
  const meta = (row.wialon_session_meta || {}) as { syncWarning?: string };
  return meta.syncWarning || row.last_error || null;
}
