import { logger } from './logger.js';

const isProd = process.env.NODE_ENV === 'production';

export function validateEnv(): void {
  const requiredInProd = ['JWT_SECRET', 'ENCRYPTION_KEY'] as const;
  const missing = requiredInProd.filter((k) => !process.env[k]?.trim());

  if (isProd && missing.length > 0) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  if (isProd) {
    const jwt = process.env.JWT_SECRET?.trim() || '';
    const enc = process.env.ENCRYPTION_KEY?.trim() || '';
    if (jwt.length < 32 || /CHANGE_ME/i.test(jwt)) {
      logger.error('JWT_SECRET must be a strong random value (32+ chars), not a placeholder.');
      process.exit(1);
    }
    if (enc.length < 32 || /CHANGE_ME/i.test(enc)) {
      logger.error('ENCRYPTION_KEY must be 32+ chars and must not be a placeholder.');
      process.exit(1);
    }
  }

  const hasMysql =
    Boolean(process.env.DATABASE_URL?.startsWith('mysql')) ||
    Boolean(process.env.DB_USER && process.env.DB_NAME);

  if (isProd && !hasMysql) {
    logger.error('MySQL is required in production. Set DB_USER/DB_NAME/DB_PASSWORD or DATABASE_URL.');
    process.exit(1);
  }

  if (
    isProd &&
    process.env.DB_USER &&
    process.env.DB_NAME &&
    !process.env.DB_PASSWORD?.trim() &&
    !process.env.DATABASE_URL?.includes('@')
  ) {
    logger.error('DB_PASSWORD is required in production when using DB_USER/DB_NAME.');
    process.exit(1);
  }

  if (isProd && !process.env.API_PUBLIC_URL?.trim() && !process.env.FRONTEND_URL?.trim()) {
    logger.error('API_PUBLIC_URL or FRONTEND_URL is required in production (webhooks, share links, CORS).');
    process.exit(1);
  }

  if (isProd) {
    const smtpReady = Boolean(
      process.env.SMTP_HOST?.trim() &&
        process.env.SMTP_USER?.trim() &&
        process.env.SMTP_PASSWORD?.trim() &&
        (process.env.SMTP_FROM_EMAIL?.trim() || process.env.SMTP_USER?.trim()),
    );
    if (!smtpReady) {
      logger.warn(
        'SMTP_* not fully set — password-reset and account emails will fail until configured.',
      );
    }

    const rawLimit = parseInt(process.env.DB_CONNECTION_LIMIT || '12', 10);
    if (Number.isFinite(rawLimit) && rawLimit > 15) {
      logger.warn(
        `DB_CONNECTION_LIMIT=${rawLimit} is high for Hostinger shared MySQL — clamping to 15 at runtime.`,
      );
    }
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
