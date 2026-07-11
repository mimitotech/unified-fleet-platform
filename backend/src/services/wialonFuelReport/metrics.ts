import type { FuelSection, FuelTransaction } from './types.js';

/** Derive liters consumed from level delta when the report column is empty. */
export function deriveFuelUsed(
  fuelUsed: number,
  initialLevel: number,
  finalLevel: number
): number {
  if (fuelUsed > 0) return fuelUsed;
  if (initialLevel > 0 && finalLevel >= 0 && initialLevel > finalLevel) {
    return initialLevel - finalLevel;
  }
  return fuelUsed;
}

/** Derive fill volume from level rise when the filled column is empty. */
export function deriveFilled(filled: number, initialLevel: number, finalLevel: number): number {
  if (filled > 0) return filled;
  if (initialLevel > 0 && finalLevel > initialLevel) {
    return finalLevel - initialLevel;
  }
  return filled;
}

/** Derive theft/drain volume from level drop only when both levels are present. */
export function deriveSuddenFuelDrop(
  suddenFuelDrop: number,
  initialLevel: number,
  finalLevel: number
): number {
  if (suddenFuelDrop > 0) return suddenFuelDrop;
  if (initialLevel > 0 && finalLevel > 0 && initialLevel > finalLevel) {
    return initialLevel - finalLevel;
  }
  return suddenFuelDrop;
}

export function applySectionMetrics(
  section: FuelSection,
  values: {
    fuelUsed: number;
    filled: number;
    suddenFuelDrop: number;
    initialLevel: number;
    finalLevel: number;
    mileage: number;
    durationSeconds: number;
  }
): typeof values {
  const next = { ...values };
  if (section === 'consumption') {
    next.fuelUsed = deriveFuelUsed(next.fuelUsed, next.initialLevel, next.finalLevel);
  } else if (section === 'filling') {
    next.filled = deriveFilled(next.filled, next.initialLevel, next.finalLevel);
  } else if (section === 'theft') {
    next.suddenFuelDrop = deriveSuddenFuelDrop(
      next.suddenFuelDrop,
      next.initialLevel,
      next.finalLevel
    );
  }
  return next;
}

export function effectiveFilled(r: FuelTransaction): number {
  if (r.section !== 'filling') return 0;
  return deriveFilled(r.filled, r.initialLevel, r.finalLevel);
}

export function effectiveConsumed(r: FuelTransaction): number {
  if (r.section !== 'consumption') return 0;
  return deriveFuelUsed(r.fuelUsed, r.initialLevel, r.finalLevel);
}

export function effectiveTheft(r: FuelTransaction): number {
  if (r.section !== 'theft') return 0;
  return deriveSuddenFuelDrop(r.suddenFuelDrop, r.initialLevel, r.finalLevel);
}

/** True when no unit has report-reported consumption (balance fill may still apply). */
export function missingConsumption(list: FuelTransaction[]): boolean {
  return !list.some((r) => r.section === 'consumption' && effectiveConsumed(r) > 0);
}
