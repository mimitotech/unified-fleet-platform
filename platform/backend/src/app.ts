import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import wialonAdminRoutes from './routes/wialonAdmin.js';
import wialonCenterRoutes from './routes/wialonCenter.js';
import integrationCenterRoutes from './routes/integrationCenter.js';
import clientRoutes from './routes/client.js';
import webhookRoutes from './routes/webhooks.js';
import publicRoutes from './routes/public.js';
import uploadRoutes from './routes/upload.js';
import { errorHandler } from './middleware/errorHandler.js';
import { rateLimit } from './middleware/rateLimit.js';
import { query } from './config/database.js';
import { createUploadsMiddleware } from './middleware/uploadsServe.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveFrontendDist(): string | null {
  const candidates = [
    process.env.FRONTEND_DIST,
    path.resolve(process.cwd(), 'frontend/dist'),
    path.resolve(process.cwd(), '../frontend/dist'),
    path.resolve(__dirname, '../../frontend/dist'),
  ]
    .filter(Boolean)
    .map((dir) => path.resolve(dir as string));

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) {
      console.log('[mams] serving frontend from', dir);
      return dir;
    }
  }
  console.warn('[mams] frontend dist not found — UI will not load');
  return null;
}

export function createApp() {
  const app = express();
  const frontendDist = resolveFrontendDist();
  const publicOrigin = process.env.FRONTEND_URL || process.env.API_PUBLIC_URL || true;

  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    })
  );
  app.use(
    cors({
      origin: publicOrigin,
      credentials: true,
    })
  );
  app.use(compression());
  app.use(express.json({ limit: '15mb' }));

  app.use('/uploads', createUploadsMiddleware());

  app.get('/health', async (_req, res) => {
    try {
      const t0 = Date.now();
      await query('SELECT 1');
      const { getPoolLimits } = await import('./config/database.js');
      const { getSyncSchedulerStatus } = await import('./services/SyncScheduler.js');
      const pool = getPoolLimits();
      const sync = getSyncSchedulerStatus();
      res.json({
        status: 'ok',
        database: 'connected',
        engine: 'mysql',
        latencyMs: Date.now() - t0,
        pool,
        sync: {
          alertCycleRunning: sync.alertCycleRunning,
          tenantCycleRunning: sync.tenantCycleRunning,
          lastAlertCycleAt: sync.lastAlertCycleAt,
          lastTenantCycleAt: sync.lastTenantCycleAt,
        },
        timestamp: new Date().toISOString(),
      });
    } catch {
      res.status(503).json({
        status: 'degraded',
        database: 'disconnected',
        engine: 'mysql',
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60_000, max: 20, message: 'Too many login attempts' }));
  app.use(
    '/api/auth/forgot-password',
    rateLimit({ windowMs: 15 * 60_000, max: 10, message: 'Too many password reset attempts' }),
  );
  app.use(
    '/api/auth/reset-password',
    rateLimit({ windowMs: 15 * 60_000, max: 10, message: 'Too many password reset attempts' }),
  );
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/admin', wialonAdminRoutes);
  app.use('/api/admin', wialonCenterRoutes);
  app.use('/api/admin', integrationCenterRoutes);
  app.use('/api/admin', uploadRoutes);
  app.use('/api/client', clientRoutes);
  app.use('/api/public', rateLimit({ windowMs: 60_000, max: 180 }), publicRoutes);
  app.use('/api/webhooks', rateLimit({ windowMs: 60_000, max: 120 }), webhookRoutes);

  if (frontendDist) {
    app.use(
      express.static(frontendDist, {
        index: false,
        etag: true,
        setHeaders(res, filePath) {
          const base = path.basename(filePath);
          // HTML + SW must never be long-cached or clients stick on old deploys.
          if (
            base === 'index.html' ||
            base === 'sw.js' ||
            base.endsWith('.webmanifest') ||
            base === 'manifest.webmanifest'
          ) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            return;
          }
          // Hashed Vite assets are content-addressed — safe to cache hard.
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            return;
          }
          res.setHeader('Cache-Control', 'public, max-age=3600');
        },
      })
    );
    app.get(/^(?!\/api(?:\/|$)|\/uploads(?:\/|$)|\/health(?:\/|$)).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
        if (err && !res.headersSent) {
          console.error('[mams] sendFile failed', err.message);
          res.status(500).json({ success: false, error: 'UI bundle missing' });
        }
      });
    });
  } else {
    app.use((_req, res) => {
      res.status(404).json({ success: false, error: 'Not found' });
    });
  }

  app.use(errorHandler);
  return app;
}
