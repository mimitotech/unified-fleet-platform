import { getRedis } from '../config/redis.js';

export class CacheService {
  async get<T>(key: string): Promise<T | null> {
    const redis = getRedis();
    if (!redis) return null;
    const val = await redis.get(key);
    return val ? (JSON.parse(val) as T) : null;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const redis = getRedis();
    if (!redis) return;
    await redis.setEx(key, ttlSeconds, JSON.stringify(value));
  }

  async del(key: string): Promise<void> {
    const redis = getRedis();
    if (!redis) return;
    await redis.del(key);
  }

  /** Bust tenant fleet cache after sync, webhooks, or integration changes. */
  async invalidateTenant(tenantId: string): Promise<void> {
    const redis = getRedis();
    if (!redis) return;
    const patterns = [`assets:${tenantId}`, `statuses:all:${tenantId}`, `fleet:snapshot:${tenantId}`];
    for (const key of patterns) {
      await redis.del(key);
    }
    let cursor = '0';
    do {
      const reply = await redis.scan(cursor, { MATCH: `status:${tenantId}:*`, COUNT: 100 });
      cursor = reply.cursor;
      if (reply.keys.length) await redis.del(reply.keys);
    } while (cursor !== '0');
  }
}
