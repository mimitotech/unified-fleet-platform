import { query } from '../config/database.js';
import { WialonFuelManagementService } from './WialonFuelManagementService.js';
import { logger } from '../config/logger.js';
/**
 * Persist live fuel sensor readings for historical lookup.
 * The Fuel UI still reads live levels from Wialon sensors directly.
 */
export class WialonFuelLiveSnapshotService {
    static async captureTenantSnapshots(tenantId) {
        const data = await WialonFuelManagementService.syncLiveFuel(tenantId);
        const count = await this.upsertSnapshots(tenantId, data.units, data.fetchedAt);
        return count;
    }
    static async upsertSnapshots(tenantId, units, recordedAt) {
        if (!units.length)
            return 0;
        const recorded = recordedAt ? new Date(recordedAt) : new Date();
        const BATCH = 100;
        let inserted = 0;
        for (let i = 0; i < units.length; i += BATCH) {
            const batch = units.slice(i, i + BATCH);
            const params = [tenantId, recorded];
            const values = [];
            let p = 3;
            for (const unit of batch) {
                values.push(`($1, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $2)`);
                params.push(String(unit.unitId), unit.unitName, unit.fuelLiters ?? null, unit.fuelPercent ?? null, unit.filledLiters ?? null, unit.mainTankLiters ?? null, unit.reserveTankLiters ?? null);
            }
            await query(`INSERT INTO fuel_live_snapshots (
           tenant_id, unit_id, unit_name, fuel_liters, fuel_percent,
           filled_liters, main_tank_liters, reserve_tank_liters, recorded_at
         ) VALUES ${values.join(', ')}`, params);
            inserted += batch.length;
        }
        return inserted;
    }
    static async getLatestByTenant(tenantId) {
        const { rows } = await query(`SELECT unit_id, unit_name, fuel_liters, fuel_percent, filled_liters,
              main_tank_liters, reserve_tank_liters, recorded_at
       FROM (
         SELECT unit_id, unit_name, fuel_liters, fuel_percent, filled_liters,
                main_tank_liters, reserve_tank_liters, recorded_at,
                ROW_NUMBER() OVER (PARTITION BY unit_id ORDER BY recorded_at DESC) AS rn
         FROM fuel_live_snapshots
         WHERE tenant_id = $1
       ) ranked
       WHERE rn = 1`, [tenantId]);
        return rows;
    }
    static async getHistory(tenantId, unitId, fromTs, toTs, limit = 500) {
        const { rows } = await query(`SELECT unit_id, unit_name, fuel_liters, fuel_percent, filled_liters,
              main_tank_liters, reserve_tank_liters, recorded_at
       FROM fuel_live_snapshots
       WHERE tenant_id = $1 AND unit_id = $2
         AND recorded_at >= to_timestamp($3)
         AND recorded_at <= to_timestamp($4)
       ORDER BY recorded_at DESC
       LIMIT $5`, [tenantId, unitId, fromTs, toTs, limit]);
        return rows;
    }
    static async pruneOldSnapshots(tenantId, keepDays = 90) {
        try {
            const days = Math.max(1, Math.min(3650, Math.floor(Number(keepDays) || 90)));
            await query(`DELETE FROM fuel_live_snapshots
         WHERE tenant_id = $1 AND recorded_at < DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL ${days} DAY)`, [tenantId]);
        }
        catch (err) {
            logger.debug(`[FuelLiveSnapshot] prune skipped for tenant ${tenantId}`, err);
        }
    }
}
