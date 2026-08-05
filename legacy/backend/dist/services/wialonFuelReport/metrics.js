/** Derive liters consumed from level delta when the report column is empty. */
export function deriveFuelUsed(fuelUsed, initialLevel, finalLevel) {
    if (fuelUsed > 0)
        return fuelUsed;
    if (initialLevel > 0 && finalLevel >= 0 && initialLevel > finalLevel) {
        return initialLevel - finalLevel;
    }
    return fuelUsed;
}
/** Derive fill volume from level rise when the filled column is empty. */
export function deriveFilled(filled, initialLevel, finalLevel) {
    if (filled > 0)
        return filled;
    if (initialLevel > 0 && finalLevel > initialLevel) {
        return finalLevel - initialLevel;
    }
    return filled;
}
/** Derive theft/drain volume from tank levels when the report column is empty.
 * Prefer the Sudden fuel drop / Drained column when Wialon reports it —
 * that is the authoritative report figure. Levels only fill gaps.
 */
export function deriveSuddenFuelDrop(suddenFuelDrop, initialLevel, finalLevel) {
    if (suddenFuelDrop > 0)
        return suddenFuelDrop;
    if (initialLevel > 0 && finalLevel >= 0 && initialLevel > finalLevel) {
        return initialLevel - finalLevel;
    }
    return suddenFuelDrop;
}
export function applySectionMetrics(section, values) {
    const next = { ...values };
    if (section === 'consumption') {
        next.fuelUsed = deriveFuelUsed(next.fuelUsed, next.initialLevel, next.finalLevel);
    }
    else if (section === 'filling') {
        next.filled = deriveFilled(next.filled, next.initialLevel, next.finalLevel);
    }
    else if (section === 'theft' || section === 'dispensed') {
        next.suddenFuelDrop = deriveSuddenFuelDrop(next.suddenFuelDrop, next.initialLevel, next.finalLevel);
    }
    return next;
}
export function effectiveFilled(r) {
    if (r.section !== 'filling')
        return 0;
    return deriveFilled(r.filled, r.initialLevel, r.finalLevel);
}
export function effectiveConsumed(r) {
    if (r.section !== 'consumption')
        return 0;
    return deriveFuelUsed(r.fuelUsed, r.initialLevel, r.finalLevel);
}
export function effectiveTheft(r) {
    if (r.section !== 'theft')
        return 0;
    return deriveSuddenFuelDrop(r.suddenFuelDrop, r.initialLevel, r.finalLevel);
}
/** Liters dispensed from a bowser/tanker (not theft). */
export function effectiveDispensed(r) {
    if (r.section !== 'dispensed')
        return 0;
    return deriveSuddenFuelDrop(r.suddenFuelDrop, r.initialLevel, r.finalLevel);
}
/** True when no unit has report-reported consumption (balance fill may still apply). */
export function missingConsumption(list) {
    return !list.some((r) => Number(r.fuelUsed) > 0 || (r.section === 'consumption' && effectiveConsumed(r) > 0));
}
