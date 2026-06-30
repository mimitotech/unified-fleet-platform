import type { UnifiedAsset, SourceType } from '@ufp/shared';
import { query } from '../config/database.js';
import { createAdapter } from '../adapters/AdapterFactory.js';
import type { BaseAdapter } from '../adapters/BaseAdapter.js';
import { decryptCredentials } from '../utils/encryption.js';
import { deduplicateAssets } from '../utils/assetMatcher.js';
import { CacheService } from '../services/CacheService.js';

const STATUS_PRIORITY: SourceType[] = ['wialon', 'tracksolid', 'loconav'];

export class AssetOrchestrator {
  private tenantId: string;
  private adapters: Map<SourceType, BaseAdapter> = new Map();
  private cache: CacheService;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
    this.cache = new CacheService();
  }

  async initialize(): Promise<void> {
    const { rows } = await query<{ source_type: SourceType; credentials_encrypted: string; is_active: boolean }>(
      `SELECT source_type, credentials_encrypted, is_active FROM data_sources WHERE tenant_id = $1 AND is_active = true`,
      [this.tenantId]
    );
    for (const row of rows) {
      try {
        const creds = decryptCredentials(row.credentials_encrypted);
        const adapter = createAdapter(row.source_type, creds);
        await adapter.connect();
        this.adapters.set(row.source_type, adapter);
      } catch (err) {
        console.error(`Failed to init adapter ${row.source_type}:`, err);
      }
    }
  }

  async getUnifiedAssets(): Promise<UnifiedAsset[]> {
    const cacheKey = `assets:${this.tenantId}`;
    const cached = await this.cache.get<UnifiedAsset[]>(cacheKey);
    if (cached) return cached;

    const allAssets: Array<UnifiedAsset & { source: SourceType }> = [];
    for (const [sourceType, adapter] of this.adapters) {
      try {
        const assets = await adapter.getAssets();
        allAssets.push(
          ...assets.map((a) => ({
            ...a,
            tenantId: this.tenantId,
            sources: [{ type: sourceType, id: a.id }],
            source: sourceType,
          }))
        );
      } catch (err) {
        console.error(`getAssets failed for ${sourceType}:`, err);
      }
    }

    const merged = deduplicateAssets(allAssets);
    await this.persistMappings(merged);
    await this.cache.set(cacheKey, merged, 120);
    return merged;
  }

  private async persistMappings(assets: UnifiedAsset[]): Promise<void> {
    for (const asset of assets) {
      const { rows: existing } = await query<{ id: string }>(
        `SELECT id FROM assets WHERE tenant_id = $1 AND (
          ($2::text IS NOT NULL AND registration_plate = $2) OR
          ($3::text IS NOT NULL AND vin = $3) OR
          (name = $4 AND registration_plate IS NULL AND vin IS NULL)
        ) LIMIT 1`,
        [this.tenantId, asset.registrationPlate || null, asset.vin || null, asset.name]
      );

      let assetId = existing[0]?.id;
      if (!assetId) {
        const ins = await query<{ id: string }>(
          `INSERT INTO assets (tenant_id, name, registration_plate, vin, make, model, year)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [this.tenantId, asset.name, asset.registrationPlate, asset.vin, asset.make, asset.model, asset.year]
        );
        assetId = ins.rows[0].id;
      }

      for (const src of asset.sources) {
        await query(
          `INSERT INTO asset_mappings (asset_id, source_type, external_id)
           VALUES ($1, $2, $3) ON CONFLICT (asset_id, source_type) DO UPDATE SET external_id = $3`,
          [assetId, src.type, src.id]
        );
      }
    }
  }

  async getUnifiedStatus(assetId: string) {
    const cacheKey = `status:${this.tenantId}:${assetId}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const { rows: mappings } = await query<{ source_type: SourceType; external_id: string }>(
      `SELECT source_type, external_id FROM asset_mappings am
       JOIN assets a ON a.id = am.asset_id
       WHERE a.id = $1 AND a.tenant_id = $2`,
      [assetId, this.tenantId]
    );

    const statuses = [];
    for (const m of mappings) {
      const adapter = this.adapters.get(m.source_type);
      if (!adapter) continue;
      try {
        const status = await adapter.getAssetStatus(m.external_id);
        statuses.push({ source: m.source_type, ...status });
      } catch {
        /* skip */
      }
    }

    statuses.sort((a, b) => STATUS_PRIORITY.indexOf(a.source) - STATUS_PRIORITY.indexOf(b.source));
    const best = statuses[0] || null;
    if (best) await this.cache.set(cacheKey, best, 30);
    return best;
  }

  async getAllStatuses() {
    const assets = await this.getUnifiedAssets();
    const results = await Promise.all(
      assets.map(async (a) => {
        const { rows } = await query<{ id: string }>(
          `SELECT id FROM assets WHERE tenant_id = $1 AND name = $2 LIMIT 1`,
          [this.tenantId, a.name]
        );
        const dbId = rows[0]?.id;
        if (!dbId) return { assetId: a.id, status: null };
        const status = await this.getUnifiedStatus(dbId);
        return { assetId: dbId, asset: a, status };
      })
    );
    return results;
  }
}
