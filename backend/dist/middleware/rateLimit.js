const buckets = new Map();
function clientKey(req) {
    return req.ip || req.socket.remoteAddress || 'unknown';
}
export function rateLimit(options) {
    const { windowMs, max, message = 'Too many requests, please try again later' } = options;
    return (req, res, next) => {
        const key = `${req.path}:${clientKey(req)}`;
        const now = Date.now();
        let bucket = buckets.get(key);
        if (!bucket || now >= bucket.resetAt) {
            bucket = { count: 0, resetAt: now + windowMs };
            buckets.set(key, bucket);
        }
        bucket.count += 1;
        res.setHeader('X-RateLimit-Limit', String(max));
        res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
        if (bucket.count > max) {
            return res.status(429).json({ success: false, error: message });
        }
        return next();
    };
}
// Periodic cleanup
setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
        if (now >= bucket.resetAt)
            buckets.delete(key);
    }
}, 60_000).unref();
