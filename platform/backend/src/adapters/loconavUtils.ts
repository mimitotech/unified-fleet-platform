/** LocoNav Integration API response parsing — matches Mamsvv loconav-api extractors */

export interface LocoNavVehicle {
  vehicleUuid?: string;
  id?: string;
  vehicleNumber?: string;
  name?: string;
  [key: string]: unknown;
}

export function extractLocoNavVehicles(responseData: unknown): LocoNavVehicle[] {
  if (!responseData) return [];

  const data = responseData as Record<string, unknown>;

  if (data.success && (data.data as Record<string, unknown>)?.data) {
    const inner = (data.data as Record<string, unknown>).data as Record<string, unknown>;
    if (Array.isArray(inner?.vehicles)) return inner.vehicles as LocoNavVehicle[];
  }
  if (data.success && (data.data as Record<string, unknown>)?.vehicles) {
    return (data.data as Record<string, unknown>).vehicles as LocoNavVehicle[];
  }
  if ((data.data as Record<string, unknown>)?.vehicles) {
    return (data.data as Record<string, unknown>).vehicles as LocoNavVehicle[];
  }
  if (data.vehicles && Array.isArray(data.vehicles)) {
    return data.vehicles as LocoNavVehicle[];
  }
  if (Array.isArray(data.data)) {
    return data.data as LocoNavVehicle[];
  }
  if (Array.isArray(data)) {
    return data as LocoNavVehicle[];
  }

  return [];
}

export function locoNavVehicleId(v: LocoNavVehicle): string {
  return String(v.vehicleUuid || v.id || '');
}

export function locoNavVehicleName(v: LocoNavVehicle): string {
  return v.name || v.vehicleNumber || `Vehicle ${locoNavVehicleId(v)}`;
}
