import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { User } from '@ufp/shared';
import { isSuperAdmin, isSystemRole } from '../utils/systemRoles.js';
import { getJwtSecret } from '../config/env.js';
import { query } from '../config/database.js';
import { getStreamByAccessToken } from '../services/wialonStreamCache.js';

export interface AuthRequest extends Request {
  user?: User & { sub: string; id: string };
}

function streamTokenFromRequest(req: Request): string {
  const q = req.query.streamToken;
  if (typeof q === 'string' && q) return q;
  const p = (req.params as Record<string, string | undefined>).streamToken;
  if (typeof p === 'string' && p) return p;
  return '';
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const streamToken = streamTokenFromRequest(req);
  if (streamToken) {
    const entry = getStreamByAccessToken(streamToken);
    if (entry) {
      (req as AuthRequest & { tenantId?: string }).tenantId = entry.tenantId;
      return next();
    }
  }

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as User & {
      sub: string;
      id: string;
    };

    const { rows } = await query<{ is_active: boolean }>(
      `SELECT is_active FROM users WHERE id = $1`,
      [payload.id]
    );

    if (!rows[0]?.is_active) {
      return res.status(401).json({ success: false, error: 'Account is inactive or not found' });
    }

    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
}

/** Mimito staff — super admin or platform admin */
export function requireAdminAccess(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (isSystemRole(req.user.role)) return next();
  return res.status(403).json({ success: false, error: 'Forbidden' });
}

export function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (isSuperAdmin(req.user.role)) return next();
  return res.status(403).json({ success: false, error: 'Super administrator access required' });
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (isSuperAdmin(req.user.role) || isSystemRole(req.user.role) && roles.includes(req.user.role)) {
      return next();
    }
    if (roles.includes(req.user.role)) return next();
    return res.status(403).json({ success: false, error: 'Forbidden' });
  };
}
