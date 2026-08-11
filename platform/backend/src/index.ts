import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const rootEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
dotenv.config({ path: rootEnv });
dotenv.config();

import { createApp } from './app.js';
import { connectDatabase } from './config/database.js';
import { connectRedis } from './config/redis.js';
import { startSyncScheduler } from './services/SyncScheduler.js';
import { logger } from './config/logger.js';
import { validateEnv } from './config/env.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

function isAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /access denied|er_access_denied|er_dbaccess_denied|passwordFingerprint/i.test(msg);
}

async function waitForDatabase(maxAttempts = 8, delayMs = 1500): Promise<boolean> {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      await connectDatabase();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`Waiting for MySQL (${i}/${maxAttempts}): ${msg.slice(0, 160)}`);

      // Wrong password / host grant — do not burn 40s retrying the same failure
      if (isAuthError(err)) {
        logger.error(`
MySQL Access denied for this user/password.

In Hostinger → Environment variables, set (and re-save):
  DB_USER=u632889724_mams
  DB_PASSWORD=<exact password from hPanel → Databases — reset it if unsure>
  DB_NAME=u632889724_mams
  API_PUBLIC_URL=https://mams.mimitotracking.com
  FRONTEND_URL=https://mams.mimitotracking.com

Remove DATABASE_URL (optional; DB_* is enough).
Confirm the same user/password opens the DB in phpMyAdmin.
`);
        return false;
      }

      if (i === maxAttempts) {
        logger.error(`MySQL connection failed after ${maxAttempts} attempts.`);
        return false;
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

async function main() {
  try {
    validateEnv();

    // Attach HTTP app immediately (HomeBridge pattern) so nginx never 504s while DB connects
    const app = createApp();
    const attach = (globalThis as { __mamsAttach?: (handler: typeof app) => void }).__mamsAttach;

    if (typeof attach === 'function') {
      attach(app);
      logger.info(`MAMS attached to Hostinger early listener on port ${PORT}`);
    } else {
      app.listen(PORT, '0.0.0.0', () => {
        logger.info(`MAMS server listening on port ${PORT}`);
      });
    }

    process.env.REDIS_DISABLED = process.env.REDIS_DISABLED || '1';
    await connectRedis();
    logger.info('Redis connected (or skipped)');

    const dbOk = await waitForDatabase();
    if (dbOk) {
      try {
        const { UploadService } = await import('./services/UploadService.js');
        await UploadService.ensureSchema();
        logger.info('Upload schema ready (tenant_files content)');
      } catch (e) {
        logger.warn(`Upload schema ensure skipped: ${(e as Error).message}`);
      }
      try {
        const { LoginSlideService } = await import('./services/LoginSlideService.js');
        await LoginSlideService.ensureSchema();
        logger.info('Login slides schema ready');
      } catch (e) {
        logger.warn(`Login slides schema ensure skipped: ${(e as Error).message}`);
      }
      try {
        const { LoginTrustLogoService } = await import('./services/LoginTrustLogoService.js');
        await LoginTrustLogoService.ensureSchema();
        logger.info('Login trust logos schema ready');
      } catch (e) {
        logger.warn(`Login trust logos schema ensure skipped: ${(e as Error).message}`);
      }
      try {
        const { ensureWorkshopSchema } = await import('./services/WorkshopSchema.js');
        await ensureWorkshopSchema();
        logger.info('Workshop schema ready (rich fields)');
      } catch (e) {
        logger.warn(`Workshop schema ensure skipped: ${(e as Error).message}`);
      }
      try {
        const { ensureUserAlertAccessSchema } = await import('./services/userAlertAccess.js');
        await ensureUserAlertAccessSchema();
        logger.info('User alert-access schema ready');
      } catch (e) {
        logger.warn(`User alert-access schema ensure skipped: ${(e as Error).message}`);
      }
      try {
        const { ensureProductionHardening } = await import('./services/ensureProductionHardening.js');
        await ensureProductionHardening();
        logger.info('Production DB indexes / alert uniqueness ensured');
      } catch (e) {
        logger.warn(`Production hardening skipped: ${(e as Error).message}`);
      }
      try {
        const { syncEmailSettingsFromEnv, verifySmtpConnection } = await import('./services/EmailService.js');
        await syncEmailSettingsFromEnv();
        const smtp = await verifySmtpConnection();
        if (smtp.ok) logger.info(`SMTP ready: ${smtp.message}`);
        else logger.warn(`SMTP not verified: ${smtp.message}`);
      } catch (e) {
        logger.warn(`SMTP sync skipped: ${(e as Error).message}`);
      }
      logger.info('MySQL connected');
      startSyncScheduler();
      logger.info('Sync scheduler started');
    } else {
      logger.error('MySQL not connected — UI is up; /api and /health will report database error until credentials are fixed');
    }

    process.on('unhandledRejection', (reason) => {
      logger.error('unhandledRejection', reason);
    });
    process.on('uncaughtException', (err) => {
      logger.error('uncaughtException — exiting', err);
      process.exit(1);
    });

    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down');
      try {
        const { getPool } = await import('./config/database.js');
        await getPool().end();
      } catch {
        /* pool may be unavailable */
      }
      process.exit(0);
    });
  } catch (err) {
    logger.error('Failed to start', err);
    process.exit(1);
  }
}

main();
