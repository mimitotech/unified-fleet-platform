import { query } from '../config/database.js';
import { decryptCredentials } from '../utils/encryption.js';
import { TrackSolidAdapter } from '../adapters/TrackSolidAdapter.js';
import { AssetOrchestrator } from '../orchestrators/AssetOrchestrator.js';
export class TrackSolidSyncService {
    static async syncTenant(tenantId) {
        const { rows: ds } = await query(`SELECT credentials_encrypted FROM data_sources WHERE tenant_id = $1 AND source_type = 'tracksolid' AND is_active = true`, [tenantId]);
        if (!ds[0]) {
            const orch = new AssetOrchestrator(tenantId);
            await orch.initialize();
            const assets = await orch.getUnifiedAssets();
            return { vehicles: assets.length, geofences: 0, alerts: 0 };
        }
        const creds = decryptCredentials(ds[0].credentials_encrypted);
        const adapter = new TrackSolidAdapter(creds);
        await adapter.connect();
        const orch = new AssetOrchestrator(tenantId);
        await orch.initialize();
        const assets = await orch.getUnifiedAssets();
        let geofencesSynced = 0;
        try {
            const fences = await adapter.getGeofences();
            for (const f of fences) {
                const name = String(f.fence_name || f.fence_id || 'Geofence');
                const coords = String(f.coordinates || '');
                const fenceType = f.fence_type === 'circle' ? 'circle' : 'polygon';
                const { rows: existing } = await query(`SELECT id FROM geofences WHERE tenant_id = $1 AND name = $2 AND deleted_at IS NULL LIMIT 1`, [tenantId, name]);
                const geometry = JSON.stringify({ type: fenceType, coordinates: coords, sourceId: f.fence_id });
                if (existing[0]) {
                    await query(`UPDATE geofences SET geometry = $2, updated_at = NOW() WHERE id = $1`, [existing[0].id, geometry]);
                }
                else {
                    await query(`INSERT INTO geofences (tenant_id, name, type, geometry, color, is_active)
             VALUES ($1, $2, $3, $4, $5, true)`, [tenantId, name, fenceType, geometry, String(f.fence_color || '#004225')]);
                }
                geofencesSynced++;
            }
        }
        catch { /* geofences optional */ }
        let alertsSynced = 0;
        try {
            const from = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const to = new Date();
            const alerts = await adapter.getAlerts(from, to);
            for (const alert of alerts) {
                const { rows: existing } = await query(`SELECT id FROM alerts WHERE tenant_id = $1 AND source_type = 'tracksolid' AND external_id = $2 LIMIT 1`, [tenantId, alert.externalId]);
                if (existing[0])
                    continue;
                await query(`INSERT INTO alerts (tenant_id, source_type, external_id, type, severity, title, description,
           latitude, longitude, occurred_at, acknowledged)
           VALUES ($1, 'tracksolid', $2, $3, $4, $5, $6, $7, $8, $9, false)`, [
                    tenantId,
                    alert.externalId,
                    alert.type,
                    alert.severity,
                    alert.title,
                    alert.description || null,
                    alert.latitude ?? null,
                    alert.longitude ?? null,
                    alert.timestamp,
                ]);
                alertsSynced++;
            }
        }
        catch { /* alerts optional */ }
        return { vehicles: assets.length, geofences: geofencesSynced, alerts: alertsSynced };
    }
}
