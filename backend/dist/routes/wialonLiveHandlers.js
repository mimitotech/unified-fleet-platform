import { success, error } from '../utils/response.js';
import { WialonLiveService } from '../services/WialonLiveService.js';
import { query } from '../config/database.js';
import { fetchCachedUnitIcon } from '../services/wialonIconCache.js';
function parseUnitId(req) {
    const id = parseInt(String(req.params.unitId), 10);
    return Number.isNaN(id) ? null : id;
}
function parseRouteId(req) {
    const id = parseInt(String(req.params.routeId), 10);
    return Number.isNaN(id) ? null : id;
}
function parseInterval(req) {
    const rawFrom = req.query.from ? parseInt(String(req.query.from), 10) : NaN;
    const rawTo = req.query.to ? parseInt(String(req.query.to), 10) : NaN;
    // Accept seconds or milliseconds (values before year ~2001 in ms are treated as seconds).
    const toMs = (n) => (Number.isFinite(n) && n > 0 && n < 1e12 ? n * 1000 : n);
    const fromMs = Number.isFinite(rawFrom) ? toMs(rawFrom) : Date.now() - 24 * 3600_000;
    const toMsVal = Number.isFinite(rawTo) ? toMs(rawTo) : Date.now();
    return { from: new Date(fromMs), to: new Date(toMsVal) };
}
async function resolveAssetUnitId(tenantId, assetId) {
    const { rows } = await query(`SELECT am.external_id FROM asset_mappings am
     JOIN assets a ON a.id = am.asset_id
     WHERE a.tenant_id = $1 AND a.id = $2 AND am.source_type = 'wialon'
     LIMIT 1`, [tenantId, assetId]);
    if (!rows[0])
        throw new Error('Asset is not linked to Wialon');
    const unitId = parseInt(rows[0].external_id, 10);
    if (Number.isNaN(unitId))
        throw new Error('Invalid Wialon unit mapping');
    return unitId;
}
export function createWialonLiveHandlers(loadCreds) {
    return {
        units: async (req, res) => {
            try {
                const creds = await loadCreds(req);
                const units = await WialonLiveService.listUnits(creds);
                return success(res, { units, count: units.length });
            }
            catch (e) {
                return error(res, e.message);
            }
        },
        geofences: async (req, res) => {
            try {
                const creds = await loadCreds(req);
                const geofences = await WialonLiveService.listGeofences(creds);
                return success(res, { geofences, count: geofences.length });
            }
            catch (e) {
                return error(res, e.message);
            }
        },
        unitSensors: async (req, res) => {
            const unitId = parseUnitId(req);
            if (!unitId)
                return error(res, 'Invalid unit id');
            try {
                const creds = await loadCreds(req);
                const sensors = await WialonLiveService.getUnitSensors(creds, unitId);
                return success(res, { unitId, sensors });
            }
            catch (e) {
                return error(res, e.message);
            }
        },
        unitDetail: async (req, res) => {
            const unitId = parseUnitId(req);
            if (!unitId)
                return error(res, 'Invalid unit id');
            try {
                const creds = await loadCreds(req);
                // Address is resolved on the client via /geocode so sensors/fuel return immediately.
                const detail = await WialonLiveService.getUnitDetail(creds, unitId);
                return success(res, { unitId, detail });
            }
            catch (e) {
                return error(res, e.message);
            }
        },
        videoUnits: async (req, res) => {
            try {
                const creds = await loadCreds(req);
                const data = await WialonLiveService.getVideoUnits(creds);
                return success(res, data);
            }
            catch (e) {
                return error(res, e.message);
            }
        },
        geocode: async (req, res) => {
            const lat = parseFloat(String(req.query.lat));
            const lng = parseFloat(String(req.query.lng));
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                return error(res, 'lat and lng query params required');
            }
            try {
                const creds = await loadCreds(req);
                const result = await WialonLiveService.reverseGeocode(creds, lat, lng);
                return success(res, { geocode: result ?? { address: '', parts: [] } });
            }
            catch (e) {
                return error(res, e.message);
            }
        },
        unitTrips: async (req, res) => {
            const unitId = parseUnitId(req);
            if (!unitId)
                return error(res, 'Invalid unit id');
            const { from, to } = parseInterval(req);
            try {
                const creds = await loadCreds(req);
                const trips = await WialonLiveService.getUnitTrips(creds, unitId, from, to);
                return success(res, { unitId, trips, count: trips.length, from: from.toISOString(), to: to.toISOString() });
            }
            catch (e) {
                return error(res, e.message);
            }
        },
        unitTrack: async (req, res) => {
            const unitId = parseUnitId(req);
            if (!unitId)
                return error(res, 'Invalid unit id');
            const { from, to } = parseInterval(req);
            try {
                const creds = await loadCreds(req);
                const points = await WialonLiveService.getUnitTrack(creds, unitId, from, to);
                return success(res, { unitId, points, count: points.length });
            }
            catch (e) {
                return error(res, e.message);
            }
        },
        unitCommands: async (req, res) => {
            const unitId = parseUnitId(req);
            if (!unitId)
                return error(res, 'Invalid unit id');
            try {
                const creds = await loadCreds(req);
                const commands = await WialonLiveService.getUnitCommands(creds, unitId);
                return success(res, { unitId, commands });
            }
            catch (e) {
                return error(res, e.message);
            }
        },
        sendUnitCommand: async (req, res) => {
            const unitId = parseUnitId(req);
            if (!unitId)
                return error(res, 'Invalid unit id');
            const commandName = String(req.body?.commandName || req.body?.command || '');
            if (!commandName)
                return error(res, 'commandName is required');
            const param = (req.body?.param || req.body?.params || {});
            try {
                const creds = await loadCreds(req);
                const result = await WialonLiveService.sendUnitCommand(creds, unitId, commandName, param);
                return success(res, { unitId, commandName, result });
            }
            catch (e) {
                return error(res, e.message);
            }
        },
        assetCommand: async (req, res) => {
            const tenantId = req.tenantId;
            if (!tenantId)
                return error(res, 'Tenant required', 403);
            const commandName = String(req.body?.commandName || req.body?.command || '');
            if (!commandName)
                return error(res, 'commandName is required');
            try {
                const unitId = await resolveAssetUnitId(tenantId, String(req.params.assetId));
                const creds = await loadCreds(req);
                const param = (req.body?.param || req.body?.params || {});
                const result = await WialonLiveService.sendUnitCommand(creds, unitId, commandName, param);
                return success(res, { assetId: req.params.assetId, unitId, commandName, result });
            }
            catch (e) {
                return error(res, e.message);
            }
        },
        unitIcon: async (req, res) => {
            const unitId = parseUnitId(req);
            if (!unitId)
                return error(res, 'Invalid unit id');
            const size = Math.min(64, Math.max(16, parseInt(String(req.query.size || '32'), 10) || 32));
            const ugi = Math.max(1, parseInt(String(req.query.v || '1'), 10) || 1);
            try {
                const creds = await loadCreds(req);
                const buf = await fetchCachedUnitIcon(creds, unitId, size, ugi);
                res.setHeader('Content-Type', 'image/png');
                res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
                return res.send(buf);
            }
            catch (e) {
                return error(res, e.message);
            }
        },
        routeRounds: async (req, res) => {
            const routeId = parseRouteId(req);
            if (!routeId)
                return error(res, 'Invalid route id');
            try {
                const creds = await loadCreds(req);
                const rounds = await WialonLiveService.listRouteRounds(creds, routeId);
                return success(res, { routeId, rounds, count: rounds.length });
            }
            catch (e) {
                return error(res, e.message);
            }
        },
        createGeofence: async (req, res) => {
            const { name, type, center, radius, points, resourceId, color } = req.body;
            if (!name || !type)
                return error(res, 'name and type required');
            try {
                const creds = await loadCreds(req);
                const result = await WialonLiveService.createGeofenceZone(creds, {
                    resourceId: resourceId ? parseInt(String(resourceId), 10) : undefined,
                    name: String(name),
                    type: type === 'polygon' ? 'polygon' : 'circle',
                    center: center,
                    radius: radius != null ? Number(radius) : undefined,
                    points: points,
                    color: color != null ? Number(color) : undefined,
                });
                return success(res, { result }, 201);
            }
            catch (e) {
                return error(res, e.message);
            }
        },
        execReport: async (req, res) => {
            const { reportResourceId, reportTemplateId, reportObjectId, reportObjectSecId, from, to, } = req.body;
            const resourceId = parseInt(String(reportResourceId), 10);
            const templateId = parseInt(String(reportTemplateId), 10);
            const objectId = parseInt(String(reportObjectId), 10);
            const fromTs = parseInt(String(from), 10);
            const toTs = parseInt(String(to), 10);
            if ([resourceId, templateId, objectId, fromTs, toTs].some((n) => Number.isNaN(n))) {
                return error(res, 'reportResourceId, reportTemplateId, reportObjectId, from, to required');
            }
            try {
                const creds = await loadCreds(req);
                const maxRowsPerTable = req.body.maxRowsPerTable
                    ? parseInt(String(req.body.maxRowsPerTable), 10)
                    : undefined;
                const data = await WialonLiveService.executeReport(creds, {
                    reportResourceId: resourceId,
                    reportTemplateId: templateId,
                    reportObjectId: objectId,
                    reportObjectSecId: reportObjectSecId ? parseInt(String(reportObjectSecId), 10) : 0,
                    from: fromTs,
                    to: toTs,
                    maxRowsPerTable: Number.isFinite(maxRowsPerTable) ? maxRowsPerTable : undefined,
                });
                return success(res, data);
            }
            catch (e) {
                return error(res, e.message);
            }
        },
    };
}
