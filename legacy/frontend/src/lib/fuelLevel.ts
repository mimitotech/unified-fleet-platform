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

/** Asset shape needed to key a live tank reading. */
export type LiveFuelAsset = {
  name?: string | null;
  plate?: string | null;
  fuelLiters?: number | null;
  fuelPercent?: number | null;
  tankCapacity?: number | null;
};

/** One tank state for one asset. `percent` is null when fuel is not monitored. */
export type LiveFuelReading = {
  liters: number;
  percent: number | null;
  tankCapacity: number | null;
};

function liveFuelKeys(asset: LiveFuelAsset): string[] {
  const keys: string[] = [];
  const name = (asset.name ?? '').trim();
  if (name) keys.push(name);
  const plate = (asset.plate ?? '').trim();
  if (plate) {
    keys.push(plate);
    keys.push(plate.toUpperCase().replace(/\s+/g, ''));
  }
  return keys;
}

/**
 * Litres, percent, and capacity resolved together, keyed by every name a fuel
 * transaction or table row can arrive under.
 *
 * Deriving litres on one screen and percent on another let a unit show a figure
 * that did not match its own bar — the two were computed from readings rounded
 * at different points. One reading per asset removes that by construction.
 */
export function buildLiveFuelReadings(assets: LiveFuelAsset[]): Map<string, LiveFuelReading> {
  const map = new Map<string, LiveFuelReading>();
  for (const asset of assets) {
    const raw = asset.fuelLiters;
    if (raw == null || !Number.isFinite(raw) || raw <= 0) continue;

    const capacity =
      asset.tankCapacity != null && Number.isFinite(asset.tankCapacity) && asset.tankCapacity > 0
        ? asset.tankCapacity
        : null;
    // Percent off the unrounded litres — rounding first can shift a whole point.
    const reading: LiveFuelReading = {
      liters: Math.round(raw * 10) / 10,
      percent: usablePercent(asset.fuelPercent) ?? tankPercentFromLiters(raw, capacity),
      tankCapacity: capacity,
    };
    for (const key of liveFuelKeys(asset)) map.set(key, reading);
  }
  return map;
}

/**
 * Live tank litres keyed by the names fuel transactions arrive under.
 *
 * Every fuel surface must share this map. `liveLevel` is not cosmetic: it seeds
 * balance-derived consumption and the event plausibility filter, so two screens
 * reading slightly different levels will report different litres and money for
 * the same period — and drift apart as the sources poll independently.
 */
export function buildLiveFuelLevels(assets: LiveFuelAsset[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const [key, reading] of buildLiveFuelReadings(assets)) {
    map.set(key, reading.liters);
  }
  return map;
}
