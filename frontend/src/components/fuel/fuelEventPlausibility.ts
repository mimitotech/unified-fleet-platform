import type { FuelTransaction } from '@/types/entities';

/**
 * Reject FLS events that are physically impossible vs the live tank.
 * Kept in sync with backend/src/services/fuelEventPlausibility.ts
 */
export function isPlausibleFuelEvent(tx: FuelTransaction, liveLiters?: number): boolean {
  if (tx.sensor === 'balance') return false;

  const ref = liveLiters != null && liveLiters > 0 ? liveLiters : 0;
  const maxLevel = Math.max(Number(tx.initialLevel) || 0, Number(tx.finalLevel) || 0);
  const volume = Math.max(
    Number(tx.filled) || 0,
    Number(tx.suddenFuelDrop) || 0,
    Number(tx.fuelUsed) || 0,
  );

  const isSummary =
    tx.sensor === 'wialon_group_summary' || tx.sensor?.startsWith('wialon_group_summary');

  if (isSummary) {
    if (ref > 0 && volume > ref * 5 && volume > 2000) return false;
    if (volume > 100_000) return false;
    return true;
  }

  if (ref > 0) {
    const softStationary =
      maxLevel > 0 && ref < 50 && maxLevel >= 100 && maxLevel < 50_000;
    if (!softStationary && maxLevel > 0 && maxLevel > ref * 2.5 && maxLevel > ref + 500) {
      return false;
    }
    if (volume > 0 && volume > ref * 1.5 && volume > 500) {
      if (!(ref < 50 && volume < 50_000)) return false;
    }
    return true;
  }

  if (maxLevel > 50_000) return false;
  if (volume > 50_000) return false;
  return true;
}

export function filterPlausibleFuelEvents(
  rows: FuelTransaction[],
  liveLiters?: number,
): FuelTransaction[] {
  return rows.filter((tx) => isPlausibleFuelEvent(tx, liveLiters));
}
