import { loadTenantWialonCreds } from './tenantWialonCredentials.js';
import { withWialonClient } from './WialonSessionService.js';
import { tripsToConsumptionTransactions, mergeTransactions } from './wialonFuelLedger.js';
import { effectiveConsumed } from './wialonFuelReport/metrics.js';
const TRIP_CONCURRENCY = 4;
async function fetchUnitTrips(client, unitId, fromTs, toTs) {
    try {
        await client.request('messages/load_interval', {
            itemId: unitId,
            timeFrom: fromTs,
            timeTo: toTs,
            flags: 1,
            flagsMask: 65281,
            loadCount: 1,
        });
        const result = await client.request('unit/get_trips', {
            itemId: unitId,
            timeFrom: fromTs,
            timeTo: toTs,
            msgsSource: 1,
        });
        await client.request('messages/unload', {}).catch(() => undefined);
        return Array.isArray(result) ? result : result.trips ?? [];
    }
    catch {
        await client.request('messages/unload', {}).catch(() => undefined);
        return [];
    }
}
/** Supplement report transactions with unit/get_trips fuel when consumption is missing per unit. */
export async function supplementTransactionsWithTrips(tenantId, rows, fromTs, toTs, unitIds) {
    const consumedByUnit = new Map();
    for (const r of rows) {
        if (r.section !== 'consumption' || r.unitId <= 0)
            continue;
        const v = effectiveConsumed(r);
        if (v > 0)
            consumedByUnit.set(r.unitId, (consumedByUnit.get(r.unitId) ?? 0) + v);
    }
    const unitsNeedingTrips = new Map();
    for (const r of rows) {
        if (r.unitId > 0)
            unitsNeedingTrips.set(r.unitId, r.unitName);
    }
    if (unitIds?.length) {
        for (const id of unitIds) {
            if (!unitsNeedingTrips.has(id))
                unitsNeedingTrips.set(id, `Unit ${id}`);
        }
    }
    const targetUnits = [...unitsNeedingTrips.entries()].filter(([id]) => (consumedByUnit.get(id) ?? 0) <= 0);
    if (!targetUnits.length)
        return rows;
    const creds = await loadTenantWialonCreds(tenantId);
    const tripTx = [];
    await withWialonClient(creds, async (client) => {
        const ids = targetUnits.map(([id]) => id);
        for (let i = 0; i < ids.length; i += TRIP_CONCURRENCY) {
            const batch = ids.slice(i, i + TRIP_CONCURRENCY);
            const parts = await Promise.all(batch.map(async (unitId) => {
                const trips = await fetchUnitTrips(client, unitId, fromTs, toTs);
                return tripsToConsumptionTransactions(trips, unitId, unitsNeedingTrips.get(unitId));
            }));
            for (const p of parts)
                tripTx.push(...p);
        }
    });
    if (!tripTx.length)
        return rows;
    return mergeTransactions(rows, tripTx);
}
