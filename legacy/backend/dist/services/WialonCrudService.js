import { withWialonClient } from './WialonSessionService.js';
import { accountIdFrom, resourceSearchSpec, searchAll } from './wialonLiveUtils.js';
import { WIALON_RESOURCE_GEOFENCES_FLAGS } from '../adapters/wialonUtils.js';
/** Typed Wialon Remote API CRUD — units, sensors, geofences, drivers, notifications, routes, tracks. */
export class WialonCrudService {
    static async call(credentials, svc, params) {
        return withWialonClient(credentials, (client) => client.request(svc, params));
    }
    // —— Units ——
    static createUnit(credentials, input) {
        return this.call(credentials, 'core/create_unit', {
            creatorId: input.creatorId,
            name: input.name,
            hwTypeId: input.hwTypeId,
            dataFlags: input.dataFlags ?? 1,
        });
    }
    static renameUnit(credentials, itemId, name) {
        return this.call(credentials, 'item/update_name', { itemId, name });
    }
    static updateUnitPhone(credentials, itemId, phoneNumber) {
        return this.call(credentials, 'unit/update_phone', { itemId, phoneNumber });
    }
    static updateDeviceType(credentials, itemId, deviceTypeId, uniqueId) {
        return this.call(credentials, 'unit/update_device_type', { itemId, deviceTypeId, uniqueId });
    }
    // —— Sensors ——
    static upsertSensor(credentials, input) {
        return this.call(credentials, 'unit/update_sensor', {
            itemId: input.itemId,
            id: input.id ?? 0,
            callMode: input.callMode,
            n: input.name,
            t: input.type,
            d: input.description ?? '',
            m: input.unit ?? '',
            p: input.param,
            f: 0,
            c: JSON.stringify({ appear_in_popup: true, pos: 1, ci: {} }),
            vt: 0,
            vs: 0,
            tbl: input.table ?? [{ x: 0, a: 0, b: 0 }],
        });
    }
    static calcSensors(credentials, unitId, sensorId = 0, indexFrom = 0, indexTo = 100) {
        return this.call(credentials, 'unit/calc_sensors', {
            unitId,
            sensorId,
            indexFrom,
            indexTo,
        });
    }
    // —— Geofences ——
    static async defaultResourceId(credentials) {
        const accountId = accountIdFrom(credentials);
        return withWialonClient(credentials, async (client) => {
            const resources = await searchAll(client, resourceSearchSpec(accountId), WIALON_RESOURCE_GEOFENCES_FLAGS);
            if (!resources.length)
                throw new Error('No Wialon resource found');
            return resources[0].id;
        });
    }
    static updateGeofence(credentials, input) {
        return withWialonClient(credentials, async (client) => {
            const resourceId = input.resourceId ?? (await this.defaultResourceId(credentials));
            const isCircle = input.type === 'circle';
            const lat = input.center?.lat ?? 0;
            const lng = input.center?.lng ?? 0;
            const zone = {
                itemId: resourceId,
                id: input.id ?? 0,
                callMode: input.callMode,
                n: input.name,
                d: input.description ?? '',
                t: isCircle ? 3 : input.type === 'line' ? 1 : 2,
                w: input.radius ?? 100,
                c: input.color ?? 256,
            };
            if (isCircle) {
                zone.b = {
                    cen_x: lng,
                    cen_y: lat,
                    min_x: lng - 0.001,
                    min_y: lat - 0.001,
                    max_x: lng + 0.001,
                    max_y: lat + 0.001,
                };
            }
            else if (input.points?.length) {
                zone.p = input.points.map((p) => ({ x: p.lng, y: p.lat, r: 0 }));
            }
            return client.request('resource/update_zone', zone);
        });
    }
    static getGeofenceData(credentials, resourceId, geofenceIds) {
        return this.call(credentials, 'resource/get_zone_data', {
            itemId: resourceId,
            flags: 28,
            ...(geofenceIds?.length ? { col: geofenceIds } : {}),
        });
    }
    // —— Drivers ——
    static upsertDriver(credentials, input) {
        return withWialonClient(credentials, async (client) => {
            const resourceId = input.resourceId ?? (await this.defaultResourceId(credentials));
            return client.request('resource/update_driver', {
                itemId: resourceId,
                id: input.id ?? 0,
                callMode: input.callMode,
                n: input.name,
                c: input.code ?? '',
                ds: input.description ?? '',
                p: input.phone ?? '',
                pwd: '',
                ej: {},
                jp: {},
            });
        });
    }
    static bindDriver(credentials, input) {
        return withWialonClient(credentials, async (client) => {
            const resourceId = input.resourceId ?? (await this.defaultResourceId(credentials));
            return client.request('resource/bind_unit_driver', {
                resourceId,
                unitId: input.unitId,
                driverId: input.driverId,
                time: input.time ?? 0,
                mode: input.assign ? 1 : 0,
            });
        });
    }
    static getDriverBindings(credentials, input) {
        return withWialonClient(credentials, async (client) => {
            const resourceId = input.resourceId ?? (await this.defaultResourceId(credentials));
            return client.request('resource/get_driver_bindings', {
                resourceId,
                unitId: input.unitId ?? 0,
                driverId: input.driverId ?? 0,
                timeFrom: input.from,
                timeTo: input.to,
            });
        });
    }
    // —— Notifications ——
    static upsertNotification(credentials, input) {
        return withWialonClient(credentials, async (client) => {
            const resourceId = input.resourceId ?? (await this.defaultResourceId(credentials));
            return client.request('resource/update_notification', {
                itemId: resourceId,
                id: input.id ?? 0,
                callMode: input.callMode,
                n: input.name,
                txt: input.text ?? '',
                ta: 0,
                td: 0,
                ma: 0,
                fl: 0,
                un: input.unitIds ?? [],
                trg: input.trigger,
                act: input.actions ?? [],
            });
        });
    }
    // —— Routes ——
    static createRoute(credentials, creatorId, name) {
        return this.call(credentials, 'core/create_route', { creatorId, name, dataFlags: 1 });
    }
    static updateRouteCheckpoints(credentials, routeId, checkpoints) {
        return this.call(credentials, 'route/update_checkpoints', {
            itemId: routeId,
            checkPoints: checkpoints.map((cp) => ({
                f: 1,
                n: cp.name,
                y: cp.lat,
                x: cp.lng,
                r: cp.radius ?? 50,
            })),
        });
    }
    // —— Messages & tracks ——
    static loadMessages(credentials, unitId, from, to, loadCount = 500) {
        return this.call(credentials, 'messages/load_interval', {
            itemId: unitId,
            timeFrom: from,
            timeTo: to,
            flags: 1,
            flagsMask: 65281,
            loadCount,
        });
    }
    static loadLastMessages(credentials, unitId, count = 10) {
        const now = Math.floor(Date.now() / 1000);
        return this.call(credentials, 'messages/load_last', {
            itemId: unitId,
            lastTime: now,
            lastCount: count * 2,
            flags: 1,
            flagsMask: 65281,
            loadCount: count,
        });
    }
    static createTrackLayer(credentials, input) {
        return this.call(credentials, 'render/create_messages_layer', {
            layerName: input.layerName ?? `track_${input.unitId}_${Date.now()}`,
            itemId: input.unitId,
            timeFrom: input.from,
            timeTo: input.to,
            tripDetector: 1,
            trackColor: input.trackColor ?? 'FFFF0000',
            trackWidth: input.trackWidth ?? 3,
            arrows: input.arrows ?? 1,
            points: 1,
            pointColor: 'FF00FF00',
            annotations: 0,
            flags: 0,
        });
    }
    static exportReport(credentials, format, options) {
        return this.call(credentials, 'report/export_result', {
            format,
            pageOrientation: options?.pageOrientation ?? 'portrait',
            pageSize: options?.pageSize ?? 'a4',
            compress: 1,
            headings: 1,
            hideGoogleLinks: 0,
        });
    }
}
