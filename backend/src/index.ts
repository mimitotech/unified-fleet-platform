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

async function waitForDatabase(maxAttempts = 15, delayMs = 2000): Promise<void> {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      await connectDatabase();
      return;
    } catch (err) {
      if (i === maxAttempts) {
        logger.error(`
Database connection failed after ${maxAttempts} attempts.

Postgres is not running. To fix:

  1. Open Docker Desktop (wait until "Running")
  2. Run:  bash scripts/setup.sh
     or:   docker compose up -d postgres redis && npm run db:migrate
  3. Then: npm run dev
`);
        throw err;
      }
      logger.warn(`Waiting for database (${i}/${maxAttempts})...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function main() {
  try {
    validateEnv();
    await waitForDatabase();
    logger.info('Database connected');

    await connectRedis();
    logger.info('Redis connected (or skipped)');

    startSyncScheduler();
    logger.info('Sync scheduler started');

    const app = createApp();
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
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
