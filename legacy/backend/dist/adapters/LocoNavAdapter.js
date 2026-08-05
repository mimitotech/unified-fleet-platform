import { BaseAdapter } from './BaseAdapter.js';
import { extractLocoNavVehicles, locoNavVehicleId, locoNavVehicleName, } from './loconavUtils.js';
/** LocoNav Integration API v1 — same paths as working Mamsvv loconav-api edge function */
const LOCONAV_VEHICLES_PATH = '/integration/api/v1/vehicles';
export class LocoNavAdapter extends BaseAdapter {
    baseUrl;
    authToken;
    constructor(config) {
        super(config);
        this.baseUrl = (config.baseUrl || process.env.LOCONAV_API_URL || 'https://api.a.loconav.com').replace(/\/$/, '');
        this.authToken = (config.userAuthentication || config.token || '').trim();
    }
    getSourceType() {
        return 'loconav';
    }
    async request(method, path, body) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15_000);
        try {
            const res = await fetch(`${this.baseUrl}${path}`, {
                method,
                headers: {
                    'User-Authentication': this.authToken,
                    Accept: 'application/json',
                    ...(body ? { 'Content-Type': 'application/json' } : {}),
                },
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });
            if (!res.ok) {
                const detail = await res.text().catch(() => '');
                throw new Error(`LocoNav API error: ${res.status}${detail ? ` — ${detail.slice(0, 240)}` : ''}. ` +
                    'Check User-Authentication token and LOCONAV_API_URL (https://api.a.loconav.com or https://api.loconav.com).');
            }
            return res.json();
        }
        catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                throw new Error('LocoNav API request timed out after 15s');
            }
            throw err;
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    async connect() {
        if (!this.authToken)
            throw new Error('LocoNav User-Authentication token not configured');
        await this.request('GET', `${LOCONAV_VEHICLES_PATH}?page=1&perPage=1`);
    }
    async testConnection() {
        await this.connect();
        return true;
    }
    async getAssets() {
        const vehicles = [];
        let page = 1;
        const perPage = 100;
        while (true) {
            const result = await this.request('GET', `${LOCONAV_VEHICLES_PATH}?page=${page}&perPage=${perPage}`);
            const batch = extractLocoNavVehicles(result);
            if (!batch.length)
                break;
            vehicles.push(...batch);
            if (batch.length < perPage)
                break;
            page++;
            if (page > 50)
                break;
        }
        return vehicles
            .filter((v) => locoNavVehicleId(v))
            .map((v) => ({
            id: locoNavVehicleId(v),
            name: locoNavVehicleName(v),
            registrationPlate: v.vehicleNumber,
        }));
    }
    async getAssetStatus(assetId) {
        const result = (await this.request('GET', `${LOCONAV_VEHICLES_PATH}/${assetId}`));
        const vehicle = result.data || result;
        const telematics = await this.request('POST', '/integration/api/v1/vehicles/telematics/last_known?page=1&perPage=1', {
            vehicleIds: [assetId],
            sensors: ['gps', 'ignition'],
        }).catch(() => null);
        let lat = 0;
        let lng = 0;
        let speed = 0;
        let timestamp = new Date();
        let moving = false;
        let idle = false;
        let engineOn = false;
        if (telematics) {
            const values = extractTelematicsValues(telematics);
            const row = values.find((v) => v.vehicleId === assetId) || values[0];
            if (row) {
                lat = row.latitude;
                lng = row.longitude;
                speed = row.speed ?? 0;
                timestamp = row.timestamp;
                moving = row.movementStatus === 'MOVING' || (row.speed ?? 0) > 0;
                idle = row.movementStatus === 'IDLE' || row.ignition === true;
                engineOn = row.ignition === true;
            }
        }
        const vLat = vehicle.latitude ?? lat;
        const vLng = vehicle.longitude ?? lng;
        return {
            status: moving ? 'moving' : idle ? 'idle' : 'stopped',
            location: {
                latitude: vLat || lat,
                longitude: vLng || lng,
                speed,
                timestamp,
            },
            engineState: engineOn,
            source: 'loconav',
        };
    }
    async getAssetHistory(assetId, from, to) {
        void assetId;
        void from;
        void to;
        return [];
    }
    async getAlerts(from, to) {
        // LocoNav delivers most events via webhooks; polling is best-effort when an events API is exposed.
        try {
            const fromIso = from.toISOString();
            const toIso = to.toISOString();
            const result = await this.request('GET', `/integration/api/v1/events?page=1&perPage=100&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`);
            return extractLocoNavEvents(result);
        }
        catch {
            return [];
        }
    }
}
function extractLocoNavEvents(data) {
    const root = data;
    let rows = [];
    const inner = root.data;
    if (Array.isArray(inner?.events))
        rows = inner.events;
    else if (Array.isArray(inner?.data))
        rows = inner.data;
    else if (Array.isArray(root.events))
        rows = root.events;
    else if (Array.isArray(root.data))
        rows = root.data;
    return rows.map((e, i) => {
        const kind = String(e.kind || e.event_key || e.alert_type || e.type || 'event').toLowerCase();
        const vehicleRef = e.vehicle_number || e.vehicle_uuid || e.vehicle_id || '';
        const ts = e.active_event_time || e.event_time || e.created_at || e.timestamp;
        const externalId = e.id ? String(e.id) : `loconav-poll:${vehicleRef}:${ts}:${i}`;
        return {
            id: externalId,
            type: kind,
            severity: 'warning',
            title: `LocoNav: ${kind}${vehicleRef ? ` — ${vehicleRef}` : ''}`,
            description: JSON.stringify(e).slice(0, 500),
            timestamp: ts ? new Date(String(ts)) : new Date(),
            sourceType: 'loconav',
            externalId,
            assetId: vehicleRef ? String(vehicleRef) : undefined,
            acknowledged: false,
        };
    });
}
function extractTelematicsValues(data) {
    const root = data;
    let raw = [];
    if (root.success && root.data?.values) {
        raw = root.data.values;
    }
    else if (root.data?.values) {
        raw = root.data.values;
    }
    else if (Array.isArray(root.values)) {
        raw = root.values;
    }
    else if (Array.isArray(root.data)) {
        raw = root.data;
    }
    return raw.map((item) => {
        const gps = item.gps;
        const coords = gps?.currentLocationCoordinates;
        const lat = coords?.lat?.value ?? 0;
        const lng = coords?.long?.value ?? 0;
        const speed = gps?.speed?.value;
        const ignitionVal = gps?.ignition?.value;
        const movement = gps?.movement?.movementStatus;
        const ts = coords?.lat?.timestamp ||
            gps?.speed?.timestamp ||
            Date.now() / 1000;
        return {
            vehicleId: String(item.vehicleId || ''),
            latitude: lat,
            longitude: lng,
            speed,
            timestamp: new Date(typeof ts === 'number' ? ts * 1000 : Date.now()),
            ignition: ignitionVal === 'ON' || ignitionVal === 'true',
            movementStatus: movement,
        };
    });
}
