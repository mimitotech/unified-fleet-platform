import { Router } from 'express';
import { query } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware, requireTenant, type TenantRequest } from '../middleware/tenant.js';
import { success, error } from '../utils/response.js';
import { AssetOrchestrator } from '../orchestrators/AssetOrchestrator.js';
import { AlertOrchestrator } from '../orchestrators/AlertOrchestrator.js';
import { DashboardOrchestrator } from '../orchestrators/DashboardOrchestrator.js';

import domainRoutes from './domain/index.js';

const router = Router();
router.use(authMiddleware);
router.use(tenantMiddleware);

// Tenant info (for branding)
router.get('/tenant', requireTenant, async (req: TenantRequest, res) => {
  const { rows } = await query(`SELECT * FROM tenants WHERE id = $1`, [req.tenantId]);
  if (!rows[0]) return error(res, 'Tenant not found', 404);
  const t = rows[0] as Record<string, unknown>;
  return success(res, {
    id: t.id,
    name: t.name,
    slug: t.slug,
    primaryColor: t.primary_color,
    secondaryColor: t.secondary_color,
    logoUrl: t.logo_url,
    faviconUrl: t.favicon_url,
  });
});

// Enabled modules for sidebar
router.get('/modules', requireTenant, async (req: TenantRequest, res) => {
  const { rows } = await query(
    `SELECT md.key as "moduleKey", md.label, md.icon, md.sources, tm.is_enabled as "isEnabled"
     FROM tenant_modules tm
     JOIN module_definitions md ON md.key = tm.module_key
     WHERE tm.tenant_id = $1 AND tm.is_enabled = true
     ORDER BY md.sort_order`,
    [req.tenantId]
  );
  return success(res, rows);
});

// Dashboard KPIs
router.get('/dashboard/kpis', requireTenant, async (req: TenantRequest, res) => {
  const orch = new DashboardOrchestrator(req.tenantId!);
  const kpis = await orch.getKpis();
  return success(res, kpis);
});

// Unified assets
router.get('/assets', requireTenant, async (req: TenantRequest, res) => {
  const orch = new AssetOrchestrator(req.tenantId!);
  await orch.initialize();
  const assets = await orch.getUnifiedAssets();
  return success(res, assets);
});

router.get('/assets/:id/status', requireTenant, async (req: TenantRequest, res) => {
  const id = String(req.params.id);
  const orch = new AssetOrchestrator(req.tenantId!);
  await orch.initialize();
  const status = await orch.getUnifiedStatus(id);
  return success(res, status);
});

router.get('/assets/statuses', requireTenant, async (req: TenantRequest, res) => {
  const orch = new AssetOrchestrator(req.tenantId!);
  await orch.initialize();
  const statuses = await orch.getAllStatuses();
  return success(res, statuses);
});

// Alerts
router.get('/alerts', requireTenant, async (req: TenantRequest, res) => {
  const limit = parseInt(String(req.query.limit || '50'), 10);
  const acknowledged = req.query.acknowledged === 'true' ? true : req.query.acknowledged === 'false' ? false : undefined;
  const orch = new AlertOrchestrator(req.tenantId!);
  const alerts = await orch.getAlerts(limit, acknowledged);
  return success(res, alerts);
});

router.post('/alerts/:id/acknowledge', requireTenant, async (req: TenantRequest, res) => {
  const orch = new AlertOrchestrator(req.tenantId!);
  await orch.acknowledge(String(req.params.id));
  return success(res, { acknowledged: true });
});

// Domain modules (drivers, routes, fuel, workshop, emissions, surveillance, geofences, reports)
router.use('/', domainRoutes);

export default router;
