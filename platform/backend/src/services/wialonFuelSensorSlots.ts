import type { WialonUnitSensorReading } from './wialonFuelSensorUtils.js';

/** One mapped Wialon sensor value for a table column. */
export type FuelSensorSlotValue = {
  sensorId: number;
  name: string;
  value: number;
  unit: string;
  param: string;
};

export type FuelSensorSlots = {
  fuelLevel: FuelSensorSlotValue | null;
  flsBattery: FuelSensorSlotValue | null;
  flsTemperature: FuelSensorSlotValue | null;
  /** Any other fuel-module sensors not in the three primary slots. */
  other: FuelSensorSlotValue[];
};

export type FuelAssetFlags = {
  hasFuelLevelSensor: boolean;
  missingFuelLevel: boolean;
  hasStaleReading: boolean;
  isFilling: boolean;
};

export type FuelFleetSummary = {
  totalAssets: number;
  vehicles: number;
  generators: number;
  machinery: number;
  withFuelLevel: number;
  missingFuelLevel: number;
  staleReadings: number;
  lowTank: number;
  fillingNow: number;
};

const BATTERY = /battery|volt/i;
const TEMPERATURE = /temperature|\btemp\b/i;

function pickSlot(
  sensors: WialonUnitSensorReading[],
  match: (s: WialonUnitSensorReading) => boolean
): FuelSensorSlotValue | null {
  const s = sensors.find(match);
  if (!s) return null;
  return { sensorId: s.sensorId, name: s.name, value: s.value, unit: s.unit, param: s.param };
}

/** Map Wialon sensor list into fixed Fuel-module columns (exact Wialon labels preserved). */
export function mapSensorSlots(sensors: WialonUnitSensorReading[]): FuelSensorSlots {
  const used = new Set<string>();

  const fuelLevel = pickSlot(sensors, (s) => s.isFuelLevel);
  if (fuelLevel) used.add(fuelLevel.param);

  const flsBattery = pickSlot(
    sensors.filter((s) => !used.has(s.param)),
    (s) => BATTERY.test(s.name)
  );
  if (flsBattery) used.add(flsBattery.param);

  const flsTemperature = pickSlot(
    sensors.filter((s) => !used.has(s.param)),
    (s) => TEMPERATURE.test(s.name)
  );
  if (flsTemperature) used.add(flsTemperature.param);

  const other = sensors
    .filter((s) => !used.has(s.param))
    .map((s) => ({
      sensorId: s.sensorId,
      name: s.name,
      value: s.value,
      unit: s.unit,
      param: s.param,
    }));

  return { fuelLevel, flsBattery, flsTemperature, other };
}

const STALE_MS = 24 * 60 * 60 * 1000;

export function buildAssetFlags(
  slots: FuelSensorSlots,
  updatedAt: string | null,
  fillingLiters: number | null
): FuelAssetFlags {
  const hasFuelLevelSensor = slots.fuelLevel != null;
  const stale =
    updatedAt != null && Date.now() - new Date(updatedAt).getTime() > STALE_MS;
  return {
    hasFuelLevelSensor,
    missingFuelLevel: !hasFuelLevelSensor,
    hasStaleReading: stale,
    isFilling: fillingLiters != null && fillingLiters > 0,
  };
}

export function computeFleetSummary(
  assets: Array<{
    assetType: 'vehicle' | 'generator' | 'machinery';
    fuelPercent: number | null;
    flags: FuelAssetFlags;
  }>
): FuelFleetSummary {
  return {
    totalAssets: assets.length,
    vehicles: assets.filter((a) => a.assetType === 'vehicle').length,
    generators: assets.filter((a) => a.assetType === 'generator').length,
    machinery: assets.filter((a) => a.assetType === 'machinery').length,
    withFuelLevel: assets.filter((a) => a.flags.hasFuelLevelSensor).length,
    missingFuelLevel: assets.filter((a) => a.flags.missingFuelLevel).length,
    staleReadings: assets.filter((a) => a.flags.hasStaleReading).length,
    lowTank: assets.filter((a) => a.fuelPercent != null && a.fuelPercent < 25).length,
    fillingNow: assets.filter((a) => a.flags.isFilling).length,
  };
}

export function formatSlotValue(slot: FuelSensorSlotValue | null | undefined): string {
  if (!slot) return '—';
  const v = Math.round(slot.value * 10) / 10;
  return slot.unit ? `${v} ${slot.unit}` : String(v);
}
