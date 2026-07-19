import { extractPlateFromName, looksLikeSiteName } from './unitPlateUtils.js';
import type { FuelGroupMembership } from './wialonFuelAssetGroups.js';

/** Fuel-module asset categories — units with fuel level sensors only. */
export type FuelAssetCategory = 'vehicle' | 'generator' | 'machinery';

/** @deprecated use FuelAssetCategory */
export type WialonAssetCategory = FuelAssetCategory | 'equipment';

function findCustomField(
  flds: Record<string, { n?: string; v?: string }> | undefined,
  ...names: string[]
): string {
  if (!flds) return '';
  const targets = names.map((n) => n.toLowerCase());
  for (const f of Object.values(flds)) {
    const key = (f?.n || '').toLowerCase();
    if (targets.includes(key)) return String(f?.v ?? '');
  }
  return '';
}

const MACHINERY_NAME_RE =
  /excavat|crane|compressor|\bpump\b|welder|fork\s*lift|forklift|loader|bulldozer|roller|paver|mixer|grader|backhoe|shovel|drill(ing)?\s*rig|plant\b|machiner|\bequip/i;

const GENERATOR_NAME_RE =
  /pearl\s*bank|genset|generator|\bdg\s*set\b|\bgen\s*set\b|\bkva\b|standby\s*power|power\s*pack|bowser|fuel\s*tanker/i;

const ENGINE_SENSOR_RE = /\bengine\b|genset|generator|run\s*time|operating\s*hours|\beh\b/i;

function readExplicitCategory(customFields: Record<string, string>, flds?: Record<string, { n?: string; v?: string }>): FuelAssetCategory | null {
  const raw = (
    customFields.asset_category ||
    customFields['Asset Category'] ||
    customFields.asset_type ||
    customFields['Asset Type'] ||
    customFields.vehicle_type ||
    customFields['Vehicle Type'] ||
    customFields.unit_type ||
    customFields['Unit Type'] ||
    findCustomField(flds, 'asset_category', 'Asset Category', 'asset_type', 'Asset Type', 'vehicle_type', 'Vehicle Type', 'unit_type', 'Unit Type')
  )
    .toLowerCase()
    .trim();

  if (!raw) return null;
  if (raw.includes('gen') || raw.includes('genset')) return 'generator';
  if (raw.includes('mach') || raw.includes('equip') || raw.includes('plant') || raw.includes('crane')) return 'machinery';
  if (raw.includes('veh') || raw.includes('truck') || raw.includes('lorry') || raw.includes('bus')) return 'vehicle';
  return null;
}

function hasEngineHoursSensor(sensorNames: string[]): boolean {
  return sensorNames.some((n) => ENGINE_SENSOR_RE.test(n));
}

/** Canonical generator detection — naming, custom fields, engine-hours profile, Wialon groups. */
export function isWialonGenerator(input: {
  name: string;
  plate?: string;
  customFields?: Record<string, string>;
  flds?: Record<string, { n?: string; v?: string }>;
  engineHours?: number;
  mileage?: number;
  unitId?: number;
  groupMembership?: FuelGroupMembership;
  sensorNames?: string[];
}): boolean {
  if (input.unitId && input.groupMembership?.generatorUnitIds.has(input.unitId)) return true;

  const name = (input.name || '').trim();
  const nameLower = name.toLowerCase();
  const plate = (input.plate || extractPlateFromName(name) || '').trim();
  const cf = input.customFields || {};

  const explicit = readExplicitCategory(cf, input.flds);
  if (explicit === 'generator') return true;
  if (explicit === 'vehicle' || explicit === 'machinery') return false;

  const vehicleType = (
    cf.vehicle_type ||
    cf['Vehicle Type'] ||
    findCustomField(input.flds, 'vehicle_type', 'Vehicle Type')
  ).toLowerCase();
  const unitType = (cf.unit_type || findCustomField(input.flds, 'unit_type')).toLowerCase();
  const model = (cf.Model || cf.model || findCustomField(input.flds, 'Model', 'model')).toLowerCase();

  if (vehicleType.includes('gen') || unitType.includes('gen')) return true;
  if (model.includes('kva')) return true;
  if (GENERATOR_NAME_RE.test(nameLower)) return true;

  const eh = input.engineHours ?? 0;
  const mi = input.mileage ?? 0;
  const sensors = input.sensorNames ?? [];

  if (hasEngineHoursSensor(sensors) && !plate && mi < 500) return true;
  if (!plate && eh > 50 && mi < 500 && (looksLikeSiteName(name) || eh > 200)) return true;

  return false;
}

export function isWialonMachinery(input: {
  name: string;
  plate?: string;
  customFields?: Record<string, string>;
  flds?: Record<string, { n?: string; v?: string }>;
  engineHours?: number;
  mileage?: number;
  unitId?: number;
  groupMembership?: FuelGroupMembership;
}): boolean {
  if (isWialonGenerator(input)) return false;
  if (input.unitId && input.groupMembership?.machineryUnitIds.has(input.unitId)) return true;

  const cf = input.customFields || {};
  const explicit = readExplicitCategory(cf, input.flds);
  if (explicit === 'machinery') return true;
  if (explicit === 'vehicle' || explicit === 'generator') return false;

  const name = (input.name || '').trim();
  if (MACHINERY_NAME_RE.test(name)) return true;

  const plate = (input.plate || extractPlateFromName(name) || '').trim();
  const mi = input.mileage ?? 0;
  const eh = input.engineHours ?? 0;

  if (!plate && mi < 500 && eh > 0) return true;

  return false;
}

export function isWialonVehicle(input: {
  name: string;
  plate?: string;
  mileage?: number;
  unitId?: number;
  groupMembership?: FuelGroupMembership;
  customFields?: Record<string, string>;
  flds?: Record<string, { n?: string; v?: string }>;
  engineHours?: number;
}): boolean {
  if (isWialonGenerator(input)) return false;
  if (isWialonMachinery(input)) return false;
  if (input.unitId && input.groupMembership?.vehicleUnitIds.has(input.unitId)) return true;

  const explicit = readExplicitCategory(input.customFields || {}, input.flds);
  if (explicit === 'vehicle') return true;
  if (explicit === 'generator' || explicit === 'machinery') return false;

  const plate = (input.plate || extractPlateFromName(input.name) || '').trim();
  if (plate) return true;
  return (input.mileage ?? 0) > 1000;
}

/** Single classifier for fuel assets (Wialon units with fuel level sensors). */
export function resolveFuelAssetCategory(input: Parameters<typeof isWialonGenerator>[0]): FuelAssetCategory {
  if (input.unitId && input.groupMembership?.vehicleUnitIds.has(input.unitId)) {
    if (!isWialonGenerator(input) && !isWialonMachinery(input)) return 'vehicle';
  }
  if (isWialonGenerator(input)) return 'generator';
  if (isWialonMachinery(input)) return 'machinery';
  if (isWialonVehicle(input)) return 'vehicle';
  return 'machinery';
}

/** @deprecated use resolveFuelAssetCategory */
export function resolveAssetCategory(input: Parameters<typeof isWialonGenerator>[0]): WialonAssetCategory {
  return resolveFuelAssetCategory(input);
}
