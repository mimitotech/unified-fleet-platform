import type { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger.js';

/** Surface safe messages to clients; keep DB detail in logs only. */
function publicMessage(err: Error): string {
  if (process.env.NODE_ENV === 'production') {
    return 'Internal server error';
  }
  return (err.message || 'Internal server error').slice(0, 300);
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  logger.error(err.message, err.stack);
  if (!res.headersSent) {
    res.status(500).json({ success: false, error: publicMessage(err) });
  }
}
