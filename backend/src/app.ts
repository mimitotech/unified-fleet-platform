import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import clientRoutes from './routes/client.js';
import webhookRoutes from './routes/webhooks.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  }));
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/client', clientRoutes);
  app.use('/api/webhooks', webhookRoutes);

  app.use(errorHandler);
  return app;
}
