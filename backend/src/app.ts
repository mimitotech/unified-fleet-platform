import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
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

const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  }));
  app.use(compression());
  app.use(express.json({ limit: '15mb' }));

  app.use('/uploads', express.static(UPLOAD_ROOT));

  app.get('/health', async (_req, res) => {
    try {
      await query('SELECT 1');
      res.json({
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
      });
    } catch {
      res.status(503).json({
        status: 'degraded',
        database: 'disconnected',
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

  app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Not found' });
  });

  app.use(errorHandler);
  return app;
}
