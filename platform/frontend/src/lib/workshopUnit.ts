import type { FleetUnit } from '@/lib/fleetUnits';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Map a fleet unit into workshop create/update payload fields. */
export function workshopUnitFields(unit: FleetUnit | null | undefined) {
  if (!unit) return {};
  const isUuid = UUID_RE.test(unit.id);
  return {
    vehicleId: unit.wialonId ? String(unit.wialonId) : unit.id,
    vehicleName: unit.name,
    vehiclePlate: unit.plate || '',
    ...(isUuid ? { assetId: unit.id } : {}),
  };
}

export function isStationaryUnit(unit: FleetUnit | null | undefined): boolean {
  if (!unit) return false;
  return Boolean(unit.stationary || unit.assetCategory === 'generator');
}
