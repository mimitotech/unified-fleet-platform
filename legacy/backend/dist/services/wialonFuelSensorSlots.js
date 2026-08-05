const BATTERY = /battery|volt/i;
const TEMPERATURE = /temperature|\btemp\b/i;
function pickSlot(sensors, match) {
    const s = sensors.find(match);
    if (!s)
        return null;
    return { sensorId: s.sensorId, name: s.name, value: s.value, unit: s.unit, param: s.param };
}
/** Map Wialon sensor list into fixed Fuel-module columns (exact Wialon labels preserved). */
export function mapSensorSlots(sensors) {
    const used = new Set();
    const fuelLevel = pickSlot(sensors, (s) => s.isFuelLevel);
    if (fuelLevel)
        used.add(fuelLevel.param);
    const flsBattery = pickSlot(sensors.filter((s) => !used.has(s.param)), (s) => BATTERY.test(s.name));
    if (flsBattery)
        used.add(flsBattery.param);
    const flsTemperature = pickSlot(sensors.filter((s) => !used.has(s.param)), (s) => TEMPERATURE.test(s.name));
    if (flsTemperature)
        used.add(flsTemperature.param);
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
export function buildAssetFlags(slots, updatedAt, fillingLiters) {
    const hasFuelLevelSensor = slots.fuelLevel != null;
    const stale = updatedAt != null && Date.now() - new Date(updatedAt).getTime() > STALE_MS;
    return {
        hasFuelLevelSensor,
        missingFuelLevel: !hasFuelLevelSensor,
        hasStaleReading: stale,
        isFilling: fillingLiters != null && fillingLiters > 0,
    };
}
export function computeFleetSummary(assets, supportedCategories) {
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
        supportedCategories,
    };
}
export function formatSlotValue(slot) {
    if (!slot)
        return '—';
    const v = Math.round(slot.value * 10) / 10;
    return slot.unit ? `${v} ${slot.unit}` : String(v);
}
