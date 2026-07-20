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
import { resolveUploadRoot } from './utils/paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_ROOT = resolveUploadRoot();

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

  app.use('/uploads', express.static(UPLOAD_ROOT));

  app.get('/health', async (_req, res) => {
    try {
      await query('SELECT 1');
      res.json({
        status: 'ok',
        database: 'connected',
        engine: 'mysql',
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
        maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
        index: false,
      })
    );
    app.get(/^(?!\/api(?:\/|$)|\/uploads(?:\/|$)|\/health(?:\/|$)).*/, (_req, res) => {
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
