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

async function waitForDatabase(maxAttempts = 20, delayMs = 2000): Promise<void> {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      await connectDatabase();
      return;
    } catch (err) {
      if (i === maxAttempts) {
        logger.error(`
MySQL connection failed after ${maxAttempts} attempts.

Check Hostinger environment variables:
  DB_HOST / DB_USER / DB_PASSWORD / DB_NAME
  (or DATABASE_URL=mysql://user:pass@host:3306/dbname)

Import schema first:
  database/mysql/ufp_complete_schema.sql via phpMyAdmin
`);
        throw err;
      }
      logger.warn(`Waiting for MySQL (${i}/${maxAttempts})...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function main() {
  try {
    validateEnv();
    await waitForDatabase();
    logger.info('MySQL connected');

    process.env.REDIS_DISABLED = process.env.REDIS_DISABLED || '1';
    await connectRedis();
    logger.info('Redis connected (or skipped)');

    startSyncScheduler();
    logger.info('Sync scheduler started');

    const app = createApp();
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`MAMS server listening on port ${PORT}`);
    });

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
