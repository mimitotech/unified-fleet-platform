import type { FleetUnit } from '@/lib/fleetUnits';
import type { WorkshopAssetCategory } from '@/types/workshop';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function sanitizeWorkshopAssetCategory(value: unknown): WorkshopAssetCategory {
  const s = String(value ?? '')
    .trim()
    .toLowerCase();
  if (s === 'generator' || s === 'genset' || s === 'gensets') return 'generator';
  if (s === 'machinery' || s === 'equipment' || s === 'plant') return 'machinery';
  return 'vehicle';
}

/** Resolve workshop category from a fleet unit (same three-way typing as Fuel). */
export function resolveWorkshopAssetCategory(
  unit: FleetUnit | null | undefined,
  fallback?: unknown,
): WorkshopAssetCategory {
  if (unit?.assetCategory) return sanitizeWorkshopAssetCategory(unit.assetCategory);
  if (unit?.stationary) return 'generator';
  if (fallback != null && String(fallback).trim() !== '') {
    return sanitizeWorkshopAssetCategory(fallback);
  }
  return 'vehicle';
}

/** Map a fleet unit into workshop create/update payload fields. */
export function workshopUnitFields(unit: FleetUnit | null | undefined) {
  if (!unit) return {};
  const isUuid = UUID_RE.test(unit.id);
  const assetCategory = resolveWorkshopAssetCategory(unit);
  return {
    vehicleId: unit.wialonId ? String(unit.wialonId) : unit.id,
    vehicleName: unit.name,
    vehiclePlate: unit.plate || '',
    assetCategory,
    ...(isUuid ? { assetId: unit.id } : {}),
  };
}

export function isStationaryUnit(unit: FleetUnit | null | undefined): boolean {
  if (!unit) return false;
  const cat = resolveWorkshopAssetCategory(unit);
  return Boolean(unit.stationary || cat === 'generator' || cat === 'machinery');
}

export function workshopAssetLabel(category: WorkshopAssetCategory): string {
  if (category === 'generator') return 'Generator';
  if (category === 'machinery') return 'Machinery';
  return 'Vehicle';
}

export function workshopOperatorLabel(category: WorkshopAssetCategory): string {
  if (category === 'vehicle') return 'Driver';
  return 'Operator';
}

export function workshopMeterLabel(category: WorkshopAssetCategory): string {
  if (category === 'vehicle') return 'Odometer (km)';
  return 'Engine hours';
}
