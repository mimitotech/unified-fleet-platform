import type { FuelTransaction, GeneratorEngineHours } from '@/types';

export type GeneratorFuelActivityKind = 'consumption' | 'filling' | 'drain' | 'level';
export type GeneratorEngineInterval = [number, number];

/**
 * Small tolerance around Wialon report interval boundaries. Fuel and engine-hour
 * reports can disagree by a few seconds, especially around start/stop moments.
 */
export const GENERATOR_ENGINE_BOUNDARY_BUFFER_S = 60;

/** Build per-generator engine-on intervals from Engine Hours Report rows. */
export function buildGeneratorEngineIntervalsByUnit(
  rows: GeneratorEngineHours[],
): Map<string, GeneratorEngineInterval[]> {
  const map = new Map<string, GeneratorEngineInterval[]>();
  for (const row of rows) {
    if (!(row.beginning > 0 && row.end > 0 && row.end >= row.beginning)) continue;
    const key = String(row.unitId);
    const intervals = map.get(key) ?? [];
    intervals.push([row.beginning, row.end]);
    map.set(key, intervals);
  }
  return map;
}

/** True when a fuel event timestamp falls inside an engine-on interval. */
export function isGeneratorEngineOnAt(
  intervalsByUnit: Map<string, GeneratorEngineInterval[]>,
  unitId: string | number,
  timestamp: number,
  bufferSeconds = GENERATOR_ENGINE_BOUNDARY_BUFFER_S,
): boolean {
  const intervals = intervalsByUnit.get(String(unitId));
  if (!intervals || intervals.length === 0) return false;

  for (const [beginning, end] of intervals) {
    if (timestamp >= beginning - bufferSeconds && timestamp <= end + bufferSeconds) {
      return true;
    }
  }
  return false;
}

/**
 * Classify a generator fuel report row from the user's point of view.
 *
 * Wialon's Sudden Fuel Drop table can represent normal generator consumption
 * while the engine is running. For generators, only sudden drops that occur
 * while the engine is OFF should be surfaced as drains/theft.
 */
export function getGeneratorFuelActivity(
  tx: FuelTransaction,
  intervalsByUnit: Map<string, GeneratorEngineInterval[]>,
): {
  kind: GeneratorFuelActivityKind;
  consumed: number;
  filled: number;
  drained: number;
} {
  if (tx.section === 'consumption') {
    return { kind: 'consumption', consumed: tx.fuelUsed || 0, filled: 0, drained: 0 };
  }

  if (tx.section === 'filling') {
    return { kind: 'filling', consumed: 0, filled: tx.filled || 0, drained: 0 };
  }

  if (tx.section === 'theft' && (tx.suddenFuelDrop || 0) > 0) {
    const drop = tx.suddenFuelDrop || 0;
    if (isGeneratorEngineOnAt(intervalsByUnit, tx.unitId, tx.timestamp)) {
      return { kind: 'consumption', consumed: drop, filled: 0, drained: 0 };
    }
    return { kind: 'drain', consumed: 0, filled: 0, drained: drop };
  }

  return { kind: 'level', consumed: 0, filled: 0, drained: 0 };
}