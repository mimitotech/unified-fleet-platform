import { createClient } from 'redis';
import { logger } from './logger.js';
let redis = null;
const DEFAULT_REDIS_URL = 'redis://localhost:6379';
function redisUrl() {
    return process.env.REDIS_URL?.trim() || DEFAULT_REDIS_URL;
}
export function isRedisConfigured() {
    return process.env.REDIS_DISABLED !== '1';
}
export async function connectRedis() {
    if (!isRedisConfigured()) {
        logger.warn('Redis disabled (REDIS_DISABLED=1)');
        return null;
    }
    const url = redisUrl();
    try {
        if (redis?.isOpen)
            return redis;
        if (redis && !redis.isOpen) {
            await redis.connect();
            logger.info('Redis reconnected');
            return redis;
        }
        redis = createClient({ url });
        redis.on('error', (err) => logger.error('Redis error', err));
        await redis.connect();
        logger.info('Redis connected');
        return redis;
    }
    catch (err) {
        logger.warn('Redis unavailable; caching disabled', err);
        redis = null;
        return null;
    }
}
export function getRedis() {
    return redis?.isOpen ? redis : null;
}
export async function pingRedis() {
    if (!isRedisConfigured()) {
        return { configured: false, ok: false, message: 'Redis disabled' };
    }
    try {
        const client = await connectRedis();
        if (!client?.isOpen) {
            return { configured: true, ok: false, message: 'Could not connect — run: docker compose up -d redis' };
        }
        const reply = await client.ping();
        return { configured: true, ok: reply === 'PONG' };
    }
    catch (err) {
        return {
            configured: true,
            ok: false,
            message: err instanceof Error ? err.message : 'Redis ping failed',
        };
    }
}
