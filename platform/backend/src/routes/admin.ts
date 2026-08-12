import { Router } from 'express';
import crypto from 'crypto';
import { query, withTransaction } from '../config/database.js';
import { authMiddleware, requireAdminAccess, requireSuperAdmin, type AuthRequest } from '../middleware/auth.js';
import { requireTenantAccess } from '../middleware/tenantAccess.js';
import { isSuperAdmin, isSystemRole } from '../utils/systemRoles.js';
import { encryptCredentials, decryptCredentials } from '../utils/encryption.js';
import { success, error } from '../utils/response.js';
import { createAdapter } from '../adapters/AdapterFactory.js';
import type { SourceType } from '@ufp/shared';
import { AuditService } from '../services/AuditService.js';
import { AdminOrchestrator } from '../orchestrators/AdminOrchestrator.js';
import { WialonHierarchyService } from '../services/WialonHierarchyService.js';
import { isWialonTenantConnected } from '../services/wialonConnectionStatus.js';
import { loadTenantWialonCreds, getTenantWialonRow } from '../services/tenantWialonCredentials.js';
import { WialonUserProvisionService } from '../services/WialonUserProvisionService.js';
import { WialonReportsLiveService } from '../services/WialonReportsLiveService.js';
import { TenantFuelModuleConfigService } from '../services/TenantFuelModuleConfigService.js';
import {
  assertCanManageClientUser,
  filterClientUserIdsForAdmin,
  getUserModules,
  isValidTenantRole,
} from '../utils/userAccess.js';
import { publicUrlOrPath } from '../utils/publicUrl.js';
import { normalizeUploadPath } from '../utils/normalizeUploadPath.js';
import { createSystemUser, createTenantUser } from '../services/UserCreateService.js';
import { resetSystemUserPassword, resetUserPasswordById } from '../services/PasswordResetService.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Prefer same-origin /uploads paths; strip localhost / absolute hosts from stored URLs. */
function publicAssetPath(value: unknown): string | null {
  return normalizeUploadPath(value == null ? null : String(value));
}

const router = Router();
router.use(authMiddleware);
router.use(requireAdminAccess);

router.param('id', (req, res, next, id) => {
  if (!UUID_RE.test(id)) {
    return error(res, 'Invalid id: must be a valid UUID', 400);
  }
  return next();
});

function mapTenant(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    accentColor: row.accent_color,
    logoUrl: publicAssetPath(row.logo_url),
    faviconUrl: publicAssetPath(row.favicon_url),
    isActive: row.is_active,
    status: row.status || (row.is_active ? 'active' : 'inactive'),
    contactEmail: row.contact_email,
    phone: row.phone,
    address: row.address,
    country: row.country,
    timezone: row.timezone,
    language: row.language,
    maxVehicles: row.max_vehicles,
    maxUsers: row.max_users,
    maxStorageGb: row.max_storage_gb,
    customCss: row.custom_css,
    assignedManagerId: row.assigned_manager_id,
    assignedManagerName: row.assigned_manager_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.use('/tenants/:id', requireTenantAccess('id'));

// ─── Dashboard ───────────────────────────────────────────────────────────────

router.get('/dashboard', async (_req, res) => {
  const stats = await AdminOrchestrator.getDashboardStats();
  return success(res, stats);
});

router.get('/system/health', async (_req, res) => {
  const health = await AdminOrchestrator.getSystemHealth();
  return success(res, health);
});

// ─── System settings ─────────────────────────────────────────────────────────

router.get('/system/settings', async (_req, res) => {
  const { rows } = await query(`SELECT \`key\`, value FROM system_settings ORDER BY \`key\``);
  const settings: Record<string, unknown> = {};
  for (const r of rows as Array<{ key: string; value: unknown }>) {
    settings[r.key] = r.value;
  }
  return success(res, settings);
});

router.put('/system/settings/:key', async (req: AuthRequest, res) => {
  const { value } = req.body;
  if (!value) return error(res, 'value required');
  await query(
    `INSERT INTO system_settings (\`key\`, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (\`key\`) DO UPDATE SET value = $2, updated_at = NOW()`,
    [req.params.key, JSON.stringify(value)]
  );
  await AuditService.log({
    userId: req.user?.id,
    userEmail: req.user?.email,
    action: 'system.settings.update',
    resourceType: 'system_settings',
    resourceId: String(req.params.key),
    details: { value },
  });
  return success(res, { updated: true });
});

// ─── Login page slideshow media ──────────────────────────────────────────────

router.get('/login-slides', async (_req, res) => {
  try {
    const { LoginSlideService } = await import('../services/LoginSlideService.js');
    const slides = await LoginSlideService.listAll();
    return success(res, { slides });
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.post('/login-slides', async (req: AuthRequest, res) => {
  try {
    const { LoginSlideService } = await import('../services/LoginSlideService.js');
    const slide = await LoginSlideService.create(req.body || {});
    await AuditService.log({
      userId: req.user?.id,
      userEmail: req.user?.email,
      action: 'login_slide.create',
      resourceType: 'login_slide',
      resourceId: slide.id,
      details: { title: slide.title },
    });
    return success(res, slide, 201);
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.patch('/login-slides/:id', async (req: AuthRequest, res) => {
  try {
    const { LoginSlideService } = await import('../services/LoginSlideService.js');
    const slide = await LoginSlideService.update(String(req.params.id), req.body || {});
    await AuditService.log({
      userId: req.user?.id,
      userEmail: req.user?.email,
      action: 'login_slide.update',
      resourceType: 'login_slide',
      resourceId: slide.id,
      details: { title: slide.title, isEnabled: slide.isEnabled },
    });
    return success(res, slide);
  } catch (e) {
    return error(res, (e as Error).message, /not found/i.test((e as Error).message) ? 404 : 400);
  }
});

router.delete('/login-slides/:id', async (req: AuthRequest, res) => {
  try {
    const { LoginSlideService } = await import('../services/LoginSlideService.js');
    const ok = await LoginSlideService.remove(String(req.params.id));
    if (!ok) return error(res, 'Slide not found', 404);
    await AuditService.log({
      userId: req.user?.id,
      userEmail: req.user?.email,
      action: 'login_slide.delete',
      resourceType: 'login_slide',
      resourceId: String(req.params.id),
    });
    return success(res, { deleted: true });
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

// ─── Login page client trust logos ───────────────────────────────────────────

router.get('/login-trust-logos', async (_req, res) => {
  try {
    const { LoginTrustLogoService } = await import('../services/LoginTrustLogoService.js');
    const logos = await LoginTrustLogoService.listAll();
    return success(res, { logos });
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.post('/login-trust-logos', async (req: AuthRequest, res) => {
  try {
    const { LoginTrustLogoService } = await import('../services/LoginTrustLogoService.js');
    const logo = await LoginTrustLogoService.create(req.body || {});
    await AuditService.log({
      userId: req.user?.id,
      userEmail: req.user?.email,
      action: 'login_trust_logo.create',
      resourceType: 'login_trust_logo',
      resourceId: logo.id,
      details: { name: logo.name },
    });
    return success(res, logo, 201);
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.patch('/login-trust-logos/:id', async (req: AuthRequest, res) => {
  try {
    const { LoginTrustLogoService } = await import('../services/LoginTrustLogoService.js');
    const logo = await LoginTrustLogoService.update(String(req.params.id), req.body || {});
    await AuditService.log({
      userId: req.user?.id,
      userEmail: req.user?.email,
      action: 'login_trust_logo.update',
      resourceType: 'login_trust_logo',
      resourceId: logo.id,
      details: { name: logo.name, isEnabled: logo.isEnabled },
    });
    return success(res, logo);
  } catch (e) {
    return error(res, (e as Error).message, /not found/i.test((e as Error).message) ? 404 : 400);
  }
});

router.delete('/login-trust-logos/:id', async (req: AuthRequest, res) => {
  try {
    const { LoginTrustLogoService } = await import('../services/LoginTrustLogoService.js');
    const ok = await LoginTrustLogoService.remove(String(req.params.id));
    if (!ok) return error(res, 'Logo not found', 404);
    await AuditService.log({
      userId: req.user?.id,
      userEmail: req.user?.email,
      action: 'login_trust_logo.delete',
      resourceType: 'login_trust_logo',
      resourceId: String(req.params.id),
    });
    return success(res, { deleted: true });
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

// ─── Marketplace ─────────────────────────────────────────────────────────────

router.get('/marketplace', async (_req, res) => {
  const { rows } = await query(`SELECT * FROM marketplace_integrations ORDER BY name`);
  return success(res, rows);
});

router.patch('/marketplace/:key', async (req, res) => {
  const { isEnabledGlobally } = req.body;
  const { rows } = await query(
    `UPDATE marketplace_integrations SET is_enabled_globally = COALESCE($2, is_enabled_globally)
     WHERE \`key\` = $1 RETURNING *`,
    [req.params.key, isEnabledGlobally]
  );
  if (!rows[0]) return error(res, 'Integration not found', 404);
  return success(res, rows[0]);
});

// ─── Global users ────────────────────────────────────────────────────────────

router.get('/users', async (req: AuthRequest, res) => {
  const search = String(req.query.search || '');
  const tenantFilter = String(req.query.tenant || '');
  const roleFilter = String(req.query.role || '');
  const statusFilter = String(req.query.status || 'active');
  const params: unknown[] = [];
  let where = `WHERE u.tenant_id IS NOT NULL AND u.role NOT IN ('platform_admin', 'super_admin')`;

  if (req.user?.role === 'platform_admin') {
    params.push(req.user.id);
    where += ` AND u.tenant_id IN (SELECT id FROM tenants WHERE assigned_manager_id = $${params.length})`;
  }

  if (search) {
    params.push(`%${search}%`);
    where += ` AND (u.email ILIKE $${params.length} OR u.full_name ILIKE $${params.length})`;
  }
  if (tenantFilter && tenantFilter !== 'all') {
    params.push(tenantFilter);
    where += ` AND u.tenant_id = $${params.length}`;
  }
  if (roleFilter && roleFilter !== 'all') {
    params.push(roleFilter);
    where += ` AND u.role = $${params.length}`;
  }
  if (statusFilter === 'active') {
    where += ` AND u.is_active = true`;
  } else if (statusFilter === 'inactive') {
    where += ` AND u.is_active = false`;
  }

  const { rows } = await query(
    `SELECT u.id, u.email, u.full_name, u.role, u.is_active, u.last_login_at, u.created_at,
            u.tenant_id, t.name as tenant_name, t.slug as tenant_slug
     FROM users u
     INNER JOIN tenants t ON t.id = u.tenant_id
     ${where}
     ORDER BY u.created_at DESC
     LIMIT 200`,
    params
  );
  return success(res, rows);
});

router.get('/users/:id', async (req: AuthRequest, res) => {
  try {
    const userId = String(req.params.id);
    await assertCanManageClientUser(req, userId);
    const { rows } = await query(
      `SELECT u.id, u.email, u.full_name, u.role, u.is_active, u.last_login_at, u.created_at,
              u.tenant_id, t.name as tenant_name
       FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id WHERE u.id = $1`,
      [userId]
    );
    if (!rows[0]) return error(res, 'User not found', 404);
    const modules = await getUserModules(userId);
    return success(res, { ...rows[0], modules });
  } catch (e) {
    const err = e as Error & { status?: number };
    return error(res, err.message, err.status || 500);
  }
});

router.patch('/users/:id', async (req: AuthRequest, res) => {
  try {
    const userId = String(req.params.id);
    await assertCanManageClientUser(req, userId);
    const { isActive, role, fullName, modules } = req.body;
    if (role && !isValidTenantRole(String(role))) {
      return error(res, 'Invalid role for client user');
    }
    const { rows } = await query(
      `UPDATE users SET
         is_active = COALESCE($2, is_active),
         role = COALESCE($3, role),
         full_name = COALESCE($4, full_name),
         updated_at = NOW()
       WHERE id = $1 RETURNING id, email, full_name, role, is_active, tenant_id`,
      [userId, isActive, role, fullName]
    );
    if (!rows[0]) return error(res, 'User not found', 404);

    if (Array.isArray(modules)) {
      await query(`DELETE FROM user_modules WHERE user_id = $1`, [userId]);
      for (const mod of modules as string[]) {
        await query(
          `INSERT INTO user_modules (user_id, module_key, is_enabled) VALUES ($1, $2, true)`,
          [userId, mod]
        );
      }
    }

    await AuditService.log({
      userId: req.user?.id,
      userEmail: req.user?.email,
      action: 'user.update',
      resourceType: 'user',
      resourceId: userId,
      details: { role, isActive, fullName },
    });
    return success(res, { ...rows[0], modules: Array.isArray(modules) ? modules : await getUserModules(userId) });
  } catch (e) {
    const err = e as Error & { status?: number };
    return error(res, err.message, err.status || 500);
  }
});

router.post('/users/:id/reset-password', async (req: AuthRequest, res) => {
  try {
    const userId = String(req.params.id);
    await assertCanManageClientUser(req, userId);
    const result = await resetUserPasswordById(userId, {
      password: req.body?.password,
      forcePasswordChange: true,
    });
    await AuditService.log({
      userId: req.user?.id,
      userEmail: req.user?.email,
      action: 'user.reset_password',
      resourceType: 'user',
      resourceId: userId,
    });
    return success(res, { reset: true, temporaryPassword: result.temporaryPassword });
  } catch (e) {
    const err = e as Error & { status?: number };
    return error(res, err.message || 'Could not reset password', err.status || 500);
  }
});

router.post('/users/bulk', async (req: AuthRequest, res) => {
  const { action, userIds } = req.body as { action: string; userIds: string[] };
  if (!Array.isArray(userIds) || !userIds.length) return error(res, 'userIds required');

  const allowedIds = await filterClientUserIdsForAdmin(req, userIds);
  if (!allowedIds.length) return error(res, 'No permitted users in selection', 403);

  if (action === 'activate') {
    await query(`UPDATE users SET is_active = true WHERE id = ANY($1)`, [allowedIds]);
  } else if (action === 'deactivate') {
    await query(`UPDATE users SET is_active = false WHERE id = ANY($1)`, [allowedIds]);
  } else {
    return error(res, 'Unknown action');
  }
  return success(res, { updated: allowedIds.length, skipped: userIds.length - allowedIds.length });
});

// ─── Mimito system staff (super admin manages) ───────────────────────────────

router.get('/system-users', requireSuperAdmin, async (_req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.email, u.full_name, u.role, u.is_active, u.last_login_at, u.created_at,
            (SELECT COUNT(*)::int FROM tenants t WHERE t.assigned_manager_id = u.id) as assigned_tenant_count
     FROM users u
     WHERE u.role IN ('super_admin', 'platform_admin') AND u.tenant_id IS NULL
     ORDER BY u.role DESC, u.full_name ASC`
  );
  return success(res, rows);
});

router.post('/system-users', requireSuperAdmin, async (req: AuthRequest, res) => {
  const { email, password, fullName, role } = req.body;
  if (!email) return error(res, 'email required');
  const staffRole = role === 'super_admin' ? 'super_admin' : 'platform_admin';
  try {
    const user = await createSystemUser({
      email,
      password,
      fullName,
      role: staffRole,
      actorUserId: req.user?.id,
      actorEmail: req.user?.email,
    });
    return success(res, user, 201);
  } catch (e) {
    const err = e as Error & { status?: number };
    return error(res, err.message, err.status || 500);
  }
});

router.patch('/system-users/:id', requireSuperAdmin, async (req: AuthRequest, res) => {
  const { isActive, role, fullName } = req.body;
  const staffRole = role === 'super_admin' ? 'super_admin' : role === 'platform_admin' ? 'platform_admin' : undefined;
  const { rows } = await query(
    `UPDATE users SET
       is_active = COALESCE($2, is_active),
       role = COALESCE($3, role),
       full_name = COALESCE($4, full_name),
       updated_at = NOW()
     WHERE id = $1 AND tenant_id IS NULL AND role IN ('super_admin', 'platform_admin')
     RETURNING id, email, full_name, role, is_active`,
    [req.params.id, isActive, staffRole, fullName]
  );
  if (!rows[0]) return error(res, 'System user not found', 404);
  return success(res, rows[0]);
});

router.post('/system-users/:id/reset-password', requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await resetSystemUserPassword(String(req.params.id), req.body?.password);
    return success(res, { reset: true, temporaryPassword: result.temporaryPassword });
  } catch (e) {
    const err = e as Error & { status?: number };
    return error(res, err.message || 'Could not reset password', err.status || 500);
  }
});

// ─── Tenants ─────────────────────────────────────────────────────────────────

router.get('/tenants', async (req: AuthRequest, res) => {
  const result = await AdminOrchestrator.listTenantsWithStats({
    search: String(req.query.search || ''),
    status: String(req.query.status || 'all'),
    integration: String(req.query.integration || ''),
    sort: String(req.query.sort || 'name'),
    page: parseInt(String(req.query.page || '1'), 10),
    limit: parseInt(String(req.query.limit || '25'), 10),
    managerId: req.user?.role === 'platform_admin' ? req.user.id : undefined,
    groupByManager: isSuperAdmin(req.user?.role),
  });
  return success(res, result);
});

router.post('/tenants', async (req: AuthRequest, res) => {
  const b = req.body;
  const { name, slug, primaryColor, logoUrl, faviconUrl, contactEmail, timezone, language } = b;
  if (!name || !slug) return error(res, 'name and slug required');

  const normalizedSlug = String(slug).trim().toLowerCase().replace(/\s+/g, '-');
  const assignedManagerId =
    req.user?.role === 'platform_admin'
      ? req.user.id
      : b.assignedManagerId || null;

  const wialonAccountId = b.wialonAccountId ? parseInt(String(b.wialonAccountId), 10) : NaN;
  const wialonAccountName = b.wialonAccountName ? String(b.wialonAccountName) : undefined;
  const wialonMotherAccountId = b.wialonMotherAccountId ? String(b.wialonMotherAccountId) : undefined;
  const wialonUserIds = Array.isArray(b.wialonUserIds)
    ? (b.wialonUserIds as unknown[]).map((id) => parseInt(String(id), 10)).filter((n) => !Number.isNaN(n))
    : undefined;

  try {
    const tenantId = await withTransaction(async (tx) => {
      const { rows } = await tx(
        `INSERT INTO tenants (name, slug, primary_color, logo_url, favicon_url, contact_email, timezone, language, status, is_active, assigned_manager_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', false, $9) RETURNING *`,
        [name, normalizedSlug, primaryColor || '#004225', normalizeUploadPath(logoUrl), normalizeUploadPath(faviconUrl), contactEmail, timezone || 'UTC', language || 'en', assignedManagerId]
      );

      const id = rows[0].id as string;

      await tx(
        `INSERT INTO tenant_modules (id, tenant_id, module_key, is_enabled, is_visible)
         SELECT UUID(), $1, m.\`key\`, m.default_enabled, 1
         FROM module_definitions m
         ON CONFLICT DO NOTHING`,
        [id]
      );
      await tx(
        `INSERT INTO tenant_backup_settings (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [id]
      );

      return id;
    });

    const { rows } = await query(`SELECT * FROM tenants WHERE id = $1`, [tenantId]);

    let wialonLink: Awaited<ReturnType<typeof import('../services/WialonUserProvisionService.js').WialonAccountLinkService.linkAccount>> | null = null;
    if (!Number.isNaN(wialonAccountId)) {
      const { WialonAccountLinkService } = await import('../services/WialonUserProvisionService.js');
      wialonLink = await WialonAccountLinkService.linkAccount(
        tenantId,
        wialonAccountId,
        wialonAccountName,
        wialonUserIds,
        wialonMotherAccountId
      );
    }

    await AuditService.log({
      userId: req.user?.id,
      userEmail: req.user?.email,
      action: 'tenant.create',
      resourceType: 'tenant',
      resourceId: tenantId,
      details: { name, slug: normalizedSlug, wialonAccountId: Number.isNaN(wialonAccountId) ? null : wialonAccountId },
    });
    await AuditService.logActivity(tenantId, 'tenant_created', `New tenant "${name}" created`);

    return success(res, { ...mapTenant(rows[0] as Record<string, unknown>), wialon: wialonLink }, 201);
  } catch (err) {
    const msg = (err as Error).message || '';
    if (msg.includes('tenants_status_check')) {
      return error(
        res,
        'Database migration required: run `npm run db:migrate` to enable draft tenant status (migration 012).',
        500
      );
    }
    if (msg.includes('tenants_slug_key') || msg.includes('duplicate key') || /Duplicate entry/i.test(msg)) {
      return error(res, `Slug "${normalizedSlug}" is already in use`, 409);
    }
    throw err;
  }
});

router.get('/tenants/:id', async (req, res) => {
  const detail = await AdminOrchestrator.getTenantDetail(String(req.params.id));
  if (!detail) return error(res, 'Tenant not found', 404);
  return success(res, { ...mapTenant(detail as Record<string, unknown>), usage: detail.usage });
});

router.patch('/tenants/:id', async (req: AuthRequest, res) => {
  const b = req.body;
  let isActive = b.isActive;
  if (b.status === 'active') isActive = true;
  else if (b.status === 'draft' || b.status === 'inactive' || b.status === 'suspended') isActive = false;

  let assignedManagerId = b.assignedManagerId;
  if (!isSuperAdmin(req.user?.role)) {
    assignedManagerId = undefined;
  } else if (assignedManagerId === '' || assignedManagerId === 'none') {
    assignedManagerId = null;
  }

  const setManager = isSuperAdmin(req.user?.role) && 'assignedManagerId' in b;
  const setLogo = Object.prototype.hasOwnProperty.call(b, 'logoUrl');
  const setFavicon = Object.prototype.hasOwnProperty.call(b, 'faviconUrl');
  const logoUrl = setLogo
    ? b.logoUrl
      ? normalizeUploadPath(String(b.logoUrl))
      : null
    : null;
  const faviconUrl = setFavicon
    ? b.faviconUrl
      ? normalizeUploadPath(String(b.faviconUrl))
      : null
    : null;

  const { rows } = await query(
    `UPDATE tenants SET
      name = COALESCE($2, name),
      slug = COALESCE($3, slug),
      primary_color = COALESCE($4, primary_color),
      secondary_color = COALESCE($5, secondary_color),
      accent_color = COALESCE($6, accent_color),
      logo_url = CASE WHEN $23 THEN $7 ELSE logo_url END,
      favicon_url = CASE WHEN $24 THEN $8 ELSE favicon_url END,
      is_active = COALESCE($9, is_active),
      status = COALESCE($10, status),
      contact_email = COALESCE($11, contact_email),
      phone = COALESCE($12, phone),
      address = COALESCE($13, address),
      country = COALESCE($14, country),
      timezone = COALESCE($15, timezone),
      language = COALESCE($16, language),
      max_vehicles = COALESCE($17, max_vehicles),
      max_users = COALESCE($18, max_users),
      max_storage_gb = COALESCE($19, max_storage_gb),
      custom_css = COALESCE($20, custom_css),
      assigned_manager_id = CASE WHEN $22 THEN $21 ELSE assigned_manager_id END,
      updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [
      req.params.id, b.name, b.slug, b.primaryColor, b.secondaryColor, b.accentColor,
      logoUrl, faviconUrl, isActive, b.status, b.contactEmail, b.phone,
      b.address, b.country, b.timezone, b.language, b.maxVehicles, b.maxUsers,
      b.maxStorageGb, b.customCss, assignedManagerId, setManager ? 1 : 0, setLogo ? 1 : 0, setFavicon ? 1 : 0,
    ]
  );
  if (!rows[0]) return error(res, 'Tenant not found', 404);
  await AuditService.log({
    tenantId: String(req.params.id),
    userId: req.user?.id,
    userEmail: req.user?.email,
    action: 'tenant.update',
    resourceType: 'tenant',
    resourceId: String(req.params.id),
  });
  return success(res, mapTenant(rows[0] as Record<string, unknown>));
});

router.delete('/tenants/:id', async (req: AuthRequest, res) => {
  await query(`UPDATE tenants SET is_active = false, status = 'inactive' WHERE id = $1`, [req.params.id]);
  await AuditService.log({
    tenantId: String(req.params.id),
    userId: req.user?.id,
    userEmail: req.user?.email,
    action: 'tenant.deactivate',
    resourceType: 'tenant',
    resourceId: String(req.params.id),
  });
  return success(res, { deactivated: true });
});

/** Permanent delete: tenant + cascaded users and client data. Requires confirmSlug = tenant.slug. */
router.post('/tenants/:id/purge', async (req: AuthRequest, res) => {
  const tenantId = String(req.params.id);
  const confirmSlug = String(req.body?.confirmSlug || '').trim().toLowerCase();
  const { rows } = await query<{ id: string; slug: string; name: string }>(
    `SELECT id, slug, name FROM tenants WHERE id = $1`,
    [tenantId]
  );
  if (!rows[0]) return error(res, 'Client not found', 404);
  const expected = String(rows[0].slug || '').trim().toLowerCase();
  if (!confirmSlug || confirmSlug !== expected) {
    return error(
      res,
      `Type the client slug "${rows[0].slug}" exactly to confirm permanent deletion`,
      400
    );
  }

  const { rows: userCountRows } = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM users WHERE tenant_id = $1`,
    [tenantId]
  );
  const usersDeleted = Number(userCountRows[0]?.n || 0);

  await query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);

  await AuditService.log({
    userId: req.user?.id,
    userEmail: req.user?.email,
    action: 'tenant.purge',
    resourceType: 'tenant',
    resourceId: tenantId,
    details: {
      slug: rows[0].slug,
      name: rows[0].name,
      usersDeleted,
    },
  });

  return success(res, { deleted: true, slug: rows[0].slug, usersDeleted });
});

router.post('/tenants/bulk', async (req, res) => {
  const { action, tenantIds } = req.body as { action: string; tenantIds: string[] };
  if (!Array.isArray(tenantIds)) return error(res, 'tenantIds required');
  const status = action === 'activate' ? 'active' : 'inactive';
  await query(
    `UPDATE tenants SET status = $2, is_active = $3 WHERE id = ANY($1)`,
    [tenantIds, status, action === 'activate']
  );
  return success(res, { updated: tenantIds.length });
});

// ─── Integrations ────────────────────────────────────────────────────────────

router.get('/tenants/:id/integrations', async (req, res) => {
  const { rows } = await query(
    `SELECT ds.id, ds.tenant_id, ds.source_type, ds.is_active, ds.last_sync_at, ds.last_error,
            ds.sync_interval_minutes, ds.created_at, ds.connection_verified_at,
            ds.preview_asset_count, ds.preview_sample,
            ds.wialon_resource_id, ds.wialon_operate_as, ds.wialon_account_name, ds.wialon_session_meta,
            ds.wialon_mother_account_id,
            ds.inherits_platform_credentials,
            wm.name AS wialon_mother_account_name,
            (SELECT COUNT(*)::int FROM integration_sync_logs isl
             WHERE isl.tenant_id = ds.tenant_id AND isl.source_type = ds.source_type
               AND isl.started_at >= NOW() - INTERVAL '24 hours' AND isl.status = 'success') as syncs_24h
     FROM data_sources ds
     LEFT JOIN wialon_mother_accounts wm ON wm.id = ds.wialon_mother_account_id
     WHERE ds.tenant_id = $1`,
    [req.params.id]
  );

  for (const r of rows) {
    const row = r as Record<string, unknown>;
    if (
      row.source_type === 'wialon' &&
      isWialonTenantConnected({
        is_active: Boolean(row.is_active),
        connection_verified_at: row.connection_verified_at as string | null,
        wialon_resource_id:
          row.wialon_resource_id != null ? Number(row.wialon_resource_id) : null,
      }) &&
      row.last_error
    ) {
      await query(
        `UPDATE data_sources SET last_error = NULL, updated_at = NOW()
         WHERE tenant_id = $1 AND source_type = 'wialon'`,
        [req.params.id]
      );
      row.last_error = null;
    }
  }

  const { rows: tenant } = await query<{ slug: string }>(`SELECT slug FROM tenants WHERE id = $1`, [req.params.id]);
  const slug = tenant[0]?.slug || '';
  return success(res, rows.map((r: Record<string, unknown>) => ({
    ...r,
    webhookUrl: r.source_type === 'loconav'
      ? publicUrlOrPath(`/api/webhooks/loconav/${slug}`)
      : r.source_type === 'tracksolid'
        ? publicUrlOrPath(`/api/webhooks/tracksolid/${slug}`)
        : null,
  })));
});

router.put('/tenants/:id/integrations/:sourceType', async (req: AuthRequest, res) => {
  const sourceType = req.params.sourceType as SourceType;
  if (!['wialon', 'loconav', 'tracksolid'].includes(sourceType)) {
    return error(res, 'Invalid source type');
  }

  const credentials = { ...(req.body.credentials || req.body) } as Record<string, unknown>;
  const syncInterval = req.body.syncIntervalMinutes || 5;

  // Merge with stored credentials so empty password fields don't wipe secrets on re-save
  const { rows: existingRows } = await query<{ credentials_encrypted: string }>(
    `SELECT credentials_encrypted FROM data_sources WHERE tenant_id = $1 AND source_type = $2`,
    [req.params.id, sourceType]
  );
  if (existingRows[0]) {
    const prev = decryptCredentials(existingRows[0].credentials_encrypted) as Record<string, unknown>;
    for (const key of Object.keys(credentials)) {
      const val = credentials[key];
      if (val === '' || val === undefined || val === null) {
        if (prev[key] !== undefined) credentials[key] = prev[key];
        else delete credentials[key];
      }
    }
    if (sourceType === 'tracksolid' && !credentials.password && !credentials.passwordMd5 && prev.passwordMd5) {
      credentials.passwordMd5 = prev.passwordMd5;
    }
  }

  if (sourceType === 'wialon' && credentials.token) {
    credentials.token = String(credentials.token).trim();
    if (credentials.operateAs === '' || credentials.operateAs === null) delete credentials.operateAs;
    if (credentials.accountId === '' || credentials.accountId === null) delete credentials.accountId;
    if (credentials.baseUrl) credentials.baseUrl = String(credentials.baseUrl).trim();
  }
  if (sourceType === 'loconav') {
    if (credentials.userAuthentication) {
      credentials.userAuthentication = String(credentials.userAuthentication).trim();
    }
    if (credentials.token) {
      credentials.token = String(credentials.token).trim();
    }
  }

  if (sourceType === 'tracksolid') {
    if (credentials.password && typeof credentials.password === 'string') {
      credentials.passwordMd5 = crypto.createHash('md5').update(credentials.password).digest('hex');
      delete credentials.password;
    }
    credentials.appKey = credentials.appKey || credentials.apiKey;
    credentials.appSecret = credentials.appSecret || credentials.secretKey;
    credentials.account = credentials.account || credentials.userId;
  }

  const hasRequiredCreds =
    sourceType === 'wialon'
      ? !!credentials.token
      : sourceType === 'loconav'
        ? !!(credentials.userAuthentication || credentials.token)
        : !!(credentials.appKey || credentials.apiKey) &&
          !!(credentials.appSecret || credentials.secretKey) &&
          !!(credentials.account || credentials.userId) &&
          !!credentials.passwordMd5;

  if (!hasRequiredCreds) {
    return error(res, `Missing required credentials for ${sourceType}. Check all fields are filled.`);
  }

  const encrypted = encryptCredentials(credentials);

  let assets: Awaited<ReturnType<ReturnType<typeof createAdapter>['getAssets']>> = [];
  let wialonMeta: Record<string, unknown> | null = null;
  let wialonResourceId: number | null = null;
  let wialonOperateAs: number | null = null;
  let wialonAccountName: string | null = null;

  const adapter = createAdapter(sourceType, credentials);
  try {
    await adapter.connect();
    assets = await adapter.getAssets();

    if (sourceType === 'wialon') {
      const probe = await WialonHierarchyService.probe({
        token: String(credentials.token),
        baseUrl: credentials.baseUrl as string | undefined,
        operateAs: credentials.operateAs as string | number | undefined,
        accountId: credentials.accountId as string | number | undefined,
      });
      wialonMeta = {
        ...WialonHierarchyService.buildSessionMeta(probe),
        baseUrl: credentials.baseUrl || 'https://hst-api.wialon.com/wialon/ajax.html',
      };
      const parsedAccount = credentials.accountId
        ? parseInt(String(credentials.accountId), 10)
        : NaN;
      wialonResourceId = !Number.isNaN(parsedAccount)
        ? parsedAccount
        : probe.currentAccount?.id ?? probe.sessionUser.bact ?? null;
      if (credentials.operateAs !== undefined && credentials.operateAs !== '') {
        const raw = credentials.operateAs;
        const parsed =
          typeof raw === 'number' ? raw : parseInt(String(raw), 10);
        wialonOperateAs = Number.isNaN(parsed) ? null : parsed;
      }
      wialonAccountName =
        probe.accounts.find((a) => a.id === wialonResourceId)?.name ||
        probe.currentAccount?.name ||
        probe.sessionUser.nm;
    }
  } catch (e) {
    return error(res, `Connection failed: ${(e as Error).message}`);
  } finally {
    if (typeof adapter.disconnect === 'function') {
      await adapter.disconnect().catch(() => undefined);
    }
  }

  const sampleAssets = assets.slice(0, 10).map((a) => ({
    id: a.id,
    name: a.name,
    registrationPlate: a.registrationPlate,
    vin: a.vin,
  }));

  const webhookSecret = crypto.randomBytes(16).toString('hex');
  const { rows } = await query(
    `INSERT INTO data_sources (tenant_id, source_type, credentials_encrypted, is_active, sync_interval_minutes, webhook_secret)
     VALUES ($1, $2, $3, true, $4, $5)
     ON CONFLICT (tenant_id, source_type)
     DO UPDATE SET credentials_encrypted = $3, is_active = true, sync_interval_minutes = $4,
                   webhook_secret = COALESCE(data_sources.webhook_secret, $5), updated_at = NOW()
     RETURNING id, tenant_id, source_type, is_active, last_sync_at, sync_interval_minutes`,
    [req.params.id, sourceType, encrypted, syncInterval, webhookSecret]
  );

  await query(
    `UPDATE data_sources SET connection_verified_at = NOW(), preview_asset_count = $3,
     preview_sample = $4, last_error = NULL,
     wialon_resource_id = COALESCE($5, wialon_resource_id),
     wialon_operate_as = $6,
     wialon_account_name = COALESCE($7, wialon_account_name),
     wialon_session_meta = COALESCE($8::jsonb, wialon_session_meta)
     WHERE tenant_id = $1 AND source_type = $2`,
    [
      req.params.id,
      sourceType,
      assets.length,
      JSON.stringify(sampleAssets),
      sourceType === 'wialon' ? wialonResourceId : null,
      sourceType === 'wialon' ? wialonOperateAs : null,
      sourceType === 'wialon' ? wialonAccountName : null,
      sourceType === 'wialon' && wialonMeta ? JSON.stringify(wialonMeta) : null,
    ]
  );

  await AuditService.log({
    tenantId: String(req.params.id),
    userId: req.user?.id,
    userEmail: req.user?.email,
    action: 'integration.configure',
    resourceType: 'data_source',
    resourceId: sourceType,
  });

  return success(res, {
    ...rows[0],
    connection_verified_at: new Date().toISOString(),
    preview_asset_count: assets.length,
    preview_sample: sampleAssets,
    assetCount: assets.length,
    sampleAssets,
    wialon: sourceType === 'wialon' ? { meta: wialonMeta, accountName: wialonAccountName } : undefined,
  });
});

router.post('/tenants/:id/integrations/:sourceType/test', async (req, res) => {
  try {
    const result = await AdminOrchestrator.testIntegration(
      String(req.params.id),
      req.params.sourceType as SourceType,
      req.body.credentials
    );
    return success(res, result);
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.get('/tenants/:id/modules/recommended', async (req, res) => {
  const modules = await AdminOrchestrator.getRecommendedModules(String(req.params.id));
  return success(res, modules);
});

router.post('/tenants/:id/activate', async (req: AuthRequest, res) => {
  try {
    const result = await AdminOrchestrator.activateTenant(String(req.params.id));
    await AuditService.log({
      tenantId: String(req.params.id),
      userId: req.user?.id,
      userEmail: req.user?.email,
      action: 'tenant.activate',
      resourceType: 'tenant',
      resourceId: String(req.params.id),
    });
    return success(res, result);
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.post('/tenants/:id/integrations/:sourceType/sync', async (req: AuthRequest, res) => {
  try {
    const result = await AdminOrchestrator.syncIntegration(
      String(req.params.id),
      req.params.sourceType as SourceType
    );
    await AuditService.log({
      tenantId: String(req.params.id),
      userId: req.user?.id,
      userEmail: req.user?.email,
      action: 'integration.sync',
      resourceType: 'data_source',
      resourceId: String(req.params.sourceType),
      details: result,
    });
    await AuditService.logActivity(
      String(req.params.id),
      'integration_sync',
      `${req.params.sourceType} sync completed`,
      `${result.vehiclesSynced} vehicles synced`
    );
    return success(res, result);
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

// ─── Modules ─────────────────────────────────────────────────────────────────

router.get('/tenants/:id/modules', async (req, res) => {
  const { rows } = await query(
    `SELECT md.\`key\`, md.label, md.description, md.icon, md.sources,
            COALESCE(tm.is_enabled, md.default_enabled) as is_enabled,
            COALESCE(tm.is_visible, true) as is_visible
     FROM module_definitions md
     LEFT JOIN tenant_modules tm ON tm.module_key = md.\`key\` AND tm.tenant_id = $1
     ORDER BY md.sort_order`,
    [req.params.id]
  );
  return success(res, rows);
});

router.get('/tenants/:id/wialon/reports/catalog', async (req, res) => {
  try {
    const data = await WialonReportsLiveService.getTemplateCatalog(String(req.params.id));
    return success(res, data);
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.get('/tenants/:id/fuel-module-config', async (req, res) => {
  try {
    const config = await TenantFuelModuleConfigService.getConfig(String(req.params.id));
    return success(res, config);
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.put('/tenants/:id/fuel-module-config', async (req: AuthRequest, res) => {
  try {
    const config = await TenantFuelModuleConfigService.saveConfig(String(req.params.id), {
      selectedReports: req.body?.selectedReports,
      visibleColumns: req.body?.visibleColumns,
      columnsByCategory: req.body?.columnsByCategory,
      fuelPricePerLiter: req.body?.fuelPricePerLiter,
    });
    await AuditService.log({
      tenantId: String(req.params.id),
      userId: req.user?.id,
      userEmail: req.user?.email,
      action: 'fuel_module_config.update',
      resourceType: 'tenant_fuel_module_config',
      resourceId: String(req.params.id),
    });
    return success(res, config);
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.get('/tenants/:id/fuel-station-sheets', async (req, res) => {
  try {
    const { FuelStationSheetService } = await import('../services/FuelStationSheetService.js');
    const uploads = await FuelStationSheetService.listUploads(String(req.params.id));
    return success(res, { uploads });
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.post('/tenants/:id/fuel-station-sheets', async (req: AuthRequest, res) => {
  try {
    const { fileName, mimeType, data, notes } = req.body as {
      fileName?: string;
      mimeType?: string;
      data?: string;
      notes?: string;
    };
    if (!fileName || !data) return error(res, 'fileName and data (base64) required');
    const base64 = data.includes(',') ? data.split(',')[1] : data;
    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) return error(res, 'Empty file');
    const { FuelStationSheetService } = await import('../services/FuelStationSheetService.js');
    const result = await FuelStationSheetService.importSheet(String(req.params.id), {
      fileName,
      buffer,
      uploadedBy: req.user?.id,
      notes,
    });
    await AuditService.log({
      tenantId: String(req.params.id),
      userId: req.user?.id,
      userEmail: req.user?.email,
      action: 'fuel_station_sheet.upload',
      resourceType: 'fuel_station_upload',
      resourceId: result.uploadId,
    });
    return success(res, result);
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.delete('/tenants/:id/fuel-station-sheets/:uploadId', async (req: AuthRequest, res) => {
  try {
    const { FuelStationSheetService } = await import('../services/FuelStationSheetService.js');
    const ok = await FuelStationSheetService.deleteUpload(String(req.params.id), String(req.params.uploadId));
    if (!ok) return error(res, 'Upload not found', 404);
    await AuditService.log({
      tenantId: String(req.params.id),
      userId: req.user?.id,
      userEmail: req.user?.email,
      action: 'fuel_station_sheet.delete',
      resourceType: 'fuel_station_upload',
      resourceId: String(req.params.uploadId),
    });
    return success(res, { deleted: true });
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.put('/tenants/:id/modules', async (req: AuthRequest, res) => {
  const { modules } = req.body as {
    modules: Array<{ key: string; isEnabled: boolean; isVisible?: boolean }>;
  };
  if (!Array.isArray(modules)) return error(res, 'modules array required');

  for (const m of modules) {
    await query(
      `INSERT INTO tenant_modules (tenant_id, module_key, is_enabled, is_visible)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, module_key) DO UPDATE SET is_enabled = $3, is_visible = $4`,
      [req.params.id, m.key, m.isEnabled, m.isVisible ?? true]
    );
  }
  await AuditService.log({
    tenantId: String(req.params.id),
    userId: req.user?.id,
    userEmail: req.user?.email,
    action: 'modules.update',
    resourceType: 'tenant_modules',
    resourceId: String(req.params.id),
  });
  return success(res, { updated: modules.length });
});

// ─── Tenant users ────────────────────────────────────────────────────────────

router.get('/tenants/:id/users', async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.email, u.full_name, u.role, u.is_active, u.last_login_at, u.created_at,
            COALESCE(
              (SELECT JSON_ARRAYAGG(um.module_key)
               FROM user_modules um WHERE um.user_id = u.id AND um.is_enabled = true),
              JSON_ARRAY()
            ) AS modules
     FROM users u WHERE u.tenant_id = $1 ORDER BY u.full_name`,
    [req.params.id]
  );
  return success(res, rows);
});

router.get('/tenants/:id/users/:userId', async (req, res) => {
  const userId = String(req.params.userId);
  const { rows } = await query(
    `SELECT u.id, u.email, u.full_name, u.role, u.is_active, u.last_login_at, u.created_at
     FROM users u WHERE u.id = $2 AND u.tenant_id = $1`,
    [req.params.id, userId]
  );
  if (!rows[0]) return error(res, 'User not found', 404);
  const modules = await getUserModules(userId);
  return success(res, { ...rows[0], modules });
});

router.post('/tenants/:id/users', async (req: AuthRequest, res) => {
  const { email, password, fullName, role, modules } = req.body;
  if (!email || !String(email).trim()) return error(res, 'email required');
  try {
    const user = await createTenantUser({
      tenantId: String(req.params.id),
      email,
      password,
      fullName,
      role,
      modules: Array.isArray(modules) ? (modules as string[]) : undefined,
      forcePasswordChange: true,
      actorUserId: req.user?.id,
      actorEmail: req.user?.email,
      auditAction: 'user.create',
      auditDetails: { by: 'admin' },
    });
    return success(res, user, 201);
  } catch (e) {
    const err = e as Error & { status?: number };
    return error(res, err.message, err.status || 500);
  }
});

router.get('/tenants/:id/wialon/users', async (req, res) => {
  try {
    const tenantId = String(req.params.id);
    const row = await getTenantWialonRow(tenantId);
    if (!isWialonTenantConnected(row)) {
      return error(res, 'Wialon is not connected for this tenant', 400);
    }
    const creds = await loadTenantWialonCreds(tenantId);
    const accountId = Number(creds.accountId);
    if (!accountId) return error(res, 'No Wialon account linked for this tenant', 400);

    const [wialonUsers, provisionedRows] = await Promise.all([
      WialonHierarchyService.getUsersForAccount(creds, accountId),
      query<{ wialon_user_id: number; id: string }>(
        `SELECT id, wialon_user_id FROM users WHERE tenant_id = $1 AND wialon_user_id IS NOT NULL`,
        [tenantId]
      ),
    ]);
    const byWialonId = new Map(
      provisionedRows.rows.map((r) => [Number(r.wialon_user_id), r.id])
    );

    return success(res, {
      accountId,
      accountName: row?.wialon_account_name || String(accountId),
      users: wialonUsers.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        lastLogin: u.lastLogin,
        provisioned: byWialonId.has(u.id),
        mamsUserId: byWialonId.get(u.id) || null,
      })),
    });
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.post('/tenants/:id/users/from-wialon', async (req: AuthRequest, res) => {
  try {
    const tenantId = String(req.params.id);
    const wialonUserId = Number(req.body?.wialonUserId);
    if (!Number.isFinite(wialonUserId) || wialonUserId <= 0) {
      return error(res, 'wialonUserId is required');
    }

    const result = await WialonUserProvisionService.provisionOneUser(tenantId, wialonUserId);
    const user = result.users[0];
    if (!user) return error(res, 'Failed to provision user');

    const { role, modules } = req.body as { role?: string; modules?: string[] };
    if (role && isValidTenantRole(String(role))) {
      await query(`UPDATE users SET role = $2, updated_at = NOW() WHERE id = $1`, [user.id, role]);
    }
    if (Array.isArray(modules)) {
      await query(`DELETE FROM user_modules WHERE user_id = $1`, [user.id]);
      for (const mod of modules as string[]) {
        await query(
          `INSERT INTO user_modules (user_id, module_key, is_enabled) VALUES ($1, $2, true) ON CONFLICT DO NOTHING`,
          [user.id, mod]
        );
      }
    }

    await AuditService.log({
      tenantId,
      userId: req.user?.id,
      userEmail: req.user?.email,
      action: 'user.create_from_wialon',
      resourceType: 'user',
      resourceId: user.id,
      details: { wialonUserId, email: user.email },
    });

    return success(res, {
      ...user,
      role: role || user.role,
      temporaryPassword: user.temporaryPassword,
    }, user.created ? 201 : 200);
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.patch('/tenants/:tenantId/users/:userId', async (req: AuthRequest, res) => {
  const userId = String(req.params.userId);
  const { isActive, role, fullName, modules } = req.body;
  if (role && !isValidTenantRole(String(role))) {
    return error(res, 'Invalid role for client user');
  }
  const { rows } = await query(
    `UPDATE users SET is_active = COALESCE($3, is_active), role = COALESCE($4, role),
                      full_name = COALESCE($5, full_name), updated_at = NOW()
     WHERE id = $2 AND tenant_id = $1 RETURNING id, email, full_name, role, is_active`,
    [req.params.tenantId, userId, isActive, role, fullName]
  );
  if (!rows[0]) return error(res, 'User not found', 404);
  if (Array.isArray(modules)) {
    await query(`DELETE FROM user_modules WHERE user_id = $1`, [userId]);
    for (const mod of modules as string[]) {
      await query(
        `INSERT INTO user_modules (user_id, module_key, is_enabled) VALUES ($1, $2, true)`,
        [userId, mod]
      );
    }
  }
  await AuditService.log({
    tenantId: String(req.params.tenantId),
    userId: req.user?.id,
    userEmail: req.user?.email,
    action: 'user.update',
    resourceType: 'user',
    resourceId: userId,
    details: { role, isActive, fullName },
  });
  return success(res, {
    ...rows[0],
    modules: Array.isArray(modules) ? modules : await getUserModules(userId),
  });
});

router.delete('/tenants/:tenantId/users/:userId', async (req: AuthRequest, res) => {
  await query(`UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`, [
    req.params.userId, req.params.tenantId,
  ]);
  await AuditService.log({
    tenantId: String(req.params.tenantId),
    userId: req.user?.id,
    userEmail: req.user?.email,
    action: 'user.deactivate',
    resourceType: 'user',
    resourceId: String(req.params.userId),
  });
  return success(res, { deactivated: true });
});

// ─── Migration / Export ──────────────────────────────────────────────────────

router.get('/tenants/:id/export', async (req, res) => {
  const include = String(req.query.include || 'all').split(',');
  const data = await AdminOrchestrator.exportTenantData(String(req.params.id), include);
  return success(res, data);
});

router.post('/tenants/:id/import', async (req: AuthRequest, res) => {
  const { data, skipDuplicates } = req.body;
  if (!data || typeof data !== 'object') return error(res, 'data object required');
  let imported = 0;

  if (Array.isArray(data.drivers)) {
    for (const d of data.drivers as Array<Record<string, unknown>>) {
      try {
        await query(
          `INSERT INTO drivers (tenant_id, name, license_number, phone, email, status)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (tenant_id, license_number) DO ${
             skipDuplicates ? 'NOTHING' : 'UPDATE SET name = EXCLUDED.name'
           }`,
          [req.params.id, d.name, d.license_number || d.licenseNumber, d.phone || '', d.email, d.status || 'available']
        );
        imported++;
      } catch { /* skip bad rows */ }
    }
  }

  await AuditService.log({
    tenantId: String(req.params.id),
    userId: req.user?.id,
    userEmail: req.user?.email,
    action: 'data.import',
    resourceType: 'tenant',
    resourceId: String(req.params.id),
    details: { imported },
  });
  return success(res, { imported });
});

// ─── Backup ──────────────────────────────────────────────────────────────────

router.get('/tenants/:id/backups', async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM tenant_backups WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.params.id]
  );
  const { rows: settings } = await query(
    `SELECT * FROM tenant_backup_settings WHERE tenant_id = $1`,
    [req.params.id]
  );
  return success(res, { backups: rows, settings: settings[0] || null });
});

router.put('/tenants/:id/backups/settings', async (req, res) => {
  const { autoBackup, frequency, backupTime, retentionDays } = req.body;
  const { rows } = await query(
    `INSERT INTO tenant_backup_settings (tenant_id, auto_backup, frequency, backup_time, retention_days, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET
       auto_backup = COALESCE($2, tenant_backup_settings.auto_backup),
       frequency = COALESCE($3, tenant_backup_settings.frequency),
       backup_time = COALESCE($4, tenant_backup_settings.backup_time),
       retention_days = COALESCE($5, tenant_backup_settings.retention_days),
       updated_at = NOW()
     RETURNING *`,
    [req.params.id, autoBackup, frequency, backupTime, retentionDays]
  );
  return success(res, rows[0]);
});

router.post('/tenants/:id/backups', async (req: AuthRequest, res) => {
  try {
    const result = await AdminOrchestrator.createBackup(String(req.params.id), req.body.type || 'full');
    await AuditService.log({
      tenantId: String(req.params.id),
      userId: req.user?.id,
      userEmail: req.user?.email,
      action: 'backup.create',
      resourceType: 'backup',
      resourceId: result.id,
    });
    return success(res, result, 201);
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

// ─── Audit ───────────────────────────────────────────────────────────────────

router.get('/tenants/:id/audit', async (req, res) => {
  const action = String(req.query.action || '');
  const params: unknown[] = [req.params.id];
  let where = 'WHERE tenant_id = $1';
  if (action && action !== 'all') {
    params.push(action);
    where += ` AND action = $${params.length}`;
  }
  const { rows } = await query(
    `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT 100`,
    params
  );
  return success(res, rows);
});

router.get('/audit', async (req, res) => {
  const { rows } = await query(
    `SELECT al.*, t.name as tenant_name FROM audit_logs al
     LEFT JOIN tenants t ON t.id = al.tenant_id
     ORDER BY al.created_at DESC LIMIT 200`
  );
  return success(res, rows);
});

// ─── API Keys ────────────────────────────────────────────────────────────────

router.get('/tenants/:id/api-keys', async (req, res) => {
  const { rows } = await query(
    `SELECT id, name, key_prefix, permissions, expires_at, last_used_at, is_active, created_at
     FROM tenant_api_keys WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [req.params.id]
  );
  return success(res, rows);
});

router.post('/tenants/:id/api-keys', async (req: AuthRequest, res) => {
  const { name, permissions, expiresInDays } = req.body;
  if (!name) return error(res, 'name required');
  const { raw, prefix, hash } = AdminOrchestrator.generateApiKey();
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 86400000)
    : null;

  const { rows } = await query(
    `INSERT INTO tenant_api_keys (tenant_id, name, key_prefix, key_hash, permissions, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, key_prefix, permissions, expires_at, created_at`,
    [req.params.id, name, prefix, hash, permissions || ['read'], expiresAt]
  );

  await AuditService.log({
    tenantId: String(req.params.id),
    userId: req.user?.id,
    userEmail: req.user?.email,
    action: 'api_key.create',
    resourceType: 'api_key',
    resourceId: rows[0].id as string,
  });

  return success(res, { ...rows[0], key: raw }, 201);
});

router.delete('/tenants/:id/api-keys/:keyId', async (req, res) => {
  await query(`UPDATE tenant_api_keys SET is_active = false WHERE id = $1 AND tenant_id = $2`, [
    req.params.keyId, req.params.id,
  ]);
  return success(res, { revoked: true });
});

export default router;
