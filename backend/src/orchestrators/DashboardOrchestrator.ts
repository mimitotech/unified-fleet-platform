import { AssetOrchestrator } from './AssetOrchestrator.js';
import { AlertOrchestrator } from './AlertOrchestrator.js';
import { query } from '../config/database.js';

export class DashboardOrchestrator {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  async getKpis() {
    const assetOrch = new AssetOrchestrator(this.tenantId);
    await assetOrch.initialize();
    const assets = await assetOrch.getUnifiedAssets();
    const statuses = await assetOrch.getAllStatuses();

    const moving = statuses.filter((s) => (s.status as { status?: string } | null)?.status === 'moving').length;
    const idle = statuses.filter((s) => (s.status as { status?: string } | null)?.status === 'idle').length;
    const stopped = statuses.filter((s) => (s.status as { status?: string } | null)?.status === 'stopped').length;
    const offline = statuses.filter((s) => (s.status as { status?: string } | null)?.status === 'offline').length;

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

    return {
      totalVehicles: assets.length,
      moving,
      idle,
      stopped,
      offline,
      activeVehicles: moving + idle + stopped,
      criticalAlerts: critical,
      unacknowledgedAlerts: alerts.filter((a) => !a.acknowledged).length,
      totalDrivers: driverStats[0]?.total || 0,
      activeDrivers: driverStats[0]?.active || 0,
      activeRoutes: routeStats[0]?.active_routes || 0,
      scheduledRoutes: routeStats[0]?.scheduled_routes || 0,
      fuelConsumedMonth: Math.round((fuelStats[0]?.fuel_consumed_month as number || 0) * 10) / 10,
      pendingMaintenance: workshopStats[0]?.pending_maintenance || 0,
    };
  }
}
