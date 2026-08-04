/**
 * Wialon is "connected" when the tenant account is linked and verified.
 * Sync warnings live in `last_error` / session meta — they must not block live fleet/map.
 */
export function isWialonTenantConnected(row) {
    return Boolean(row?.is_active && row.connection_verified_at && row.wialon_resource_id);
}
/** Non-fatal sync/link warnings (shown in UI, do not affect connected). */
export function wialonSyncWarning(row) {
    if (!row)
        return null;
    const meta = (row.wialon_session_meta || {});
    return meta.syncWarning || row.last_error || null;
}
