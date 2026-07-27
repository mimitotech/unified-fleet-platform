import { extractPlateFromName, looksLikeSiteName } from './unitPlateUtils.js';
import type { FuelGroupMembership } from './wialonFuelAssetGroups.js';
import type { FuelCategorySupport } from './wialonFuelCategoryStructure.js';

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

/** Kept for group naming / admin tooling — not used to invent Machinery tabs from unit titles. */
export const MACHINERY_NAME_RE =
  /excavat|crane|compressor|\bpump\b|welder|fork\s*lift|forklift|loader|bulldozer|roller|paver|mixer|grader|back\s*hoe|backhoe|shovel|drill(ing)?\s*rig|plant\b|machiner|\bequip/i;

export const GENERATOR_NAME_RE =
  /pearl\s*bank|genset|generator|\bdg\s*set\b|\bgen\s*set\b|\bkva\b|standby\s*power|power\s*pack|bowser|fuel\s*tanker/i;

/** Fuel bowser / tanker — level drops are usually dispensed fuel, not theft. */
const BOWSER_NAME_RE = /\bbowser\b|fuel\s*tanker|fuel\s*truck|fuel\s*trailer/i;

export function isFuelBowserName(name: string): boolean {
  return BOWSER_NAME_RE.test(String(name || ''));
}

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

export type FuelAssetClassifyInput = {
  name: string;
  plate?: string;
  customFields?: Record<string, string>;
  flds?: Record<string, { n?: string; v?: string }>;
  engineHours?: number;
  mileage?: number;
  unitId?: number;
  groupMembership?: FuelGroupMembership;
  sensorNames?: string[];
  /**
   * From Wialon report templates + dedicated groups.
   * When unifiedFleet / category unsupported, do not invent gen/mach from unit names.
   */
  categorySupport?: FuelCategorySupport | null;
};

/**
 * Generator detection from Wialon configuration:
 * 1) dedicated generator unit groups
 * 2) explicit custom fields
 * 3) name/sensor heuristics only when this account has genset templates or gen groups
 */
export function isWialonGenerator(input: FuelAssetClassifyInput): boolean {
  const support = input.categorySupport;
  if (support && !support.generator) {
    // Unified vehicle-only accounts: never invent generators from names.
    // Still honor explicit Wialon custom fields if an admin tagged one unit.
    const explicit = readExplicitCategory(input.customFields || {}, input.flds);
    return explicit === 'generator';
  }

  if (input.unitId && input.groupMembership?.generatorUnitIds.has(input.unitId)) return true;

  const name = (input.name || '').trim();
  const nameLower = name.toLowerCase();
  const plate = (input.plate || extractPlateFromName(name) || '').trim();
  const cf = input.customFields || {};

  const explicit = readExplicitCategory(cf, input.flds);
  if (explicit === 'generator') return true;
  if (explicit === 'vehicle' || explicit === 'machinery') return false;

  // Bowsers / fuel tankers are stationary FLS tanks — group with generators
  // (same Fuel tab), while isFuelBowserName still reclassifies drops as dispensed.
  if (isFuelBowserName(name)) return true;

  const vehicleType = (
    cf.vehicle_type ||
    cf['Vehicle Type'] ||
    findCustomField(input.flds, 'vehicle_type', 'Vehicle Type')
  ).toLowerCase();
  const unitType = (cf.unit_type || findCustomField(input.flds, 'unit_type')).toLowerCase();
  const model = (cf.Model || cf.model || findCustomField(input.flds, 'Model', 'model')).toLowerCase();

  if (vehicleType.includes('gen') || unitType.includes('gen')) return true;
  if (model.includes('kva')) return true;

  // Soft heuristics only when Wialon structure supports generators
  if (GENERATOR_NAME_RE.test(nameLower)) return true;

  const eh = input.engineHours ?? 0;
  const mi = input.mileage ?? 0;
  const sensors = input.sensorNames ?? [];

  if (hasEngineHoursSensor(sensors) && !plate && mi < 500) return true;
  if (!plate && eh > 50 && mi < 500 && (looksLikeSiteName(name) || eh > 200)) return true;

  return false;
}

/**
 * Machinery only from Wialon configuration:
 * dedicated machinery groups or explicit custom fields.
 * Never invent Machinery from unit names (excavator/backhoe in a shared vehicle report).
 */
export function isWialonMachinery(input: FuelAssetClassifyInput): boolean {
  if (isWialonGenerator(input)) return false;

  const support = input.categorySupport;
  if (support && !support.machinery) {
    const explicit = readExplicitCategory(input.customFields || {}, input.flds);
    return explicit === 'machinery';
  }

  if (input.unitId && input.groupMembership?.machineryUnitIds.has(input.unitId)) return true;

  const cf = input.customFields || {};
  const explicit = readExplicitCategory(cf, input.flds);
  if (explicit === 'machinery') return true;
  if (explicit === 'vehicle' || explicit === 'generator') return false;

  // No name / mileage heuristics — excavators in a shared Fuel Report stay vehicles
  // unless Wialon groups or custom fields say otherwise.
  return false;
}

export function isWialonVehicle(input: FuelAssetClassifyInput): boolean {
  if (isWialonGenerator(input)) return false;
  if (isWialonMachinery(input)) return false;
  if (input.unitId && input.groupMembership?.vehicleUnitIds.has(input.unitId)) return true;

  const explicit = readExplicitCategory(input.customFields || {}, input.flds);
  if (explicit === 'vehicle') return true;
  if (explicit === 'generator' || explicit === 'machinery') return false;

  // Default: anything with fuel sensors that isn't configured as gen/mach is a vehicle.
  return true;
}

/** Single classifier for fuel assets (Wialon units with fuel level sensors). */
export function resolveFuelAssetCategory(input: FuelAssetClassifyInput): FuelAssetCategory {
  if (isWialonGenerator(input)) return 'generator';
  if (isWialonMachinery(input)) return 'machinery';
  return 'vehicle';
}

/** @deprecated use resolveFuelAssetCategory */
export function resolveAssetCategory(input: FuelAssetClassifyInput): WialonAssetCategory {
  return resolveFuelAssetCategory(input);
}
