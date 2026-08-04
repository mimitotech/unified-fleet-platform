import { Router } from 'express';
import { query } from '../../config/database.js';
import { requireTenant } from '../../middleware/tenant.js';
import { success } from '../../utils/response.js';
import { toCamelRows } from '../../utils/mapper.js';
const EMISSION_FACTOR = 2.68; // kg CO2 per liter diesel
const router = Router();
router.get('/violations', requireTenant, async (req, res) => {
    const limit = parseInt(String(req.query.limit || '100'), 10);
    const { rows } = await query(`SELECT * FROM eco_driving_violations WHERE tenant_id = $1 ORDER BY occurred_at DESC LIMIT $2`, [req.tenantId, limit]);
    return success(res, toCamelRows(rows));
});
router.get('/metrics', requireTenant, async (req, res) => {
    const { rows: trips } = await query(`SELECT COALESCE(SUM(mileage), 0)::float as mileage, COALESCE(SUM(fuel_used), 0)::float as fuel_used
     FROM trip_summaries WHERE tenant_id = $1`, [req.tenantId]);
    const { rows: fuel } = await query(`SELECT COALESCE(SUM(fuel_used), 0)::float as fuel_used, COALESCE(SUM(mileage), 0)::float as mileage
     FROM fuel_transactions WHERE tenant_id = $1 AND section = 'consumption'`, [req.tenantId]);
    const { rows: violations } = await query(`SELECT COUNT(*)::int as count FROM eco_driving_violations WHERE tenant_id = $1`, [req.tenantId]);
    const totalFuel = (trips[0]?.fuel_used || 0) + (fuel[0]?.fuel_used || 0);
    const totalMileage = Math.max(trips[0]?.mileage || 0, fuel[0]?.mileage || 0);
    const co2Kg = totalFuel * EMISSION_FACTOR;
    const co2PerKm = totalMileage > 0 ? co2Kg / totalMileage : 0;
    return success(res, {
        totalFuelLiters: Math.round(totalFuel * 10) / 10,
        totalMileageKm: Math.round(totalMileage * 10) / 10,
        co2Kg: Math.round(co2Kg),
        co2PerKm: Math.round(co2PerKm * 100) / 100,
        violationCount: violations[0]?.count || 0,
        emissionFactor: EMISSION_FACTOR,
        complianceStatus: co2PerKm < 0.25 ? 'good' : co2PerKm < 0.35 ? 'moderate' : 'poor',
    });
});
router.get('/by-vehicle', requireTenant, async (req, res) => {
    const { rows } = await query(`SELECT unit_name, COALESCE(SUM(fuel_used), 0)::float as fuel_used, COALESCE(SUM(mileage), 0)::float as mileage
     FROM trip_summaries WHERE tenant_id = $1
     GROUP BY unit_name ORDER BY fuel_used DESC`, [req.tenantId]);
    return success(res, toCamelRows(rows).map((r) => {
        const row = r;
        return {
            vehicle: row.unitName,
            fuelUsed: row.fuelUsed,
            mileage: row.mileage,
            co2Kg: Math.round(row.fuelUsed * EMISSION_FACTOR),
        };
    }));
});
export default router;
