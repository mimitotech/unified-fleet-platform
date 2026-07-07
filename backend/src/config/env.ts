import { logger } from './logger.js';

const isProd = process.env.NODE_ENV === 'production';

export function validateEnv(): void {
  const requiredInProd = ['JWT_SECRET', 'ENCRYPTION_KEY'] as const;
  const missing = requiredInProd.filter((k) => !process.env[k]?.trim());

  if (isProd && missing.length > 0) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
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

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret) return secret;
  if (isProd) throw new Error('JWT_SECRET is required in production');
  return 'dev-secret';
}
