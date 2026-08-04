import { loadTenantWialonCreds, getTenantWialonRow } from '../services/tenantWialonCredentials.js';
import { isWialonTenantConnected } from '../services/wialonConnectionStatus.js';
import { WialonVideoService } from '../services/WialonVideoService.js';
import { query } from '../config/database.js';
import { decryptCredentials } from '../utils/encryption.js';
import { createAdapter } from '../adapters/AdapterFactory.js';
export class VideoOrchestrator {
    tenantId;
    constructor(tenantId) {
        this.tenantId = tenantId;
    }
    async listWialonStreams() {
        const row = await getTenantWialonRow(this.tenantId);
        if (!isWialonTenantConnected(row))
            return [];
        const creds = await loadTenantWialonCreds(this.tenantId);
        const units = await WialonVideoService.listVideoUnits(creds);
        const streams = [];
        for (const u of units) {
            const streamUrl = await WialonVideoService.getLiveStreamUrl(creds, u.id, u).catch(() => undefined);
            for (const cam of u.cameras) {
                streams.push({
                    id: `wialon-${u.id}-${cam.index}`,
                    assetId: String(u.id),
                    assetName: u.cameras.length > 1 ? `${u.name} · ${cam.name}` : u.name,
                    channel: cam.name,
                    status: u.connected && cam.active ? 'online' : 'offline',
                    sourceType: 'wialon',
                    streamUrl,
                });
            }
            if (!u.cameras.length) {
                streams.push({
                    id: `wialon-${u.id}`,
                    assetId: String(u.id),
                    assetName: u.name,
                    channel: 'Wialon video',
                    status: u.connected ? 'online' : 'offline',
                    sourceType: 'wialon',
                    streamUrl,
                });
            }
        }
        return streams;
    }
    async listExternalStreams() {
        const { rows: sources } = await query(`SELECT source_type, credentials_encrypted, connection_verified_at
       FROM data_sources
       WHERE tenant_id = $1 AND is_active = true
         AND source_type IN ('loconav', 'tracksolid')
         AND connection_verified_at IS NOT NULL`, [this.tenantId]);
        const streams = [];
        for (const src of sources) {
            try {
                const creds = decryptCredentials(src.credentials_encrypted);
                const adapter = createAdapter(src.source_type, creds);
                const fleetAssets = await adapter.getAssets();
                for (const a of fleetAssets) {
                    let streamUrl;
                    if (src.source_type === 'tracksolid' && 'getLiveStreamUrl' in adapter) {
                        streamUrl =
                            (await adapter.getLiveStreamUrl(a.id)) || undefined;
                    }
                    streams.push({
                        id: `${src.source_type}-${a.id}`,
                        assetId: a.id,
                        assetName: a.name,
                        channel: 'Live Feed',
                        status: streamUrl ? 'online' : 'offline',
                        sourceType: src.source_type,
                        streamUrl,
                    });
                }
            }
            catch {
                /* integration unavailable */
            }
        }
        return streams;
    }
    async listStreams() {
        const [wialon, external] = await Promise.all([
            this.listWialonStreams(),
            this.listExternalStreams(),
        ]);
        return [...wialon, ...external];
    }
}
