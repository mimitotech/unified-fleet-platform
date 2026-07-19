import type { FuelTransaction } from './wialonFuelReport/types.js';

/**
 * Reject FLS fill/theft/level rows that are physically impossible vs the live tank.
 * URSB BOWSER example: Wialon oscillated between ~207k and ~241k L while live is ~4.4k L.
 * Those ±34k "fills/thefts" are sensor noise, not fuel movement.
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
    tx.sensor === 'wialon_group_summary' || tx.sensor.startsWith('wialon_group_summary');

  if (isSummary) {
    // Trust Wialon group period totals unless they are absurd vs the live tank.
    if (ref > 0 && volume > ref * 5 && volume > 2000) return false;
    if (volume > 100_000) return false;
    return true;
  }

  if (ref > 0) {
    // Levels far above the live tank are sensor plateaus / bad calibration.
    // Soften for large stationary tanks when live reading looks stale/tiny vs event.
    const softStationary =
      maxLevel > 0 && ref < 50 && maxLevel >= 100 && maxLevel < 50_000;
    if (!softStationary && maxLevel > 0 && maxLevel > ref * 2.5 && maxLevel > ref + 500) {
      return false;
    }
    // A single event cannot move more fuel than ~1.5× the live tank (vehicles).
    // Stationary: allow larger absolute moves when live snapshot is tiny/stale.
    if (volume > 0 && volume > ref * 1.5 && volume > 500) {
      if (!(ref < 50 && volume < 50_000)) return false;
    }
    return true;
  }

  // No live reference: still drop absurd absolute levels.
  // Gensets/bowsers commonly sit under ~20k L; allow a bit more for bowsers.
  if (maxLevel > 50_000) return false;
  if (volume > 50_000) return false;
  return true;
}

export function filterPlausibleFuelEvents(
  rows: FuelTransaction[],
  liveFuelByUnit?: Map<number, number>,
): FuelTransaction[] {
  return rows.filter((tx) => isPlausibleFuelEvent(tx, liveFuelByUnit?.get(tx.unitId)));
}

/** Opening/closing used for balance math must sit near the live tank. */
export function isPlausibleBalanceLevel(level: number, liveLiters?: number): boolean {
  if (level <= 0) return false;
  if (liveLiters == null || liveLiters <= 0) return level <= 20_000;
  return level <= liveLiters * 2.5 || level <= liveLiters + 500;
}
