import { wialonObjectValues } from '../adapters/wialonUtils.js';
import { fleetUnitIconProxyPath } from './wialonIcon.js';
import { extractPlateFromName } from './unitPlateUtils.js';
import { extractFuelLevel, fuelLiveFromLls, fuelFromSearchItem, mergeLlsWithSensorNames, extractTankCapacityFromItem } from './wialonFuel.js';
import { deriveWialonHostingStatus } from './wialonUnitStatus.js';
import { deriveStatusFromWialonEvents } from './wialonTripStatus.js';
import { resolveHwName } from './wialonHwTypes.js';
import { resolveFuelAssetCategory } from './wialonAssetCategory.js';
function mapFlds(item) {
    return wialonObjectValues(item.flds)
        .filter((f) => f?.n)
        .map((f) => ({ id: f.id ?? 0, name: f.n, value: String(f.v ?? '') }));
}
function mapSens(item) {
    if (!item.sens)
        return [];
    return Object.entries(item.sens)
        .filter(([, s]) => s?.n)
        .map(([id, s]) => {
        const tbl = Array.isArray(s.tbl)
            ? s.tbl
                .map((row) => {
                const r = row;
                if (r.x == null || r.a == null || r.b == null)
                    return null;
                return { x: Number(r.x), a: Number(r.a), b: Number(r.b) };
            })
                .filter((r) => r != null)
            : undefined;
        return {
            id: Number(id) || 0,
            name: s.n,
            type: String(s.t ?? ''),
            param: s.p,
            unit: s.u,
            tbl: tbl?.length ? tbl : undefined,
        };
    });
}
function mapPrms(item) {
    if (!item.prms)
        return [];
    return Object.entries(item.prms).map(([key, p]) => ({
        key,
        value: String(p?.v ?? ''),
        calcTime: p?.ct,
        actualTime: p?.at,
    }));
}
function mapRtd(item) {
    const rtd = item.rtd;
    if (!rtd)
        return undefined;
    return {
        type: rtd.type,
        gpsCorrection: rtd.gpsCorrection,
        minSat: rtd.minSat,
        minMovingSpeed: rtd.minMovingSpeed,
        minStayTime: rtd.minStayTime,
        maxMessagesDistance: rtd.maxMessagesDistance,
        minTripTime: rtd.minTripTime,
        minTripDistance: rtd.minTripDistance,
    };
}
function mapLmsg(item) {
    const lmsg = item.lmsg;
    if (!lmsg)
        return undefined;
    const params = {};
    if (lmsg.p) {
        for (const [k, v] of Object.entries(lmsg.p)) {
            params[k] = typeof v === 'boolean' ? (v ? 1 : 0) : v;
        }
    }
    return { time: lmsg.t, params: Object.keys(params).length ? params : undefined };
}
function resolveUnitCategory(item, prp) {
    const flds = item.flds;
    const customFields = { ...prp };
    if (flds) {
        for (const f of Object.values(flds)) {
            if (f?.n)
                customFields[f.n] = String(f.v ?? '');
        }
    }
    const sensorNames = item.sens
        ? Object.values(item.sens).map((s) => s?.n || '').filter(Boolean)
        : [];
    return resolveFuelAssetCategory({
        name: item.nm || '',
        plate: prp.registration_plate || prp.plate || extractPlateFromName(item.nm),
        customFields,
        flds,
        engineHours: item.cneh,
        mileage: item.cnm,
        unitId: item.id,
        sensorNames,
    });
}
function isStationaryUnit(item, prp) {
    const category = resolveUnitCategory(item, prp);
    return category === 'generator' || category === 'machinery';
}
export function mapWialonSearchItem(item, hwTypes, calcSensors) {
    const prp = item.prp || {};
    const plate = prp.registration_plate || prp.plate || extractPlateFromName(item.nm);
    const pos = item.pos;
    const assetCategory = resolveUnitCategory(item, prp);
    const stationary = assetCategory === 'generator' || assetCategory === 'machinery';
    const hosting = deriveWialonHostingStatus(item, calcSensors, { stationary });
    const hw = item.hw;
    const prmsList = mapPrms(item);
    const lmsg = mapLmsg(item);
    const fromSearch = fuelFromSearchItem(item);
    const tankCapacity = fromSearch?.tankCapacity ?? extractTankCapacityFromItem(item);
    const fuelLevel = fromSearch?.fuelLevelPercent ??
        extractFuelLevel(prp, prmsList, lmsg?.params, calcSensors, undefined, fromSearch?.live.levelLiters, tankCapacity);
    return {
        id: item.id,
        name: item.nm,
        accountId: item.bact,
        plate,
        uid: item.uid || prp.uid,
        ph: item.ph || prp.phone,
        hw,
        hwName: resolveHwName(hwTypes || new Map(), hw) || prp.hw_type,
        iconUri: item.uri,
        iconUgi: item.ugi ?? 1,
        iconUrl: fleetUnitIconProxyPath(item.id, item.ugi ?? 1, 48),
        netconn: item.netconn,
        prp: { ...prp },
        flds: mapFlds(item),
        sens: mapSens(item),
        prms: prmsList,
        rtd: mapRtd(item),
        position: pos
            ? {
                lat: pos.y,
                lng: pos.x,
                speed: pos.s,
                time: pos.t,
                course: pos.c,
                satellites: pos.sc,
                altitude: pos.z,
            }
            : undefined,
        lmsg,
        counters: { mileage: item.cnm, engineHours: item.cneh },
        status: hosting.status,
        motionState: hosting.motionState,
        assetCategory,
        stationary,
        fuelLevel,
        tankCapacity,
        fuel: fromSearch?.live,
    };
}
export function applyUnitEvents(slice, item, events) {
    if (!events)
        return slice;
    const stationary = isStationaryUnit(item, item.prp || {});
    const hosting = deriveStatusFromWialonEvents(item, events, { stationary });
    const liveFuel = events.fuelLls?.length
        ? fuelLiveFromLls(mergeLlsWithSensorNames(events.fuelLls, slice.sens))
        : undefined;
    // FLS updates fill events only — keep level from calibrated sensors (snapshot)
    const fuel = slice.fuel
        ? {
            ...slice.fuel,
            filled: liveFuel?.filled ?? slice.fuel.filled,
            filledFormatted: liveFuel?.filledFormatted ?? slice.fuel.filledFormatted,
        }
        : slice.fuel;
    return {
        ...slice,
        status: hosting.status,
        motionState: hosting.motionState || events.tripStateLabel,
        stationary,
        assetCategory: resolveUnitCategory(item, item.prp || {}),
        fuelLevel: slice.fuelLevel,
        fuel,
        position: slice.position
            ? {
                ...slice.position,
                speed: events.currSpeed ?? slice.position.speed,
                course: events.course ?? slice.position.course,
            }
            : slice.position,
        trip: {
            state: events.tripState,
            currSpeed: events.currSpeed,
            maxSpeed: events.maxSpeed,
            avgSpeed: events.avgSpeed,
            course: events.course,
            distance: events.tripDistance,
            ignitionOn: events.ignitionOn,
        },
    };
}
