import crypto from 'crypto';
import { BaseAdapter } from './BaseAdapter.js';
/** TrackSolid Pro (Jimi) API adapter — full jimi.* method integration. */
export class TrackSolidAdapter extends BaseAdapter {
    baseUrl;
    appKey;
    appSecret;
    account;
    passwordMd5;
    accessToken = null;
    refreshToken = null;
    tokenExpiry = 0;
    constructor(config) {
        super(config);
        const root = config.baseUrl || process.env.TRACKSOLID_API_URL || 'https://api.tracksolid.com';
        this.baseUrl = root.endsWith('/api') ? root : `${root.replace(/\/$/, '')}/api`;
        this.appKey = config.appKey || config.apiKey || '';
        this.appSecret = config.appSecret || config.secretKey || '';
        this.account = config.account || config.userId || '';
        this.passwordMd5 = config.passwordMd5 || config.userPwdMd5 || '';
    }
    getSourceType() {
        return 'tracksolid';
    }
    formatTimestamp(date = new Date()) {
        return date.toISOString().replace('T', ' ').slice(0, 19);
    }
    generateSignature(params) {
        const sortedKeys = Object.keys(params).sort();
        let signString = this.appSecret;
        for (const key of sortedKeys) {
            if (key === 'sign')
                continue;
            signString += `${key}${params[key]}`;
        }
        signString += this.appSecret;
        return crypto.createHash('md5').update(signString).digest('hex').toUpperCase();
    }
    async request(method, extraParams = {}) {
        const requestParams = {
            method,
            app_key: this.appKey,
            timestamp: this.formatTimestamp(),
            format: 'json',
            sign_method: 'md5',
            v: '1.0',
            ...extraParams,
        };
        if (this.accessToken && !method.startsWith('jimi.oauth.')) {
            requestParams.access_token = this.accessToken;
        }
        requestParams.sign = this.generateSignature(requestParams);
        const res = await fetch(this.baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(Object.entries(requestParams).map(([k, v]) => [k, String(v)])),
        });
        const data = (await res.json());
        if (data.code !== 0 && data.code !== undefined) {
            throw new Error(`TrackSolid API error: ${data.code} - ${data.message || 'unknown'}`);
        }
        return data;
    }
    async connect() {
        if (!this.appKey || !this.appSecret || !this.account || !this.passwordMd5) {
            throw new Error('TrackSolid credentials incomplete (appKey, appSecret, account, password required)');
        }
        if (this.isAuthenticated())
            return;
        if (this.refreshToken && Date.now() < this.tokenExpiry - 300_000) {
            try {
                await this.refreshAuth();
                return;
            }
            catch {
                /* fall through to full auth */
            }
        }
        const response = await this.request('jimi.oauth.token.get', {
            user_id: this.account,
            user_pwd_md5: this.passwordMd5,
            expires_in: 7200,
        });
        const result = response.result;
        this.accessToken = result.accessToken;
        this.refreshToken = result.refreshToken || result.accessToken;
        this.tokenExpiry = Date.now() + result.expiresIn * 1000;
    }
    isAuthenticated() {
        return !!this.accessToken && Date.now() < this.tokenExpiry;
    }
    async refreshAuth() {
        if (!this.refreshToken) {
            await this.connect();
            return;
        }
        const response = await this.request('jimi.oauth.token.refresh', {
            access_token: this.accessToken,
            refresh_token: this.refreshToken,
            expires_in: 7200,
        });
        const result = response.result;
        this.accessToken = result.accessToken;
        this.refreshToken = result.refreshToken || this.refreshToken;
        this.tokenExpiry = Date.now() + result.expiresIn * 1000;
    }
    async ensureAuth() {
        if (!this.isAuthenticated())
            await this.connect();
    }
    async testConnection() {
        await this.connect();
        await this.request('jimi.user.device.list', { target: this.account });
        return true;
    }
    async getAssets() {
        if (!this.appKey)
            return [];
        await this.ensureAuth();
        const response = await this.request('jimi.user.device.list', { target: this.account });
        const devices = (response.result || []);
        return devices.map((d) => ({
            id: d.imei,
            name: d.vehicleName || d.deviceName || d.imei,
            registrationPlate: d.vehicleNumber || undefined,
            vin: d.vin || d.carFrame || undefined,
            make: d.vehicleModels || undefined,
            model: d.mcType || undefined,
        }));
    }
    async getAssetStatus(assetId) {
        if (!this.appKey) {
            return { status: 'offline', location: { latitude: 0, longitude: 0, timestamp: new Date() } };
        }
        await this.ensureAuth();
        const response = await this.request('jimi.device.location.get', {
            imeis: assetId,
            map_type: 'GOOGLE',
        });
        const locations = (response.result || []);
        const d = locations[0];
        if (!d) {
            return { status: 'offline', location: { latitude: 0, longitude: 0, timestamp: new Date() } };
        }
        const speed = parseFloat(d.speed || '0') || 0;
        const online = d.status === '1';
        const engineOn = d.accStatus === '1' || d.accStatus === 'ON';
        return {
            status: !online ? 'offline' : speed > 0 ? 'moving' : engineOn ? 'idle' : 'stopped',
            location: {
                latitude: d.lat || 0,
                longitude: d.lng || 0,
                speed,
                timestamp: new Date(d.gpsTime || d.hbTime || Date.now()),
            },
            engineState: engineOn,
            fuelLevel: d.trackerOil ? parseFloat(d.trackerOil) : undefined,
            source: 'tracksolid',
        };
    }
    async getAssetHistory(assetId, from, to) {
        if (!this.appKey)
            return [];
        await this.ensureAuth();
        const response = await this.request('jimi.device.track.list', {
            imei: assetId,
            begin_time: this.formatTimestamp(from),
            end_time: this.formatTimestamp(to),
            map_type: 'GOOGLE',
        });
        const points = (response.result || []);
        return points.map((p) => ({
            latitude: p.lat,
            longitude: p.lng,
            speed: p.gpsSpeed,
            timestamp: new Date(p.gpsTime),
        }));
    }
    async getAlerts(from, to, assetId) {
        if (!this.appKey)
            return [];
        await this.ensureAuth();
        const response = await this.request('jimi.device.alarm.list', {
            imei: assetId || '',
            begin_time: this.formatTimestamp(from),
            end_time: this.formatTimestamp(to),
            page_no: 1,
            page_size: 100,
        });
        const alarms = (response.result || []);
        return alarms.map((a) => ({
            id: `${a.imei}_${a.alertTime}`,
            type: a.alertTypeId || 'alarm',
            severity: this.mapSeverity(a.alertTypeId),
            title: a.alarmTypeName || 'TrackSolid Alert',
            description: a.alarmTypeName,
            latitude: a.lat ? parseFloat(a.lat) : undefined,
            longitude: a.lng ? parseFloat(a.lng) : undefined,
            timestamp: new Date(a.alertTime || Date.now()),
            sourceType: 'tracksolid',
            externalId: `${a.imei}_${a.alertTime}`,
        }));
    }
    mapSeverity(alertTypeId) {
        const critical = ['6', '83', '71', '140', '147', '144', '145'];
        const warning = ['4', '5', '113', '146'];
        if (!alertTypeId)
            return 'info';
        if (critical.includes(alertTypeId))
            return 'critical';
        if (warning.includes(alertTypeId))
            return 'warning';
        return 'info';
    }
    async getLiveStreamUrl(assetId, channel = '1') {
        if (!this.appKey)
            return null;
        await this.ensureAuth();
        try {
            const response = await this.request('jimi.device.media.live.stream', {
                imei: assetId,
                channel,
                appId: this.generateAppId(),
            });
            return response.result || null;
        }
        catch {
            try {
                const page = await this.request('jimi.device.live.page.url', {
                    imei: assetId,
                    type: '1',
                    voice: '0',
                });
                const result = page.result;
                return result?.UrlCamera || null;
            }
            catch {
                return null;
            }
        }
    }
    async getVideoRecordings(assetId, from, to) {
        if (!this.appKey)
            return [];
        await this.ensureAuth();
        const response = await this.request('jimi.device.jimi.media.URL', {
            imei: assetId,
            camera: '3',
            media_type: '3',
            start_time: this.formatTimestamp(from),
            end_time: this.formatTimestamp(to),
            page_no: 0,
            page_size: 50,
        });
        return (response.result || []);
    }
    async getCommands(assetId) {
        if (!this.appKey)
            return [];
        await this.ensureAuth();
        const response = await this.request('jimi.open.instruction.list', { imei: assetId });
        return (response.result || []);
    }
    async sendCommand(assetId, command, params) {
        await this.ensureAuth();
        const commandAliases = {
            block_engine: ['Fuel Remote Control', 'RELAY', 'Engine Cut'],
            unblock_engine: ['Fuel Remote Control', 'RELAY', 'Engine Restore'],
            request_position: ['Location', 'GPS', 'query'],
            query_pos: ['Location', 'GPS', 'query'],
        };
        const commands = await this.getCommands(assetId);
        const aliases = commandAliases[command] || [command];
        const cmd = commands.find((c) => aliases.some((a) => c.orderName.toLowerCase().includes(a.toLowerCase())) ||
            String(c.id) === command);
        if (!cmd) {
            throw new Error(`Command "${command}" not supported for device ${assetId}`);
        }
        const paramValues = Array.isArray(params.values)
            ? params.values
            : command.includes('block')
                ? ['0']
                : command.includes('unblock')
                    ? ['1']
                    : [];
        return this.request('jimi.open.instruction.send', {
            imei: assetId,
            inst_param_json: JSON.stringify({
                inst_id: String(cmd.id),
                inst_template: cmd.orderContent,
                params: paramValues,
                is_cover: 'true',
            }),
        });
    }
    async getGeofences() {
        if (!this.appKey)
            return [];
        await this.ensureAuth();
        const response = await this.request('jimi.open.platform.fence.list', {
            account: this.account,
            page_no: 1,
            page_size: 100,
        });
        const result = response.result;
        return result?.rows || [];
    }
    async createGeofence(data) {
        await this.ensureAuth();
        const response = await this.request('jimi.open.platform.fence.create', {
            account: this.account,
            fence_name: data.name,
            fence_type: data.type || 'polygon',
            fence_color: data.color || '#004225',
            geom: data.coordinates,
            radius: data.radius,
            description: data.description || '',
        });
        return { id: response.data };
    }
    async bindGeofence(fenceId, imeis) {
        await this.ensureAuth();
        return this.request('jimi.open.platform.fence.bind', {
            fence_id: fenceId,
            imeis: imeis.join(','),
            alert_type: 'in,out',
        });
    }
    async getObdData(imeis, from, to) {
        if (!this.appKey)
            return [];
        await this.ensureAuth();
        const response = await this.request('jimi.device.obd.list', {
            account: this.account,
            imeis,
            start_time: this.formatTimestamp(from),
            end_time: this.formatTimestamp(to),
            page_no: 1,
            page_size: 100,
        });
        const data = response.data;
        return data?.result || [];
    }
    async getObdFaults(imeis, from, to) {
        if (!this.appKey)
            return [];
        await this.ensureAuth();
        const response = await this.request('jimi.device.obd.fault', {
            account: this.account,
            imeis,
            start_time: this.formatTimestamp(from),
            end_time: this.formatTimestamp(to),
            page_no: 1,
            page_size: 100,
        });
        const data = response.data;
        return data?.result || [];
    }
    async generateTripReport(imeis, from, to) {
        await this.ensureAuth();
        return this.request('jimi.open.platform.report.trips', {
            account: this.account,
            imeis,
            type: 'list',
            start_time: this.formatTimestamp(from),
            end_time: this.formatTimestamp(to),
            start_row: '0',
            page_size: '100',
        });
    }
    async getAllDeviceLocations() {
        if (!this.appKey)
            return [];
        await this.ensureAuth();
        const response = await this.request('jimi.user.device.location.list', {
            target: this.account,
            map_type: 'GOOGLE',
        });
        return (response.result || []);
    }
    generateAppId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 15; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
}
