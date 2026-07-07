import type { FleetAlert } from '@ufp/shared';
import { query } from '../config/database.js';

export class AlertOrchestrator {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  async getAlerts(limit = 50, acknowledged?: boolean): Promise<FleetAlert[]> {
    let sql = `SELECT * FROM alerts WHERE tenant_id = $1`;
    const params: unknown[] = [this.tenantId];
    if (acknowledged !== undefined) {
      sql += ` AND acknowledged = $2`;
      params.push(acknowledged);
    }
    sql += ` ORDER BY occurred_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const { rows } = await query(sql, params);
    return rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      type: r.type as string,
      severity: r.severity as FleetAlert['severity'],
      title: r.title as string,
      description: r.description as string | undefined,
      latitude: r.latitude as number | undefined,
      longitude: r.longitude as number | undefined,
      timestamp: new Date(r.occurred_at as string),
      videoUrl: r.video_url as string | undefined,
      sourceType: r.source_type as FleetAlert['sourceType'],
      externalId: r.external_id as string | undefined,
      assetId: r.asset_id as string | undefined,
      acknowledged: r.acknowledged as boolean,
    }));
  }

  async syncFromAdapters(): Promise<number> {
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const to = new Date();
    let count = 0;

    const { rows: sources } = await query<{ source_type: string; credentials_encrypted: string }>(
      `SELECT source_type, credentials_encrypted FROM data_sources WHERE tenant_id = $1 AND is_active = true`,
      [this.tenantId]
    );

    const { createAdapter } = await import('../adapters/AdapterFactory.js');
    const { resolveSourceCredentials } = await import('../services/integrationCredentials.js');

    for (const src of sources) {
      if (src.source_type !== 'tracksolid' && src.source_type !== 'wialon') continue;
      try {
        const creds = await resolveSourceCredentials(
          this.tenantId,
          src.source_type as import('@ufp/shared').SourceType,
          src.credentials_encrypted
        );
        const adapter = createAdapter(src.source_type, creds);
        const alerts = await adapter.getAlerts(from, to);
        for (const alert of alerts) {
          const sourceType = src.source_type as FleetAlert['sourceType'];
          const { rows: existing } = await query(
            `SELECT id FROM alerts WHERE tenant_id = $1 AND source_type = $2 AND external_id = $3`,
            [this.tenantId, sourceType, alert.externalId || alert.id]
          );
          if (existing.length > 0) continue;
          await this.insertAlert({
            tenantId: this.tenantId,
            type: alert.type,
            severity: alert.severity,
            title: alert.title,
            description: alert.description,
            latitude: alert.latitude,
            longitude: alert.longitude,
            timestamp: alert.timestamp,
            videoUrl: alert.videoUrl,
            sourceType,
            externalId: alert.externalId || alert.id,
            assetId: alert.assetId,
            acknowledged: false,
          });
          count++;
        }
        if (typeof adapter.disconnect === 'function') {
          await adapter.disconnect();
        }
      } catch {
        // Skip if adapter unavailable
      }
    }

    return count;
  }

  async acknowledge(alertId: string): Promise<void> {
    await query(`UPDATE alerts SET acknowledged = true WHERE id = $1 AND tenant_id = $2`, [
      alertId,
      this.tenantId,
    ]);
  }

  async insertAlert(alert: Omit<FleetAlert, 'id'> & { tenantId: string }): Promise<string> {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO alerts (tenant_id, asset_id, source_type, external_id, type, severity, title, description, latitude, longitude, video_url, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        alert.tenantId,
        alert.assetId || null,
        alert.sourceType,
        alert.externalId || null,
        alert.type,
        alert.severity,
        alert.title,
        alert.description || null,
        alert.latitude || null,
        alert.longitude || null,
        alert.videoUrl || null,
        alert.timestamp,
      ]
    );
    return rows[0]?.id || '';
  }
}
