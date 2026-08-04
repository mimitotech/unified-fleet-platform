import { query } from '../config/database.js';
export function wialonUnitPlate(unit) {
    return unit.prp?.registration_plate || unit.prp?.plate || undefined;
}
export function wialonUnitVin(unit) {
    return unit.prp?.vin || undefined;
}
export function statusFromWialonPos(pos) {
    if (!pos)
        return null;
    if (pos.y === 0 && pos.x === 0)
        return null;
    const motion = pos.s > 0 ? 'moving' : (pos.sc ?? 0) > 0 ? 'idle' : 'stopped';
    return {
        status: motion,
        location: {
            latitude: pos.y,
            longitude: pos.x,
            speed: pos.s,
            altitude: pos.z,
            timestamp: new Date(pos.t * 1000),
        },
        engineState: pos.s > 0 || (pos.sc ?? 0) > 0,
        source: 'wialon',
    };
}
/** Upsert one Wialon avl_unit into assets, asset_mappings, and asset_status. */
export async function upsertWialonUnit(tenantId, unit) {
    const externalId = String(unit.id);
    const name = unit.nm?.trim() || `Unit ${externalId}`;
    const registrationPlate = wialonUnitPlate(unit);
    const vin = wialonUnitVin(unit);
    const make = unit.prp?.brand;
    const model = unit.prp?.model;
    const yearRaw = unit.prp?.year;
    const year = yearRaw ? parseInt(yearRaw, 10) : undefined;
    const { rows: byMapping } = await query(`SELECT am.asset_id FROM asset_mappings am
     JOIN assets a ON a.id = am.asset_id
     WHERE a.tenant_id = $1 AND am.source_type = 'wialon' AND am.external_id = $2
     LIMIT 1`, [tenantId, externalId]);
    let assetId = byMapping[0]?.asset_id;
    if (!assetId && (vin || registrationPlate)) {
        const { rows: byIdentity } = await query(`SELECT id FROM assets WHERE tenant_id = $1 AND (
        ($2::text IS NOT NULL AND vin = $2) OR
        ($3::text IS NOT NULL AND registration_plate = $3)
      ) LIMIT 1`, [tenantId, vin || null, registrationPlate || null]);
        assetId = byIdentity[0]?.id;
    }
    if (!assetId) {
        const ins = await query(`INSERT INTO assets (tenant_id, name, registration_plate, vin, make, model, year)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`, [tenantId, name, registrationPlate || null, vin || null, make || null, model || null, year || null]);
        assetId = ins.rows[0].id;
    }
    else {
        await query(`UPDATE assets SET name = $2, registration_plate = COALESCE($3, registration_plate),
       vin = COALESCE($4, vin), make = COALESCE($5, make), model = COALESCE($6, model),
       year = COALESCE($7, year), updated_at = NOW() WHERE id = $1`, [assetId, name, registrationPlate, vin, make, model, year]);
    }
    await query(`INSERT INTO asset_mappings (asset_id, source_type, external_id)
     VALUES ($1, 'wialon', $2)
     ON CONFLICT (asset_id, source_type) DO UPDATE SET external_id = EXCLUDED.external_id`, [assetId, externalId]);
    const st = statusFromWialonPos(unit.pos);
    if (st?.location) {
        await query(`INSERT INTO asset_status (asset_id, source_type, status, latitude, longitude, speed, fuel_level, engine_on, recorded_at)
       VALUES ($1, 'wialon', $2, $3, $4, $5, NULL, $6, $7)
       ON CONFLICT (asset_id, source_type) DO UPDATE SET
         status = EXCLUDED.status,
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude,
         speed = EXCLUDED.speed,
         engine_on = EXCLUDED.engine_on,
         recorded_at = EXCLUDED.recorded_at`, [
            assetId,
            st.status,
            st.location.latitude,
            st.location.longitude,
            st.location.speed ?? null,
            st.engineState ?? null,
            st.location.timestamp ?? new Date(),
        ]);
    }
    return assetId;
}
