import type { FleetSnapshotUnit } from '@/lib/fleetUnits';
import type { FuelInfo, Generator, Machinery, Vehicle } from '@/types';
import { GENERATOR_STATUS, VEHICLE_STATUS } from '@/types/status';
import type { WialonFuelAssetRow } from '@/lib/fuelTypes';
import { tankPercentFromLiters, usablePercent } from '@/lib/fuelLevel';

function buildFuelInfoFromAsset(asset: WialonFuelAssetRow): FuelInfo | undefined {
  const liters = asset.fuelLiters;
  const percent = asset.fuelPercent;
  if (liters == null && percent == null) return undefined;

  const tanks: FuelInfo['tanks'] = [];
  if (asset.mainTankLiters != null && asset.mainTankLiters > 0) {
    tanks.push({ name: 'Main', level: asset.mainTankLiters });
  }
  if (asset.reserveTankLiters != null && asset.reserveTankLiters > 0) {
    tanks.push({ name: 'Reserve', level: asset.reserveTankLiters });
  }

  const info = resolveFuelInfo(liters, percent, asset.tankCapacity);
  return { ...info, tanks: tanks.length ? tanks : undefined };
}

/**
 * Fuel level, capacity and percent using only what Wialon actually reports.
 * Never invent a tank size from L÷% and never invent 0% — missing percent means
 * the asset is not fuel-monitored for %, and callers must treat it as unknown.
 */
function resolveFuelInfo(
  liters: number | null | undefined,
  percent: number | null | undefined,
  declaredCapacity?: number | null,
): FuelInfo {
  const level = liters != null && Number.isFinite(liters) ? liters : 0;
  const reported = usablePercent(percent);
  const tankCapacity =
    declaredCapacity != null && declaredCapacity > 0 ? declaredCapacity : undefined;
  const percentage =
    reported ?? (level > 0 ? tankPercentFromLiters(level, tankCapacity) ?? undefined : undefined);

  return {
    level,
    unit: 'liters',
    tankCapacity: tankCapacity ?? 0,
    percentage,
    capacitySource: tankCapacity != null ? 'custom_field' : 'sensor',
  };
}

function normalizeVehicleStatus(raw: string): Vehicle['status'] {
  const s = (raw || '').toLowerCase();
  if (s === 'moving' || s === 'driving' || s === 'running') return VEHICLE_STATUS.MOVING;
  if (s === 'idle') return VEHICLE_STATUS.IDLE;
  if (s === 'stopped' || s === 'stop' || s === 'parked') return VEHICLE_STATUS.STOPPED;
  return VEHICLE_STATUS.OFFLINE;
}

function normalizeGeneratorStatus(raw: string): Generator['status'] {
  const s = (raw || '').toLowerCase();
  // Backend maps stationary engine-on → idle; never trust vehicle "moving" for gensets.
  if (s === 'running' || s === 'idle') return GENERATOR_STATUS.RUNNING;
  if (s === 'stopped' || s === 'stop' || s === 'parked') return GENERATOR_STATUS.STOPPED;
  if (s === 'moving') return GENERATOR_STATUS.RUNNING;
  return GENERATOR_STATUS.OFFLINE;
}

function customFieldsFromUnit(u: FleetSnapshotUnit): Record<string, string> {
  const cf: Record<string, string> = { ...(u.prp || {}) };
  for (const f of u.flds ?? []) {
    if (f.name) cf[f.name] = String(f.value ?? '');
  }
  return cf;
}

function buildFuelInfoFromLiters(
  liters: number | null | undefined,
  percent: number | null | undefined,
  declaredCapacity?: number | null,
): FuelInfo | undefined {
  if (liters == null && percent == null) return undefined;
  return resolveFuelInfo(liters, percent, declaredCapacity);
}

export function snapshotUnitToVehicle(u: FleetSnapshotUnit): Vehicle {
  // fuelLevel is a percent — never fall back to it as a litre reading.
  const liters = u.fuel?.levelLiters ?? null;
  const fuelInfo = buildFuelInfoFromLiters(liters, u.fuelLevel, u.tankCapacity);
  const id = String(u.wialonId ?? u.id);

  return {
    id,
    name: u.name,
    plate: u.plate || '',
    unitType: 'vehicle',
    vehicleType: 'truck',
    status: normalizeVehicleStatus(u.status),
    driver: null,
    driverId: null,
    speed: u.position?.speed ?? 0,
    mileage: u.mileage ?? 0,
    engineHours: u.engineHours ?? 0,
    fuel: fuelInfo?.level ?? liters ?? 0,
    fuelUnit: 'liters',
    fuelInfo,
    location: {
      lat: u.position?.lat ?? 0,
      lng: u.position?.lng ?? 0,
    },
    lastUpdate: u.position?.time
      ? new Date(u.position.time * 1000).toISOString()
      : new Date().toISOString(),
  };
}

export function snapshotUnitToGenerator(u: FleetSnapshotUnit): Generator {
  // fuelLevel is a percent — never fall back to it as a litre reading.
  const liters = u.fuel?.levelLiters ?? null;
  const fuelInfo = buildFuelInfoFromLiters(liters, u.fuelLevel, u.tankCapacity);
  const id = String(u.wialonId ?? u.id);
  const cf = customFieldsFromUnit(u);
  const siteName = cf.site_name || cf['Site Name'] || u.name;

  return {
    id,
    name: u.name,
    unitType: 'generator',
    assetId: `GEN-${id}`,
    status: normalizeGeneratorStatus(u.status),
    runningTimeToday: 0,
    totalRunningHours: u.engineHours ?? 0,
    siteName,
    power: 100,
    fuel: fuelInfo?.level ?? liters ?? 0,
    fuelInfo,
    location: {
      lat: u.position?.lat ?? 0,
      lng: u.position?.lng ?? 0,
    },
    lastUpdate: u.position?.time
      ? new Date(u.position.time * 1000).toISOString()
      : new Date().toISOString(),
  };
}

export function fuelAssetToVehicle(asset: WialonFuelAssetRow): Vehicle {
  const fuelInfo = buildFuelInfoFromAsset(asset);
  const liters = fuelInfo?.level ?? asset.fuelLiters ?? 0;

  return {
    id: String(asset.unitId),
    name: asset.name,
    plate: asset.plate || '',
    unitType: 'vehicle',
    vehicleType: 'truck',
    status: normalizeVehicleStatus(asset.status),
    driver: null,
    driverId: null,
    speed: 0,
    mileage: 0,
    engineHours: asset.engineHours ?? 0,
    fuel: liters,
    fuelUnit: 'liters',
    fuelInfo,
    location: { lat: 0, lng: 0 },
    lastUpdate: asset.updatedAt ?? new Date().toISOString(),
  };
}

export function fuelAssetToGenerator(asset: WialonFuelAssetRow): Generator {
  const fuelInfo = buildFuelInfoFromAsset(asset);
  const liters = fuelInfo?.level ?? asset.fuelLiters ?? 0;

  return {
    id: String(asset.unitId),
    name: asset.name,
    unitType: 'generator',
    assetId: `GEN-${asset.unitId}`,
    status: normalizeGeneratorStatus(asset.status),
    runningTimeToday: 0,
    totalRunningHours: asset.engineHours ?? 0,
    siteName: asset.name,
    power: 100,
    fuel: liters,
    fuelInfo,
    location: { lat: 0, lng: 0 },
    lastUpdate: asset.updatedAt ?? new Date().toISOString(),
  };
}

export function fuelAssetToMachinery(asset: WialonFuelAssetRow): Machinery {
  const fuelInfo = buildFuelInfoFromAsset(asset);
  const liters = fuelInfo?.level ?? asset.fuelLiters ?? 0;

  return {
    id: String(asset.unitId),
    name: asset.name,
    unitType: 'machinery',
    assetId: `MCH-${asset.unitId}`,
    status: normalizeGeneratorStatus(asset.status),
    runningTimeToday: 0,
    totalRunningHours: asset.engineHours ?? 0,
    siteName: asset.name,
    engineHours: asset.engineHours ?? 0,
    fuel: liters,
    fuelInfo,
    location: { lat: 0, lng: 0 },
    lastUpdate: asset.updatedAt ?? new Date().toISOString(),
  };
}
