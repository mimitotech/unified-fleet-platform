import { CacheService } from './CacheService.js';
import { loadTenantWialonCreds, getTenantWialonRow } from './tenantWialonCredentials.js';
import { isWialonTenantConnected } from './wialonConnectionStatus.js';
import { WialonLiveService } from './WialonLiveService.js';
const FLEET_CACHE_TTL_MS = 8_000;
const FLEET_REDIS_TTL_SEC = 15;
const memoryCache = new Map();
const inflight = new Map();
export class WialonFleetService {
    static async isLiveAvailable(tenantId) {
        const row = await getTenantWialonRow(tenantId);
        return isWialonTenantConnected(row);
    }
    /** Cached live fleet — dedupes parallel requests and short-TTL Redis/memory cache. */
    static async getCachedLiveFleet(tenantId, limit = 10_000) {
        const now = Date.now();
        const mem = memoryCache.get(tenantId);
        if (mem && mem.expires > now)
            return mem.data;
        const cache = new CacheService();
        const redisKey = `fleet:snapshot:${tenantId}`;
        const cached = await cache.get(redisKey);
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
    static async getLiveFleet(tenantId, limit = 10_000) {
        return this.getCachedLiveFleet(tenantId, limit);
    }
    static invalidateCache(tenantId) {
        memoryCache.delete(tenantId);
        void new CacheService().del(`fleet:snapshot:${tenantId}`);
    }
    static async fetchLiveFleet(tenantId, limit = 10_000) {
        const row = await getTenantWialonRow(tenantId);
        if (!row?.wialon_resource_id) {
            throw new Error('No Wialon account linked for this tenant');
        }
        const creds = await loadTenantWialonCreds(tenantId);
        const accountId = Number(row.wialon_resource_id);
        const scoped = { ...creds, accountId: String(accountId) };
        const raw = await WialonLiveService.listUnitsDetailed(scoped, limit);
        const units = raw.map((u) => ({
            ...u,
            fuelLevel: u.fuelLevel,
        }));
        const byHwName = {};
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
