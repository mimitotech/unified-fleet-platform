import { query } from '../config/database.js';
export class IntegrationCenterService {
    static async getCenterStatus(sourceType) {
        const { rows } = await query(`SELECT t.id AS tenant_id, t.name AS tenant_name, t.slug AS tenant_slug,
              ds.is_active, ds.connection_verified_at, ds.last_sync_at, ds.last_error,
              ds.wialon_resource_id,
              (SELECT COUNT(*)::int FROM asset_mappings am
                 WHERE am.tenant_id = t.id AND am.source_type = $1) AS asset_count,
              (SELECT COUNT(*)::int FROM alerts a
                 WHERE a.tenant_id = t.id AND a.source_type = $1
                   AND a.occurred_at >= NOW() - INTERVAL '24 hours') AS alerts_24h
       FROM data_sources ds
       INNER JOIN tenants t ON t.id = ds.tenant_id
       WHERE ds.source_type = $1 AND t.is_active = true
       ORDER BY t.name`, [sourceType]);
        const tenants = rows.map((r) => ({
            tenantId: r.tenant_id,
            tenantName: r.tenant_name,
            tenantSlug: r.tenant_slug,
            isActive: Boolean(r.is_active && r.connection_verified_at),
            verifiedAt: r.connection_verified_at,
            lastSyncAt: r.last_sync_at,
            lastError: r.last_error,
            assetCount: r.asset_count,
            alerts24h: r.alerts_24h,
        }));
        const connectedTenants = tenants.filter((t) => t.isActive).length;
        const totalAssets = tenants.reduce((s, t) => s + t.assetCount, 0);
        return {
            sourceType,
            configured: tenants.length > 0,
            connected: connectedTenants > 0,
            tenantCount: tenants.length,
            connectedTenants,
            totalAssets,
            tenants,
            webhookNote: sourceType === 'loconav'
                ? 'LocoNav camera and safety alerts are delivered via webhooks. Configure the webhook URL in each client integration.'
                : 'TrackSolid alarms sync on schedule and via webhooks when configured.',
        };
    }
}
