import { CacheService } from './CacheService.js';
import { loadTenantWialonCreds, getTenantWialonRow } from './tenantWialonCredentials.js';
import { isWialonTenantConnected } from './wialonConnectionStatus.js';
import { WialonLiveService } from './WialonLiveService.js';
import type { WialonUnitSlice } from './wialonUnitMapper.js';

export type WialonFleetUnit = WialonUnitSlice & {
  fuelLevel?: number;
};

export type WialonFleetSnapshot = {
  units: WialonFleetUnit[];
  counts: {
    total: number;
    moving: number;
    idle: number;
    stopped: number;
    offline: number;
    withPosition: number;
    byHwName: Record<string, number>;
  };
  fetchedAt: string;
  accountId?: number;
  accountName?: string;
};

const FLEET_CACHE_TTL_MS = 2_500;
const FLEET_REDIS_TTL_SEC = 5;

const memoryCache = new Map<string, { data: WialonFleetSnapshot; expires: number }>();
const inflight = new Map<string, Promise<WialonFleetSnapshot>>();

export class WialonFleetService {
  static async isLiveAvailable(tenantId: string): Promise<boolean> {
    const row = await getTenantWialonRow(tenantId);
    return isWialonTenantConnected(row);
  }

  /** Cached live fleet — dedupes parallel requests and short-TTL Redis/memory cache. */
  static async getCachedLiveFleet(tenantId: string, limit = 10_000): Promise<WialonFleetSnapshot> {
    const now = Date.now();
    const mem = memoryCache.get(tenantId);
    if (mem && mem.expires > now) return mem.data;

    const cache = new CacheService();
    const redisKey = `fleet:snapshot:${tenantId}`;
    const cached = await cache.get<WialonFleetSnapshot>(redisKey);
    if (cached) {
      memoryCache.set(tenantId, { data: cached, expires: now + FLEET_CACHE_TTL_MS });
      return cached;
    }

    let pending = inflight.get(tenantId);
    if (!pending) {
      pending = this.fetchLiveFleet(tenantId, limit).finally(() => inflight.delete(tenantId));
      inflight.set(tenantId, pending);
    }

    const data = await pending;
    memoryCache.set(tenantId, { data, expires: Date.now() + FLEET_CACHE_TTL_MS });
    void cache.set(redisKey, data, FLEET_REDIS_TTL_SEC);
    return data;
  }

  /** @deprecated Use getCachedLiveFleet — kept for direct uncached access if needed */
  static async getLiveFleet(tenantId: string, limit = 10_000): Promise<WialonFleetSnapshot> {
    return this.getCachedLiveFleet(tenantId, limit);
  }

  static invalidateCache(tenantId: string): void {
    memoryCache.delete(tenantId);
    void new CacheService().del(`fleet:snapshot:${tenantId}`);
  }

  private static async fetchLiveFleet(tenantId: string, limit = 10_000): Promise<WialonFleetSnapshot> {
    const row = await getTenantWialonRow(tenantId);
    if (!row?.wialon_resource_id) {
      throw new Error('No Wialon account linked for this tenant');
    }

    const creds = await loadTenantWialonCreds(tenantId);
    const accountId = Number(row.wialon_resource_id);
    const scoped = { ...creds, accountId: String(accountId) };

    const raw = await WialonLiveService.listUnitsDetailed(scoped, limit);
    const units: WialonFleetUnit[] = raw.map((u) => ({
      ...u,
      fuelLevel: u.fuelLevel,
    }));

    const byHwName: Record<string, number> = {};
    for (const u of units) {
      const key = u.hwName || (u.hw != null ? `HW ${u.hw}` : 'Unknown');
      byHwName[key] = (byHwName[key] || 0) + 1;
    }

    return {
      units,
      counts: {
        total: units.length,
        moving: units.filter((u) => u.status === 'moving').length,
        idle: units.filter((u) => u.status === 'idle').length,
        stopped: units.filter((u) => u.status === 'stopped').length,
        offline: units.filter((u) => u.status === 'offline').length,
        withPosition: units.filter((u) => u.position).length,
        byHwName,
      },
      fetchedAt: new Date().toISOString(),
      accountId,
      accountName: row.wialon_account_name || undefined,
    };
  }
}
