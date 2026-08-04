import { BaseAdapter } from './BaseAdapter.js';
import { WialonClient } from './wialonClient.js';
import { WIALON_SEARCH_PAGE_SIZE, WIALON_UNIT_FLAGS, } from './wialonUtils.js';
import { filterActiveWialonUnits } from '../services/wialonLiveUtils.js';
export class WialonAdapter extends BaseAdapter {
    client;
    constructor(config) {
        super(config);
        this.client = new WialonClient({
            token: (config.token || '').trim(),
            baseUrl: config.baseUrl,
            operateAs: config.operateAs,
        });
    }
    getSourceType() {
        return 'wialon';
    }
    async connect() {
        await this.client.connect();
    }
    async testConnection() {
        await this.connect();
        await this.searchUnits(0, 10);
        return true;
    }
    request(svc, params) {
        return this.client.request(svc, params);
    }
    unitSearchSpec() {
        const accountId = this.config.accountId;
        if (accountId !== undefined && accountId !== null && String(accountId).trim() !== '') {
            return {
                itemsType: 'avl_unit',
                propName: 'sys_billing_account_guid',
                propValueMask: String(accountId),
                sortType: 'sys_name',
                propType: 'property',
            };
        }
        return {
            itemsType: 'avl_unit',
            propName: 'sys_name',
            propValueMask: '*',
            sortType: 'sys_name',
        };
    }
    async searchUnits(from, to, flags = WIALON_UNIT_FLAGS) {
        return this.request('core/search_items', {
            spec: this.unitSearchSpec(),
            force: 1,
            flags,
            from,
            to,
        });
    }
    async getAssets() {
        const items = [];
        let from = 0;
        while (true) {
            const to = from + WIALON_SEARCH_PAGE_SIZE - 1;
            const result = await this.searchUnits(from, to);
            const page = result.items || [];
            items.push(...page);
            const total = result.totalItemsCount ?? items.length;
            if (page.length === 0 || items.length >= total)
                break;
            from += WIALON_SEARCH_PAGE_SIZE;
        }
        return filterActiveWialonUnits(items).map((item) => ({
            id: String(item.id),
            name: item.nm,
            registrationPlate: item.prp?.registration_plate || item.prp?.plate || undefined,
            vin: item.prp?.vin,
            make: item.prp?.brand,
            model: item.prp?.model,
            year: item.prp?.year ? parseInt(item.prp.year, 10) : undefined,
        }));
    }
    async getBulkAssetStatus(unitIds) {
        const map = new Map();
        if (!unitIds.length)
            return map;
        const ids = unitIds.map((id) => parseInt(id, 10)).filter((n) => !Number.isNaN(n));
        if (!ids.length)
            return map;
        try {
            const rows = await this.request('unit/calc_last', { itemIds: ids });
            for (const row of rows || []) {
                const pos = row.pos;
                if (!pos)
                    continue;
                const status = pos.s > 0 ? 'moving' : (pos.sc ?? 0) > 0 ? 'idle' : 'stopped';
                map.set(String(row.i), {
                    status,
                    location: {
                        latitude: pos.y,
                        longitude: pos.x,
                        speed: pos.s,
                        altitude: pos.z,
                        timestamp: new Date(pos.t * 1000),
                    },
                    engineState: pos.s > 0 || (pos.sc ?? 0) > 0,
                    source: 'wialon',
                });
            }
        }
        catch {
            for (const id of unitIds) {
                try {
                    map.set(id, await this.getAssetStatus(id));
                }
                catch { /* skip */ }
            }
        }
        return map;
    }
    async getAssetStatus(assetId) {
        const result = await this.request('core/search_item', {
            id: parseInt(assetId, 10),
            flags: 1025,
        });
        const pos = result.item?.pos;
        if (!pos) {
            return {
                status: 'offline',
                location: { latitude: 0, longitude: 0, timestamp: new Date() },
            };
        }
        const status = pos.s > 0 ? 'moving' : (pos.sc ?? 0) > 0 ? 'idle' : 'stopped';
        return {
            status,
            location: {
                latitude: pos.y,
                longitude: pos.x,
                speed: pos.s,
                altitude: pos.z,
                timestamp: new Date(pos.t * 1000),
            },
            engineState: pos.s > 0 || (pos.sc ?? 0) > 0,
            source: 'wialon',
        };
    }
    async getAssetHistory(assetId, from, to) {
        const result = await this.request('messages/load_interval', {
            itemId: parseInt(assetId, 10),
            timeFrom: Math.floor(from.getTime() / 1000),
            timeTo: Math.floor(to.getTime() / 1000),
            flags: 1,
            flagsMask: 65281,
            loadCount: 1000,
        });
        return (result.messages || []).map((m) => ({
            latitude: m.pos.y,
            longitude: m.pos.x,
            speed: m.pos.s,
            timestamp: new Date(m.t * 1000),
        }));
    }
    async getAlerts(from, to) {
        const { harvestTaskMessageAlerts, harvestUnitEventAndNotificationAlerts, harvestEcoReportAlerts, } = await import('../services/wialonAlertHarvest.js');
        const assets = await this.getAssets();
        const allUnitIds = assets
            .map((a) => parseInt(a.id, 10))
            .filter((id) => !Number.isNaN(id));
        if (!allUnitIds.length)
            return [];
        const timeFrom = Math.floor(from.getTime() / 1000);
        const timeTo = Math.floor(to.getTime() / 1000);
        const unitNameById = new Map(assets
            .map((a) => [parseInt(a.id, 10), a.name])
            .filter(([id]) => !Number.isNaN(id)));
        const byExternal = new Map();
        const addAll = (list) => {
            for (const a of list)
                byExternal.set(a.externalId || a.id, a);
        };
        const scopeKey = `${this.config.accountId || this.config.token?.slice(0, 12) || 'wialon'}`;
        // 1) Task / registered notification messages for all units.
        addAll(await harvestTaskMessageAlerts(this.client, allUnitIds, unitNameById, timeFrom, timeTo));
        // 2) Triggered notifications + unit events (power, sensors, speed, etc.) — rotating deep scan.
        addAll(await harvestUnitEventAndNotificationAlerts(this.client, scopeKey, allUnitIds, unitNameById, timeFrom, timeTo));
        // 3) Eco/safety report enrichment — never a random group that can leak other fleets.
        addAll(await harvestEcoReportAlerts({
            token: this.config.token || '',
            baseUrl: this.config.baseUrl,
            operateAs: this.config.operateAs,
            accountId: this.config.accountId,
        }, this.client, scopeKey, timeFrom, timeTo, allUnitIds, unitNameById));
        const alerts = [...byExternal.values()];
        alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        return alerts;
    }
    resourceSearchSpec() {
        const accountId = this.config.accountId;
        if (accountId !== undefined && accountId !== null && String(accountId).trim() !== '') {
            return {
                itemsType: 'avl_resource',
                propName: 'sys_billing_account_guid',
                propValueMask: String(accountId),
                sortType: 'sys_name',
                propType: 'property',
            };
        }
        return {
            itemsType: 'avl_resource',
            propName: 'sys_name',
            propValueMask: '*',
            sortType: 'sys_name',
        };
    }
    async searchResources(flags) {
        const all = [];
        let from = 0;
        while (true) {
            const to = from + WIALON_SEARCH_PAGE_SIZE - 1;
            const result = await this.request('core/search_items', {
                spec: this.resourceSearchSpec(),
                force: 1,
                flags,
                from,
                to,
            });
            const items = result.items || [];
            all.push(...items);
            const total = result.totalItemsCount ?? all.length;
            if (items.length === 0 || all.length >= total)
                break;
            from += WIALON_SEARCH_PAGE_SIZE;
        }
        return all;
    }
    async getDrivers() {
        try {
            const resources = await this.searchResources(257);
            const drivers = [];
            for (const resource of resources) {
                const detail = await this.request('core/search_item', { id: resource.id, flags: 257 });
                const drvrs = detail.item?.drvrs || {};
                for (const d of Object.values(drvrs)) {
                    drivers.push({
                        id: String(d.id),
                        name: d.n,
                        phone: d.p,
                        licenseNumber: d.c || String(d.id),
                    });
                }
            }
            if (drivers.length)
                return drivers;
        }
        catch { /* fallback */ }
        const result = await this.request('core/search_items', {
            spec: { itemsType: 'driver', propName: 'sys_name', propValueMask: '*', sortType: 'sys_name' },
            force: 1,
            flags: 1,
            from: 0,
            to: WIALON_SEARCH_PAGE_SIZE - 1,
        });
        return (result.items || []).map((d) => ({
            id: String(d.id),
            name: d.nm,
            licenseNumber: d.prp?.license || String(d.id),
            phone: d.prp?.phone,
            email: d.prp?.email,
        }));
    }
    async getGeofences() {
        const resources = await this.searchResources(4097);
        const zones = [];
        for (const resource of resources) {
            const detail = await this.request('core/search_item', { id: resource.id, flags: 4097 });
            const zl = detail.item?.zl || {};
            for (const z of Object.values(zl)) {
                const color = z.c ? `#${(z.c & 0xffffff).toString(16).padStart(6, '0')}` : '#3B82F6';
                if (z.t === 3 && z.b) {
                    zones.push({
                        name: z.n,
                        type: 'circle',
                        center: { lat: z.b.cen_y, lng: z.b.cen_x },
                        radius: z.w,
                        color,
                    });
                    continue;
                }
                if (z.t === 2) {
                    try {
                        const zoneData = await this.request('resource/get_zone_data', { itemId: resource.id, col: [z.id], flags: 1 });
                        const pts = zoneData[0]?.p;
                        if (pts?.length) {
                            zones.push({
                                name: z.n,
                                type: 'polygon',
                                points: pts.map((pt) => ({ lat: pt.y, lng: pt.x })),
                                color,
                            });
                        }
                    }
                    catch { /* skip zone without detail */ }
                }
            }
        }
        return zones;
    }
    async getSensorValues(unitId) {
        try {
            const result = await this.request('unit/calc_last_message', { unitId: parseInt(unitId, 10), sensors: [], flags: 1 });
            return (result.sensors || []).map((s) => ({ name: s.n, value: s.v, unit: s.u }));
        }
        catch {
            return [];
        }
    }
    async getTrips(unitId, from, to) {
        return this.request('unit/get_trips', {
            itemId: parseInt(unitId, 10),
            timeFrom: Math.floor(from.getTime() / 1000),
            timeTo: Math.floor(to.getTime() / 1000),
            msgsSource: 0,
        });
    }
    async sendCommand(assetId, command, params) {
        const paramStr = params && Object.keys(params).length ? JSON.stringify(params) : '';
        return this.request('unit/exec_cmd', {
            itemId: parseInt(assetId, 10),
            commandName: command,
            linkType: '',
            param: paramStr,
            timeout: 60,
            flags: 0,
        });
    }
    async disconnect() {
        await this.client.disconnect();
    }
}
