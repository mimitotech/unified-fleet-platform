import type { FuelTransaction } from '@/types/entities';

/**
 * Sudden-drop volume from the Wialon report row.
 * Prefer the Sudden fuel drop / Drained column when present — that is the
 * authoritative report figure. Fall back to Initial − Final only when the
 * report column is empty.
 */
export function effectiveSuddenDropVolume(t: Pick<FuelTransaction, 'suddenFuelDrop' | 'initialLevel' | 'finalLevel'>): number {
  const reported = Number(t.suddenFuelDrop) || 0;
  if (reported > 0) return Math.round(reported * 10) / 10;
  const before = Number(t.initialLevel) || 0;
  const after = Number(t.finalLevel) || 0;
  if (before > 0 && after >= 0 && before > after) {
    return Math.round((before - after) * 10) / 10;
  }
  return 0;
}

/** Dedupe key for identical sudden-drop alert rows. */
export function fuelTheftEventKey(t: FuelTransaction): string {
  const vol = effectiveSuddenDropVolume(t);
  return [
    t.unitId,
    t.timestamp,
    vol,
    Math.round((t.initialLevel || 0) * 10) / 10,
    Math.round((t.finalLevel || 0) * 10) / 10,
  ].join('|');
}
