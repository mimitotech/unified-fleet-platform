import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../config/database.js';
import { AuditService } from '../services/AuditService.js';
import { isValidTenantRole } from '../utils/userAccess.js';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware, requireTenant, type TenantRequest } from '../middleware/tenant.js';
import { getAllowedModules } from '../middleware/rbac.js';
import { success, error } from '../utils/response.js';
import { AssetOrchestrator } from '../orchestrators/AssetOrchestrator.js';
import { AlertOrchestrator } from '../orchestrators/AlertOrchestrator.js';
import { DashboardOrchestrator } from '../orchestrators/DashboardOrchestrator.js';
import { WialonFleetService } from '../services/WialonFleetService.js';
import {
  isWialonTenantConnected,
  wialonSyncWarning,
} from '../services/wialonConnectionStatus.js';
import {
  fleetUnitToAsset,
  fleetUnitToStatusItem,
  fleetToSnapshotResponse,
} from '../services/wialonFleetMapper.js';
import { logger } from '../config/logger.js';
import { toCamelCase } from '../utils/mapper.js';

import domainRoutes from './domain/index.js';
import clientWialonRoutes from './clientWialon.js';

const router = Router();
router.use(authMiddleware);
router.use(tenantMiddleware);

async function loadCachedLiveFleet(tenantId: string) {
  if (!(await WialonFleetService.isLiveAvailable(tenantId))) return null;
  try {
    return await WialonFleetService.getCachedLiveFleet(tenantId);
  } catch (err) {
    logger.warn(`Live Wialon fleet failed for tenant ${tenantId}`, err);
    return null;
  }
}

// Tenant info (for branding)
router.get('/tenant', requireTenant, async (req: TenantRequest, res) => {
  const { rows } = await query(`SELECT * FROM tenants WHERE id = $1`, [req.tenantId]);
  if (!rows[0]) return error(res, 'Tenant not found', 404);
  const t = rows[0] as Record<string, unknown>;
  const assetPath = (value: unknown): string | null => {
    if (value == null || value === '') return null;
    const s = String(value).trim();
    const local = s.match(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/uploads\/.+)$/i);
    if (local) return local[3];
    return s || null;
  };
  return success(res, {
    id: t.id,
    name: t.name,
    slug: t.slug,
    primaryColor: t.primary_color,
    secondaryColor: t.secondary_color,
    accentColor: t.accent_color,
    logoUrl: assetPath(t.logo_url),
    faviconUrl: assetPath(t.favicon_url),
    customCss: t.custom_css,
    contactEmail: t.contact_email,
    phone: t.phone,
    timezone: t.timezone,
  });
});

// Integration status for client header
router.get('/integrations/status', requireTenant, async (req: TenantRequest, res) => {
  const { rows } = await query(
    `SELECT source_type, is_active, last_sync_at, last_error, connection_verified_at,
            wialon_account_name, wialon_resource_id, wialon_operate_as, wialon_session_meta, preview_asset_count
     FROM data_sources WHERE tenant_id = $1`,
    [req.tenantId]
  );
  return success(res, rows.map((r: Record<string, unknown>) => ({
    sourceType: r.source_type,
    isActive: r.is_active,
    lastSyncAt: r.last_sync_at,
    lastError: r.source_type === 'wialon'
      ? wialonSyncWarning({
          last_error: r.last_error as string | null,
          wialon_session_meta: r.wialon_session_meta as Record<string, unknown> | null,
        })
      : r.last_error,
    verified: !!r.connection_verified_at,
    connected:
      r.source_type === 'wialon'
        ? isWialonTenantConnected({
            is_active: Boolean(r.is_active),
            connection_verified_at: r.connection_verified_at as string | null,
            wialon_resource_id: r.wialon_resource_id as number | null,
          })
        : Boolean(r.is_active && r.connection_verified_at && !r.last_error),
    wialonAccountName: r.wialon_account_name,
    wialonAccountId: r.wialon_resource_id,
    wialonOperateAs: r.wialon_operate_as,
    wialonMeta: r.wialon_session_meta,
    previewAssetCount: r.preview_asset_count,
  })));
});

// Enabled modules for client navigation (enabled = show in nav; isVisible = data access)
router.get('/modules', requireTenant, async (req: TenantRequest, res) => {
  const { rows: connectedSources } = await query<{ source_type: string }>(
    `SELECT source_type FROM data_sources WHERE tenant_id = $1 AND is_active = true AND connection_verified_at IS NOT NULL`,
    [req.tenantId]
  );
  const connected = new Set(connectedSources.map((s) => s.source_type));

  const { rows } = await query(
    `SELECT md.\`key\` as moduleKey, md.label, md.icon, md.sources, md.sort_order as sortOrder,
            tm.is_enabled as isEnabled, COALESCE(tm.is_visible, true) as isVisible
     FROM tenant_modules tm
     JOIN module_definitions md ON md.\`key\` = tm.module_key
     WHERE tm.tenant_id = $1 AND tm.is_enabled = true
     ORDER BY md.sort_order`,
    [req.tenantId]
  );

  const role = req.user?.role || 'viewer';
  const allowed = getAllowedModules(role);
  const moduleRows = rows as Array<{
    moduleKey: string;
    sources?: string[];
    sortOrder: number;
    isEnabled: boolean;
    isVisible: boolean;
  }>;

  let filtered = moduleRows.filter((m) => allowed.includes('*') || allowed.includes(m.moduleKey));

  if (req.user?.id && role !== 'platform_admin' && role !== 'super_admin' && role !== 'tenant_admin') {
    const { rows: userMods } = await query<{ module_key: string; is_enabled: boolean }>(
      `SELECT module_key, is_enabled FROM user_modules WHERE user_id = $1`,
      [req.user.id]
    );
    if (userMods.length > 0) {
      const enabledKeys = new Set(userMods.filter((m) => m.is_enabled).map((m) => m.module_key));
      filtered = filtered.filter((m) => enabledKeys.has(m.moduleKey));
    }
  }

  const result = filtered.map((m) => {
    const required = m.sources || [];
    const integrationReady =
      required.length === 0 || required.some((s) => connected.has(s));
    return { ...m, integrationReady };
  });

  return success(res, result);
});

// User preferences
router.get('/preferences', requireTenant, async (req: TenantRequest, res) => {
  const { rows } = await query(`SELECT * FROM user_preferences WHERE user_id = $1`, [req.user!.id]);
  if (rows[0]) return success(res, toCamelCase(rows[0] as Record<string, unknown>));
  return success(res, {
    language: 'en', timezone: 'UTC', dateFormat: 'YYYY-MM-DD',
    timeFormat: '24h', unitSystem: 'metric',
    emailNotifications: true, inAppNotifications: true, smsNotifications: false,
  });
});

router.put('/preferences', requireTenant, async (req: TenantRequest, res) => {
  const b = req.body;
  const { rows } = await query(
    `INSERT INTO user_preferences (user_id, language, timezone, date_format, time_format, unit_system,
      email_notifications, in_app_notifications, sms_notifications, dashboard_layout, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       language = COALESCE($2, user_preferences.language),
       timezone = COALESCE($3, user_preferences.timezone),
       date_format = COALESCE($4, user_preferences.date_format),
       time_format = COALESCE($5, user_preferences.time_format),
       unit_system = COALESCE($6, user_preferences.unit_system),
       email_notifications = COALESCE($7, user_preferences.email_notifications),
       in_app_notifications = COALESCE($8, user_preferences.in_app_notifications),
       sms_notifications = COALESCE($9, user_preferences.sms_notifications),
       dashboard_layout = COALESCE($10, user_preferences.dashboard_layout),
       updated_at = NOW()
     RETURNING *`,
    [
      req.user!.id, b.language, b.timezone, b.dateFormat, b.timeFormat, b.unitSystem,
      b.emailNotifications, b.inAppNotifications, b.smsNotifications,
      b.dashboardLayout ? JSON.stringify(b.dashboardLayout) : null,
    ]
  );
  return success(res, rows[0] ? toCamelCase(rows[0] as Record<string, unknown>) : null);
});

// Tenant users (tenant_admin only)
function isTenantAdmin(req: TenantRequest): boolean {
  return ['tenant_admin', 'platform_admin', 'super_admin'].includes(req.user?.role || '');
}

router.get('/users', requireTenant, async (req: TenantRequest, res) => {
  if (!isTenantAdmin(req)) return error(res, 'Forbidden', 403);
  const { rows } = await query(
    `SELECT id, email, full_name, role, is_active, last_login_at, created_at
     FROM users WHERE tenant_id = $1 ORDER BY full_name`,
    [req.tenantId]
  );
  return success(res, rows);
});

router.post('/users', requireTenant, async (req: TenantRequest, res) => {
  if (!isTenantAdmin(req)) return error(res, 'Forbidden', 403);
  const { email, password, fullName, role } = req.body as {
    email?: string; password?: string; fullName?: string; role?: string;
  };
  if (!email || !/\S+@\S+\.\S+/.test(email)) return error(res, 'A valid email is required');
  const userRole = role || 'viewer';
  if (!isValidTenantRole(userRole)) return error(res, 'Invalid role');

  const temporaryPassword = password || crypto.randomBytes(8).toString('hex');
  const hash = await bcrypt.hash(temporaryPassword, 10);
  try {
    const { rows } = await query(
      `INSERT INTO users (tenant_id, email, password_hash, full_name, role, force_password_change)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id, email, full_name, role, is_active, created_at`,
      [req.tenantId, email.toLowerCase().trim(), hash, fullName || email, userRole]
    );
    await AuditService.log({
      tenantId: req.tenantId,
      userId: req.user?.id,
      userEmail: req.user?.email,
      action: 'user.create',
      resourceType: 'user',
      resourceId: rows[0].id as string,
      details: { email, role: userRole, by: 'tenant_admin' },
    });
    return success(res, { ...rows[0], temporaryPassword: password ? undefined : temporaryPassword }, 201);
  } catch (e) {
    const msg = (e as Error).message || '';
    if (msg.includes('duplicate') || msg.includes('unique')) {
      return error(res, 'A user with this email already exists', 409);
    }
    throw e;
  }
});

router.patch('/users/:userId', requireTenant, async (req: TenantRequest, res) => {
  if (!isTenantAdmin(req)) return error(res, 'Forbidden', 403);
  const userId = String(req.params.userId);
  const { fullName, role, isActive } = req.body as {
    fullName?: string; role?: string; isActive?: boolean;
  };
  if (role && !isValidTenantRole(String(role))) return error(res, 'Invalid role');
  if (userId === req.user?.id && (role !== undefined || isActive === false)) {
    return error(res, 'You cannot change your own role or deactivate yourself');
  }
  const { rows } = await query(
    `UPDATE users SET full_name = COALESCE($3, full_name), role = COALESCE($4, role),
                      is_active = COALESCE($5, is_active), updated_at = NOW()
     WHERE id = $2 AND tenant_id = $1
     RETURNING id, email, full_name, role, is_active`,
    [req.tenantId, userId, fullName, role, isActive]
  );
  if (!rows[0]) return error(res, 'User not found', 404);
  await AuditService.log({
    tenantId: req.tenantId,
    userId: req.user?.id,
    userEmail: req.user?.email,
    action: 'user.update',
    resourceType: 'user',
    resourceId: userId,
    details: { fullName, role, isActive, by: 'tenant_admin' },
  });
  return success(res, rows[0]);
});

router.delete('/users/:userId', requireTenant, async (req: TenantRequest, res) => {
  if (!isTenantAdmin(req)) return error(res, 'Forbidden', 403);
  const userId = String(req.params.userId);
  if (userId === req.user?.id) return error(res, 'You cannot remove your own account');
  const { rows } = await query(
    `UPDATE users SET is_active = false, updated_at = NOW()
     WHERE id = $2 AND tenant_id = $1 RETURNING id`,
    [req.tenantId, userId]
  );
  if (!rows[0]) return error(res, 'User not found', 404);
  await AuditService.log({
    tenantId: req.tenantId,
    userId: req.user?.id,
    userEmail: req.user?.email,
    action: 'user.deactivate',
    resourceType: 'user',
    resourceId: userId,
    details: { by: 'tenant_admin' },
  });
  return success(res, { deactivated: true });
});

router.post('/users/:userId/reset-password', requireTenant, async (req: TenantRequest, res) => {
  if (!isTenantAdmin(req)) return error(res, 'Forbidden', 403);
  const userId = String(req.params.userId);
  if (userId === req.user?.id) {
    return error(res, 'Use the change password form in Account to update your own password');
  }
  const temporaryPassword = (req.body?.password as string) || crypto.randomBytes(8).toString('hex');
  const hash = await bcrypt.hash(temporaryPassword, 10);
  const { rows } = await query(
    `UPDATE users SET password_hash = $3, force_password_change = true, updated_at = NOW()
     WHERE id = $2 AND tenant_id = $1 RETURNING id, email`,
    [req.tenantId, userId, hash]
  );
  if (!rows[0]) return error(res, 'User not found', 404);
  await AuditService.log({
    tenantId: req.tenantId,
    userId: req.user?.id,
    userEmail: req.user?.email,
    action: 'user.reset_password',
    resourceType: 'user',
    resourceId: userId,
    details: { by: 'tenant_admin' },
  });
  return success(res, { reset: true, temporaryPassword });
});

// Dashboard KPIs
router.get('/dashboard/kpis', requireTenant, async (req: TenantRequest, res) => {
  const orch = new DashboardOrchestrator(req.tenantId!);
  const kpis = await orch.getKpis();
  return success(res, kpis);
});

/** Unified fleet snapshot — single source for map, list, KPIs (live Wialon or DB). */
router.get('/fleet/snapshot', requireTenant, async (req: TenantRequest, res) => {
  const fleet = await loadCachedLiveFleet(req.tenantId!);
  if (fleet) {
    return success(res, fleetToSnapshotResponse(fleet, true));
  }

  const orch = new AssetOrchestrator(req.tenantId!);
  await orch.initialize();
  const assets = await orch.getUnifiedAssets();
  const { items, fetchedAt } = await orch.getAllStatuses();

  const byStatus = { moving: 0, idle: 0, stopped: 0, offline: 0 };
  const byKind: Record<string, number> = {};
  const byHwName: Record<string, number> = {};
  let withPosition = 0;

  const units = items.map((row) => {
    const st = (row.status as { status?: string; location?: { latitude?: number; longitude?: number; speed?: number; timestamp?: Date }; fuelLevel?: number } | null);
    const status = (st?.status || 'offline') as 'moving' | 'idle' | 'stopped' | 'offline';
    if (status in byStatus) byStatus[status as keyof typeof byStatus]++;
    const asset = row.asset as {
      name?: string;
      registrationPlate?: string;
      wialonKind?: string;
      modules?: string[];
      hardware?: string;
      hwName?: string;
      sources?: Array<{ type?: string; id?: string }>;
    } | undefined;
    const kind = asset?.wialonKind || 'tracker';
    byKind[kind] = (byKind[kind] || 0) + 1;
    const hwLabel = asset?.hwName || asset?.hardware || 'Unknown';
    byHwName[hwLabel] = (byHwName[hwLabel] || 0) + 1;
    const loc = st?.location;
    const hasPos = loc?.latitude != null && loc?.longitude != null;
    if (hasPos) withPosition++;

    const wialonSrc = asset?.sources?.find((s) => s.type === 'wialon');
    const wialonId = wialonSrc?.id && Number.isFinite(Number(wialonSrc.id)) ? Number(wialonSrc.id) : undefined;

    return {
      id: wialonId != null ? String(wialonId) : row.assetId,
      wialonId,
      name: asset?.name || `Unit ${row.assetId}`,
      plate: asset?.registrationPlate,
      kind,
      hwName: hwLabel,
      modules: asset?.modules || [],
      hardware: asset?.hardware,
      status,
      fuelLevel: st?.fuelLevel,
      position: hasPos
        ? {
            lat: loc!.latitude!,
            lng: loc!.longitude!,
            speed: loc?.speed ?? 0,
            time: loc?.timestamp ? Math.floor(new Date(loc.timestamp).getTime() / 1000) : Math.floor(Date.now() / 1000),
          }
        : undefined,
    };
  });

  return success(res, {
    live: false,
    stale: false,
    fetchedAt: fetchedAt || new Date().toISOString(),
    units,
    counts: {
      total: units.length,
      moving: byStatus.moving,
      idle: byStatus.idle,
      stopped: byStatus.stopped,
      offline: byStatus.offline,
      withPosition,
      byKind,
      byHwName,
    },
    assetCount: assets.length,
  });
});

// Unified assets
router.get('/assets', requireTenant, async (req: TenantRequest, res) => {
  const fleet = await loadCachedLiveFleet(req.tenantId!);
  if (fleet) {
    return success(res, fleet.units.map(fleetUnitToAsset));
  }

  const orch = new AssetOrchestrator(req.tenantId!);
  await orch.initialize();
  const assets = await orch.getUnifiedAssets();
  return success(res, assets);
});

router.get('/assets/:id/status', requireTenant, async (req: TenantRequest, res) => {
  const id = String(req.params.id);
  const fleet = await loadCachedLiveFleet(req.tenantId!);
  if (fleet) {
    const unit = fleet.units.find((u) => String(u.id) === id);
    if (unit) {
      return success(res, fleetUnitToStatusItem(unit).status);
    }
  }

  const orch = new AssetOrchestrator(req.tenantId!);
  await orch.initialize();
  const status = await orch.getUnifiedStatus(id);
  return success(res, status);
});

router.get('/assets/statuses', requireTenant, async (req: TenantRequest, res) => {
  const fleet = await loadCachedLiveFleet(req.tenantId!);
  if (fleet) {
    const items = fleet.units.map(fleetUnitToStatusItem);
    return success(res, {
      items,
      fetchedAt: fleet.fetchedAt,
      stale: false,
      live: true,
    });
  }

  const orch = new AssetOrchestrator(req.tenantId!);
  const payload = await orch.getAllStatuses();
  return success(res, { ...payload, live: false });
});

// Alerts — sync from Wialon when requested (throttled per tenant), then read inbox
const alertSyncAt = new Map<string, number>();
const ALERT_SYNC_MIN_MS = 20_000;

router.get('/alerts', requireTenant, async (req: TenantRequest, res) => {
  const limit = parseInt(String(req.query.limit || '50'), 10);
  const acknowledged = req.query.acknowledged === 'true' ? true : req.query.acknowledged === 'false' ? false : undefined;
  const parseDate = (v: unknown): Date | undefined => {
    if (!v) return undefined;
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? undefined : d;
  };
  const from = parseDate(req.query.from);
  const to = parseDate(req.query.to);
  const orch = new AlertOrchestrator(req.tenantId!);
  // Default: read inbox only. Sync is expensive (Wialon round-trips) — opt in with ?sync=1
  const wantSync = req.query.sync === '1' || req.query.sync === 'true';
  if (wantSync) {
    const last = alertSyncAt.get(req.tenantId!) || 0;
    if (Date.now() - last >= ALERT_SYNC_MIN_MS) {
      alertSyncAt.set(req.tenantId!, Date.now());
      try {
        await orch.syncFromAdapters();
      } catch {
        /* still return cached inbox */
      }
    }
  }
  const alerts = await orch.getAlerts(limit, acknowledged, from, to);
  return success(res, alerts);
});

router.post('/alerts/acknowledge-bulk', requireTenant, async (req: TenantRequest, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? (req.body.ids as unknown[]).map(String).filter(Boolean)
    : undefined;
  const orch = new AlertOrchestrator(req.tenantId!);
  const acknowledged = await orch.acknowledgeMany(ids);
  return success(res, { acknowledged });
});

router.post('/alerts/sync', requireTenant, async (req: TenantRequest, res) => {
  const orch = new AlertOrchestrator(req.tenantId!);
  const inserted = await orch.syncFromAdapters();
  alertSyncAt.set(req.tenantId!, Date.now());
  return success(res, { inserted });
});

router.post('/alerts/:id/acknowledge', requireTenant, async (req: TenantRequest, res) => {
  const orch = new AlertOrchestrator(req.tenantId!);
  await orch.acknowledge(String(req.params.id));
  return success(res, { acknowledged: true });
});

router.use('/', clientWialonRoutes);

// Domain modules (drivers, routes, fuel, workshop, emissions, surveillance, geofences)
router.use('/', domainRoutes);

export default router;
