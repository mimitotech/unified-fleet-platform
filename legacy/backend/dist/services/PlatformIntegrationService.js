import { query } from '../config/database.js';
import { decryptCredentials, encryptCredentials } from '../utils/encryption.js';
import { WialonHierarchyService } from './WialonHierarchyService.js';
import { WialonMotherAccountService } from './WialonMotherAccountService.js';
export class PlatformIntegrationService {
    static async getStatus(sourceType) {
        const { rows } = await query(`SELECT source_type, is_active, connection_verified_at, last_error, session_meta
       FROM platform_integrations WHERE source_type = $1`, [sourceType]);
        const row = rows[0];
        if (!row) {
            return { configured: false, connected: false, verifiedAt: null, lastError: null, meta: null };
        }
        return {
            configured: true,
            connected: Boolean(row.is_active && row.connection_verified_at && !row.last_error),
            verifiedAt: row.connection_verified_at,
            lastError: row.last_error,
            meta: row.session_meta,
        };
    }
    static async loadWialonCreds(motherId) {
        const resolved = await WialonMotherAccountService.resolveMotherCreds(motherId);
        return resolved.creds;
    }
    /** @deprecated Prefer WialonMotherAccountService — kept for legacy save path */
    static async loadWialonCredsLegacy() {
        const { rows } = await query(`SELECT credentials_encrypted FROM platform_integrations
       WHERE source_type = 'wialon' AND is_active = true`, []);
        if (!rows[0])
            throw new Error('Wialon Center is not configured. Add the mother account token in Admin → Wialon Center.');
        const stored = decryptCredentials(rows[0].credentials_encrypted);
        const token = String(stored.token || '').trim();
        if (!token)
            throw new Error('Wialon Center token is missing. Re-save the mother account in Wialon Center.');
        const creds = { token };
        if (stored.baseUrl)
            creds.baseUrl = String(stored.baseUrl).trim();
        return creds;
    }
    static async isWialonConfigured() {
        const mothers = await WialonMotherAccountService.list();
        if (mothers.some((m) => m.isActive))
            return true;
        const { rows } = await query(`SELECT COUNT(*)::int AS n FROM platform_integrations WHERE source_type = 'wialon' AND is_active = true`, []);
        return (rows[0]?.n || 0) > 0;
    }
    static async saveWialon(credentials) {
        const name = String(credentials.name || credentials.label || 'Primary mother account').trim();
        const created = await WialonMotherAccountService.create({
            name,
            token: String(credentials.token || ''),
            baseUrl: credentials.baseUrl ? String(credentials.baseUrl) : undefined,
        });
        const meta = created.meta;
        const counts = (meta.counts || {});
        // Keep legacy platform_integrations row in sync for older code paths
        const token = String(credentials.token || '').trim();
        const encrypted = encryptCredentials({
            token,
            baseUrl: credentials.baseUrl ? String(credentials.baseUrl).trim() : undefined,
        });
        await query(`INSERT INTO platform_integrations (source_type, credentials_encrypted, is_active, connection_verified_at, last_error, session_meta, updated_at)
       VALUES ('wialon', $1, true, NOW(), NULL, $2::jsonb, NOW())
       ON CONFLICT (source_type) DO UPDATE SET
         credentials_encrypted = EXCLUDED.credentials_encrypted,
         is_active = true,
         connection_verified_at = NOW(),
         last_error = NULL,
         session_meta = EXCLUDED.session_meta,
         updated_at = NOW()`, [encrypted, JSON.stringify(meta)]);
        return { meta, counts, accountTier: created.accountTier || 'mother', motherAccountId: created.id };
    }
    /** @deprecated use saveWialon which creates a mother account row */
    static async saveWialonLegacy(credentials) {
        const token = String(credentials.token || '').trim();
        if (!token)
            throw new Error('Wialon token is required');
        const creds = { token };
        if (credentials.baseUrl)
            creds.baseUrl = String(credentials.baseUrl).trim();
        const probe = await WialonHierarchyService.probe(creds);
        const meta = {
            ...WialonHierarchyService.buildSessionMeta(probe),
            baseUrl: creds.baseUrl || 'https://hst-api.wialon.com/wialon/ajax.html',
            configuredAt: new Date().toISOString(),
        };
        const encrypted = encryptCredentials({
            token,
            baseUrl: creds.baseUrl,
        });
        await query(`INSERT INTO platform_integrations (source_type, credentials_encrypted, is_active, connection_verified_at, last_error, session_meta, updated_at)
       VALUES ('wialon', $1, true, NOW(), NULL, $2::jsonb, NOW())
       ON CONFLICT (source_type) DO UPDATE SET
         credentials_encrypted = EXCLUDED.credentials_encrypted,
         is_active = true,
         connection_verified_at = NOW(),
         last_error = NULL,
         session_meta = EXCLUDED.session_meta,
         updated_at = NOW()`, [encrypted, JSON.stringify(meta)]);
        return { meta, counts: probe.counts, accountTier: probe.accountTier };
    }
    static async getWialonAccountAssignments() {
        const { rows } = await query(`SELECT ds.wialon_resource_id, t.id AS tenant_id, t.name AS tenant_name, t.slug AS tenant_slug
       FROM data_sources ds
       INNER JOIN tenants t ON t.id = ds.tenant_id
       WHERE ds.source_type = 'wialon' AND ds.is_active = true AND ds.wialon_resource_id IS NOT NULL`);
        const map = new Map();
        for (const r of rows) {
            map.set(Number(r.wialon_resource_id), {
                tenantId: r.tenant_id,
                tenantName: r.tenant_name,
                tenantSlug: r.tenant_slug,
            });
        }
        return map;
    }
    static async assertAccountAvailable(accountId, exceptTenantId) {
        const { rows } = await query(`SELECT ds.tenant_id, t.name AS tenant_name
       FROM data_sources ds
       INNER JOIN tenants t ON t.id = ds.tenant_id
       WHERE ds.source_type = 'wialon' AND ds.is_active = true
         AND ds.wialon_resource_id = $1
         AND ($2::uuid IS NULL OR ds.tenant_id <> $2::uuid)
       LIMIT 1`, [accountId, exceptTenantId || null]);
        if (rows[0]) {
            throw new Error(`Wialon account ${accountId} is already linked to tenant "${rows[0].tenant_name}"`);
        }
    }
}
