import { readFuelLevelSensors, totalLitersFromReadings, tankCapacityFromItem, fuelPercentFromLitres, } from './wialonFuelSensorUtils.js';
const FUEL_KEY = /fuel|lls|tank|filling|consum/i;
const CALC_TYPE_BITS = [
    { bit: 0x01, label: 'Mathematical' },
    { bit: 0x02, label: 'Fuel level sensors' },
    { bit: 0x04, label: 'Replace invalid with math' },
    { bit: 0x08, label: 'Absolute fuel sensors' },
    { bit: 0x10, label: 'Impulse sensors' },
    { bit: 0x20, label: 'Instant sensors' },
    { bit: 0x40, label: 'Consumption by rates' },
];
export function decodeCalcTypes(calcTypes) {
    if (calcTypes == null)
        return [];
    return CALC_TYPE_BITS.filter((b) => (calcTypes & b.bit) !== 0).map((b) => b.label);
}
function parseCalibrationTable(tbl) {
    if (!Array.isArray(tbl))
        return [];
    return tbl
        .map((row) => {
        const r = row;
        if (r.x == null || r.a == null || r.b == null)
            return null;
        return { x: Number(r.x), a: Number(r.a), b: Number(r.b) };
    })
        .filter((r) => r != null);
}
/** Piecewise-linear sensor calibration — same as MAMSv2 unitService. */
export function calculateSensorValue(rawValue, tbl) {
    if (!tbl?.length)
        return rawValue;
    const table = [...tbl].sort((a, b) => a.x - b.x);
    if (rawValue <= table[0].x)
        return table[0].a * rawValue + table[0].b;
    if (rawValue >= table[table.length - 1].x) {
        const last = table[table.length - 1];
        return last.a * rawValue + last.b;
    }
    for (let i = 0; i < table.length - 1; i++) {
        if (rawValue >= table[i].x && rawValue < table[i + 1].x) {
            return table[i].a * rawValue + table[i].b;
        }
    }
    return rawValue;
}
const FUEL_SENSOR_PATTERNS = ['fuel level', 'fuel', 'fls', 'tank'];
function isFuelSensor(typeLower, nameLower) {
    return FUEL_SENSOR_PATTERNS.some((p) => typeLower.includes(p) || nameLower.includes(p));
}
/** Per-tank calibrated levels from Wialon search_items sens + prms (MAMS getCombinedFuelLevel). */
export function collectFuelTanksFromItem(item) {
    if (!item.sens)
        return [];
    const processedParams = new Set();
    const tanks = [];
    for (const [id, sensor] of Object.entries(item.sens)) {
        if (!sensor?.n)
            continue;
        const typeLower = String(sensor.t ?? '').toLowerCase();
        const nameLower = sensor.n.toLowerCase();
        if (!isFuelSensor(typeLower, nameLower))
            continue;
        const paramName = sensor.p;
        if (!paramName || processedParams.has(paramName))
            continue;
        processedParams.add(paramName);
        const raw = item.prms?.[paramName]?.v ?? item.lmsg?.p?.[paramName];
        if (typeof raw !== 'number' || !Number.isFinite(raw))
            continue;
        const tbl = parseCalibrationTable(sensor.tbl);
        const level = Math.round(calculateSensorValue(raw, tbl) * 10) / 10;
        if (level > 0) {
            tanks.push({ sensorId: Number(id) || 0, name: sensor.n, level });
        }
    }
    return tanks;
}
export function getCombinedFuelLitersFromItem(item) {
    const tanks = collectFuelTanksFromItem(item);
    let total = tanks.reduce((sum, t) => sum + t.level, 0);
    if (total === 0) {
        const direct = item.prms?.fuel?.v ??
            item.prms?.fuel_level?.v ??
            item.lmsg?.p?.fuel_level ??
            item.lmsg?.p?.fuel;
        if (typeof direct === 'number' && Number.isFinite(direct) && direct > 0) {
            total = direct;
        }
    }
    return Math.round(total * 10) / 10;
}
/** Prefer shared tankCapacityFromItem (calibration + flds/prp). */
export function extractTankCapacityFromItem(item) {
    return tankCapacityFromItem(item);
}
/** Primary live fuel — strict fuel LEVEL sensors from core/search_items. */
export function fuelFromSearchItem(item) {
    const sensors = readFuelLevelSensors(item);
    if (!sensors.length)
        return undefined;
    const totalLiters = totalLitersFromReadings(sensors);
    const capacity = tankCapacityFromItem(item);
    const fuelLevelPercent = capacity && capacity > 0 ? (fuelPercentFromLitres(totalLiters, capacity) ?? undefined) : undefined;
    return {
        live: {
            sensors: sensors.map((s) => ({
                sensorId: s.sensorId,
                name: s.name,
                level: s.liters,
                value: s.liters,
                valueFormatted: `${s.liters} L`,
            })),
            levelLiters: totalLiters,
            levelFormatted: `${totalLiters} L`,
        },
        fuelLevelPercent,
        tankCapacity: capacity,
    };
}
function parseNumeric(raw) {
    if (raw == null || String(raw).trim() === '')
        return undefined;
    const n = parseFloat(String(raw).replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(n) || n < 0)
        return undefined;
    if (n > 0 && n <= 1)
        return Math.round(n * 100);
    if (n <= 100)
        return Math.round(n);
    return Math.round(n * 10) / 10;
}
export function parseWialonLlsBlock(lls) {
    if (!lls || typeof lls !== 'object')
        return [];
    const out = [];
    for (const [sensorId, raw] of Object.entries(lls)) {
        const id = Number(sensorId);
        if (!Number.isFinite(id) || !raw || typeof raw !== 'object')
            continue;
        const d = raw;
        const format = d.format;
        out.push({
            sensorId: id,
            value: d.value != null ? Number(d.value) : undefined,
            level: d.level != null ? Number(d.level) : undefined,
            filled: d.filled != null ? Number(d.filled) : undefined,
            valueFormatted: format?.value,
            filledFormatted: format?.filled,
        });
    }
    return out;
}
export function mergeLlsWithSensorNames(readings, sensDefs = []) {
    const byId = new Map(sensDefs.map((s) => [s.id, s.name]));
    return readings.map((r) => ({ ...r, name: byId.get(r.sensorId) || `Sensor ${r.sensorId}` }));
}
export function fuelLiveFromCalcSensors(calcSensors, sensDefs = []) {
    const fuelSensors = calcSensors.filter((s) => FUEL_KEY.test(s.n) || s.t === 1 || /fuel level|lls/i.test(String(s.t)));
    if (!fuelSensors.length)
        return undefined;
    const readings = fuelSensors.map((s, i) => {
        const def = sensDefs.find((d) => d.name === s.n);
        const value = parseNumeric(s.v);
        return {
            sensorId: def?.id ?? i + 1,
            name: s.n,
            value,
            level: value,
            valueFormatted: `${s.v}${s.u ? ` ${s.u}` : ''}`,
        };
    });
    return fuelLiveFromLls(readings, sensDefs);
}
export function hasFuelData(info) {
    if (!info)
        return false;
    const fuelInfo = info;
    return Boolean(info.levelLiters != null ||
        info.levelFormatted ||
        fuelInfo.level != null ||
        (info.sensors && info.sensors.length > 0) ||
        (fuelInfo.tanks && fuelInfo.tanks.length > 0) ||
        fuelInfo.consumption);
}
export function fuelLiveFromLls(readings, sensDefs = []) {
    const merged = mergeLlsWithSensorNames(readings, sensDefs);
    if (!merged.length)
        return undefined;
    const totalLiters = merged.reduce((sum, r) => sum + (r.level ?? r.value ?? 0), 0);
    const primary = merged[0];
    const levelLiters = totalLiters > 0 ? Math.round(totalLiters * 10) / 10 : primary.level ?? primary.value;
    return {
        sensors: merged,
        levelLiters,
        levelFormatted: levelLiters != null
            ? `${levelLiters} L`
            : primary.valueFormatted || undefined,
        filled: merged.find((r) => (r.filled ?? 0) > 0)?.filled,
        filledFormatted: merged.find((r) => r.filledFormatted)?.filledFormatted,
    };
}
/**
 * Fuel level as a 0–100 percentage.
 * Never treat raw litres as % — only litres÷capacity or explicit percent fields.
 * When capacity is known, always use litres/capacity (even if litres ≤ 100).
 */
export function extractFuelLevel(prp = {}, prms = [], lmsgParams, calcSensors, liveLls, fuelLiters, tankCapacity) {
    if (fuelLiters != null && fuelLiters >= 0 && tankCapacity && tankCapacity > 0) {
        const pct = fuelPercentFromLitres(fuelLiters, tankCapacity);
        if (pct != null)
            return pct;
    }
    if (liveLls?.length) {
        const liters = liveLls.reduce((sum, r) => sum + (r.level ?? r.value ?? 0), 0);
        if (liters >= 0 && tankCapacity && tankCapacity > 0) {
            const pct = fuelPercentFromLitres(liters, tankCapacity);
            if (pct != null)
                return pct;
        }
    }
    // Capacity known but no litre reading yet — never treat raw ≤100 values as %.
    const capacityKnown = tankCapacity != null && tankCapacity > 0;
    const looksLikeLitres = fuelLiters != null && fuelLiters > 0
        ? true
        : calcSensors?.some((s) => /l|litre|liter/i.test(s.u || '')) === true;
    // Explicit percent-named keys only — avoid treating LLS litre params as %.
    const percentKeys = ['fuel_percent', 'fuel_level_percent', 'fuel_pct', 'fuel%'];
    for (const key of percentKeys) {
        const raw = prp[key] ?? prms.find((p) => p.key === key)?.value ?? lmsgParams?.[key];
        const n = parseNumeric(raw);
        if (n != null && n >= 0 && n <= 100)
            return Math.round(n);
    }
    // Never treat raw litre values ≤100 as percentage when capacity is known or unit looks like litres.
    if (!capacityKnown && !looksLikeLitres) {
        for (const key of ['fuel_level', 'can_fuel']) {
            const raw = prp[key] ?? prms.find((p) => p.key === key)?.value ?? lmsgParams?.[key];
            const n = parseNumeric(raw);
            if (n != null && n >= 0 && n <= 100 && (fuelLiters == null || fuelLiters <= 0)) {
                return Math.round(n);
            }
        }
    }
    if (calcSensors?.length) {
        for (const s of calcSensors) {
            if (/l|litre|liter/i.test(s.u || ''))
                continue;
            if (!/percent|%|pct/i.test(s.n) && s.t !== 1)
                continue;
            const n = parseNumeric(s.v);
            if (n != null && n >= 0 && n <= 100 && !capacityKnown)
                return Math.round(n);
        }
    }
    return undefined;
}
export function parseWialonFuelSettingsRaw(settings) {
    const calcTypes = settings?.calcTypes != null ? Number(settings.calcTypes) : undefined;
    const fuelLevelParams = (settings?.fuelLevelParams || settings?.fuel_level_params);
    const fuelConsMath = (settings?.fuelConsMath || settings?.fuel_cons_math);
    const fuelConsRates = (settings?.fuelConsRates || settings?.fuel_cons_rates);
    const fuelConsImpulse = (settings?.fuelConsImpulse || settings?.fuel_cons_impulse);
    return {
        calcTypes,
        calcTypeLabels: decodeCalcTypes(calcTypes),
        fuelLevelParams,
        fuelConsMath,
        fuelConsRates,
        fuelConsImpulse,
    };
}
export function parseWialonFuelSettings(settings, sensors, liveLls) {
    const parsed = parseWialonFuelSettingsRaw(settings);
    const tanks = sensors
        .filter((s) => FUEL_KEY.test(s.name) || FUEL_KEY.test(s.type) || /fuel level|lls/i.test(s.type))
        .map((t) => ({
        name: t.name,
        value: t.value,
        unit: t.unit,
        type: t.type,
        sensorId: t.id,
    }));
    const live = liveLls?.length ? fuelLiveFromLls(liveLls) : undefined;
    const primary = tanks[0];
    const levelFromSensor = primary ? parseNumeric(primary.value) : undefined;
    // Fuel-level / tank sensor readings are always litres — never treat ≤100 as %.
    const levelLiters = live?.levelLiters ?? levelFromSensor;
    const levelPercent = undefined;
    return {
        level: levelPercent,
        levelLiters,
        levelFormatted: live?.levelFormatted ||
            (primary?.value && primary.value !== '—'
                ? `${primary.value}${primary.unit ? ` ${primary.unit}` : ''}`
                : levelLiters != null
                    ? `${levelLiters} L`
                    : undefined),
        filled: live?.filled,
        filledFormatted: live?.filledFormatted,
        sensors: live?.sensors || [],
        tanks,
        consumption: parsed.fuelConsMath,
        rates: parsed.fuelConsRates,
        settings: parsed,
        minFillingVolume: parsed.fuelLevelParams?.minFillingVolume,
        minTheftVolume: parsed.fuelLevelParams?.minTheftVolume,
        filterQuality: parsed.fuelLevelParams?.filterQuality,
    };
}
