import { loadTenantWialonCreds } from './tenantWialonCredentials.js';
import { withWialonClient } from './WialonSessionService.js';
import { mergeTransactions } from './wialonFuelLedger.js';
import { effectiveConsumed } from './wialonFuelReport/metrics.js';
const MESSAGE_CONCURRENCY = 2;
const MAX_MESSAGES = 4000;
const BATCH = 500;
const FUEL_PARAM_KEYS = [
    'fuel',
    'fuel_level',
    'fuel1',
    'fuel2',
    'lls',
    'lls1',
    'lls2',
    'can_fuel',
    'Fuel Level',
    'tank',
];
function round1(n) {
    return Math.round(n * 10) / 10;
}
function parseFuelFromMessage(msg) {
    const p = msg.p;
    if (!p)
        return null;
    for (const key of FUEL_PARAM_KEYS) {
        const raw = p[key];
        if (raw == null)
            continue;
        const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[^\d.-]/g, ''));
        if (Number.isFinite(n) && n > 0 && n < 10000)
            return n;
    }
    for (const [key, val] of Object.entries(p)) {
        if (!/fuel|lls|tank/i.test(key))
            continue;
        const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^\d.-]/g, ''));
        if (Number.isFinite(n) && n > 0 && n < 10000)
            return n;
    }
    return null;
}
async function loadFuelReadings(client, unitId, fromTs, toTs) {
    try {
        const load = await client.request('messages/load_interval', {
            itemId: unitId,
            timeFrom: fromTs,
            timeTo: toTs,
            flags: 1,
            flagsMask: 65281,
            loadCount: BATCH,
        });
        const total = Math.min(load.count ?? 0, MAX_MESSAGES);
        if (!total)
            return [];
        const readings = [];
        let indexFrom = 0;
        while (indexFrom < total) {
            const indexTo = Math.min(indexFrom + BATCH - 1, total - 1);
            const batch = await client.request('messages/get_messages', { indexFrom, indexTo });
            for (const msg of batch.messages ?? []) {
                const t = Number(msg.t);
                const liters = parseFuelFromMessage(msg);
                if (Number.isFinite(t) && liters != null)
                    readings.push({ t, liters });
            }
            indexFrom = indexTo + 1;
        }
        await client.request('messages/unload', {}).catch(() => undefined);
        return readings.sort((a, b) => a.t - b.t);
    }
    catch {
        await client.request('messages/unload', {}).catch(() => undefined);
        return [];
    }
}
function consumptionFromReadings(readings, unitId, unitName, minRefillJump = 8) {
    if (readings.length < 2)
        return [];
    const byDay = new Map();
    for (const r of readings) {
        const day = new Date(r.t * 1000).toISOString().slice(0, 10);
        const list = byDay.get(day) ?? [];
        list.push(r);
        byDay.set(day, list);
    }
    const out = [];
    for (const [day, dayReadings] of byDay) {
        const sorted = [...dayReadings].sort((a, b) => a.t - b.t);
        const opening = sorted[0].liters;
        const closing = sorted[sorted.length - 1].liters;
        let filled = 0;
        let consumedFromDrops = 0;
        for (let i = 1; i < sorted.length; i++) {
            const diff = sorted[i].liters - sorted[i - 1].liters;
            if (diff >= minRefillJump)
                filled += diff;
            else if (diff < -0.3)
                consumedFromDrops += -diff;
        }
        const balanceUsed = Math.max(0, opening + filled - closing);
        const used = balanceUsed > 0 ? balanceUsed : consumedFromDrops;
        if (used <= 0)
            continue;
        const ts = sorted[sorted.length - 1].t;
        out.push({
            id: `msg-${unitId}-${day}`,
            unitId,
            unitName,
            section: 'consumption',
            tank: 'main',
            timestamp: ts,
            time: day,
            location: '',
            initialLevel: round1(opening),
            finalLevel: round1(closing),
            filled: 0,
            sensor: 'messages',
            fuelUsed: round1(used),
            mileage: 0,
            duration: '',
            durationSeconds: 0,
            avgConsumption: 0,
            suddenFuelDrop: 0,
            count: 0,
        });
    }
    return out;
}
export async function supplementTransactionsWithMessages(tenantId, rows, fromTs, toTs, unitIds) {
    const targets = new Map();
    if (unitIds?.length) {
        for (const id of unitIds) {
            if (rows.some((r) => r.unitId === id && r.section === 'consumption' && effectiveConsumed(r) > 0)) {
                continue;
            }
            targets.set(id, rows.find((r) => r.unitId === id)?.unitName ?? `Unit ${id}`);
        }
    }
    else {
        for (const r of rows) {
            if (r.unitId > 0)
                targets.set(r.unitId, r.unitName);
        }
    }
    if (!targets.size)
        return rows;
    const creds = await loadTenantWialonCreds(tenantId);
    const supplements = [];
    await withWialonClient(creds, async (client) => {
        const ids = [...targets.keys()];
        for (let i = 0; i < ids.length; i += MESSAGE_CONCURRENCY) {
            const batch = ids.slice(i, i + MESSAGE_CONCURRENCY);
            const parts = await Promise.all(batch.map(async (unitId) => {
                const readings = await loadFuelReadings(client, unitId, fromTs, toTs);
                return consumptionFromReadings(readings, unitId, targets.get(unitId));
            }));
            for (const p of parts)
                supplements.push(...p);
        }
    });
    if (!supplements.length)
        return rows;
    return mergeTransactions(rows, supplements);
}
