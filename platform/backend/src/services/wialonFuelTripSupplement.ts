import type { WialonClient } from '../adapters/wialonClient.js';
import { loadTenantWialonCreds } from './tenantWialonCredentials.js';
import { withWialonClient } from './WialonSessionService.js';
import { tripsToConsumptionTransactions, mergeTransactions } from './wialonFuelLedger.js';
import type { FuelTransaction } from './wialonFuelReport/types.js';
import { effectiveConsumed } from './wialonFuelReport/metrics.js';

const TRIP_CONCURRENCY = 4;

async function fetchUnitTrips(
  client: WialonClient,
  unitId: number,
  fromTs: number,
  toTs: number
): Promise<Array<Record<string, unknown>>> {
  try {
    const result = await client.request<{ trips?: Array<Record<string, unknown>> }>('unit/get_trips', {
      itemId: unitId,
      timeFrom: fromTs,
      timeTo: toTs,
      msgsSource: 1,
    });
    return result.trips ?? [];
  } catch {
    return [];
  }
}

/** Supplement report transactions with unit/get_trips fuel when consumption is missing per unit. */
export async function supplementTransactionsWithTrips(
  tenantId: string,
  rows: FuelTransaction[],
  fromTs: number,
  toTs: number,
  unitIds?: number[]
): Promise<FuelTransaction[]> {
  const consumedByUnit = new Map<number, number>();
  for (const r of rows) {
    if (r.section !== 'consumption' || r.unitId <= 0) continue;
    const v = effectiveConsumed(r);
    if (v > 0) consumedByUnit.set(r.unitId, (consumedByUnit.get(r.unitId) ?? 0) + v);
  }

  const unitsNeedingTrips = new Map<number, string>();
  for (const r of rows) {
    if (r.unitId > 0) unitsNeedingTrips.set(r.unitId, r.unitName);
  }
  if (unitIds?.length) {
    for (const id of unitIds) {
      if (!unitsNeedingTrips.has(id)) unitsNeedingTrips.set(id, `Unit ${id}`);
    }
  }

  const targetUnits = [...unitsNeedingTrips.entries()].filter(([id]) => (consumedByUnit.get(id) ?? 0) <= 0);
  if (!targetUnits.length) return rows;

  const creds = await loadTenantWialonCreds(tenantId);
  const tripTx: FuelTransaction[] = [];

  await withWialonClient(creds, async (client) => {
    const ids = targetUnits.map(([id]) => id);
    for (let i = 0; i < ids.length; i += TRIP_CONCURRENCY) {
      const batch = ids.slice(i, i + TRIP_CONCURRENCY);
      const parts = await Promise.all(
        batch.map(async (unitId) => {
          const trips = await fetchUnitTrips(client, unitId, fromTs, toTs);
          return tripsToConsumptionTransactions(trips, unitId, unitsNeedingTrips.get(unitId)!);
        })
      );
      for (const p of parts) tripTx.push(...p);
    }
  });

  if (!tripTx.length) return rows;
  return mergeTransactions(rows, tripTx);
}
