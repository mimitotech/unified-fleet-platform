import { parseWialonLlsBlock } from './wialonFuel.js';
const TRIP_LABELS = {
    0: 'Parking',
    1: 'Trip',
    2: 'Stop',
};
function parseTripBlock(trips) {
    if (!trips || typeof trips !== 'object')
        return undefined;
    const t = trips;
    const block = 'state' in t ? t : typeof t['0'] === 'object' && t['0'] ? t['0'] : undefined;
    if (!block || block.state == null)
        return undefined;
    const state = Number(block.state);
    return {
        tripState: state,
        tripStateLabel: TRIP_LABELS[state] || String(state),
        currSpeed: block.curr_speed != null ? Number(block.curr_speed) : undefined,
        maxSpeed: block.max_speed != null ? Number(block.max_speed) : undefined,
        avgSpeed: block.avg_speed != null ? Number(block.avg_speed) : undefined,
        course: block.course != null ? Number(block.course) : undefined,
        tripDistance: block.distance != null ? Number(block.distance) : undefined,
    };
}
function parseIgnition(ignition) {
    if (!ignition || typeof ignition !== 'object')
        return undefined;
    for (const sensor of Object.values(ignition)) {
        if (!sensor || typeof sensor !== 'object')
            continue;
        const s = sensor;
        if (s.value === true || s.value === 1 || s.state === 1)
            return true;
        if (s.value === false || s.value === 0 || s.state === 0)
            return false;
    }
    return undefined;
}
function parseCounters(counters) {
    if (!counters || typeof counters !== 'object')
        return {};
    const c = counters;
    return {
        mileage: c.mileage != null ? Number(c.mileage) : undefined,
        engineHours: c.engine_hours != null ? Number(c.engine_hours) : c.engineHours != null ? Number(c.engineHours) : undefined,
    };
}
/** Parse `events/check_updates` — keyed by unit id. */
export function parseEventsCheckUpdates(data) {
    const out = new Map();
    for (const [key, val] of Object.entries(data)) {
        const unitId = Number(key);
        if (!Number.isFinite(unitId) || unitId <= 0 || typeof val !== 'object' || !val)
            continue;
        const obj = val;
        const trip = parseTripBlock(obj.trips);
        const ignitionOn = parseIgnition(obj.ignition);
        const fuelLls = obj.lls ? parseWialonLlsBlock(obj.lls) : undefined;
        const counters = parseCounters(obj.counters);
        if (!trip && ignitionOn === undefined && !fuelLls?.length && counters.mileage == null)
            continue;
        out.set(unitId, { ...trip, ignitionOn, fuelLls, ...counters });
    }
    return out;
}
/** Subscribe fleet units to Wialon session events (trips, ignition, sensors, fuel). */
export async function subscribeFleetUnitsEvents(client, unitIds) {
    if (!unitIds.length)
        return;
    const units = unitIds.slice(0, 500).map((id) => ({
        id,
        detect: { trips: 0, lls: 0, sensors: 0, ignition: 0, counters: 0 },
    }));
    await client.request('events/update_units', { mode: 'add', units });
}
/** Poll Wialon real-time event detectors (trip state, speed, course, ignition). */
export async function fetchFleetEventsUpdates(client) {
    const raw = await client.request('events/check_updates', {
        lang: 'en',
        measure: 0,
        detalization: 0x27,
    });
    return parseEventsCheckUpdates(raw || {});
}
