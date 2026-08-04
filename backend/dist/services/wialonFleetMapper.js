export { extractFuelLevel } from './wialonFuel.js';
export function fleetUnitToAsset(u) {
    return {
        id: String(u.id),
        name: u.name,
        registrationPlate: u.plate,
        sources: [{ type: 'wialon', id: String(u.id) }],
        hwName: u.hwName,
        hw: u.hw,
    };
}
export function fleetUnitToStatusItem(u) {
    const fuelLevel = u.fuelLevel;
    const fuelFormatted = u.fuel?.levelFormatted;
    const fuelLiters = u.fuel?.levelLiters;
    return {
        assetId: String(u.id),
        asset: {
            id: String(u.id),
            name: u.name,
            registrationPlate: u.plate,
        },
        status: u.position
            ? {
                status: u.status,
                fuelLevel,
                fuelFormatted,
                fuelLiters,
                location: {
                    latitude: u.position.lat,
                    longitude: u.position.lng,
                    speed: u.position.speed,
                    course: u.position.course,
                    timestamp: new Date(u.position.time * 1000),
                },
                source: 'wialon',
            }
            : { status: u.status, fuelLevel, fuelFormatted, fuelLiters, source: 'wialon' },
        wialon: {
            wialonId: u.id,
            hwName: u.hwName,
            hw: u.hw,
            motionState: u.motionState,
            netconn: u.netconn,
            iconUrl: u.iconUrl,
            iconUgi: u.iconUgi,
            course: u.position?.course,
            trip: u.trip,
            fuel: u.fuel,
            fuelFormatted,
            fuelLiters,
            flds: u.flds,
            sens: u.sens,
        },
    };
}
export function fleetToSnapshotResponse(fleet, live = true) {
    return {
        live,
        stale: false,
        ...fleet,
        units: (fleet.units ?? []).map((u) => ({
            id: String(u.id),
            wialonId: u.id,
            name: u.name,
            plate: u.plate,
            hw: u.hw,
            hwName: u.hwName,
            uid: u.uid,
            ph: u.ph,
            netconn: u.netconn,
            motionState: u.motionState,
            status: u.status,
            assetCategory: u.assetCategory,
            stationary: u.stationary === true || u.assetCategory === 'generator' || u.assetCategory === 'machinery',
            fuelLevel: u.fuelLevel,
            tankCapacity: u.tankCapacity,
            fuel: u.fuel,
            trip: u.trip,
            prp: u.prp,
            flds: u.flds,
            sens: u.sens,
            prms: u.prms,
            rtd: u.rtd,
            position: u.position
                ? {
                    lat: u.position.lat,
                    lng: u.position.lng,
                    speed: u.position.speed,
                    time: u.position.time,
                    course: u.position.course,
                }
                : undefined,
            iconUrl: u.iconUrl,
            iconUgi: u.iconUgi,
            iconUri: u.iconUri,
            engineHours: u.counters?.engineHours,
            mileage: u.counters?.mileage,
            lmsg: u.lmsg,
        })),
    };
}
