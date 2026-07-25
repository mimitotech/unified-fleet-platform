/**
 * Tank-level rules shared by every fuel surface (Monitoring, Fuel module, Dashboard).
 * Mirrors the backend `fuelPercentFromLitres` so one asset never reads differently
 * in two places.
 */

/**
 * Percent of tank, or null when litres and capacity cannot honestly produce one.
 *
 * Litres above the tank mean an uncalibrated probe (raw ADC counts) or a wrong
 * capacity. Clamping those down to 100% hides the fault and makes an asset look
 * full, so callers show litres alone instead.
 */
export function tankPercentFromLiters(
  litres: number | null | undefined,
  capacity: number | null | undefined,
): number | null {
  if (litres == null || !Number.isFinite(litres) || litres < 0) return null;
  if (capacity == null || !Number.isFinite(capacity) || capacity <= 0) return null;
  if (litres > capacity * 1.1) return null;
  return Math.min(100, Math.round((litres / capacity) * 100));
}

/** An already-known percent is only usable when it sits in a real 0–100 range. */
export function usablePercent(percent: number | null | undefined): number | null {
  if (percent == null || !Number.isFinite(percent)) return null;
  if (percent <= 0 || percent > 100) return null;
  return percent;
}
