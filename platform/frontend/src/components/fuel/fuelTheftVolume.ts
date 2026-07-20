import type { FuelTransaction } from '@/types/entities';

/**
 * Sudden-drop volume that matches Wialon Before/After levels on the same row.
 * Prefer Initial − Final when both exist and disagree with the Sudden fuel drop column.
 */
export function effectiveSuddenDropVolume(t: Pick<FuelTransaction, 'suddenFuelDrop' | 'initialLevel' | 'finalLevel'>): number {
  const reported = Number(t.suddenFuelDrop) || 0;
  const before = Number(t.initialLevel) || 0;
  const after = Number(t.finalLevel) || 0;
  if (before > 0 && after >= 0 && before > after) {
    const fromLevels = before - after;
    if (reported <= 0) return Math.round(fromLevels * 10) / 10;
    if (Math.abs(reported - fromLevels) > Math.max(5, fromLevels * 0.15)) {
      return Math.round(fromLevels * 10) / 10;
    }
  }
  return Math.round(reported * 10) / 10;
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
