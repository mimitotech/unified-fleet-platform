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
}
