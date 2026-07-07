import type { UnifiedAsset, SourceType, AssetStatus } from '@ufp/shared';
import { query } from '../config/database.js';
import { createAdapter } from '../adapters/AdapterFactory.js';
import type { BaseAdapter } from '../adapters/BaseAdapter.js';
import { TrackSolidAdapter } from '../adapters/TrackSolidAdapter.js';
import { WialonAdapter } from '../adapters/WialonAdapter.js';
import { resolveSourceCredentials } from '../services/integrationCredentials.js';
import { deduplicateAssets } from '../utils/assetMatcher.js';
import { CacheService } from '../services/CacheService.js';
import { WialonFleetService } from '../services/WialonFleetService.js';
import { logger } from '../config/logger.js';
import { coerceMetricNumber } from '../utils/telematicsMetrics.js';

const STATUS_PRIORITY: SourceType[] = ['wialon', 'tracksolid', 'loconav'];
const CACHE_ASSETS_TTL = 30;
const CACHE_STATUS_TTL = 5;
const CACHE_ALL_STATUSES_TTL = 8;

type StatusItem = { assetId: string; asset: UnifiedAsset; status: AssetStatus | null };

const backgroundRefresh = new Map<string, Promise<void>>();

export class AssetOrchestrator {
  private tenantId: string;
  private adapters: Map<SourceType, BaseAdapter> = new Map();
  private cache: CacheService;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
    this.cache = new CacheService();
  }

  static async invalidateTenantCache(tenantId: string): Promise<void> {
    WialonFleetService.invalidateCache(tenantId);
    await new CacheService().invalidateTenant(tenantId);
  }

  async initialize(): Promise<void> {
    const { rows } = await query<{ source_type: SourceType; credentials_encrypted: string; is_active: boolean }>(
      `SELECT source_type, credentials_encrypted, is_active FROM data_sources WHERE tenant_id = $1 AND is_active = true`,
      [this.tenantId]
    );
    for (const row of rows) {
      try {
        const creds = await resolveSourceCredentials(
          this.tenantId,
          row.source_type,
          row.credentials_encrypted
        );
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
    if (cached && cached.length > 0) return cached;

    await this.initialize();

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

    let merged = deduplicateAssets(allAssets);
    if (merged.length > 0) {
      await this.persistMappings(merged);
      await this.cache.set(cacheKey, merged, CACHE_ASSETS_TTL);
      return merged;
    }

    const fromDb = await this.getUnifiedAssetsFromDb();
    if (fromDb.length > 0) {
      await this.cache.set(cacheKey, fromDb, CACHE_ASSETS_TTL);
    }
    return fromDb;
  }

  /** Fleet synced to Postgres (Wialon Center link + sync) — used when live adapters are unavailable. */
  private async getUnifiedAssetsFromDb(): Promise<UnifiedAsset[]> {
    const { rows } = await query<{
      id: string;
      name: string;
      registration_plate: string | null;
      vin: string | null;
      make: string | null;
      model: string | null;
      year: number | null;
      source_type: SourceType;
      external_id: string;
    }>(
      `SELECT a.id, a.name, a.registration_plate, a.vin, a.make, a.model, a.year,
              am.source_type, am.external_id
       FROM assets a
       JOIN asset_mappings am ON am.asset_id = a.id
       WHERE a.tenant_id = $1
       ORDER BY a.name`,
      [this.tenantId]
    );

    const byAsset = new Map<string, UnifiedAsset>();
    for (const row of rows) {
      if (!byAsset.has(row.id)) {
        byAsset.set(row.id, {
          id: row.id,
          name: row.name,
          registrationPlate: row.registration_plate || undefined,
          vin: row.vin || undefined,
          make: row.make || undefined,
          model: row.model || undefined,
          year: row.year || undefined,
          tenantId: this.tenantId,
          sources: [],
        });
      }
      byAsset.get(row.id)!.sources.push({ type: row.source_type, id: row.external_id });
    }
    return [...byAsset.values()];
  }

  private async persistMappings(assets: UnifiedAsset[]): Promise<void> {
    for (const asset of assets) {
      let assetId: string | undefined;

      for (const src of asset.sources) {
        const { rows: byMapping } = await query<{ asset_id: string }>(
          `SELECT am.asset_id FROM asset_mappings am
           JOIN assets a ON a.id = am.asset_id
           WHERE a.tenant_id = $1 AND am.source_type = $2 AND am.external_id = $3
           LIMIT 1`,
          [this.tenantId, src.type, src.id]
        );
        if (byMapping[0]) {
          assetId = byMapping[0].asset_id;
          break;
        }
      }

      if (!assetId && (asset.vin || asset.registrationPlate)) {
        const { rows: byIdentity } = await query<{ id: string }>(
          `SELECT id FROM assets WHERE tenant_id = $1 AND (
            ($2::text IS NOT NULL AND vin = $2) OR
            ($3::text IS NOT NULL AND registration_plate = $3)
          ) LIMIT 1`,
          [this.tenantId, asset.vin || null, asset.registrationPlate || null]
        );
        assetId = byIdentity[0]?.id;
      }

      if (!assetId) {
        const ins = await query<{ id: string }>(
          `INSERT INTO assets (tenant_id, name, registration_plate, vin, make, model, year)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [this.tenantId, asset.name, asset.registrationPlate, asset.vin, asset.make, asset.model, asset.year]
        );
        assetId = ins.rows[0].id;
      } else {
        await query(
          `UPDATE assets SET name = $2, registration_plate = COALESCE($3, registration_plate),
           vin = COALESCE($4, vin), make = COALESCE($5, make), model = COALESCE($6, model),
           year = COALESCE($7, year), updated_at = NOW() WHERE id = $1`,
          [assetId, asset.name, asset.registrationPlate, asset.vin, asset.make, asset.model, asset.year]
        );
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

    const status = await this.fetchStatusForAsset(assetId);
    if (status) await this.cache.set(cacheKey, status, CACHE_STATUS_TTL);
    return status;
  }

  private async fetchStatusForAsset(assetId: string) {
    const { rows: mappings } = await query<{ source_type: SourceType; external_id: string }>(
      `SELECT source_type, external_id FROM asset_mappings am
       JOIN assets a ON a.id = am.asset_id
       WHERE a.id = $1 AND a.tenant_id = $2`,
      [assetId, this.tenantId]
    );

    const statuses: Array<{ source: SourceType } & AssetStatus> = [];
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
    return statuses[0] || null;
  }

  async getAllStatuses() {
    const cacheKey = `statuses:all:${this.tenantId}`;
    const cached = await this.cache.get<StatusItem[]>(cacheKey);
    if (cached && cached.length > 0) {
      return { items: cached, fetchedAt: new Date().toISOString(), stale: false };
    }

    const stored = await this.getStoredStatusesFromDb();
    if (stored.length > 0) {
      this.scheduleBackgroundRefresh(cacheKey);
      const latest = stored.reduce((max, row) => {
        const t = row.status?.location?.timestamp;
        if (!t) return max;
        const ms = t instanceof Date ? t.getTime() : new Date(t).getTime();
        return ms > max ? ms : max;
      }, 0);
      return {
        items: stored,
        fetchedAt: latest ? new Date(latest).toISOString() : new Date().toISOString(),
        stale: true,
      };
    }

    const results = await this.fetchAllStatusesFromAdapters();
    const withGps = results.filter((r) => r.status?.location?.latitude);
    if (withGps.length > 0) {
      await this.persistStatusesToDb(withGps);
      await this.cache.set(cacheKey, withGps, CACHE_ALL_STATUSES_TTL);
      return { items: withGps, fetchedAt: new Date().toISOString(), stale: false };
    }
    return { items: results, fetchedAt: new Date().toISOString(), stale: false };
  }

  private scheduleBackgroundRefresh(cacheKey: string): void {
    if (backgroundRefresh.has(this.tenantId)) return;

    const job = (async () => {
      try {
        const results = await this.fetchAllStatusesFromAdapters();
        await this.persistStatusesToDb(results);
        await this.cache.set(cacheKey, results, CACHE_ALL_STATUSES_TTL);
      } catch (err) {
        logger.error(`Background status refresh failed for tenant ${this.tenantId}`, err);
      } finally {
        backgroundRefresh.delete(this.tenantId);
      }
    })();

    backgroundRefresh.set(this.tenantId, job);
  }

  private async getStoredStatusesFromDb(): Promise<StatusItem[]> {
    const { rows } = await query<{
      asset_id: string;
      name: string;
      registration_plate: string | null;
      status: string;
      latitude: number;
      longitude: number;
      speed: number | null;
      fuel_level: number | null;
      engine_on: boolean | null;
      recorded_at: Date;
      source_type: SourceType;
    }>(
      `SELECT a.id as asset_id, a.name, a.registration_plate,
              ast.status, ast.latitude, ast.longitude, ast.speed, ast.fuel_level,
              ast.engine_on, ast.recorded_at, ast.source_type
       FROM assets a
       JOIN asset_status ast ON ast.asset_id = a.id
       WHERE a.tenant_id = $1
         AND ast.latitude IS NOT NULL AND ast.longitude IS NOT NULL
         AND NOT (ast.latitude = 0 AND ast.longitude = 0)
       ORDER BY a.name`,
      [this.tenantId]
    );

    const byAsset = new Map<string, StatusItem & { _priority: number }>();

    for (const row of rows) {
      const priority = STATUS_PRIORITY.indexOf(row.source_type);
      const existing = byAsset.get(row.asset_id);
      if (existing && existing._priority <= priority) continue;

      const asset: UnifiedAsset = {
        id: row.asset_id,
        name: row.name,
        registrationPlate: row.registration_plate || undefined,
        sources: [{ type: row.source_type, id: '' }],
      };

      const status: AssetStatus = {
        status: row.status as AssetStatus['status'],
        location: {
          latitude: row.latitude,
          longitude: row.longitude,
          speed: row.speed ?? undefined,
          timestamp: row.recorded_at,
        },
        fuelLevel: row.fuel_level ?? undefined,
        engineState: row.engine_on ?? undefined,
        source: row.source_type,
      };

      byAsset.set(row.asset_id, {
        assetId: row.asset_id,
        asset,
        status,
        _priority: priority >= 0 ? priority : 99,
      });
    }

    return [...byAsset.values()].map(({ assetId, asset, status }) => ({ assetId, asset, status }));
  }

  private async persistStatusesToDb(items: StatusItem[]): Promise<void> {
    for (const item of items) {
      const st = item.status;
      const loc = st?.location;
      if (!st || !loc?.latitude || !loc?.longitude) continue;
      if (loc.latitude === 0 && loc.longitude === 0) continue;

      const source = (st.source || item.asset.sources[0]?.type) as SourceType | undefined;
      if (!source) continue;

      await query(
        `INSERT INTO asset_status (asset_id, source_type, status, latitude, longitude, speed, fuel_level, engine_on, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (asset_id, source_type) DO UPDATE SET
           status = EXCLUDED.status,
           latitude = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude,
           speed = EXCLUDED.speed,
           fuel_level = EXCLUDED.fuel_level,
           engine_on = EXCLUDED.engine_on,
           recorded_at = NOW()`,
        [
          item.assetId,
          source,
          st.status,
          loc.latitude,
          loc.longitude,
          coerceMetricNumber(loc.speed),
          coerceMetricNumber(st.fuelLevel),
          st.engineState ?? null,
        ]
      );
    }
  }

  private async fetchAllStatusesFromAdapters(): Promise<StatusItem[]> {
    await this.initialize();

    const { rows: assetRows } = await query<{
      asset_id: string;
      name: string;
      registration_plate: string | null;
      source_type: SourceType;
      external_id: string;
    }>(
      `SELECT a.id as asset_id, a.name, a.registration_plate,
              am.source_type, am.external_id
       FROM assets a
       JOIN asset_mappings am ON am.asset_id = a.id
       WHERE a.tenant_id = $1`,
      [this.tenantId]
    );

    const byAsset = new Map<string, {
      assetId: string;
      name: string;
      registrationPlate?: string;
      mappings: Array<{ source_type: SourceType; external_id: string }>;
    }>();

    for (const row of assetRows) {
      if (!byAsset.has(row.asset_id)) {
        byAsset.set(row.asset_id, {
          assetId: row.asset_id,
          name: row.name,
          registrationPlate: row.registration_plate || undefined,
          mappings: [],
        });
      }
      byAsset.get(row.asset_id)!.mappings.push({
        source_type: row.source_type,
        external_id: row.external_id,
      });
    }

    const dbStored = await this.getStoredStatusesFromDb();
    const dbStatusByAsset = new Map(dbStored.map((s) => [s.assetId, s.status]));

    const wialonAdapter = this.adapters.get('wialon') as WialonAdapter | undefined;
    const wialonIds = assetRows.filter((r) => r.source_type === 'wialon').map((r) => r.external_id);
    const wialonBulk = wialonAdapter ? await wialonAdapter.getBulkAssetStatus([...new Set(wialonIds)]) : new Map();

    const tracksolidAdapter = this.adapters.get('tracksolid') as TrackSolidAdapter | undefined;
    const tsBulk = new Map<string, AssetStatus>();
    if (tracksolidAdapter) {
      try {
        const locations = await tracksolidAdapter.getAllDeviceLocations();
        for (const loc of locations) {
          const speed = parseFloat(loc.speed || '0') || 0;
          const online = loc.status === '1';
          const engineOn = loc.accStatus === '1' || loc.accStatus === 'ON';
          tsBulk.set(loc.imei, {
            status: !online ? 'offline' : speed > 0 ? 'moving' : engineOn ? 'idle' : 'stopped',
            location: {
              latitude: loc.lat || 0,
              longitude: loc.lng || 0,
              speed,
              timestamp: new Date(loc.gpsTime || loc.hbTime || Date.now()),
            },
            engineState: engineOn,
            fuelLevel: loc.trackerOil ? parseFloat(loc.trackerOil) : undefined,
            source: 'tracksolid',
          });
        }
      } catch { /* fallback per-asset */ }
    }

    const results = await Promise.all(
      [...byAsset.values()].map(async (entry) => {
        const statuses: Array<{ source: SourceType } & AssetStatus> = [];

        for (const m of entry.mappings) {
          if (m.source_type === 'wialon' && wialonBulk.has(m.external_id)) {
            statuses.push({ source: 'wialon', ...wialonBulk.get(m.external_id)! });
            continue;
          }
          if (m.source_type === 'tracksolid' && tsBulk.has(m.external_id)) {
            statuses.push({ source: 'tracksolid', ...tsBulk.get(m.external_id)! });
            continue;
          }
          const adapter = this.adapters.get(m.source_type);
          if (!adapter) continue;
          try {
            const st = await adapter.getAssetStatus(m.external_id);
            statuses.push({ source: m.source_type, ...st });
          } catch { /* skip */ }
        }

        statuses.sort((a, b) => STATUS_PRIORITY.indexOf(a.source) - STATUS_PRIORITY.indexOf(b.source));
        const best = statuses[0] || dbStatusByAsset.get(entry.assetId) || null;

        const asset: UnifiedAsset = {
          id: entry.assetId,
          name: entry.name,
          registrationPlate: entry.registrationPlate,
          sources: entry.mappings.map((m) => ({ type: m.source_type, id: m.external_id })),
        };

        return { assetId: entry.assetId, asset, status: best };
      })
    );

    return results;
  }
}
