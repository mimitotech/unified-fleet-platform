import { AssetOrchestrator } from './AssetOrchestrator.js';
import { query } from '../config/database.js';
import { WialonFleetService } from '../services/WialonFleetService.js';
import { logger } from '../config/logger.js';
async function safeQuery(sql, params, label) {
    try {
        const { rows } = await query(sql, params);
        return rows;
    }
    catch (err) {
        logger.warn(`Dashboard KPI query failed (${label}): ${err.message}`);
        return [];
    }
}
export class DashboardOrchestrator {
    tenantId;
    constructor(tenantId) {
        this.tenantId = tenantId;
    }
    async getKpis() {
        const tid = this.tenantId;
        const [alertRows, driverStats, routeStats, fuelStats, workshopStats] = await Promise.all([
            safeQuery(`SELECT
           COALESCE(SUM(CASE WHEN severity IN ('critical','emergency') AND acknowledged = 0 THEN 1 ELSE 0 END), 0) as critical,
           COALESCE(SUM(CASE WHEN acknowledged = 0 THEN 1 ELSE 0 END), 0) as unack
         FROM alerts WHERE tenant_id = $1`, [tid], 'alerts'),
            safeQuery(`SELECT COUNT(*)::int as total,
                COUNT(*) FILTER (WHERE status = 'driving')::int as active
         FROM drivers WHERE tenant_id = $1 AND deleted_at IS NULL`, [tid], 'drivers'),
            safeQuery(`SELECT COUNT(*) FILTER (WHERE status = 'in-progress')::int as active_routes,
                COUNT(*) FILTER (WHERE status = 'scheduled')::int as scheduled_routes
         FROM fleet_routes WHERE tenant_id = $1 AND deleted_at IS NULL`, [tid], 'routes'),
            safeQuery(`SELECT COALESCE(SUM(fuel_used), 0)::float as fuel_consumed_month
         FROM fuel_transactions
         WHERE tenant_id = $1 AND section = 'consumption'
           AND to_timestamp(timestamp) >= date_trunc('month', NOW())`, [tid], 'fuel'),
            safeQuery(`SELECT COUNT(*)::int as pending_maintenance
         FROM maintenance_logs WHERE tenant_id = $1 AND status IN ('pending','in-progress') AND deleted_at IS NULL`, [tid], 'workshop'),
        ]);
        const shared = {
            criticalAlerts: Number(alertRows[0]?.critical || 0),
            unacknowledgedAlerts: Number(alertRows[0]?.unack || 0),
            totalDrivers: Number(driverStats[0]?.total || 0),
            activeDrivers: Number(driverStats[0]?.active || 0),
            activeRoutes: Number(routeStats[0]?.active_routes || 0),
            scheduledRoutes: Number(routeStats[0]?.scheduled_routes || 0),
            fuelConsumedMonth: Math.round(Number(fuelStats[0]?.fuel_consumed_month || 0) * 10) / 10,
            pendingMaintenance: Number(workshopStats[0]?.pending_maintenance || 0),
        };
        if (await WialonFleetService.isLiveAvailable(this.tenantId)) {
            try {
                const fleet = await WialonFleetService.getCachedLiveFleet(this.tenantId);
                const { counts } = fleet;
                return {
                    ...shared,
                    totalVehicles: counts.total,
                    moving: counts.moving,
                    idle: counts.idle,
                    stopped: counts.stopped,
                    offline: counts.offline,
                    activeVehicles: counts.moving + counts.idle + counts.stopped,
                    liveFromWialon: true,
                    wialonFetchedAt: fleet.fetchedAt,
                };
            }
            catch (err) {
                logger.warn(`Live Wialon KPIs failed for tenant ${this.tenantId}`, err);
            }
        }
        try {
            const assetOrch = new AssetOrchestrator(this.tenantId);
            await assetOrch.initialize();
            const assets = await assetOrch.getUnifiedAssets();
            const { items: statusItems } = await assetOrch.getAllStatuses();
            const moving = statusItems.filter((s) => s.status?.status === 'moving').length;
            const idle = statusItems.filter((s) => s.status?.status === 'idle').length;
            const stopped = statusItems.filter((s) => s.status?.status === 'stopped').length;
            const offline = statusItems.filter((s) => s.status?.status === 'offline').length;
            return {
                ...shared,
                totalVehicles: assets.length,
                moving,
                idle,
                stopped,
                offline,
                activeVehicles: moving + idle + stopped,
                liveFromWialon: false,
            };
        }
        catch (err) {
            logger.warn(`Fallback asset KPIs failed for tenant ${this.tenantId}`, err);
            return {
                ...shared,
                totalVehicles: 0,
                moving: 0,
                idle: 0,
                stopped: 0,
                offline: 0,
                activeVehicles: 0,
                liveFromWialon: false,
            };
        }
    }
}
