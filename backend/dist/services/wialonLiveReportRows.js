/** Normalized live report rows from Wialon (no exec_report). */
export function parseTripRow(trip, unitId, unitName, plate) {
    const from = Number(trip.t1 ?? trip.tm ?? trip.from ?? trip.begin ?? trip.time_begin);
    const to = Number(trip.t2 ?? trip.to ?? trip.end ?? trip.time_end);
    const durationSec = Number.isFinite(from) && Number.isFinite(to) && to > from ? to - from : null;
    const distanceM = Number(trip.m ?? trip.distance ?? trip.mileage ?? trip.len);
    const distanceKm = Number.isFinite(distanceM) ? distanceM / 1000 : null;
    const maxSpeed = Number(trip.max_speed ?? trip.maxSpeed ?? trip.c ?? trip.sp);
    let avgSpeed = Number(trip.avg_speed ?? trip.avgSpeed ?? trip.a);
    if (!Number.isFinite(avgSpeed) && durationSec && distanceKm && durationSec > 0) {
        avgSpeed = distanceKm / (durationSec / 3600);
    }
    const fuelUsed = Number(trip.fuel ?? trip.fuel_consumption ?? trip.fuelCons ?? trip.fc);
    return {
        unitId,
        unitName,
        plate: plate || '',
        startTime: Number.isFinite(from) ? new Date(from * 1000).toISOString() : null,
        endTime: Number.isFinite(to) ? new Date(to * 1000).toISOString() : null,
        durationMin: durationSec != null ? Math.round(durationSec / 60) : null,
        distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
        maxSpeedKmh: Number.isFinite(maxSpeed) ? Math.round(maxSpeed) : null,
        avgSpeedKmh: Number.isFinite(avgSpeed) ? Math.round(avgSpeed) : null,
        fuelUsedLiters: Number.isFinite(fuelUsed) ? Math.round(fuelUsed * 10) / 10 : null,
        driver: trip.cn ?? trip.driver ?? trip.driverName ?? '',
    };
}
export async function fetchTripsForUnits(getTrips, units, from, to, concurrency = 6) {
    const rows = [];
    for (let i = 0; i < units.length; i += concurrency) {
        const batch = units.slice(i, i + concurrency);
        const parts = await Promise.all(batch.map(async (u) => {
            try {
                const trips = await getTrips(u.id, from, to);
                return trips.map((t) => parseTripRow(t, u.id, u.name, u.plate));
            }
            catch {
                return [];
            }
        }));
        for (const p of parts)
            rows.push(...p);
    }
    return rows.sort((a, b) => {
        const at = a.startTime ? new Date(String(a.startTime)).getTime() : 0;
        const bt = b.startTime ? new Date(String(b.startTime)).getTime() : 0;
        return bt - at;
    });
}
