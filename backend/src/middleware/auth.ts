import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { User } from '@ufp/shared';

export interface AuthRequest extends Request {
  user?: User & { sub: string };
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  try {
    const token = header.slice(7);
    const secret = process.env.JWT_SECRET || 'dev-secret';
    const payload = jwt.verify(token, secret) as User & { sub: string };
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (req.user.role === 'platform_admin' || roles.includes(req.user.role)) return next();
    return res.status(403).json({ success: false, error: 'Forbidden' });
  };
}
