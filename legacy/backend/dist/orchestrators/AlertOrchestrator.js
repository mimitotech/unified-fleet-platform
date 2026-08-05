import { query } from '../config/database.js';
import { isNoiseAlert } from '../services/wialonAlertClassify.js';
import { logger } from '../config/logger.js';
function isUuid(value) {
    if (!value)
        return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function fuelEventFingerprint(unitId, type, volume, timestampSec) {
    // Same physical event can land as multiple fuel_transactions ids (group summary + leaf).
    return `fuel-evt:${unitId}:${type}:${volume.toFixed(2)}:${timestampSec}`;
}
function clientFacingCopy(text) {
    if (!text)
        return text;
    return text
        .replace(/\bWialon\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([.,;:])/g, '$1')
        .trim();
}
/** Reject alerts that clearly belong to another fleet's units. */
function alertBelongsToTenantFleet(alert, allowedUnitIds, allowedNames) {
    const ext = alert.externalId || alert.id || '';
    if (ext.startsWith('fuel-evt:') ||
        ext.startsWith('fuel-sum:') ||
        ext.startsWith('fuel-tx:') ||
        ext.startsWith('eco-unit:')) {
        return true;
    }
    // Numeric Wialon unit id on the alert — must be in this tenant's fleet.
    if (alert.assetId) {
        if (allowedUnitIds.has(String(alert.assetId)))
            return true;
        // UUID already mapped elsewhere — keep; unknown numeric id reject.
        if (isUuid(alert.assetId))
            return true;
        if (/^\d+$/.test(String(alert.assetId)))
            return false;
    }
    if (!allowedNames.length)
        return true;
    const blob = `${alert.title || ''} ${alert.description || ''}`.toLowerCase();
    if (allowedNames.some((name) => blob.includes(name)))
        return true;
    // Keep unscoped informational alerts that don't claim a foreign unit name.
    return !/^[A-Z0-9][\w-]{2,}/.test(alert.title || '');
}
export class AlertOrchestrator {
    tenantId;
    constructor(tenantId) {
        this.tenantId = tenantId;
    }
    async getAlerts(limit = 200, acknowledged, from, to) {
        // Cheap MySQL-safe purge so ghost period-summary rows (wrong EOD clocks)
        // disappear on a normal inbox load, not only on full Wialon sync.
        await this.cleanupSpuriousAlerts();
        let sql = `SELECT * FROM alerts WHERE tenant_id = $1`;
        const params = [this.tenantId];
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
            .map((r) => ({
            id: r.id,
            type: r.type,
            severity: r.severity,
            title: r.title,
            description: r.description,
            latitude: r.latitude,
            longitude: r.longitude,
            timestamp: new Date(r.occurred_at),
            videoUrl: r.video_url,
            sourceType: r.source_type,
            externalId: r.external_id,
            assetId: r.asset_id,
            acknowledged: r.acknowledged,
        }))
            .filter((a) => !isNoiseAlert(a));
    }
    /** Wipe Engine_Hours / counter noise for every tenant (one-shot + each sync cycle). */
    static async purgeNoiseAlertsGlobally() {
        try {
            const { rowCount } = await query(`DELETE FROM alerts
         WHERE title REGEXP 'engine[_[:space:]-]*hours?'
            OR description REGEXP 'engine[_[:space:]-]*hours?'
            OR title REGEXP 'mileage|odometer|gprs[[:space:]_-]*traffic|traffic[[:space:]_-]*counter|moto[[:space:]_-]*hours?'
            OR description REGEXP 'mileage[[:space:]_-]*counter|odometer|gprs[[:space:]_-]*traffic'`);
            return rowCount ?? 0;
        }
        catch (err) {
            logger.warn('[AlertOrchestrator] global noise purge failed', err);
            return 0;
        }
    }
    /** Resolve Wialon numeric unit id → local asset UUID via asset_mappings. */
    async resolveAssetUuid(wialonUnitId) {
        if (!wialonUnitId)
            return undefined;
        if (isUuid(wialonUnitId))
            return wialonUnitId;
        if (!/^\d+$/.test(wialonUnitId))
            return undefined;
        const { rows } = await query(`SELECT am.asset_id
       FROM asset_mappings am
       INNER JOIN assets a ON a.id = am.asset_id
       WHERE a.tenant_id = $1 AND am.source_type = 'wialon' AND am.external_id = $2
       LIMIT 1`, [this.tenantId, wialonUnitId]);
        return rows[0]?.asset_id;
    }
    async syncFromAdapters() {
        await AlertOrchestrator.purgeNoiseAlertsGlobally();
        const from = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        const to = new Date();
        let count = 0;
        await this.cleanupSpuriousAlerts();
        const { rows: sources } = await query(`SELECT source_type, credentials_encrypted FROM data_sources WHERE tenant_id = $1 AND is_active = true`, [this.tenantId]);
        const { createAdapter } = await import('../adapters/AdapterFactory.js');
        const { resolveSourceCredentials } = await import('../services/integrationCredentials.js');
        // Prefer mapped unit ids from DB (stable) and fall back to live adapter assets.
        const { rows: mappedUnits } = await query(`SELECT am.external_id, a.name
       FROM asset_mappings am
       INNER JOIN assets a ON a.id = am.asset_id
       WHERE a.tenant_id = $1 AND am.source_type = 'wialon'`, [this.tenantId]);
        for (const src of sources) {
            if (src.source_type !== 'tracksolid' && src.source_type !== 'wialon' && src.source_type !== 'loconav') {
                continue;
            }
            try {
                const creds = await resolveSourceCredentials(this.tenantId, src.source_type, src.credentials_encrypted);
                const adapter = createAdapter(src.source_type, creds);
                const assets = typeof adapter.getAssets === 'function' ? await adapter.getAssets() : [];
                const allowedUnitIds = new Set([
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
                    if (isNoiseAlert(alert))
                        continue;
                    if (!alertBelongsToTenantFleet(alert, allowedUnitIds, allowedNames))
                        continue;
                    const sourceType = src.source_type;
                    const externalId = alert.externalId || alert.id;
                    const { rows: existing } = await query(`SELECT id, acknowledged FROM alerts WHERE tenant_id = $1 AND source_type = $2 AND external_id = $3`, [this.tenantId, sourceType, externalId]);
                    if (existing.length > 0)
                        continue;
                    // Same event already acknowledged under another external_id — do not reopen.
                    const { rows: alreadyAcked } = await query(`SELECT id FROM alerts
             WHERE tenant_id = $1
               AND acknowledged = true
               AND title = $2
               AND ABS(UNIX_TIMESTAMP(occurred_at) - UNIX_TIMESTAMP($3)) < 600
             LIMIT 1`, [this.tenantId, clientFacingCopy(alert.title) || alert.title, alert.timestamp]);
                    if (alreadyAcked.length > 0)
                        continue;
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
                    }
                    catch {
                        /* skip bad row */
                    }
                }
                if (typeof adapter.disconnect === 'function') {
                    await adapter.disconnect();
                }
            }
            catch {
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
     *
     * Each step is isolated so one MySQL-incompatible statement cannot skip the
     * fuel-sum purge that clears the “today / 02:59:59” ghost alerts.
     */
    async cleanupSpuriousAlerts() {
        const run = async (label, sql, params = [this.tenantId]) => {
            try {
                await query(sql, params);
            }
            catch (e) {
                console.warn(`[alerts:${this.tenantId}] cleanup ${label}:`, e.message);
            }
        };
        await run('eco-group', `DELETE FROM alerts
       WHERE tenant_id = $1
         AND source_type = 'wialon'
         AND (
           external_id LIKE 'eco-rpt:%'
           OR description LIKE '%Eco Driving Report(Group)%'
           OR description LIKE '%Eco Driving Report (Group)%'
         )`);
        // Period-summary fuel rows used report end-of-day (UTC 23:59:59 → next-day
        // 02:59:59 in EAT) as the alert clock — run this early and alone so leftovers
        // are always purged even if later steps fail on MySQL.
        await run('fuel-period-summaries', `DELETE FROM alerts
       WHERE tenant_id = $1
         AND source_type = 'wialon'
         AND (
           external_id LIKE 'fuel-sum:%'
           OR description LIKE '%for this period%'
         )`);
        await run('fuel-tx-period', `DELETE a FROM alerts a
       INNER JOIN fuel_transactions f
         ON f.tenant_id = a.tenant_id
        AND a.external_id = CONCAT('fuel-tx:', f.id)
       WHERE a.tenant_id = $1
         AND a.source_type = 'wialon'
         AND (
           COALESCE(f.sensor, '') LIKE 'wialon_group_summary%'
           OR COALESCE(f.location, '') LIKE '__period:%'
         )`);
        await run('fuel-future', `DELETE FROM alerts
       WHERE tenant_id = $1
         AND source_type = 'wialon'
         AND type IN ('fuel_theft', 'fuel_filling')
         AND occurred_at > DATE_ADD(NOW(), INTERVAL 2 MINUTE)`);
        await run('fuel-dupes', `DELETE a FROM alerts a
       INNER JOIN alerts b
         ON b.tenant_id = a.tenant_id
        AND b.source_type = a.source_type
        AND b.type = a.type
        AND b.title = a.title
        AND b.occurred_at = a.occurred_at
        AND b.id < a.id
       WHERE a.tenant_id = $1
         AND a.source_type = 'wialon'
         AND a.type IN ('fuel_theft', 'fuel_filling')`);
        await run('legacy-type', `UPDATE alerts SET type = 'fleet_event'
       WHERE tenant_id = $1 AND type = 'wialon_event'`);
        await run('noise', `DELETE FROM alerts
       WHERE tenant_id = $1
         AND (
           title REGEXP 'engine[_[:space:]-]*hours?'
           OR description REGEXP 'engine[_[:space:]-]*hours?'
           OR title REGEXP 'mileage|odometer|gprs[[:space:]_-]*traffic|traffic[[:space:]_-]*counter|moto[[:space:]_-]*hours?'
           OR (
             COALESCE(description, '') = ''
             AND title REGEXP '^(fleet alert|notification|event|evt|task|message|unknown)([[:space:]]*·.*)?$'
           )
         )`);
        await run('retention-30d', `DELETE FROM alerts
       WHERE tenant_id = $1
         AND occurred_at < DATE_SUB(NOW(), INTERVAL 30 DAY)`);
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
    async promoteFuelEventsToAlerts() {
        let inserted = 0;
        try {
            const since = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;
            const nowSec = Math.floor(Date.now() / 1000) + 120;
            const { rows: leafRows } = await query(`SELECT id, unit_id, unit_name, section, filled, sudden_fuel_drop, timestamp,
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
         LIMIT 400`, [this.tenantId, since, nowSec]);
            const seenFingerprints = new Set();
            for (const row of leafRows) {
                const isTheft = row.section === 'theft';
                const vol = isTheft ? Number(row.sudden_fuel_drop || 0) : Number(row.filled || 0);
                if (!(vol > 0))
                    continue;
                const type = isTheft ? 'fuel_theft' : 'fuel_filling';
                const ts = Number(row.timestamp);
                if (!Number.isFinite(ts) || ts <= 0 || ts > nowSec)
                    continue;
                const fingerprint = fuelEventFingerprint(row.unit_id, type, vol, ts);
                if (seenFingerprints.has(fingerprint))
                    continue;
                seenFingerprints.add(fingerprint);
                const { rows: existingFp } = await query(`SELECT id FROM alerts WHERE tenant_id = $1 AND source_type = 'wialon' AND external_id = $2`, [this.tenantId, fingerprint]);
                if (existingFp.length)
                    continue;
                const legacyId = `fuel-tx:${row.id}`;
                const { rows: existingLegacy } = await query(`SELECT id FROM alerts WHERE tenant_id = $1 AND source_type = 'wialon' AND external_id = $2`, [this.tenantId, legacyId]);
                if (existingLegacy.length)
                    continue;
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
                }
                catch {
                    /* skip */
                }
            }
        }
        catch {
            /* fuel table may be empty */
        }
        return inserted;
    }
    async acknowledge(alertId) {
        await query(`UPDATE alerts SET acknowledged = true WHERE id = $1 AND tenant_id = $2`, [
            alertId,
            this.tenantId,
        ]);
    }
    /** Acknowledge a specific set of alerts, or every open alert when ids omitted. */
    async acknowledgeMany(ids) {
        if (ids && ids.length) {
            const { rowCount } = await query(`UPDATE alerts SET acknowledged = true
         WHERE tenant_id = $1 AND acknowledged = false AND id = ANY($2::uuid[])`, [this.tenantId, ids]);
            return rowCount ?? 0;
        }
        const { rowCount } = await query(`UPDATE alerts SET acknowledged = true WHERE tenant_id = $1 AND acknowledged = false`, [this.tenantId]);
        return rowCount ?? 0;
    }
    async insertAlert(alert) {
        const { rows } = await query(`INSERT INTO alerts (tenant_id, asset_id, source_type, external_id, type, severity, title, description, latitude, longitude, video_url, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`, [
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
        ]);
        return rows[0]?.id || '';
    }
}
