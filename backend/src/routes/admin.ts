import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/database.js';
import { authMiddleware, requireRole, type AuthRequest } from '../middleware/auth.js';
import { encryptCredentials } from '../utils/encryption.js';
import { success, error } from '../utils/response.js';
import { createAdapter } from '../adapters/AdapterFactory.js';
import type { SourceType } from '@ufp/shared';

const router = Router();
router.use(authMiddleware);

// List tenants
router.get('/tenants', requireRole('platform_admin'), async (_req, res) => {
  const { rows } = await query(`SELECT * FROM tenants ORDER BY name`);
  return success(res, rows);
});

// Create tenant
router.post('/tenants', requireRole('platform_admin'), async (req, res) => {
  const { name, slug, primaryColor, logoUrl, faviconUrl } = req.body;
  if (!name || !slug) return error(res, 'name and slug required');

  const { rows } = await query(
    `INSERT INTO tenants (name, slug, primary_color, logo_url, favicon_url)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name, slug, primaryColor || '#006f45', logoUrl, faviconUrl]
  );

  // Enable default modules
  await query(
    `INSERT INTO tenant_modules (tenant_id, module_key, is_enabled)
     SELECT $1, key, default_enabled FROM module_definitions
     ON CONFLICT DO NOTHING`,
    [rows[0].id]
  );

  return success(res, rows[0], 201);
});

// Get tenant
router.get('/tenants/:id', async (req: AuthRequest, res) => {
  const { rows } = await query(`SELECT * FROM tenants WHERE id = $1`, [req.params.id]);
  if (!rows[0]) return error(res, 'Tenant not found', 404);
  return success(res, rows[0]);
});

// Update tenant branding
router.patch('/tenants/:id', async (req, res) => {
  const { name, primaryColor, secondaryColor, logoUrl, faviconUrl, isActive } = req.body;
  const { rows } = await query(
    `UPDATE tenants SET
      name = COALESCE($2, name),
      primary_color = COALESCE($3, primary_color),
      secondary_color = COALESCE($4, secondary_color),
      logo_url = COALESCE($5, logo_url),
      favicon_url = COALESCE($6, favicon_url),
      is_active = COALESCE($7, is_active),
      updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [req.params.id, name, primaryColor, secondaryColor, logoUrl, faviconUrl, isActive]
  );
  if (!rows[0]) return error(res, 'Tenant not found', 404);
  return success(res, rows[0]);
});

// Configure integration
router.put('/tenants/:id/integrations/:sourceType', async (req, res) => {
  const sourceType = req.params.sourceType as SourceType;
  if (!['wialon', 'loconav', 'tracksolid'].includes(sourceType)) {
    return error(res, 'Invalid source type');
  }

  const credentials = req.body.credentials || req.body;
  const encrypted = encryptCredentials(credentials);

  // Test connection
  try {
    const adapter = createAdapter(sourceType, credentials);
    const ok = await adapter.testConnection();
    if (!ok && credentials.token) {
      return error(res, 'Connection test failed');
    }
  } catch (e) {
    // Allow save in dev without live API
    if (process.env.NODE_ENV === 'production') {
      return error(res, `Connection failed: ${(e as Error).message}`);
    }
  }

  const { rows } = await query(
    `INSERT INTO data_sources (tenant_id, source_type, credentials_encrypted, is_active)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (tenant_id, source_type)
     DO UPDATE SET credentials_encrypted = $3, is_active = true, updated_at = NOW()
     RETURNING id, tenant_id, source_type, is_active, last_sync_at`,
    [req.params.id, sourceType, encrypted]
  );
  return success(res, rows[0]);
});

// List integrations
router.get('/tenants/:id/integrations', async (req, res) => {
  const { rows } = await query(
    `SELECT id, tenant_id, source_type, is_active, last_sync_at, created_at FROM data_sources WHERE tenant_id = $1`,
    [req.params.id]
  );
  return success(res, rows);
});

// Module management
router.get('/tenants/:id/modules', async (req, res) => {
  const { rows } = await query(
    `SELECT md.key, md.label, md.icon, md.sources, COALESCE(tm.is_enabled, md.default_enabled) as is_enabled
     FROM module_definitions md
     LEFT JOIN tenant_modules tm ON tm.module_key = md.key AND tm.tenant_id = $1
     ORDER BY md.sort_order`,
    [req.params.id]
  );
  return success(res, rows);
});

router.put('/tenants/:id/modules', async (req, res) => {
  const { modules } = req.body as { modules: Array<{ key: string; isEnabled: boolean }> };
  if (!Array.isArray(modules)) return error(res, 'modules array required');

  for (const m of modules) {
    await query(
      `INSERT INTO tenant_modules (tenant_id, module_key, is_enabled)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, module_key) DO UPDATE SET is_enabled = $3`,
      [req.params.id, m.key, m.isEnabled]
    );
  }
  return success(res, { updated: modules.length });
});

// Users
router.get('/tenants/:id/users', async (req, res) => {
  const { rows } = await query(
    `SELECT id, email, full_name, role, is_active, created_at FROM users WHERE tenant_id = $1`,
    [req.params.id]
  );
  return success(res, rows);
});

router.post('/tenants/:id/users', async (req, res) => {
  const { email, password, fullName, role } = req.body;
  const hash = await bcrypt.hash(password || 'changeme123', 10);
  const { rows } = await query(
    `INSERT INTO users (tenant_id, email, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, email, full_name, role`,
    [req.params.id, email, hash, fullName || email, role || 'viewer']
  );
  return success(res, rows[0], 201);
});

export default router;
