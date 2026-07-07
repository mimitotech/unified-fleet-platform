import type { VideoStream } from '@ufp/shared';
import { loadTenantWialonCreds, getTenantWialonRow } from '../services/tenantWialonCredentials.js';
import { isWialonTenantConnected } from '../services/wialonConnectionStatus.js';
import { WialonVideoService } from '../services/WialonVideoService.js';
import { query } from '../config/database.js';
import { decryptCredentials } from '../utils/encryption.js';
import { createAdapter } from '../adapters/AdapterFactory.js';
import type { SourceType } from '@ufp/shared';

export class VideoOrchestrator {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  private async listWialonStreams(): Promise<VideoStream[]> {
    const row = await getTenantWialonRow(this.tenantId);
    if (!isWialonTenantConnected(row)) return [];

    const creds = await loadTenantWialonCreds(this.tenantId);
    const units = await WialonVideoService.listVideoUnits(creds);
    const streams: VideoStream[] = [];

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

  private async listExternalStreams(): Promise<VideoStream[]> {
    const { rows: sources } = await query<{
      source_type: SourceType;
      credentials_encrypted: string;
      connection_verified_at: string | null;
    }>(
      `SELECT source_type, credentials_encrypted, connection_verified_at
       FROM data_sources
       WHERE tenant_id = $1 AND is_active = true
         AND source_type IN ('loconav', 'tracksolid')
         AND connection_verified_at IS NOT NULL`,
      [this.tenantId]
    );

    const streams: VideoStream[] = [];

    for (const src of sources) {
      try {
        const creds = decryptCredentials(src.credentials_encrypted);
        const adapter = createAdapter(src.source_type, creds);
        const fleetAssets = await adapter.getAssets();
        for (const a of fleetAssets) {
          let streamUrl: string | undefined;
          if (src.source_type === 'tracksolid' && 'getLiveStreamUrl' in adapter) {
            streamUrl =
              (await (
                adapter as import('../adapters/TrackSolidAdapter.js').TrackSolidAdapter
              ).getLiveStreamUrl(a.id)) || undefined;
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
      } catch {
        /* integration unavailable */
      }
    }

    return streams;
  }

  async listStreams(): Promise<VideoStream[]> {
    const [wialon, external] = await Promise.all([
      this.listWialonStreams(),
      this.listExternalStreams(),
    ]);
    return [...wialon, ...external];
  }
}
