import { extractPlateFromName, looksLikeSiteName, UG_PLATE_RE } from '@/lib/plateUtils';

export type WialonAssetCategory = 'vehicle' | 'generator' | 'equipment';

export function isWialonGenerator(input: {
  name: string;
  plate?: string;
  customFields?: Record<string, string>;
  engineHours?: number;
  mileage?: number;
}): boolean {
  const name = (input.name || '').trim();
  const nameLower = name.toLowerCase();
  const plate = (input.plate || extractPlateFromName(name) || '').trim();
  const cf = input.customFields || {};

  const vehicleType = (cf.vehicle_type || cf['Vehicle Type'] || '').toLowerCase();
  const unitType = (cf.unit_type || '').toLowerCase();
  const model = (cf.Model || cf.model || '').toLowerCase();

  if (vehicleType.includes('gen') || unitType.includes('gen')) return true;
  if (model.includes('kva')) return true;
  // Stationary fuel storage (bowser/tanker) sits with generators in Fuel tabs.
  if (/pearl\s*bank|genset|generator|\bdg\s*set\b|bowser|fuel\s*tanker/i.test(nameLower)) return true;

  const eh = input.engineHours ?? 0;
  const mi = input.mileage ?? 0;
  if (!plate && eh > 100 && mi < 500 && looksLikeSiteName(name)) return true;

  return false;
}

export function isWialonVehicle(input: {
  name: string;
  plate?: string;
  mileage?: number;
}): boolean {
  if (isWialonGenerator(input)) return false;
  const plate = (input.plate || extractPlateFromName(input.name) || '').trim();
  if (plate) return true;
  return (input.mileage ?? 0) > 1000;
}

/** FA fallback icon when Wialon PNG unavailable — never classify tank capacity as generator. */
export function fallbackIconKind(input: {
  name: string;
  plate?: string;
  engineHours?: number;
  mileage?: number;
  kind?: string;
}): 'truck' | 'generator' | 'equipment' {
  if (
    isWialonGenerator({
      name: input.name,
      plate: input.plate,
      engineHours: input.engineHours,
      mileage: input.mileage,
    })
  ) {
    return 'generator';
  }
  if (isWialonVehicle({ name: input.name, plate: input.plate, mileage: input.mileage })) {
    return 'truck';
  }
  return 'equipment';
}
