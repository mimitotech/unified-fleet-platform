import type { VideoStream } from '@ufp/shared';
import { query } from '../config/database.js';
import { decryptCredentials } from '../utils/encryption.js';
import { createAdapter } from '../adapters/AdapterFactory.js';
import type { SourceType } from '@ufp/shared';

export class VideoOrchestrator {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  async listStreams(): Promise<VideoStream[]> {
    const streams: VideoStream[] = [];

    const { rows: assets } = await query<{ id: string; name: string }>(
      `SELECT id, name FROM assets WHERE tenant_id = $1 ORDER BY name`,
      [this.tenantId]
    );

    for (const asset of assets) {
      streams.push({
        id: `${asset.id}-front`,
        assetId: asset.id,
        assetName: asset.name,
        channel: 'Front Camera',
        status: 'offline',
        sourceType: 'system',
      });
      streams.push({
        id: `${asset.id}-cab`,
        assetId: asset.id,
        assetName: asset.name,
        channel: 'Cabin Camera',
        status: 'offline',
        sourceType: 'system',
      });
    }

    const { rows: sources } = await query<{ source_type: SourceType; credentials_encrypted: string }>(
      `SELECT source_type, credentials_encrypted FROM data_sources
       WHERE tenant_id = $1 AND is_active = true AND source_type IN ('loconav', 'tracksolid')`,
      [this.tenantId]
    );

    for (const src of sources) {
      try {
        const creds = decryptCredentials(src.credentials_encrypted);
        const adapter = createAdapter(src.source_type, creds);
        const fleetAssets = await adapter.getAssets();
        for (const a of fleetAssets.slice(0, 20)) {
          const existing = streams.find((s) => s.assetName === a.name);
          if (existing) {
            existing.status = 'online';
            existing.sourceType = src.source_type;
          } else {
            streams.push({
              id: `${src.source_type}-${a.id}`,
              assetId: a.id,
              assetName: a.name,
              channel: 'Live Feed',
              status: 'online',
              sourceType: src.source_type,
            });
          }
        }
      } catch {
        // Integration unavailable — keep offline placeholders
      }
    }

    return streams;
  }
}
