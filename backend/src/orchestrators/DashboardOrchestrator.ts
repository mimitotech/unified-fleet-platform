import { AssetOrchestrator } from './AssetOrchestrator.js';
import { AlertOrchestrator } from './AlertOrchestrator.js';
import { query } from '../config/database.js';
import { WialonFleetService } from '../services/WialonFleetService.js';
import { logger } from '../config/logger.js';

export class DashboardOrchestrator {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  async getKpis() {
    const alertOrch = new AlertOrchestrator(this.tenantId);
    const alerts = await alertOrch.getAlerts(100);
    const critical = alerts.filter((a) => a.severity === 'critical' || a.severity === 'emergency').length;

    const { rows: driverStats } = await query(
      `SELECT COUNT(*)::int as total,
              COUNT(*) FILTER (WHERE status = 'driving')::int as active
       FROM drivers WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [this.tenantId]
    );

    const { rows: routeStats } = await query(
      `SELECT COUNT(*) FILTER (WHERE status = 'in-progress')::int as active_routes,
              COUNT(*) FILTER (WHERE status = 'scheduled')::int as scheduled_routes
       FROM fleet_routes WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [this.tenantId]
    );

    const { rows: fuelStats } = await query(
      `SELECT COALESCE(SUM(fuel_used), 0)::float as fuel_consumed_month
       FROM fuel_transactions
       WHERE tenant_id = $1 AND section = 'consumption'
         AND to_timestamp(timestamp) >= date_trunc('month', NOW())`,
      [this.tenantId]
    );

    const { rows: workshopStats } = await query(
      `SELECT COUNT(*)::int as pending_maintenance
       FROM maintenance_logs WHERE tenant_id = $1 AND status IN ('pending','in-progress') AND deleted_at IS NULL`,
      [this.tenantId]
    );

    const shared = {
      criticalAlerts: critical,
      unacknowledgedAlerts: alerts.filter((a) => !a.acknowledged).length,
      totalDrivers: driverStats[0]?.total || 0,
      activeDrivers: driverStats[0]?.active || 0,
      activeRoutes: routeStats[0]?.active_routes || 0,
      scheduledRoutes: routeStats[0]?.scheduled_routes || 0,
      fuelConsumedMonth: Math.round((fuelStats[0]?.fuel_consumed_month as number || 0) * 10) / 10,
      pendingMaintenance: workshopStats[0]?.pending_maintenance || 0,
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
      } catch (err) {
        logger.warn(`Live Wialon KPIs failed for tenant ${this.tenantId}`, err);
      }
    }

    const assetOrch = new AssetOrchestrator(this.tenantId);
    await assetOrch.initialize();
    const assets = await assetOrch.getUnifiedAssets();
    const { items: statusItems } = await assetOrch.getAllStatuses();

    const moving = statusItems.filter((s) => (s.status as { status?: string } | null)?.status === 'moving').length;
    const idle = statusItems.filter((s) => (s.status as { status?: string } | null)?.status === 'idle').length;
    const stopped = statusItems.filter((s) => (s.status as { status?: string } | null)?.status === 'stopped').length;
    const offline = statusItems.filter((s) => (s.status as { status?: string } | null)?.status === 'offline').length;

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
}
