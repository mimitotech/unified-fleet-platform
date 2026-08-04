/** LocoNav Integration API response parsing — matches Mamsvv loconav-api extractors */
export function extractLocoNavVehicles(responseData) {
    if (!responseData)
        return [];
    const data = responseData;
    if (data.success && data.data?.data) {
        const inner = data.data.data;
        if (Array.isArray(inner?.vehicles))
            return inner.vehicles;
    }
    if (data.success && data.data?.vehicles) {
        return data.data.vehicles;
    }
    if (data.data?.vehicles) {
        return data.data.vehicles;
    }
    if (data.vehicles && Array.isArray(data.vehicles)) {
        return data.vehicles;
    }
    if (Array.isArray(data.data)) {
        return data.data;
    }
    if (Array.isArray(data)) {
        return data;
    }
    return [];
}
export function locoNavVehicleId(v) {
    return String(v.vehicleUuid || v.id || '');
}
export function locoNavVehicleName(v) {
    return v.name || v.vehicleNumber || `Vehicle ${locoNavVehicleId(v)}`;
}
