import { createClient, type RedisClientType } from 'redis';
import { logger } from './logger.js';

let redis: RedisClientType | null = null;

export async function connectRedis(): Promise<RedisClientType | null> {
  const url = process.env.REDIS_URL;
  if (!url) {
    logger.warn('REDIS_URL not set; caching disabled');
    return null;
  }
  try {
    redis = createClient({ url });
    redis.on('error', (err) => logger.error('Redis error', err));
    await redis.connect();
    return redis;
  } catch (err) {
    logger.warn('Redis unavailable; caching disabled', err);
    return null;
  }
}

export function getRedis(): RedisClientType | null {
  return redis;
}
