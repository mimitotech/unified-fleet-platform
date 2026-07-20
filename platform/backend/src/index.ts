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
  return /access denied|er_access_denied|er_dbaccess_denied/i.test(msg);
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
MySQL Access denied for this user/host.

On Hostinger, set:
  DB_HOST=localhost
  DB_USER=u454222977_mams
  DB_PASSWORD=<exact password from hPanel → Databases>
  DB_NAME=u454222977_mams

Remove DATABASE_URL or make its host localhost (not 127.0.0.1).
Confirm the user can open the DB in phpMyAdmin with the same password.
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
      logger.info('MySQL connected');
      startSyncScheduler();
      logger.info('Sync scheduler started');
    } else {
      logger.error('MySQL not connected — UI is up; /api and /health will report database error until credentials are fixed');
    }

    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down');
      process.exit(0);
    });
  } catch (err) {
    logger.error('Failed to start', err);
    process.exit(1);
  }
}

main();
