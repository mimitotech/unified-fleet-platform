import type { FleetAlert } from '@ufp/shared';
import { query } from '../config/database.js';

function isUuid(value?: string | null): boolean {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function fuelEventFingerprint(
  unitId: string,
  type: string,
  volume: number,
  timestampSec: number,
): string {
  // Same physical event can land as multiple fuel_transactions ids (group summary + leaf).
  return `fuel-evt:${unitId}:${type}:${volume.toFixed(2)}:${timestampSec}`;
}

function clientFacingCopy(text?: string): string | undefined {
  if (!text) return text;
  return text
    .replace(/\bWialon\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim();
}

/** Reject alerts that clearly belong to another fleet's units. */
function alertBelongsToTenantFleet(
  alert: FleetAlert,
  allowedUnitIds: Set<string>,
  allowedNames: string[],
): boolean {
  const ext = alert.externalId || alert.id || '';
  if (
    ext.startsWith('fuel-evt:') ||
    ext.startsWith('fuel-sum:') ||
    ext.startsWith('fuel-tx:') ||
    ext.startsWith('eco-unit:')
  ) {
    return true;
  }

  // Numeric Wialon unit id on the alert — must be in this tenant's fleet.
  if (alert.assetId) {
    if (allowedUnitIds.has(String(alert.assetId))) return true;
    // UUID already mapped elsewhere — keep; unknown numeric id reject.
    if (isUuid(alert.assetId)) return true;
    if (/^\d+$/.test(String(alert.assetId))) return false;
  }

  if (!allowedNames.length) return true;

  const blob = `${alert.title || ''} ${alert.description || ''}`.toLowerCase();
  if (allowedNames.some((name) => blob.includes(name))) return true;

  // Keep unscoped informational alerts that don't claim a foreign unit name.
  return !/^[A-Z0-9][\w-]{2,}/.test(alert.title || '');
}

export class AlertOrchestrator {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  async getAlerts(
    limit = 200,
    acknowledged?: boolean,
    from?: Date,
    to?: Date,
  ): Promise<FleetAlert[]> {
    let sql = `SELECT * FROM alerts WHERE tenant_id = $1`;
    const params: unknown[] = [this.tenantId];
    if (acknowledged !== undefined) {
      params.push(acknowledged);
      sql += ` AND acknowledged = $${params.length}`;
    }
    if (from) {
      params.push(from);
      sql += ` AND occurred_at >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      sql += ` AND occurred_at <= $${params.length}`;
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

  /** Resolve Wialon numeric unit id → local asset UUID via asset_mappings. */
  private async resolveAssetUuid(wialonUnitId?: string): Promise<string | undefined> {
    if (!wialonUnitId) return undefined;
    if (isUuid(wialonUnitId)) return wialonUnitId;
    if (!/^\d+$/.test(wialonUnitId)) return undefined;
    const { rows } = await query<{ asset_id: string }>(
      `SELECT am.asset_id
       FROM asset_mappings am
       INNER JOIN assets a ON a.id = am.asset_id
       WHERE a.tenant_id = $1 AND am.source_type = 'wialon' AND am.external_id = $2
       LIMIT 1`,
      [this.tenantId, wialonUnitId],
    );
    return rows[0]?.asset_id;
  }

  async syncFromAdapters(): Promise<number> {
    const from = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const to = new Date();
    let count = 0;

    await this.cleanupSpuriousAlerts();

    const { rows: sources } = await query<{ source_type: string; credentials_encrypted: string }>(
      `SELECT source_type, credentials_encrypted FROM data_sources WHERE tenant_id = $1 AND is_active = true`,
      [this.tenantId],
    );

    const { createAdapter } = await import('../adapters/AdapterFactory.js');
    const { resolveSourceCredentials } = await import('../services/integrationCredentials.js');

    // Prefer mapped unit ids from DB (stable) and fall back to live adapter assets.
    const { rows: mappedUnits } = await query<{ external_id: string; name: string }>(
      `SELECT am.external_id, a.name
       FROM asset_mappings am
       INNER JOIN assets a ON a.id = am.asset_id
       WHERE a.tenant_id = $1 AND am.source_type = 'wialon'`,
      [this.tenantId],
    );

    for (const src of sources) {
      if (src.source_type !== 'tracksolid' && src.source_type !== 'wialon' && src.source_type !== 'loconav') {
        continue;
      }
      try {
        const creds = await resolveSourceCredentials(
          this.tenantId,
          src.source_type as import('@ufp/shared').SourceType,
          src.credentials_encrypted,
        );
        const adapter = createAdapter(src.source_type, creds);

        const assets = typeof adapter.getAssets === 'function' ? await adapter.getAssets() : [];
        const allowedUnitIds = new Set<string>([
          ...mappedUnits.map((u) => String(u.external_id)),
          ...assets.map((a) => String(a.id)).filter(Boolean),
        ]);
        const allowedNames = [
          ...mappedUnits.map((u) => String(u.name || '').trim().toLowerCase()),
          ...assets.map((a) => String(a.name || '').trim().toLowerCase()),
        ]
          .filter(Boolean)
          .sort((a, b) => b.length - a.length);

        const alerts = await adapter.getAlerts(from, to);
        for (const alert of alerts) {
          if (!alertBelongsToTenantFleet(alert, allowedUnitIds, allowedNames)) continue;

          const sourceType = src.source_type as FleetAlert['sourceType'];
          const externalId = alert.externalId || alert.id;
          const { rows: existing } = await query(
            `SELECT id FROM alerts WHERE tenant_id = $1 AND source_type = $2 AND external_id = $3`,
            [this.tenantId, sourceType, externalId],
          );
          if (existing.length > 0) continue;

          const assetUuid = await this.resolveAssetUuid(alert.assetId);
          try {
            await this.insertAlert({
              tenantId: this.tenantId,
              type: alert.type === 'wialon_event' ? 'fleet_event' : alert.type,
              severity: alert.severity,
              title: clientFacingCopy(alert.title) || alert.title,
              description: clientFacingCopy(alert.description),
              latitude: alert.latitude,
              longitude: alert.longitude,
              timestamp: alert.timestamp,
              videoUrl: alert.videoUrl,
              sourceType,
              externalId,
              assetId: assetUuid,
              acknowledged: false,
            });
            count++;
          } catch {
            /* skip bad row */
          }
        }
        if (typeof adapter.disconnect === 'function') {
          await adapter.disconnect();
        }
      } catch {
        // Skip if adapter unavailable
      }
    }

    count += await this.promoteFuelEventsToAlerts();
    return count;
  }

  /**
   * Remove alerts that leaked from other fleets (group eco reports) or were
   * period-summary fuel totals (wrong timestamp / duplicates).
   * Does NOT delete valid sensor/power/safety alerts just because the title
   * omits a plate — those are scoped by unit id at insert time.
   */
  private async cleanupSpuriousAlerts(): Promise<void> {
    try {
      await query(
        `DELETE FROM alerts
         WHERE tenant_id = $1
           AND source_type = 'wialon'
           AND (
             external_id LIKE 'eco-rpt:%'
             OR description ILIKE '%Eco Driving Report(Group)%'
             OR description ILIKE '%Eco Driving Report (Group)%'
           )`,
        [this.tenantId],
      );

      await query(
        `DELETE FROM alerts a
         USING fuel_transactions f
         WHERE a.tenant_id = $1
           AND f.tenant_id = $1
           AND a.source_type = 'wialon'
           AND a.external_id = 'fuel-tx:' || f.id
           AND (
             f.sensor LIKE 'wialon_group_summary%'
             OR f.location LIKE '__period:%'
           )`,
        [this.tenantId],
      );

      await query(
        `DELETE FROM alerts a
         USING alerts b
         WHERE a.tenant_id = $1
           AND b.tenant_id = $1
           AND a.source_type = 'wialon'
           AND b.source_type = 'wialon'
           AND a.type IN ('fuel_theft', 'fuel_filling')
           AND b.type = a.type
           AND a.title = b.title
           AND a.occurred_at = b.occurred_at
           AND a.ctid > b.ctid`,
        [this.tenantId],
      );

      // Migrate legacy type label.
      await query(
        `UPDATE alerts SET type = 'fleet_event'
         WHERE tenant_id = $1 AND type = 'wialon_event'`,
        [this.tenantId],
      );

      // Purge technical counter noise (engine hours, mileage, odometer registrations).
      await query(
        `DELETE FROM alerts
         WHERE tenant_id = $1
           AND source_type = 'wialon'
           AND COALESCE(description, '') = ''
           AND (
             title ~* '(engine\\s*hours?|mileage|odometer|gprs\\s*traffic|traffic\\s*counter|counter\\s*(reset|update|value))'
             OR title ~* '^(fleet alert|notification|event|evt|task|message|unknown)(\\s*·.*)?$'
           )`,
        [this.tenantId],
      );
    } catch {
      /* best-effort cleanup */
    }
  }

  /** Promote fuel fillings / sudden drops — leaf events plus generator group summaries. */
  private async promoteFuelEventsToAlerts(): Promise<number> {
    let inserted = 0;
    try {
      type FuelRow = {
        id: string;
        unit_id: string;
        unit_name: string;
        section: string;
        filled: number | null;
        sudden_fuel_drop: number | null;
        timestamp: number;
        latitude: number | null;
        longitude: number | null;
        sensor: string | null;
        location: string | null;
        time_str: string | null;
      };

      const since = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;

      // 1) Exact leaf events (vehicles + flat genset event rows).
      const { rows: leafRows } = await query<FuelRow>(
        `SELECT id, unit_id, unit_name, section, filled, sudden_fuel_drop, timestamp,
                latitude, longitude, sensor, location, time_str
         FROM fuel_transactions
         WHERE tenant_id = $1
           AND section IN ('theft', 'filling')
           AND timestamp >= $2
           AND COALESCE(sensor, '') NOT LIKE 'wialon_group_summary%'
           AND COALESCE(location, '') NOT LIKE '__period:%'
         ORDER BY timestamp DESC
         LIMIT 400`,
        [this.tenantId, since],
      );

      // 2) Generator / stationary period summaries that never got leaf events.
      //    Fuel Usage Report(Gensets) often stores only wialon_group_summary rows.
      const { rows: summaryRows } = await query<FuelRow>(
        `SELECT id, unit_id, unit_name, section, filled, sudden_fuel_drop, timestamp,
                latitude, longitude, sensor, location, time_str
         FROM fuel_transactions f
         WHERE f.tenant_id = $1
           AND f.section IN ('theft', 'filling')
           AND f.timestamp >= $2
           AND (
             f.sensor LIKE 'wialon_group_summary%'
             OR f.location LIKE '__period:%'
           )
           AND (
             COALESCE(f.filled, 0) > 0
             OR COALESCE(f.sudden_fuel_drop, 0) > 0
           )
           AND NOT EXISTS (
             SELECT 1 FROM fuel_transactions leaf
             WHERE leaf.tenant_id = f.tenant_id
               AND leaf.unit_id = f.unit_id
               AND leaf.section = f.section
               AND leaf.timestamp >= $2
               AND COALESCE(leaf.sensor, '') NOT LIKE 'wialon_group_summary%'
               AND COALESCE(leaf.location, '') NOT LIKE '__period:%'
               AND (
                 (f.section = 'filling' AND COALESCE(leaf.filled, 0) > 0)
                 OR (f.section = 'theft' AND COALESCE(leaf.sudden_fuel_drop, 0) > 0)
               )
           )
         ORDER BY f.timestamp DESC
         LIMIT 200`,
        [this.tenantId, since],
      );

      const seenFingerprints = new Set<string>();
      const candidates = [...leafRows, ...summaryRows];

      for (const row of candidates) {
        const isTheft = row.section === 'theft';
        const vol = isTheft ? Number(row.sudden_fuel_drop || 0) : Number(row.filled || 0);
        if (!(vol > 0)) continue;

        const type = isTheft ? 'fuel_theft' : 'fuel_filling';
        const isSummary =
          String(row.sensor || '').startsWith('wialon_group_summary') ||
          String(row.location || '').startsWith('__period:');
        const fingerprint = isSummary
          ? `fuel-sum:${row.unit_id}:${type}:${vol.toFixed(2)}:${Number(row.timestamp)}`
          : fuelEventFingerprint(row.unit_id, type, vol, Number(row.timestamp));
        if (seenFingerprints.has(fingerprint)) continue;
        seenFingerprints.add(fingerprint);

        const { rows: existingFp } = await query(
          `SELECT id FROM alerts WHERE tenant_id = $1 AND source_type = 'wialon' AND external_id = $2`,
          [this.tenantId, fingerprint],
        );
        if (existingFp.length) continue;

        const legacyId = `fuel-tx:${row.id}`;
        const { rows: existingLegacy } = await query(
          `SELECT id FROM alerts WHERE tenant_id = $1 AND source_type = 'wialon' AND external_id = $2`,
          [this.tenantId, legacyId],
        );
        if (existingLegacy.length) continue;

        const when = row.time_str ? ` at ${row.time_str}` : '';
        const assetUuid = await this.resolveAssetUuid(row.unit_id);
        const unitLabel = row.unit_name || row.unit_id;
        try {
          await this.insertAlert({
            tenantId: this.tenantId,
            type,
            severity: isTheft ? 'critical' : 'info',
            title: isTheft
              ? `Sudden fuel drop · ${unitLabel} (−${vol} L)`
              : `Fuel filling · ${unitLabel} (+${vol} L)`,
            description: isSummary
              ? `${isTheft ? 'Sudden drop' : 'Filling'} of ${vol} L reported from fuel sensors for this period${when}.`
              : `${isTheft ? 'Sudden drop' : 'Filling'} of ${vol} L reported from fuel sensors${when}.`,
            latitude: row.latitude ?? undefined,
            longitude: row.longitude ?? undefined,
            timestamp: new Date(Number(row.timestamp) * 1000),
            sourceType: 'wialon',
            externalId: fingerprint,
            assetId: assetUuid,
            acknowledged: false,
          });
          inserted++;
        } catch {
          /* skip */
        }
      }
    } catch {
      /* fuel table may be empty */
    }
    return inserted;
  }

  async acknowledge(alertId: string): Promise<void> {
    await query(`UPDATE alerts SET acknowledged = true WHERE id = $1 AND tenant_id = $2`, [
      alertId,
      this.tenantId,
    ]);
  }

  /** Acknowledge a specific set of alerts, or every open alert when ids omitted. */
  async acknowledgeMany(ids?: string[]): Promise<number> {
    if (ids && ids.length) {
      const { rowCount } = await query(
        `UPDATE alerts SET acknowledged = true
         WHERE tenant_id = $1 AND acknowledged = false AND id = ANY($2::uuid[])`,
        [this.tenantId, ids],
      );
      return rowCount ?? 0;
    }
    const { rowCount } = await query(
      `UPDATE alerts SET acknowledged = true WHERE tenant_id = $1 AND acknowledged = false`,
      [this.tenantId],
    );
    return rowCount ?? 0;
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
      ],
    );
    return rows[0]?.id || '';
  }
}
