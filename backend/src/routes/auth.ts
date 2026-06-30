import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { success, error } from '../utils/response.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return error(res, 'Email and password required');

  const { rows } = await query<{
    id: string;
    email: string;
    full_name: string;
    role: string;
    tenant_id: string | null;
    password_hash: string;
    is_active: boolean;
  }>(`SELECT * FROM users WHERE email = $1`, [email]);

  const user = rows[0];
  if (!user || !user.is_active) return error(res, 'Invalid credentials', 401);

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return error(res, 'Invalid credentials', 401);

  const token = jwt.sign(
    {
      sub: user.id,
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      tenantId: user.tenant_id,
      isActive: user.is_active,
    },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '24h' }
  );

  return success(res, {
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      tenantId: user.tenant_id,
      isActive: user.is_active,
    },
  });
});

router.get('/me', async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return error(res, 'Unauthorized', 401);
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET || 'dev-secret') as {
      id: string;
    };
    const { rows } = await query(`SELECT id, email, full_name, role, tenant_id, is_active FROM users WHERE id = $1`, [
      payload.id,
    ]);
    if (!rows[0]) return error(res, 'User not found', 404);
    const u = rows[0] as Record<string, unknown>;
    return success(res, {
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      role: u.role,
      tenantId: u.tenant_id,
      isActive: u.is_active,
    });
  } catch {
    return error(res, 'Invalid token', 401);
  }
});

export default router;
