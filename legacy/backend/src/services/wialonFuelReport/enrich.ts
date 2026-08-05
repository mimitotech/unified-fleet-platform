import type { FuelTransaction } from './types.js';

/** Carry-forward main/reserve tank levels at each event timestamp (MAMS pattern). */
export function enrichTransactionsWithTankLevels(transactions: FuelTransaction[]): FuelTransaction[] {
  const groupedByUnit = new Map<number, FuelTransaction[]>();
  for (const tx of transactions) {
    const list = groupedByUnit.get(tx.unitId) ?? [];
    list.push(tx);
    groupedByUnit.set(tx.unitId, list);
  }

  const enriched: FuelTransaction[] = [];
  for (const unitTransactions of groupedByUnit.values()) {
    const sorted = [...unitTransactions].sort((a, b) => a.timestamp - b.timestamp);
    let lastMainLevel = 0;
    let lastReserveLevel = 0;

    for (const tx of sorted) {
      if (tx.tank === 'main' && tx.finalLevel > 0) lastMainLevel = tx.finalLevel;
      else if (tx.tank === 'reserve' && tx.finalLevel > 0) lastReserveLevel = tx.finalLevel;

      const sameTimestamp = sorted.filter((t) => t.timestamp === tx.timestamp);
      for (const t of sameTimestamp) {
        if (t.tank === 'main' && t.finalLevel > 0) lastMainLevel = t.finalLevel;
        else if (t.tank === 'reserve' && t.finalLevel > 0) lastReserveLevel = t.finalLevel;
      }

      enriched.push({
        ...tx,
        mainTankLevel: lastMainLevel > 0 ? lastMainLevel : undefined,
        reserveTankLevel: lastReserveLevel > 0 ? lastReserveLevel : undefined,
      });
    }
  }

  return enriched;
}
