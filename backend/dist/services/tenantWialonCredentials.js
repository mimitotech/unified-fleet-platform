import { query } from '../config/database.js';
import { decryptCredentials } from '../utils/encryption.js';
import { PlatformIntegrationService } from './PlatformIntegrationService.js';
import { WialonMotherAccountService } from './WialonMotherAccountService.js';
export function parseWialonCredsFromBody(body) {
    const token = String(body.token || '').trim();
    if (!token)
        throw new Error('Wialon token is required');
    const creds = { token };
    if (body.baseUrl)
        creds.baseUrl = String(body.baseUrl).trim();
    if (body.operateAs !== undefined && body.operateAs !== '') {
        const raw = body.operateAs;
        creds.operateAs = typeof raw === 'number' ? raw : String(raw).trim();
    }
    if (body.accountId !== undefined && body.accountId !== '') {
        const raw = body.accountId;
        creds.accountId = typeof raw === 'number' ? raw : String(raw).trim();
    }
    return creds;
}
function resolveAccountId(stored, wialonResourceId) {
    if (stored.accountId !== undefined && stored.accountId !== '' && stored.accountId !== null) {
        return stored.accountId;
    }
    if (wialonResourceId != null)
        return wialonResourceId;
    return undefined;
}
/**
 * Resolve Wialon API credentials for a tenant.
 * Uses the tenant's chosen mother account token + scoped billing accountId.
 */
export async function loadTenantWialonCreds(tenantId) {
    const { rows } = await query(`SELECT credentials_encrypted, wialon_resource_id, wialon_mother_account_id, inherits_platform_credentials, is_active
     FROM data_sources WHERE tenant_id = $1 AND source_type = 'wialon'`, [tenantId]);
    if (!rows[0]) {
        throw new Error('Wialon integration not configured for this tenant');
    }
    let stored = {};
    try {
        stored = decryptCredentials(rows[0].credentials_encrypted);
    }
    catch {
        /* tenant blob may be legacy/corrupt — platform center still applies */
    }
    const accountId = resolveAccountId(stored, rows[0].wialon_resource_id);
    const operateAs = stored.operateAs !== undefined && stored.operateAs !== '' && stored.operateAs !== null
        ? stored.operateAs
        : undefined;
    if (rows[0].inherits_platform_credentials || await PlatformIntegrationService.isWialonConfigured()) {
        const motherId = rows[0].wialon_mother_account_id || (await WialonMotherAccountService.getDefaultId());
        const platform = motherId
            ? await WialonMotherAccountService.loadCreds(motherId)
            : await PlatformIntegrationService.loadWialonCreds();
        return {
            ...platform,
            accountId: accountId !== undefined ? accountId : platform.accountId,
            operateAs,
        };
    }
    if (!String(stored.token || '').trim()) {
        throw new Error('Wialon is not configured. Add a mother account in Admin → Wialon Center and link this tenant.');
    }
    const creds = parseWialonCredsFromBody(stored);
    if (!creds.accountId && rows[0].wialon_resource_id) {
        creds.accountId = rows[0].wialon_resource_id;
    }
    return creds;
}
export async function getTenantWialonRow(tenantId) {
    const { rows } = await query(`SELECT wialon_resource_id, wialon_operate_as, wialon_account_name, wialon_mother_account_id,
            wialon_session_meta, connection_verified_at, last_sync_at, last_error,
            preview_asset_count, is_active, inherits_platform_credentials
     FROM data_sources WHERE tenant_id = $1 AND source_type = 'wialon'`, [tenantId]);
    return rows[0] || null;
}
export async function getTenantMotherAccountId(tenantId) {
    const row = await getTenantWialonRow(tenantId);
    return row?.wialon_mother_account_id || (await WialonMotherAccountService.getDefaultId());
}
