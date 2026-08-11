import crypto from 'crypto';
import { query } from '../config/database.js';
import { AssetOrchestrator } from './AssetOrchestrator.js';
import { createAdapter } from '../adapters/AdapterFactory.js';
import { decryptCredentials } from '../utils/encryption.js';
import type { SourceType } from '@ufp/shared';

export class AdminOrchestrator {
  static async getDashboardStats() {
    const { rows: tenantStats } = await query<{
      total: string;
      active: string;
      warning: string;
      inactive: string;
    }>(
      `SELECT COUNT(*)::int as total,
              COUNT(*) FILTER (WHERE status = 'active' OR (status IS NULL AND is_active = true))::int as active,
              COUNT(*) FILTER (WHERE status = 'warning')::int as warning,
              COUNT(*) FILTER (WHERE status IN ('inactive','suspended') OR is_active = false)::int as inactive
       FROM tenants`
    );

    const { rows: vehicleStats } = await query<{ total: string; active: string }>(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN (
                SELECT status FROM asset_status s
                WHERE s.asset_id = a.id
                ORDER BY s.recorded_at DESC LIMIT 1
              ) IN ('moving','idle','stopped') THEN 1 ELSE 0 END) as active
       FROM assets a`
    );

    const { rows: userStats } = await query<{ total: string }>(
      `SELECT COUNT(*)::int as total FROM users WHERE role != 'platform_admin'`
    );

    const { rows: alertStats } = await query<{ pending: string }>(
      `SELECT COUNT(*)::int as pending FROM alerts WHERE acknowledged = false`
    );

    const { rows: integrationStats } = await query<{ total: string; active: string }>(
      `SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE is_active = true)::int as active FROM data_sources`
    );

    const totalIntegrations = Number(integrationStats[0]?.total || 0);
    const activeIntegrations = Number(integrationStats[0]?.active || 0);
    const integrationHealth =
      totalIntegrations > 0 ? Math.round((activeIntegrations / totalIntegrations) * 1000) / 10 : 100;

    const { rows: healthHistory } = await query<{ day: string; score: number }>(
      `SELECT date_trunc('day', started_at)::date::text as day,
              ROUND(AVG(CASE WHEN status = 'success' THEN 100 ELSE 0 END)::numeric, 1)::float as score
       FROM integration_sync_logs
       WHERE started_at >= NOW() - INTERVAL '7 days'
       GROUP BY 1 ORDER BY 1`
    );

    const { rows: growthHistory } = await query<{ day: string; count: number }>(
      `SELECT date_trunc('day', created_at)::date::text as day, COUNT(*)::int as count
       FROM tenants WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY 1 ORDER BY 1`
    );

    const { rows: recentActivity } = await query(
      `SELECT af.*, t.name as tenant_name FROM activity_feed af
       LEFT JOIN tenants t ON t.id = af.tenant_id
       ORDER BY af.created_at DESC LIMIT 10`
    );

    const { rows: topTenants } = await query(
      `SELECT t.id, t.name, t.slug, t.status,
              CASE
                WHEN EXISTS (
                  SELECT 1 FROM data_sources ds
                  WHERE ds.tenant_id = t.id AND ds.source_type = 'wialon' AND ds.is_active
                ) THEN (
                  SELECT COUNT(DISTINCT am.asset_id)::int
                  FROM asset_mappings am
                  JOIN assets ax ON ax.id = am.asset_id
                  WHERE ax.tenant_id = t.id AND am.source_type = 'wialon'
                )
                ELSE COUNT(DISTINCT a.id)::int
              END as vehicle_count,
              COUNT(DISTINCT u.id)::int as user_count
       FROM tenants t
       LEFT JOIN assets a ON a.tenant_id = t.id
       LEFT JOIN users u ON u.tenant_id = t.id
       GROUP BY t.id ORDER BY vehicle_count DESC LIMIT 5`
    );

    const { rows: recentIncidents } = await query(
      `SELECT isl.*, t.name as tenant_name FROM integration_sync_logs isl
       JOIN tenants t ON t.id = isl.tenant_id
       WHERE isl.status = 'failed'
       ORDER BY isl.started_at DESC LIMIT 5`
    );

    const { rows: assetStatusBreakdown } = await query<{ status: string; count: number }>(
      `SELECT COALESCE((
         SELECT s.status FROM asset_status s
         WHERE s.asset_id = a.id
         ORDER BY s.recorded_at DESC LIMIT 1
       ), 'offline') as status,
       COUNT(DISTINCT a.id) as count
       FROM assets a
       GROUP BY 1`
    );

    const { rows: alertsTimeline } = await query<{ hour: string; critical: number; warning: number; info: number }>(
      `SELECT date_trunc('hour', occurred_at)::timestamptz::text as hour,
              COUNT(*) FILTER (WHERE severity IN ('critical', 'emergency'))::int as critical,
              COUNT(*) FILTER (WHERE severity = 'warning')::int as warning,
              COUNT(*) FILTER (WHERE severity = 'info')::int as info
       FROM alerts
       WHERE occurred_at >= NOW() - INTERVAL '24 hours'
       GROUP BY 1 ORDER BY 1`
    );

    const { rows: alertsBySeverity } = await query<{ severity: string; count: number }>(
      `SELECT severity, COUNT(*)::int as count
       FROM alerts
       WHERE occurred_at >= NOW() - INTERVAL '7 days'
       GROUP BY severity ORDER BY count DESC`
    );

    const { rows: syncTimeline } = await query<{ day: string; success: number; failed: number }>(
      `SELECT date_trunc('day', started_at)::date::text as day,
              COUNT(*) FILTER (WHERE status = 'success')::int as success,
              COUNT(*) FILTER (WHERE status = 'failed')::int as failed
       FROM integration_sync_logs
       WHERE started_at >= NOW() - INTERVAL '7 days'
       GROUP BY 1 ORDER BY 1`
    );

    const { rows: integrationsBySource } = await query<{ source_type: string; total: number; active: number }>(
      `SELECT source_type::text, COUNT(*)::int as total,
              COUNT(*) FILTER (WHERE is_active = true)::int as active
       FROM data_sources
       GROUP BY source_type ORDER BY total DESC`
    );

    const { rows: tenantStatusBreakdown } = await query<{ status: string; count: number }>(
      `SELECT COALESCE(status, CASE WHEN is_active THEN 'active' ELSE 'inactive' END) as status,
              COUNT(*)::int as count
       FROM tenants
       GROUP BY 1`
    );

    const { rows: loginStats } = await query<{ logins24h: string; activeUsers7d: string }>(
      `SELECT COUNT(*) FILTER (WHERE last_login_at >= NOW() - INTERVAL '24 hours')::int as logins24h,
              COUNT(*) FILTER (WHERE last_login_at >= NOW() - INTERVAL '7 days')::int as activeUsers7d
       FROM users WHERE is_active = true`
    );

    const { rows: webhookStats } = await query<{ events24h: string }>(
      `SELECT COUNT(*)::int as events24h FROM alerts
       WHERE source_type IN ('loconav', 'tracksolid') AND occurred_at >= NOW() - INTERVAL '24 hours'`
    );

    const { rows: syncStats24h } = await query<{ total: string; success: string; assetsSynced: string }>(
      `SELECT COUNT(*)::int as total,
              COUNT(*) FILTER (WHERE status = 'success')::int as success,
              COALESCE(SUM(vehicles_synced) FILTER (WHERE status = 'success'), 0)::int as assetsSynced
       FROM integration_sync_logs
       WHERE started_at >= NOW() - INTERVAL '24 hours'`
    );

    const { rows: recentSyncs } = await query(
      `SELECT isl.source_type, isl.status, isl.vehicles_synced, isl.started_at, isl.message, t.name as tenant_name
       FROM integration_sync_logs isl
       JOIN tenants t ON t.id = isl.tenant_id
       ORDER BY isl.started_at DESC LIMIT 8`
    );

    const totalTenants = Number(tenantStats[0]?.total || 0);
    const activeTenants = Number(tenantStats[0]?.active || 0);

    return {
      totalTenants,
      activeTenants,
      activeTenantsPct: totalTenants ? Math.round((activeTenants / totalTenants) * 100) : 0,
      totalVehicles: Number(vehicleStats[0]?.total || 0),
      activeVehicles: Number(vehicleStats[0]?.active || 0),
      activeVehiclesPct: vehicleStats[0]?.total
        ? Math.round((Number(vehicleStats[0]?.active || 0) / Number(vehicleStats[0]?.total)) * 100)
        : 0,
      totalUsers: Number(userStats[0]?.total || 0),
      integrationHealth,
      pendingAlerts: Number(alertStats[0]?.pending || 0),
      healthScore: integrationHealth,
      healthHistory,
      growthHistory,
      recentActivity,
      topTenants,
      recentIncidents,
      lastSync: await this.getLastSyncTime(),
      generatedAt: new Date().toISOString(),
      assetStatusBreakdown,
      alertsTimeline,
      alertsBySeverity,
      syncTimeline,
      integrationsBySource,
      tenantStatusBreakdown,
      logins24h: Number(loginStats[0]?.logins24h || 0),
      activeUsers7d: Number(loginStats[0]?.activeUsers7d || 0),
      webhooks24h: Number(webhookStats[0]?.events24h || 0),
      syncs24h: Number(syncStats24h[0]?.total || 0),
      syncSuccess24h: Number(syncStats24h[0]?.success || 0),
      assetsSynced24h: Number(syncStats24h[0]?.assetsSynced || 0),
      recentSyncs,
      tenantWarning: Number(tenantStats[0]?.warning || 0),
      tenantInactive: Number(tenantStats[0]?.inactive || 0),
    };
  }

  static async getLastSyncTime(): Promise<string | null> {
    const { rows } = await query<{ last_sync: string }>(
      `SELECT MAX(last_sync_at)::text as last_sync FROM data_sources`
    );
    return rows[0]?.last_sync || null;
  }

  static async getSystemHealth() {
    const started = Date.now();
    let dbOk = false;
    try {
      await query('SELECT 1');
      dbOk = true;
    } catch {
      dbOk = false;
    }
    const latencyMs = Date.now() - started;

    const { pingRedis } = await import('../config/redis.js');
    const redisHealth = await pingRedis();
    const redisStatus = !redisHealth.configured ? 'disabled' : redisHealth.ok ? 'ok' : 'error';

    const { getPoolLimits } = await import('../config/database.js');
    const pool = getPoolLimits();

    const { getSyncSchedulerStatus } = await import('../services/SyncScheduler.js');
    const syncStatus = getSyncSchedulerStatus();
    const syncBusy =
      syncStatus.tenantCycleRunning ||
      syncStatus.fuelDbCycleRunning ||
      syncStatus.alertCycleRunning ||
      syncStatus.domainCycleRunning;
    const syncErrored = Boolean(syncStatus.lastTenantCycleError || syncStatus.lastAlertCycleError);

    let smtp: { ok: boolean; message: string } = { ok: false, message: 'not checked' };
    try {
      const { verifySmtpConnection } = await import('../services/EmailService.js');
      smtp = await verifySmtpConnection();
    } catch (err) {
      smtp = { ok: false, message: (err as Error).message };
    }

    const allOperational = dbOk && (redisStatus === 'ok' || redisStatus === 'disabled');

    const { rows: sourceHealth } = await query(
      `SELECT ds.source_type, ds.is_active, ds.last_sync_at, ds.last_error, t.name as tenant_name,
              COUNT(*) FILTER (WHERE isl.status = 'success')::int as success_count,
              COUNT(*) FILTER (WHERE isl.status = 'failed')::int as fail_count
       FROM data_sources ds
       JOIN tenants t ON t.id = ds.tenant_id
       LEFT JOIN integration_sync_logs isl ON isl.tenant_id = ds.tenant_id AND isl.source_type = ds.source_type
         AND isl.started_at >= NOW() - INTERVAL '24 hours'
       WHERE ds.is_active = true
       GROUP BY ds.id, t.name`
    );

    const { rows: webhookCount } = await query<{ count: string }>(
      `SELECT COUNT(*)::int as count FROM alerts
       WHERE source_type IN ('loconav','tracksolid') AND occurred_at >= NOW() - INTERVAL '24 hours'`
    );

    return {
      overall: allOperational ? (syncErrored ? 'degraded' : 'operational') : 'degraded',
      api: { status: 'ok', latencyMs },
      database: {
        status: dbOk ? 'ok' : 'error',
        connectionLimit: pool.connectionLimit,
        queueLimit: pool.queueLimit,
        latencyMs,
      },
      redis: {
        status: redisStatus,
        message: redisHealth.message,
      },
      smtp,
      sync: {
        status: syncErrored ? 'error' : syncBusy ? 'running' : 'idle',
        ...syncStatus,
      },
      integrations: sourceHealth,
      webhooks: { events24h: Number(webhookCount[0]?.count || 0) },
      recentIncidents: await query(
        `SELECT * FROM integration_sync_logs WHERE status = 'failed' ORDER BY started_at DESC LIMIT 10`
      ).then((r) => r.rows),
    };
  }

  static async listTenantsWithStats(filters: {
    search?: string;
    status?: string;
    integration?: string;
    sort?: string;
    page?: number;
    limit?: number;
    managerId?: string;
    groupByManager?: boolean;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 25;
    const offset = (page - 1) * limit;
    const params: unknown[] = [];
    let where = 'WHERE 1=1';

    if (filters.managerId) {
      params.push(filters.managerId);
      where += ` AND t.assigned_manager_id = $${params.length}`;
    }

    if (filters.search) {
      params.push(`%${filters.search}%`);
      where += ` AND (t.name ILIKE $${params.length} OR t.slug ILIKE $${params.length})`;
    }
    if (filters.status && filters.status !== 'all') {
      params.push(filters.status);
      where += ` AND COALESCE(t.status, CASE WHEN t.is_active THEN 'active' ELSE 'inactive' END) = $${params.length}`;
    }

    const sortMap: Record<string, string> = {
      name: 't.name ASC',
      vehicles: 'vehicle_count DESC',
      users: 'user_count DESC',
      created: 't.created_at DESC',
      manager: '(mgr.full_name IS NULL), mgr.full_name ASC, t.name ASC',
    };
    const orderBy = sortMap[filters.sort || 'name'] || 't.name ASC';

    const { rows } = await query(
      `SELECT t.*,
              mgr.full_name as assigned_manager_name,
              mgr.email as assigned_manager_email,
              CASE
                WHEN EXISTS (
                  SELECT 1 FROM data_sources ds
                  WHERE ds.tenant_id = t.id AND ds.source_type = 'wialon' AND ds.is_active
                ) THEN (
                  SELECT COUNT(DISTINCT am.asset_id)::int
                  FROM asset_mappings am
                  JOIN assets ax ON ax.id = am.asset_id
                  WHERE ax.tenant_id = t.id AND am.source_type = 'wialon'
                )
                ELSE COUNT(DISTINCT a.id)::int
              END as vehicle_count,
              COUNT(DISTINCT u.id)::int as user_count,
              COUNT(DISTINCT CASE WHEN tm.is_enabled THEN tm.module_key END)::int as enabled_modules,
              (SELECT COUNT(*)::int FROM module_definitions) as total_modules,
              COALESCE(
                (SELECT GROUP_CONCAT(
                  CASE ds.source_type
                    WHEN 'wialon' THEN 'W' WHEN 'loconav' THEN 'L' WHEN 'tracksolid' THEN 'T'
                  END SEPARATOR ','
                ) FROM data_sources ds WHERE ds.tenant_id = t.id AND ds.is_active),
                ''
              ) as integration_codes
       FROM tenants t
       LEFT JOIN users mgr ON mgr.id = t.assigned_manager_id
       LEFT JOIN assets a ON a.tenant_id = t.id
       LEFT JOIN users u ON u.tenant_id = t.id AND u.role NOT IN ('platform_admin', 'super_admin')
       LEFT JOIN tenant_modules tm ON tm.tenant_id = t.id
       ${where}
       GROUP BY t.id, mgr.full_name, mgr.email
       ORDER BY ${orderBy}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const { rows: countRows } = await query<{ total: string }>(
      `SELECT COUNT(*)::int as total FROM tenants t ${where}`,
      params
    );

    const tenants = rows;
    let byManager: Array<{ managerId: string | null; managerName: string; tenants: unknown[] }> | undefined;

    if (filters.groupByManager) {
      const groups = new Map<string | null, { managerName: string; tenants: unknown[] }>();
      for (const row of rows as Array<Record<string, unknown>>) {
        const managerId = (row.assigned_manager_id as string) || null;
        const managerName = (row.assigned_manager_name as string) || 'Unassigned';
        if (!groups.has(managerId)) {
          groups.set(managerId, { managerName, tenants: [] });
        }
        groups.get(managerId)!.tenants.push(row);
      }
      byManager = [...groups.entries()].map(([managerId, g]) => ({
        managerId,
        managerName: g.managerName,
        tenants: g.tenants,
      }));
    }

    return {
      tenants,
      byManager,
      total: Number(countRows[0]?.total || 0),
      page,
      limit,
    };
  }

  static async getTenantDetail(tenantId: string) {
    const { rows } = await query(
      `SELECT t.*, mgr.full_name as assigned_manager_name, mgr.email as assigned_manager_email
       FROM tenants t
       LEFT JOIN users mgr ON mgr.id = t.assigned_manager_id
       WHERE t.id = $1`,
      [tenantId]
    );
    if (!rows[0]) return null;

    const { rows: usage } = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM assets WHERE tenant_id = $1) as vehicles_used,
         (SELECT COUNT(*)::int FROM users WHERE tenant_id = $1) as users_used`,
      [tenantId]
    );

    return { ...rows[0], usage: usage[0] };
  }

  static async syncIntegration(tenantId: string, sourceType: SourceType) {
    const started = new Date();
    try {
      let vehiclesSynced = 0;
      let message = '';

      if (sourceType === 'wialon') {
        const result = await import('../services/WialonSyncService.js').then((m) => m.WialonSyncService.syncTenant(tenantId));
        vehiclesSynced = result.vehicles;
        const userPart =
          result.usersCreated != null
            ? `, ${result.usersCreated} users created, ${result.usersUpdated ?? 0} updated (${result.usersTotal ?? 0} on account)`
            : '';
        message = `Synced ${result.vehicles} vehicles, ${result.drivers} drivers, ${result.geofences} geofences${userPart}`;
      } else if (sourceType === 'tracksolid') {
        const result = await import('../services/TrackSolidSyncService.js').then((m) => m.TrackSolidSyncService.syncTenant(tenantId));
        vehiclesSynced = result.vehicles;
        message = `Synced ${result.vehicles} vehicles, ${result.geofences} geofences, ${result.alerts} alerts`;
      } else {
        const orch = new AssetOrchestrator(tenantId);
        await orch.initialize();
        const assets = await orch.getUnifiedAssets();
        vehiclesSynced = assets.length;
        message = `Synced ${assets.length} vehicles`;
      }
      await query(
        `UPDATE data_sources SET last_sync_at = NOW(), last_error = NULL WHERE tenant_id = $1 AND source_type = $2`,
        [tenantId, sourceType]
      );
      await query(
        `INSERT INTO integration_sync_logs (tenant_id, source_type, status, message, vehicles_synced, completed_at)
         VALUES ($1, $2, 'success', $3, $4, NOW())`,
        [tenantId, sourceType, message, vehiclesSynced]
      );
      await AssetOrchestrator.invalidateTenantCache(tenantId);
      return { success: true, vehiclesSynced, startedAt: started, message };
    } catch (err) {
      const msg = (err as Error).message;
      await query(
        `UPDATE data_sources SET last_error = $3 WHERE tenant_id = $1 AND source_type = $2`,
        [tenantId, sourceType, msg]
      );
      await query(
        `INSERT INTO integration_sync_logs (tenant_id, source_type, status, message, completed_at)
         VALUES ($1, $2, 'failed', $3, NOW())`,
        [tenantId, sourceType, msg]
      );
      throw err;
    }
  }

  static async testIntegration(tenantId: string, sourceType: SourceType, credentials?: Record<string, unknown>) {
    let creds = credentials;
    if (!creds) {
      if (sourceType === 'wialon') {
        const { loadTenantWialonCreds } = await import('../services/tenantWialonCredentials.js');
        creds = (await loadTenantWialonCreds(tenantId)) as unknown as Record<string, unknown>;
      } else {
        const { rows } = await query<{ credentials_encrypted: string }>(
          `SELECT credentials_encrypted FROM data_sources WHERE tenant_id = $1 AND source_type = $2`,
          [tenantId, sourceType]
        );
        if (!rows[0]) throw new Error('Integration not configured');
        creds = decryptCredentials(rows[0].credentials_encrypted);
      }
    }

    if (sourceType === 'tracksolid' && creds.password && typeof creds.password === 'string') {
      creds = { ...creds };
      creds.passwordMd5 = crypto.createHash('md5').update(creds.password as string).digest('hex');
      delete creds.password;
      creds.appKey = creds.appKey || creds.apiKey;
      creds.appSecret = creds.appSecret || creds.secretKey;
      creds.account = creds.account || creds.userId;
    }

    const adapter = createAdapter(sourceType, creds);
    await adapter.connect();
    const assets = await adapter.getAssets();
    const sampleAssets = assets.slice(0, 10).map((a) => ({
      id: a.id,
      name: a.name,
      registrationPlate: a.registrationPlate,
      vin: a.vin,
    }));

    const capabilities = {
      wialon: { gps: true, video: true, fuel: true, commands: true, geofencing: true, drivers: true, reports: true, obd: false },
      loconav: { gps: true, video: true, fuel: false, commands: false, geofencing: false, drivers: false, reports: false, obd: false },
      tracksolid: { gps: true, video: true, fuel: true, commands: true, geofencing: true, drivers: false, reports: true, obd: true },
    }[sourceType];

    await query(
      `UPDATE data_sources SET connection_verified_at = NOW(), preview_asset_count = $3,
       preview_sample = $4, last_error = NULL
       WHERE tenant_id = $1 AND source_type = $2`,
      [tenantId, sourceType, assets.length, JSON.stringify(sampleAssets)]
    );

    return {
      connected: true,
      sourceType,
      assetCount: assets.length,
      sampleAssets,
      capabilities,
    };
  }

  static async getRecommendedModules(tenantId: string) {
    const { rows: sources } = await query<{ source_type: SourceType }>(
      `SELECT source_type FROM data_sources WHERE tenant_id = $1 AND is_active = true AND connection_verified_at IS NOT NULL`,
      [tenantId]
    );
    const connected = sources.map((s) => s.source_type);

    const { rows: modules } = await query<{ key: string; label: string; sources: string[] }>(
      `SELECT \`key\`, label, sources FROM module_definitions ORDER BY sort_order`
    );

    return modules.map((m) => {
      const requiredSources = m.sources || [];
      const canEnable =
        requiredSources.length === 0 ||
        requiredSources.some((s) => connected.includes(s as SourceType));
      return {
        moduleKey: m.key,
        label: m.label,
        requiredSources,
        recommended: canEnable,
        reason: canEnable
          ? requiredSources.length === 0
            ? 'Core module — always available'
            : `Requires ${requiredSources.filter((s) => connected.includes(s as SourceType)).join(' or ')}`
          : `Needs ${requiredSources.join(' or ')} — not connected yet`,
      };
    });
  }

  static async activateTenant(tenantId: string) {
    const { rows: existing } = await query<{ id: string; name: string; status: string }>(
      `SELECT id, name, status FROM tenants WHERE id = $1`,
      [tenantId]
    );
    if (!existing[0]) throw new Error('Tenant not found');

    const { rows: verified } = await query<{ count: string }>(
      `SELECT COUNT(*)::int as count FROM data_sources
       WHERE tenant_id = $1 AND is_active = true AND connection_verified_at IS NOT NULL`,
      [tenantId]
    );
    const verifiedIntegrations = Number(verified[0]?.count || 0);

    await query(
      `UPDATE tenants SET status = 'active', is_active = true, updated_at = NOW() WHERE id = $1`,
      [tenantId]
    );
    await AssetOrchestrator.invalidateTenantCache(tenantId);

    const warnings: string[] = [];
    if (verifiedIntegrations === 0) {
      warnings.push(
        'No telematics systems verified yet. Users can sign in, but live fleet data will appear after you connect and test an integration.'
      );
    }

    return {
      status: 'active',
      verifiedIntegrations,
      integrationsReady: verifiedIntegrations > 0,
      warnings,
    };
  }

  static async createBackup(tenantId: string, backupType = 'full') {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO tenant_backups (tenant_id, backup_type, status) VALUES ($1, $2, 'running') RETURNING id`,
      [tenantId, backupType]
    );
    const backupId = rows[0].id;

    try {
      const tables = ['assets', 'drivers', 'fleet_routes', 'alerts', 'fuel_transactions', 'geofences'];
      let totalRows = 0;
      for (const table of tables) {
        const { rows: cnt } = await query<{ c: string }>(
          `SELECT COUNT(*)::int as c FROM ${table} WHERE tenant_id = $1`,
          [tenantId]
        );
        totalRows += Number(cnt[0]?.c || 0);
      }
      const sizeBytes = totalRows * 1024;
      await query(
        `UPDATE tenant_backups SET status = 'success', size_bytes = $2, completed_at = NOW(),
         file_path = $3 WHERE id = $1`,
        [backupId, sizeBytes, `/backups/${tenantId}/${backupId}.json`]
      );
      return { id: backupId, status: 'success', sizeBytes, rows: totalRows };
    } catch (err) {
      await query(
        `UPDATE tenant_backups SET status = 'failed', error_message = $2, completed_at = NOW() WHERE id = $1`,
        [backupId, (err as Error).message]
      );
      throw err;
    }
  }

  static async exportTenantData(tenantId: string, include: string[] = ['all']) {
    const exportAll = include.includes('all');
    const data: Record<string, unknown> = { exportedAt: new Date().toISOString(), tenantId };

    if (exportAll || include.includes('vehicles')) {
      const { rows } = await query(`SELECT * FROM assets WHERE tenant_id = $1`, [tenantId]);
      data.assets = rows;
    }
    if (exportAll || include.includes('users')) {
      const { rows } = await query(
        `SELECT id, email, full_name, role, is_active, created_at FROM users WHERE tenant_id = $1`,
        [tenantId]
      );
      data.users = rows;
    }
    if (exportAll || include.includes('alerts')) {
      const { rows } = await query(`SELECT * FROM alerts WHERE tenant_id = $1 LIMIT 1000`, [tenantId]);
      data.alerts = rows;
    }
    if (exportAll || include.includes('drivers')) {
      const { rows } = await query(`SELECT * FROM drivers WHERE tenant_id = $1 AND deleted_at IS NULL`, [tenantId]);
      data.drivers = rows;
    }
    return data;
  }

  static generateApiKey(): { raw: string; prefix: string; hash: string } {
    const raw = `sk_live_${crypto.randomBytes(24).toString('hex')}`;
    const prefix = raw.slice(0, 12);
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    return { raw, prefix, hash };
  }
}
