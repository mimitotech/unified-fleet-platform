import type { FleetAlert } from '@ufp/shared';
import { query } from '../config/database.js';
import { isNoiseAlert } from '../services/wialonAlertClassify.js';
import { logger } from '../config/logger.js';

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
    // Cleanup runs on sync cycles / throttled path — never on every inbox poll.
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
    return rows
      .map((r: Record<string, unknown>) => ({
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
      }))
      .filter((a) => !isNoiseAlert(a));
  }

  /** Wipe Engine_Hours / counter noise for every tenant (scheduler only; scoped by time). */
  static async purgeNoiseAlertsGlobally(): Promise<number> {
    try {
      const { rowCount } = await query(
        `DELETE FROM alerts
         WHERE occurred_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
           AND (
             title REGEXP 'engine[_[:space:]-]*hours?'
             OR description REGEXP 'engine[_[:space:]-]*hours?'
             OR title REGEXP 'mileage|odometer|gprs[[:space:]_-]*traffic|traffic[[:space:]_-]*counter|moto[[:space:]_-]*hours?'
             OR description REGEXP 'mileage[[:space:]_-]*counter|odometer|gprs[[:space:]_-]*traffic'
           )`,
      );
      return rowCount ?? 0;
    } catch (err) {
      logger.warn('[AlertOrchestrator] global noise purge failed', err);
      return 0;
    }
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

    await this.cleanupSpuriousAlertsThrottled();

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
          if (isNoiseAlert(alert)) continue;
          if (!alertBelongsToTenantFleet(alert, allowedUnitIds, allowedNames)) continue;

          const sourceType = src.source_type as FleetAlert['sourceType'];
          const externalId = alert.externalId || alert.id;
          const { rows: existing } = await query(
            `SELECT id, acknowledged FROM alerts WHERE tenant_id = $1 AND source_type = $2 AND external_id = $3`,
            [this.tenantId, sourceType, externalId],
          );
          if (existing.length > 0) continue;

          // Same event already acknowledged under another external_id — do not reopen.
          const { rows: alreadyAcked } = await query(
            `SELECT id FROM alerts
             WHERE tenant_id = $1
               AND acknowledged = true
               AND title = $2
               AND ABS(UNIX_TIMESTAMP(occurred_at) - UNIX_TIMESTAMP($3)) < 600
             LIMIT 1`,
            [this.tenantId, clientFacingCopy(alert.title) || alert.title, alert.timestamp],
          );
          if (alreadyAcked.length > 0) continue;

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
    try {
      count += await this.syncWialonServiceIntervals();
    } catch {
      /* optional — service intervals from Wialon si */
    }
    return count;
  }

  /**
   * Mirror Wialon Hosting maintenance intervals (si) into Inbox as Service due
   * when the interval is overdue (e.g. "86 days overdue", "Genset Service Interval").
   */
  private async syncWialonServiceIntervals(): Promise<number> {
    const { loadTenantWialonCreds } = await import('../services/tenantWialonCredentials.js');
    const { WialonHierarchyService } = await import('../services/WialonHierarchyService.js');
    const { emitServiceDueAlert } = await import('../services/workshopAlertService.js');
    const { wialonObjectValues } = await import('../adapters/wialonUtils.js');

    const creds = await loadTenantWialonCreds(this.tenantId);
    const accountId = Number(creds.accountId);
    if (!Number.isFinite(accountId) || accountId <= 0) return 0;

    const items = await WialonHierarchyService.getUnitsForAccount(creds, accountId, 10_000);
    let inserted = 0;
    for (const item of items) {
      if (!item.si) continue;
      const assetUuid = await this.resolveAssetUuid(String(item.id));
      for (const s of wialonObjectValues(item.si)) {
        if (!s?.n || s.cnm == null || s.nmt == null) continue;
        if (!(s.cnm > s.nmt)) continue;
        const delta = Math.round(s.cnm - s.nmt);
        const unitLabel = /day/i.test(s.n) ? 'days' : /hour|e\/h|eng/i.test(s.n) ? 'e/h' : 'km';
        await emitServiceDueAlert({
          tenantId: this.tenantId,
          assetId: assetUuid,
          vehicleName: item.nm || `Unit ${item.id}`,
          reason: `${s.n}: ${delta} ${unitLabel} overdue`,
          sourceId: `wialon-si:${item.id}:${s.n}`,
        });
        inserted++;
      }
    }
    return inserted;
  }

  /**
   * Remove alerts that leaked from other fleets (group eco reports) or were
   * period-summary fuel totals (wrong timestamp / duplicates).
   * Does NOT delete valid sensor/power/safety alerts just because the title
   * omits a plate — those are scoped by unit id at insert time.
   *
   * Each step is isolated so one MySQL-incompatible statement cannot skip the
   * fuel-sum purge that clears the “today / 02:59:59” ghost alerts.
   */
  private static cleanupAtByTenant = new Map<string, number>();
  private static CLEANUP_TTL_MS = 10 * 60_000;

  private async cleanupSpuriousAlertsThrottled(): Promise<void> {
    const last = AlertOrchestrator.cleanupAtByTenant.get(this.tenantId) || 0;
    if (Date.now() - last < AlertOrchestrator.CLEANUP_TTL_MS) return;
    AlertOrchestrator.cleanupAtByTenant.set(this.tenantId, Date.now());
    await this.cleanupSpuriousAlerts();
  }

  private async cleanupSpuriousAlerts(): Promise<void> {
    const run = async (label: string, sql: string, params: unknown[] = [this.tenantId]) => {
      try {
        await query(sql, params);
      } catch (e) {
        console.warn(`[alerts:${this.tenantId}] cleanup ${label}:`, (e as Error).message);
      }
    };

    await run(
      'eco-group',
      `DELETE FROM alerts
       WHERE tenant_id = $1
         AND source_type = 'wialon'
         AND (
           external_id LIKE 'eco-rpt:%'
           OR description LIKE '%Eco Driving Report(Group)%'
           OR description LIKE '%Eco Driving Report (Group)%'
         )`,
    );

    // Period-summary fuel rows used report end-of-day (UTC 23:59:59 → next-day
    // 02:59:59 in EAT) as the alert clock — run this early and alone so leftovers
    // are always purged even if later steps fail on MySQL.
    await run(
      'fuel-period-summaries',
      `DELETE FROM alerts
       WHERE tenant_id = $1
         AND source_type = 'wialon'
         AND (
           external_id LIKE 'fuel-sum:%'
           OR description LIKE '%for this period%'
         )`,
    );

    await run(
      'fuel-tx-period',
      `DELETE a FROM alerts a
       INNER JOIN fuel_transactions f
         ON f.tenant_id = a.tenant_id
        AND a.external_id = CONCAT('fuel-tx:', f.id)
       WHERE a.tenant_id = $1
         AND a.source_type = 'wialon'
         AND (
           COALESCE(f.sensor, '') LIKE 'wialon_group_summary%'
           OR COALESCE(f.location, '') LIKE '__period:%'
         )`,
    );

    await run(
      'fuel-future',
      `DELETE FROM alerts
       WHERE tenant_id = $1
         AND source_type = 'wialon'
         AND type IN ('fuel_theft', 'fuel_filling')
         AND occurred_at > DATE_ADD(NOW(), INTERVAL 2 MINUTE)`,
    );

    await run(
      'fuel-dupes',
      `DELETE a FROM alerts a
       INNER JOIN alerts b
         ON b.tenant_id = a.tenant_id
        AND b.source_type = a.source_type
        AND b.type = a.type
        AND b.title = a.title
        AND b.occurred_at = a.occurred_at
        AND b.id < a.id
       WHERE a.tenant_id = $1
         AND a.source_type = 'wialon'
         AND a.type IN ('fuel_theft', 'fuel_filling')`,
    );

    await run(
      'legacy-type',
      `UPDATE alerts SET type = 'fleet_event'
       WHERE tenant_id = $1 AND type = 'wialon_event'`,
    );

    await run(
      'noise',
      `DELETE FROM alerts
       WHERE tenant_id = $1
         AND (
           title REGEXP 'engine[_[:space:]-]*hours?'
           OR description REGEXP 'engine[_[:space:]-]*hours?'
           OR title REGEXP 'mileage|odometer|gprs[[:space:]_-]*traffic|traffic[[:space:]_-]*counter|moto[[:space:]_-]*hours?'
           OR (
             COALESCE(description, '') = ''
             AND title REGEXP '^(fleet alert|notification|event|evt|task|message|unknown)([[:space:]]*·.*)?$'
           )
         )`,
    );

    await run(
      'retention-30d',
      `DELETE FROM alerts
       WHERE tenant_id = $1
         AND occurred_at < DATE_SUB(NOW(), INTERVAL 30 DAY)`,
    );
  }

  /**
   * Promote real fuel fill / sudden-drop leaf events into the inbox.
   *
   * Period summaries (`wialon_group_summary` / `__period:`) are intentionally
   * excluded — they carry the report window end as their timestamp (UTC EOD,
   * which reads as tomorrow morning in East Africa) and re-fingerprint when the
   * rolling sync window moves, inventing duplicate "future" alerts. Those
   * totals already live in the Fuel module.
   */
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
      const nowSec = Math.floor(Date.now() / 1000) + 120;

      const { rows: leafRows } = await query<FuelRow>(
        `SELECT id, unit_id, unit_name, section, filled, sudden_fuel_drop, timestamp,
                latitude, longitude, sensor, location, time_str
         FROM fuel_transactions
         WHERE tenant_id = $1
           AND section IN ('theft', 'filling')
           AND timestamp >= $2
           AND timestamp <= $3
           AND COALESCE(sensor, '') NOT LIKE 'wialon_group_summary%'
           AND COALESCE(location, '') NOT LIKE '__period:%'
           AND (
             COALESCE(filled, 0) > 0
             OR COALESCE(sudden_fuel_drop, 0) > 0
           )
         ORDER BY timestamp DESC
         LIMIT 400`,
        [this.tenantId, since, nowSec],
      );

      const seenFingerprints = new Set<string>();

      for (const row of leafRows) {
        const isTheft = row.section === 'theft';
        const vol = isTheft ? Number(row.sudden_fuel_drop || 0) : Number(row.filled || 0);
        if (!(vol > 0)) continue;

        const type = isTheft ? 'fuel_theft' : 'fuel_filling';
        const ts = Number(row.timestamp);
        if (!Number.isFinite(ts) || ts <= 0 || ts > nowSec) continue;

        const fingerprint = fuelEventFingerprint(row.unit_id, type, vol, ts);
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
            description: `${isTheft ? 'Sudden drop' : 'Filling'} of ${vol} L reported from fuel sensors${when}.`,
            latitude: row.latitude ?? undefined,
            longitude: row.longitude ?? undefined,
            timestamp: new Date(ts * 1000),
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
