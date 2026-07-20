import type { WialonFuelLive } from './wialonFuel.js';
import type { WialonFleetUnit } from './WialonFleetService.js';
import { unitHasFuelLevelSensors } from './wialonFuelSensorUtils.js';

/** Merge live LLS readings with fleet snapshot fuel (same path as Fuel module). */
export function mergeUnitFuel(
  unit: WialonFleetUnit,
  live?: WialonFuelLive | null
): WialonFuelLive | undefined {
  const snapFuel = unit.fuel;
  if (live?.sensors?.length || live?.levelFormatted || live?.levelLiters != null || live?.filled != null) {
    return {
      sensors: live.sensors?.length ? live.sensors : snapFuel?.sensors ?? [],
      levelLiters: live.levelLiters ?? snapFuel?.levelLiters,
      levelFormatted: live.levelFormatted ?? snapFuel?.levelFormatted,
      filled: live.filled ?? snapFuel?.filled,
      filledFormatted: live.filledFormatted ?? snapFuel?.filledFormatted,
    };
  }
  return snapFuel;
}

export function unitHasFuelCapability(unit: WialonFleetUnit): boolean {
  return unitHasFuelLevelSensors(unit.sens) || unit.fuel?.levelLiters != null;
}

export function fuelMethodLabel(unit: WialonFleetUnit, merged?: WialonFuelLive): string {
  if (merged?.sensors?.length) return 'Wialon sensor';
  if (merged?.levelFormatted || merged?.levelLiters != null) return 'Wialon calc';
  if (unitHasFuelCapability(unit)) return 'Wialon sensor';
  return '—';
}

export function formatFuelRowFields(unit: WialonFleetUnit, merged?: WialonFuelLive) {
  const fuel = merged ?? unit.fuel;
  const fuelLiters = fuel?.levelLiters ?? null;
  const fuelPercent = unit.fuelLevel != null ? Math.round(unit.fuelLevel) : null;

  const fuelLive =
    fuel?.levelFormatted ||
    (fuelLiters != null && fuelLiters >= 0 ? `${fuelLiters} L` : fuelPercent != null ? `${fuelPercent}%` : '');

  return {
    fuelLive,
    fuelFiltered: '',
    fuelLiters,
    fuelPercent,
    filledLiters: fuel?.filled != null && fuel.filled > 0 ? Math.round(fuel.filled * 10) / 10 : null,
    filledFormatted:
      fuel?.filled != null && fuel.filled > 0
        ? fuel.filledFormatted || `${Math.round(fuel.filled * 10) / 10} L`
        : '',
    sensorName: fuel?.sensors?.[0]?.name || '',
    tankCount: fuel?.sensors?.length ?? 0,
    method: 'Wialon sensor',
  };
}
