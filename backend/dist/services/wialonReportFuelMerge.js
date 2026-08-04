import { fuelPercentFromLitres, unitHasFuelLevelSensors } from './wialonFuelSensorUtils.js';
/** Merge live LLS readings with fleet snapshot fuel (same path as Fuel module). */
export function mergeUnitFuel(unit, live) {
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
export function unitHasFuelCapability(unit) {
    return unitHasFuelLevelSensors(unit.sens) || unit.fuel?.levelLiters != null;
}
export function fuelMethodLabel(unit, merged) {
    if (merged?.sensors?.length)
        return 'Wialon sensor';
    if (merged?.levelFormatted || merged?.levelLiters != null)
        return 'Wialon calc';
    if (unitHasFuelCapability(unit))
        return 'Wialon sensor';
    return '—';
}
export function formatFuelRowFields(unit, merged) {
    const fuel = merged ?? unit.fuel;
    const fuelLiters = fuel?.levelLiters ?? null;
    const capacity = unit.tankCapacity;
    // Always compute % from litres÷capacity when both known — never treat litres ≤100 as %.
    const fromCapacity = fuelLiters != null && capacity != null && capacity > 0
        ? fuelPercentFromLitres(fuelLiters, capacity)
        : null;
    const fuelPercent = fromCapacity ??
        // Only use an explicit percent field — never treat raw fuelLevel ≤100 as %
        // (those values are often litres on tanks under 100 L or mis-mapped sensors).
        null;
    const fuelLive = fuel?.levelFormatted ||
        (fuelLiters != null && fuelLiters >= 0
            ? fuelPercent != null
                ? `${fuelLiters} L (${fuelPercent}%)`
                : `${fuelLiters} L`
            : fuelPercent != null
                ? `${fuelPercent}%`
                : '');
    return {
        fuelLive,
        fuelFiltered: '',
        fuelLiters,
        fuelPercent,
        tankCapacity: capacity ?? null,
        filledLiters: fuel?.filled != null && fuel.filled > 0 ? Math.round(fuel.filled * 10) / 10 : null,
        filledFormatted: fuel?.filled != null && fuel.filled > 0
            ? fuel.filledFormatted || `${Math.round(fuel.filled * 10) / 10} L`
            : '',
        sensorName: fuel?.sensors?.[0]?.name || '',
        tankCount: fuel?.sensors?.length ?? 0,
        method: 'Wialon sensor',
    };
}
