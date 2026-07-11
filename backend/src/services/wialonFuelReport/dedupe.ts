import type { FuelTransaction } from './types.js';

/** Merge duplicate fuel rows from overlapping Wialon groups or report passes. */
export function dedupeFuelTransactions(rows: FuelTransaction[]): FuelTransaction[] {
  const byId = new Map<string, FuelTransaction>();
  for (const row of rows) {
    const existing = byId.get(row.id);
    if (!existing) {
      byId.set(row.id, row);
      continue;
    }
    if (row.section === 'consumption' && row.sensor === 'wialon_group_summary') {
      byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}
