import { Router } from 'express';
import { authMiddleware, requireAdminAccess } from '../middleware/auth.js';
import { requireTenantAccess } from '../middleware/tenantAccess.js';
import { success, error } from '../utils/response.js';
import { query } from '../config/database.js';
import { WialonHierarchyService } from '../services/WialonHierarchyService.js';
import { WialonLiveService } from '../services/WialonLiveService.js';
import { loadTenantWialonCreds, parseWialonCredsFromBody, } from '../services/tenantWialonCredentials.js';
import { WialonAccountLinkService } from '../services/WialonUserProvisionService.js';
import { isWialonTenantConnected, wialonSyncWarning } from '../services/wialonConnectionStatus.js';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const router = Router();
router.use(authMiddleware);
router.use(requireAdminAccess);
/** Probe any token without saving (platform admin) */
router.post('/wialon/probe', async (req, res) => {
    try {
        const creds = parseWialonCredsFromBody((req.body.credentials || req.body));
        const probe = await WialonHierarchyService.probe(creds);
        return success(res, probe);
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.param('id', (req, res, next, id) => {
    if (!UUID_RE.test(id))
        return error(res, 'Invalid id: must be a valid UUID', 400);
    return next();
});
router.use('/tenants/:id', requireTenantAccess('id'));
router.get('/tenants/:id/wialon/hierarchy', async (req, res) => {
    try {
        const creds = await loadTenantWialonCreds(String(req.params.id));
        const probe = await WialonHierarchyService.probe(creds);
        return success(res, probe);
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.post('/tenants/:id/wialon/probe', async (req, res) => {
    try {
        const creds = req.body?.token
            ? parseWialonCredsFromBody((req.body.credentials || req.body))
            : await loadTenantWialonCreds(String(req.params.id));
        const probe = await WialonHierarchyService.probe(creds);
        return success(res, probe);
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/tenants/:id/wialon/accounts/:accountId/units', async (req, res) => {
    try {
        const creds = await loadTenantWialonCreds(String(req.params.id));
        const accountId = parseInt(String(req.params.accountId), 10);
        if (Number.isNaN(accountId))
            return error(res, 'Invalid Wialon account id');
        const units = await WialonHierarchyService.getUnitsForAccount(creds, accountId);
        return success(res, {
            accountId,
            count: units.length,
            units: units.map((u) => ({
                id: u.id,
                name: u.nm,
                accountId: u.bact,
                position: u.pos,
            })),
        });
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.post('/tenants/:id/wialon/link-account', async (req, res) => {
    try {
        const accountId = parseInt(String(req.body?.accountId ?? ''), 10);
        if (Number.isNaN(accountId))
            return error(res, 'accountId is required');
        const accountName = req.body?.accountName ? String(req.body.accountName) : undefined;
        const selectedUserIds = Array.isArray(req.body?.wialonUserIds)
            ? req.body.wialonUserIds.map((id) => parseInt(String(id), 10)).filter((n) => !Number.isNaN(n))
            : undefined;
        const motherAccountId = req.body?.motherAccountId ? String(req.body.motherAccountId) : undefined;
        const result = await WialonAccountLinkService.linkAccount(String(req.params.id), accountId, accountName, selectedUserIds, motherAccountId);
        return success(res, result);
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/wialon/overview', async (_req, res) => {
    try {
        const { rows } = await query(`SELECT t.id AS tenant_id, t.name AS tenant_name,
              ds.wialon_account_name, ds.wialon_resource_id, ds.wialon_operate_as,
              ds.is_active, ds.connection_verified_at, ds.last_sync_at, ds.last_error,
              ds.wialon_session_meta, ds.preview_asset_count
       FROM tenants t
       INNER JOIN data_sources ds ON ds.tenant_id = t.id AND ds.source_type = 'wialon'
       ORDER BY t.name`);
        return success(res, {
            tenants: rows.map((r) => ({
                tenantId: r.tenant_id,
                tenantName: r.tenant_name,
                accountName: r.wialon_account_name,
                accountId: r.wialon_resource_id,
                operateAs: r.wialon_operate_as,
                connected: isWialonTenantConnected({
                    is_active: r.is_active,
                    connection_verified_at: r.connection_verified_at,
                    wialon_resource_id: r.wialon_resource_id != null ? Number(r.wialon_resource_id) : null,
                }),
                accountTier: r.wialon_session_meta?.accountTier,
                counts: r.wialon_session_meta?.counts,
                lastSyncAt: r.last_sync_at,
                lastError: wialonSyncWarning({
                    last_error: r.last_error,
                    wialon_session_meta: r.wialon_session_meta,
                }),
                previewAssetCount: r.preview_asset_count,
            })),
            count: rows.length,
        });
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/tenants/:id/wialon/capabilities', async (req, res) => {
    try {
        const creds = await loadTenantWialonCreds(String(req.params.id));
        const caps = await WialonLiveService.getCapabilities(creds);
        return success(res, caps);
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/tenants/:id/wialon/routes', async (req, res) => {
    try {
        const creds = await loadTenantWialonCreds(String(req.params.id));
        const routes = await WialonLiveService.listRoutes(creds);
        return success(res, { routes, count: routes.length });
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.post('/tenants/:id/wialon/api', async (req, res) => {
    const svc = String(req.body?.svc || '');
    const params = (req.body?.params || {});
    if (!svc)
        return error(res, 'svc is required', 400);
    try {
        const creds = await loadTenantWialonCreds(String(req.params.id));
        const result = await WialonLiveService.proxy(creds, svc, params);
        return success(res, result);
    }
    catch (e) {
        return error(res, e.message);
    }
});
export default router;
