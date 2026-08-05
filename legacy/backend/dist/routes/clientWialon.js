import { Router } from 'express';
import { query } from '../config/database.js';
import { requireTenant } from '../middleware/tenant.js';
import { success, error } from '../utils/response.js';
import { WialonHierarchyService } from '../services/WialonHierarchyService.js';
import { WialonSyncService } from '../services/WialonSyncService.js';
import { WialonLiveService } from '../services/WialonLiveService.js';
import { getTenantWialonRow, loadTenantWialonCreds, } from '../services/tenantWialonCredentials.js';
import { createWialonLiveHandlers } from './wialonLiveHandlers.js';
import { createWialonCrudHandlers } from './wialonCrudHandlers.js';
import { requireCommandAccess } from '../middleware/rbac.js';
import { WialonFleetService } from '../services/WialonFleetService.js';
import { WialonFuelService } from '../services/WialonFuelService.js';
import { WialonFuelManagementService } from '../services/WialonFuelManagementService.js';
import { WialonFuelAnalyticsService } from '../services/WialonFuelAnalyticsService.js';
import { FuelSyncService } from '../services/FuelSyncService.js';
import { WialonFuelReportService } from '../services/WialonFuelReportService.js';
import { WialonFuelReportCapabilityService } from '../services/WialonFuelReportCapabilityService.js';
import { WialonFuelIntelligenceService } from '../services/WialonFuelIntelligenceService.js';
import { WialonFuelFleetService } from '../services/WialonFuelFleetService.js';
import { WialonReportsLiveService } from '../services/WialonReportsLiveService.js';
import { fleetToSnapshotResponse } from '../services/wialonFleetMapper.js';
import { isWialonTenantConnected, wialonSyncWarning, } from '../services/wialonConnectionStatus.js';
import { WialonMotherAccountService } from '../services/WialonMotherAccountService.js';
import { TenantFuelModuleConfigService } from '../services/TenantFuelModuleConfigService.js';
const router = Router();
const live = createWialonLiveHandlers(async (req) => loadTenantWialonCreds(req.tenantId));
const crud = createWialonCrudHandlers(async (req) => loadTenantWialonCreds(req.tenantId));
function isTenantAdmin(req) {
    return ['tenant_admin', 'platform_admin', 'super_admin'].includes(req.user?.role || '');
}
async function requireWialonCreds(tenantId) {
    return loadTenantWialonCreds(tenantId);
}
/** Safe Wialon context for any tenant user (no token, no full user list). */
router.get('/wialon/context', requireTenant, async (req, res) => {
    const row = await getTenantWialonRow(req.tenantId);
    if (!row) {
        return success(res, { configured: false, connected: false });
    }
    // Heal stale "sync after link" errors when the account is linked and has units.
    if (isWialonTenantConnected(row) &&
        row.last_error) {
        await query(`UPDATE data_sources SET last_error = NULL, updated_at = NOW()
       WHERE tenant_id = $1 AND source_type = 'wialon'`, [req.tenantId]);
        row.last_error = null;
    }
    const meta = (row.wialon_session_meta || {});
    const rawCounts = meta.counts;
    const scopedAccountId = meta.scopedAccountId;
    const counts = scopedAccountId != null
        ? {
            ...(rawCounts || {}),
            units: row.preview_asset_count ?? rawCounts?.units ?? 0,
        }
        : rawCounts || null;
    let motherAccountName = null;
    const motherAccountId = row.wialon_mother_account_id || null;
    if (motherAccountId) {
        const mother = await WialonMotherAccountService.get(motherAccountId);
        motherAccountName = mother?.name || null;
    }
    return success(res, {
        configured: true,
        connected: isWialonTenantConnected(row),
        accountName: row.wialon_account_name,
        accountId: row.wialon_resource_id,
        motherAccountId,
        motherAccountName,
        operateAs: row.wialon_operate_as,
        accountTier: scopedAccountId != null ? 'admin' : meta.accountTier,
        sessionUserName: meta.sessionUserName ?? meta.sessionUser?.nm,
        sessionMeta: meta,
        counts,
        lastSyncAt: row.last_sync_at,
        lastError: wialonSyncWarning(row),
        syncWarning: meta.syncWarning || null,
        previewAssetCount: row.preview_asset_count,
        verifiedAt: row.connection_verified_at,
    });
});
/** Live hierarchy probe — tenant admins only (mirrors platform admin tree). */
router.get('/wialon/hierarchy', requireTenant, async (req, res) => {
    if (!isTenantAdmin(req))
        return error(res, 'Forbidden', 403);
    try {
        const creds = await loadTenantWialonCreds(req.tenantId);
        const probe = await WialonHierarchyService.probe(creds);
        return success(res, probe);
    }
    catch (e) {
        return error(res, e.message);
    }
});
/** Trigger Wialon → MAMS sync (vehicles, drivers, geofences). */
router.post('/wialon/sync', requireTenant, async (req, res) => {
    if (!isTenantAdmin(req))
        return error(res, 'Forbidden', 403);
    try {
        await loadTenantWialonCreds(req.tenantId);
        const result = await WialonSyncService.syncTenant(req.tenantId);
        await query(`UPDATE data_sources SET last_sync_at = NOW(), last_error = NULL, updated_at = NOW()
       WHERE tenant_id = $1 AND source_type = 'wialon'`, [req.tenantId]);
        return success(res, result);
    }
    catch (e) {
        await query(`UPDATE data_sources SET last_error = $2, updated_at = NOW()
       WHERE tenant_id = $1 AND source_type = 'wialon'`, [req.tenantId, e.message]);
        return error(res, e.message);
    }
});
router.get('/wialon/capabilities', requireTenant, async (req, res) => {
    try {
        const creds = await requireWialonCreds(req.tenantId);
        const caps = await WialonLiveService.getCapabilities(creds);
        return success(res, caps);
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/wialon/routes', requireTenant, async (req, res) => {
    try {
        const creds = await requireWialonCreds(req.tenantId);
        const routes = await WialonLiveService.listRoutes(creds);
        return success(res, { routes, count: routes.length });
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/wialon/reports/templates', requireTenant, async (req, res) => {
    try {
        const creds = await requireWialonCreds(req.tenantId);
        const templates = await WialonLiveService.listReportTemplates(creds);
        return success(res, { templates, count: templates.length });
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/wialon/reports/catalog', requireTenant, async (req, res) => {
    try {
        const data = await WialonReportsLiveService.getTemplateCatalog(req.tenantId);
        return success(res, data);
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.post('/wialon/reports/run', requireTenant, async (req, res) => {
    try {
        req.setTimeout(20 * 60 * 1000);
        const body = req.body;
        const objectId = parseInt(String(body.objectId), 10);
        const from = parseInt(String(body.from), 10);
        const to = parseInt(String(body.to), 10);
        if ([objectId, from, to].some((n) => Number.isNaN(n))) {
            return error(res, 'objectId, from, and to (unix seconds) are required');
        }
        const objectKindRaw = String(body.objectKind || 'unit');
        const objectKind = objectKindRaw === 'group' || objectKindRaw === 'user' || objectKindRaw === 'resource'
            ? objectKindRaw
            : 'unit';
        const module = body.module != null ? String(body.module) : undefined;
        const resourceId = body.resourceId != null ? parseInt(String(body.resourceId), 10) : undefined;
        const templateId = body.templateId != null ? parseInt(String(body.templateId), 10) : undefined;
        const maxRowsPerTable = body.maxRowsPerTable != null ? Number(body.maxRowsPerTable) : undefined;
        const data = await WialonReportsLiveService.runTemplateReport(req.tenantId, {
            module: module,
            resourceId: Number.isFinite(resourceId) ? resourceId : undefined,
            templateId: Number.isFinite(templateId) ? templateId : undefined,
            objectId,
            objectKind,
            from,
            to,
            maxRowsPerTable: Number.isFinite(maxRowsPerTable) ? maxRowsPerTable : undefined,
        });
        return success(res, data);
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/wialon/notifications', requireTenant, async (req, res) => {
    try {
        const creds = await requireWialonCreds(req.tenantId);
        const notifications = await WialonLiveService.listNotifications(creds);
        return success(res, { notifications, count: notifications.length });
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/wialon/accounts', requireTenant, async (req, res) => {
    if (!isTenantAdmin(req))
        return error(res, 'Forbidden', 403);
    try {
        const creds = await requireWialonCreds(req.tenantId);
        const accounts = await WialonLiveService.listChildAccounts(creds);
        return success(res, { accounts, count: accounts.length });
    }
    catch (e) {
        return error(res, e.message);
    }
});
/** Live fleet snapshot — all Wialon units for the linked account (positions, kinds, counts). */
router.get('/wialon/fleet', requireTenant, async (req, res) => {
    try {
        const fleet = await WialonFleetService.getCachedLiveFleet(req.tenantId);
        return success(res, fleetToSnapshotResponse(fleet, true));
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/wialon/units', requireTenant, live.units);
router.get('/wialon/geofences', requireTenant, live.geofences);
router.post('/wialon/geofences', requireTenant, requireCommandAccess, live.createGeofence);
router.get('/wialon/units/:unitId/detail', requireTenant, live.unitDetail);
router.get('/wialon/video-units', requireTenant, live.videoUnits);
router.get('/wialon/geocode', requireTenant, live.geocode);
router.get('/wialon/units/:unitId/sensors', requireTenant, live.unitSensors);
router.get('/wialon/units/:unitId/trips', requireTenant, live.unitTrips);
router.get('/wialon/units/:unitId/track', requireTenant, live.unitTrack);
router.get('/wialon/units/:unitId/fuel/settings', requireTenant, async (req, res) => {
    try {
        const unitId = Number(req.params.unitId);
        const creds = await requireWialonCreds(req.tenantId);
        const settings = await WialonFuelService.getFuelSettings(creds, unitId);
        return success(res, { unitId, settings });
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/wialon/units/:unitId/fuel/live', requireTenant, async (req, res) => {
    try {
        const unitId = Number(req.params.unitId);
        const creds = await requireWialonCreds(req.tenantId);
        const live = await WialonFuelService.getUnitFuelLive(creds, unitId);
        return success(res, { unitId, fuel: live?.fuel ?? null, live });
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/wialon/fuel/analytics', requireTenant, async (req, res) => {
    try {
        const refresh = req.query.refresh === 'true';
        req.setTimeout(20 * 60 * 1000);
        const period = req.query.period || 'month';
        const month = req.query.month ? String(req.query.month) : undefined;
        const from = req.query.from ? String(req.query.from) : undefined;
        const to = req.query.to ? String(req.query.to) : undefined;
        const unitId = req.query.unitId ? Number(req.query.unitId) : undefined;
        const unitName = req.query.unitName ? String(req.query.unitName) : undefined;
        const data = await WialonFuelAnalyticsService.getAnalytics(req.tenantId, {
            unitId: unitId ?? null,
            unitName,
            period: period,
            month,
            from,
            to,
            refresh,
        });
        return success(res, data);
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.post('/wialon/fuel/analytics/warm', requireTenant, async (req, res) => {
    try {
        const from = req.body?.from ?? req.query.from;
        const to = req.body?.to ?? req.query.to;
        if (from && to) {
            FuelSyncService.warmDateRange(req.tenantId, String(from), String(to));
        }
        else {
            void FuelSyncService.warmTenantDashboard(req.tenantId);
        }
        return success(res, { started: true });
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/wialon/fuel/transactions', requireTenant, async (req, res) => {
    try {
        const refresh = req.query.refresh === 'true';
        req.setTimeout(20 * 60 * 1000);
        const from = req.query.from ? String(req.query.from) : req.query.startDate ? String(req.query.startDate) : undefined;
        const to = req.query.to ? String(req.query.to) : req.query.endDate ? String(req.query.endDate) : undefined;
        const unitId = req.query.unitId ? Number(req.query.unitId) : undefined;
        const assetCategory = req.query.assetCategory
            ? String(req.query.assetCategory)
            : undefined;
        const data = await WialonFuelReportService.getTransactions(req.tenantId, {
            from,
            to,
            refresh,
            unitId,
            assetCategory,
        });
        return success(res, data);
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/wialon/fuel/live', requireTenant, async (req, res) => {
    try {
        const data = await WialonFuelManagementService.syncLiveFuel(req.tenantId);
        return success(res, { units: data.units, count: data.count, fetchedAt: data.fetchedAt });
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/wialon/fuel/assets', requireTenant, async (req, res) => {
    try {
        const data = await WialonFuelFleetService.listAssets(req.tenantId);
        return success(res, data);
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/wialon/fuel/dashboard', requireTenant, async (req, res) => {
    try {
        const data = await WialonFuelFleetService.listAssets(req.tenantId);
        return success(res, data);
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/wialon/fuel/overview', requireTenant, async (req, res) => {
    try {
        const from = req.query.from ? String(req.query.from) : undefined;
        const to = req.query.to ? String(req.query.to) : undefined;
        const refresh = req.query.refresh === 'true';
        const data = await WialonFuelReportService.getOverview(req.tenantId, { from, to, refresh });
        return success(res, data);
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/wialon/fuel/events', requireTenant, async (req, res) => {
    try {
        const limit = req.query.limit ? Number(req.query.limit) : 200;
        const data = await WialonFuelManagementService.getEvents(req.tenantId, limit);
        return success(res, data);
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/wialon/fuel/level-series', requireTenant, async (req, res) => {
    try {
        req.setTimeout(5 * 60 * 1000);
        const unitId = Number(req.query.unitId);
        const from = Number(req.query.from);
        const to = Number(req.query.to);
        if (!Number.isFinite(unitId) || unitId <= 0)
            return error(res, 'unitId is required');
        if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
            return error(res, 'from and to unix timestamps are required');
        }
        const { WialonFuelLevelSeriesService } = await import('../services/WialonFuelLevelSeriesService.js');
        const data = await WialonFuelLevelSeriesService.getSeries(req.tenantId, { unitId, from, to });
        return success(res, data);
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/wialon/fuel/trend', requireTenant, async (req, res) => {
    try {
        const from = req.query.from ? String(req.query.from) : undefined;
        const to = req.query.to ? String(req.query.to) : undefined;
        const refresh = req.query.refresh === 'true';
        const data = await WialonFuelReportService.getTrend(req.tenantId, { from, to, refresh });
        return success(res, data);
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/wialon/fuel/report-capabilities', requireTenant, async (req, res) => {
    try {
        req.setTimeout(3 * 60 * 1000);
        const data = await WialonFuelReportCapabilityService.getFuelCapabilities(req.tenantId);
        return success(res, data);
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/wialon/fuel/intelligence', requireTenant, async (req, res) => {
    try {
        req.setTimeout(20 * 60 * 1000);
        const from = req.query.from ? String(req.query.from) : req.query.startDate ? String(req.query.startDate) : undefined;
        const to = req.query.to ? String(req.query.to) : req.query.endDate ? String(req.query.endDate) : undefined;
        if (!from || !to)
            return error(res, 'from and to are required');
        const refresh = req.query.refresh === 'true';
        const assetCategory = req.query.assetCategory
            ? String(req.query.assetCategory)
            : undefined;
        const unitId = req.query.unitId ? Number(req.query.unitId) : undefined;
        const data = await WialonFuelIntelligenceService.getFuelIntelligence(req.tenantId, {
            from,
            to,
            refresh,
            assetCategory,
            unitId,
        });
        return success(res, data);
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/wialon/fuel/module-config', requireTenant, async (req, res) => {
    try {
        const data = await TenantFuelModuleConfigService.getConfig(req.tenantId);
        return success(res, data);
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/wialon/fuel/generator-engine-hours', requireTenant, async (req, res) => {
    try {
        req.setTimeout(20 * 60 * 1000);
        const from = req.query.from ? String(req.query.from) : req.query.startDate ? String(req.query.startDate) : undefined;
        const to = req.query.to ? String(req.query.to) : req.query.endDate ? String(req.query.endDate) : undefined;
        const refresh = req.query.refresh === 'true';
        const unitId = req.query.unitId ? Number(req.query.unitId) : undefined;
        const { WialonGeneratorEngineHoursService } = await import('../services/WialonGeneratorEngineHoursService.js');
        const rows = await WialonGeneratorEngineHoursService.list(req.tenantId, { from, to, refresh, unitId });
        return success(res, { data: rows, count: rows.length, fetchedAt: new Date().toISOString() });
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/wialon/units/:unitId/fuel/profile', requireTenant, async (req, res) => {
    try {
        const unitId = Number(req.params.unitId);
        const data = await WialonFuelManagementService.getUnitProfile(req.tenantId, unitId);
        return success(res, data);
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.patch('/wialon/units/:unitId/fuel/math', requireTenant, requireCommandAccess, async (req, res) => {
    try {
        const unitId = Number(req.params.unitId);
        const { idling, urban, suburban } = req.body;
        const creds = await requireWialonCreds(req.tenantId);
        await WialonFuelService.updateFuelMath(creds, unitId, { idling, urban, suburban });
        return success(res, { unitId, updated: true });
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.patch('/wialon/units/:unitId/fuel/rates', requireTenant, requireCommandAccess, async (req, res) => {
    try {
        const unitId = Number(req.params.unitId);
        const creds = await requireWialonCreds(req.tenantId);
        await WialonFuelService.updateFuelRates(creds, unitId, req.body);
        return success(res, { unitId, updated: true });
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.patch('/wialon/units/:unitId/fuel/detection', requireTenant, requireCommandAccess, async (req, res) => {
    try {
        const unitId = Number(req.params.unitId);
        const creds = await requireWialonCreds(req.tenantId);
        await WialonFuelService.updateFuelLevelParams(creds, unitId, req.body);
        return success(res, { unitId, updated: true });
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.post('/wialon/units/:unitId/fuel/sensors', requireTenant, requireCommandAccess, async (req, res) => {
    try {
        const unitId = Number(req.params.unitId);
        const creds = await requireWialonCreds(req.tenantId);
        const { name, parameter, calibration, description } = req.body;
        const result = await WialonFuelService.createFuelSensor(creds, unitId, { name, parameter, calibration, description });
        return success(res, { unitId, sensor: result });
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.post('/wialon/units/:unitId/fuel/events/mark-false', requireTenant, requireCommandAccess, async (req, res) => {
    try {
        const unitId = Number(req.params.unitId);
        const creds = await requireWialonCreds(req.tenantId);
        const { resourceId, eventType, timeFrom, timeTo, eventId } = req.body;
        await WialonFuelService.markFuelEventFalse(creds, { unitId, resourceId, eventType, timeFrom, timeTo });
        if (eventId) {
            const { wialonFuelEventStore } = await import('../services/wialonFuelEventStore.js');
            wialonFuelEventStore.markFalse(req.tenantId, eventId);
        }
        return success(res, { unitId, marked: true });
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.post('/wialon/units/:unitId/fuel/filling', requireTenant, requireCommandAccess, async (req, res) => {
    try {
        const unitId = Number(req.params.unitId);
        const creds = await requireWialonCreds(req.tenantId);
        await WialonFuelService.registerFuelFilling(creds, unitId, req.body);
        return success(res, { unitId, registered: true });
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/wialon/units/:unitId/commands', requireTenant, live.unitCommands);
router.get('/wialon/units/:unitId/icon', requireTenant, live.unitIcon);
router.post('/wialon/units/:unitId/commands', requireTenant, requireCommandAccess, live.sendUnitCommand);
router.post('/wialon/assets/:assetId/command', requireTenant, requireCommandAccess, live.assetCommand);
router.get('/wialon/routes/:routeId/rounds', requireTenant, live.routeRounds);
router.post('/wialon/reports/exec', requireTenant, live.execReport);
router.get('/wialon/reports/live/fleet-status', requireTenant, async (req, res) => {
    try {
        const data = await WialonReportsLiveService.fleetStatus(req.tenantId);
        return success(res, data);
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/wialon/reports/live/fleet-fuel', requireTenant, async (req, res) => {
    try {
        const data = await WialonReportsLiveService.fleetFuel(req.tenantId);
        return success(res, data);
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/wialon/reports/live/trips', requireTenant, async (req, res) => {
    try {
        const fromMs = req.query.from ? parseInt(String(req.query.from), 10) : Date.now() - 7 * 86400_000;
        const toMs = req.query.to ? parseInt(String(req.query.to), 10) : Date.now();
        const unitId = req.query.unitId ? parseInt(String(req.query.unitId), 10) : undefined;
        const data = await WialonReportsLiveService.fleetTrips(req.tenantId, fromMs, toMs, unitId);
        return success(res, data);
    }
    catch (e) {
        return error(res, e.message);
    }
});
router.get('/wialon/reports/live/unit-sensors/:unitId', requireTenant, async (req, res) => {
    try {
        const unitId = parseInt(String(req.params.unitId), 10);
        if (Number.isNaN(unitId))
            return error(res, 'Invalid unit id');
        const data = await WialonReportsLiveService.unitSensors(req.tenantId, unitId);
        return success(res, data);
    }
    catch (e) {
        return error(res, e.message);
    }
});
// —— Wialon CRUD (units, sensors, geofences, drivers, notifications, routes, tracks) ——
router.post('/wialon/units', requireTenant, requireCommandAccess, crud.createUnit);
router.patch('/wialon/units/:unitId', requireTenant, requireCommandAccess, crud.patchUnit);
router.post('/wialon/units/:unitId/sensors/manage', requireTenant, requireCommandAccess, crud.upsertSensor);
router.patch('/wialon/geofences/manage', requireTenant, requireCommandAccess, crud.patchGeofence);
router.post('/wialon/drivers/manage', requireTenant, requireCommandAccess, crud.upsertDriver);
router.post('/wialon/drivers/bind', requireTenant, requireCommandAccess, crud.bindDriver);
router.post('/wialon/notifications/manage', requireTenant, requireCommandAccess, crud.upsertNotification);
router.post('/wialon/routes', requireTenant, requireCommandAccess, crud.createRoute);
router.put('/wialon/routes/:routeId/checkpoints', requireTenant, requireCommandAccess, crud.updateRouteCheckpoints);
router.get('/wialon/units/:unitId/messages', requireTenant, crud.loadMessages);
router.post('/wialon/units/:unitId/track-layer', requireTenant, crud.createTrackLayer);
/** Proxied Wialon Remote API call (allowlisted svc only). */
router.post('/wialon/api', requireTenant, async (req, res) => {
    const svc = String(req.body?.svc || '');
    const params = (req.body?.params || {});
    if (!svc)
        return error(res, 'svc is required', 400);
    try {
        const creds = await requireWialonCreds(req.tenantId);
        const result = await WialonLiveService.proxy(creds, svc, params);
        return success(res, result);
    }
    catch (e) {
        return error(res, e.message);
    }
});
export default router;
