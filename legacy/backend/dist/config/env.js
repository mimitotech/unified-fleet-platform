import { logger } from './logger.js';
const isProd = process.env.NODE_ENV === 'production';
export function validateEnv() {
    const requiredInProd = ['JWT_SECRET', 'ENCRYPTION_KEY'];
    const missing = requiredInProd.filter((k) => !process.env[k]?.trim());
    if (isProd && missing.length > 0) {
        logger.error(`Missing required environment variables: ${missing.join(', ')}`);
        process.exit(1);
    }
    const hasMysql = Boolean(process.env.DATABASE_URL?.startsWith('mysql')) ||
        Boolean(process.env.DB_USER && process.env.DB_NAME);
    if (isProd && !hasMysql) {
        logger.error('MySQL is required in production. Set DB_USER/DB_NAME/DB_PASSWORD/DB_HOST or DATABASE_URL.');
        process.exit(1);
    }
    if (isProd && !process.env.API_PUBLIC_URL?.trim() && !process.env.FRONTEND_URL?.trim()) {
        logger.error('API_PUBLIC_URL or FRONTEND_URL is required in production (webhooks, share links, CORS).');
        process.exit(1);
    }
    if (!isProd) {
        if (!process.env.JWT_SECRET) {
            logger.warn('JWT_SECRET not set — using insecure dev default');
        }
        if (!process.env.ENCRYPTION_KEY) {
            logger.warn('ENCRYPTION_KEY not set — integration credentials may fail to decrypt');
        }
    }
}
export function getJwtSecret() {
    const secret = process.env.JWT_SECRET?.trim();
    if (secret)
        return secret;
    if (isProd)
        throw new Error('JWT_SECRET is required in production');
    return 'dev-secret';
}
