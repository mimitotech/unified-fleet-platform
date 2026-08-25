import { query } from '../config/database.js';

export type DriverGrade = 'good' | 'bad' | 'ugly';

export type PenaltyWeights = Record<string, number>;

export type DriverPenaltyConfig = {
  tenantId: string;
  baseScore: number;
  penalties: PenaltyWeights;
  goodMin: number;
  badMin: number;
  updatedAt?: string | null;
};

export const DEFAULT_PENALTIES: PenaltyWeights = {
  speeding: 8,
  overspeeding: 8,
  harsh_braking: 5,
  harsh_acceleration: 4,
  harsh_cornering: 4,
  idling: 2,
  towing: 10,
  unauthorized: 10,
  fatigue: 12,
  camera: 6,
  video: 6,
  eco_violation: 3,
};

const DEFAULT_CONFIG = {
  baseScore: 100,
  penalties: DEFAULT_PENALTIES,
  goodMin: 80,
  badMin: 55,
};

function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw as T;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

export function gradeFromScore(score: number, goodMin: number, badMin: number): DriverGrade {
  if (score >= goodMin) return 'good';
  if (score >= badMin) return 'bad';
  return 'ugly';
}

export function normalizeViolationKey(type: string): string {
  const t = String(type || '')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_');
  if (/over.?speed|speeding/.test(t)) return 'speeding';
  if (/harsh.?brak/.test(t)) return 'harsh_braking';
  if (/harsh.?accel/.test(t)) return 'harsh_acceleration';
  if (/harsh.?corn|corner/.test(t)) return 'harsh_cornering';
  if (/idle/.test(t)) return 'idling';
  if (/unauth|towing/.test(t)) return 'unauthorized';
  if (/fatigue|tired/.test(t)) return 'fatigue';
  if (/camera|video|surveillance/.test(t)) return 'camera';
  return t || 'eco_violation';
}

export class DriverScoringService {
  static parseAlertDaysFromEnv(): number[] {
    const raw = String(process.env.DRIVER_LICENSE_ALERT_DAYS || '').trim();
    const parsed = raw
      .split(',')
      .map((v) => parseInt(v.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0 && n <= 365);
    const uniqueDesc = [...new Set(parsed)].sort((a, b) => b - a);
    return uniqueDesc.length ? uniqueDesc : [30, 14, 7];
  }

  static parseExpiredPolicyFromEnv(): 'warn' | 'off_duty' {
    const raw = String(process.env.DRIVER_LICENSE_EXPIRED_ACTION || '').trim().toLowerCase();
    return raw === 'off_duty' || raw === 'off-duty' ? 'off_duty' : 'warn';
  }

  static async resolveLicensePolicy(): Promise<{
    alertDays: number[];
    expiredAction: 'warn' | 'off_duty';
  }> {
    const envPolicy = {
      alertDays: this.parseAlertDaysFromEnv(),
      expiredAction: this.parseExpiredPolicyFromEnv(),
    };
    const { rows } = await query<{ value: unknown }>(
      `SELECT value FROM system_settings WHERE \`key\` = 'driver_license_policy' LIMIT 1`
    ).catch(() => ({ rows: [] as Array<{ value: unknown }> }));
    const row = rows[0];
    if (!row?.value) return envPolicy;
    try {
      const v =
        typeof row.value === 'string'
          ? (JSON.parse(row.value) as Record<string, unknown>)
          : (row.value as Record<string, unknown>);
      const days = Array.isArray(v.alertDays)
        ? v.alertDays
            .map((n) => parseInt(String(n), 10))
            .filter((n) => Number.isFinite(n) && n > 0 && n <= 365)
            .sort((a, b) => b - a)
        : envPolicy.alertDays;
      const actionRaw = String(v.expiredAction || '').toLowerCase();
      const action = actionRaw === 'off_duty' || actionRaw === 'off-duty' ? 'off_duty' : 'warn';
      return {
        alertDays: days.length ? [...new Set(days)] : envPolicy.alertDays,
        expiredAction: action,
      };
    } catch {
      return envPolicy;
    }
  }

  static async ensureSchema(): Promise<void> {
    await query(
      `CREATE TABLE IF NOT EXISTS tenant_driver_penalty_configs (
         tenant_id CHAR(36) NOT NULL PRIMARY KEY,
         base_score DECIMAL(18,4) NOT NULL DEFAULT 100,
         penalties JSON NOT NULL,
         good_min DECIMAL(18,4) NOT NULL DEFAULT 80,
         bad_min DECIMAL(18,4) NOT NULL DEFAULT 55,
         updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
       )`
    ).catch(() => undefined);
    await query(
      `ALTER TABLE drivers ADD COLUMN fuel_card_number VARCHAR(64) NULL`
    ).catch(() => undefined);
    await query(
      `ALTER TABLE drivers ADD COLUMN hire_date DATE NULL`
    ).catch(() => undefined);
    await query(
      `ALTER TABLE drivers ADD COLUMN permit_class VARCHAR(32) NULL`
    ).catch(() => undefined);
    await query(
      `ALTER TABLE drivers ADD COLUMN license_expiry_date DATE NULL`
    ).catch(() => undefined);
    await query(
      `ALTER TABLE drivers ADD KEY idx_drivers_tenant_license_expiry (tenant_id, license_expiry_date)`
    ).catch(() => undefined);
    await query(
      `ALTER TABLE eco_driving_violations ADD COLUMN driver_id CHAR(36) NULL`
    ).catch(() => undefined);
    await query(
      `ALTER TABLE driver_performance_snapshots ADD COLUMN grade VARCHAR(16) NULL`
    ).catch(() => undefined);
    await query(
      `ALTER TABLE driver_performance_snapshots ADD COLUMN penalty_points DECIMAL(18,4) NOT NULL DEFAULT 0`
    ).catch(() => undefined);
  }

  static async syncLicenseExpiryAlerts(tenantId: string): Promise<{ checked: number; alerted: number }> {
    await this.ensureSchema();
    const policy = await this.resolveLicensePolicy();
    const { rows } = await query<{
      id: string;
      name: string;
      license_number: string;
      permit_class: string | null;
      license_expiry_date: string;
    }>(
      `SELECT id, name, license_number, permit_class, license_expiry_date
       FROM drivers
       WHERE tenant_id = $1
         AND deleted_at IS NULL
         AND license_expiry_date IS NOT NULL`,
      [tenantId]
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let alerted = 0;

    for (const d of rows) {
      const expiry = new Date(`${String(d.license_expiry_date).slice(0, 10)}T00:00:00Z`);
      if (Number.isNaN(expiry.getTime())) continue;
      const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);

      let bucket: string | null = null;
      let severity = 'medium';
      if (daysLeft < 0) {
        bucket = 'expired';
        severity = 'critical';
      } else {
        for (const day of policy.alertDays) {
          if (daysLeft <= day) {
            bucket = `${day}d`;
            severity = day <= 7 ? 'high' : day <= 14 ? 'medium' : 'low';
          }
        }
      }
      if (!bucket) continue;

      const externalId = `driver-license:${d.id}:${bucket}`;
      const permit = d.permit_class ? ` class ${d.permit_class}` : '';
      const title = daysLeft < 0 ? 'Driver license expired' : 'Driver license expiring soon';
      const description =
        daysLeft < 0
          ? `${d.name} (${d.license_number}${permit}) license expired ${Math.abs(daysLeft)} day(s) ago.`
          : `${d.name} (${d.license_number}${permit}) license expires in ${daysLeft} day(s) on ${String(d.license_expiry_date).slice(0, 10)}.`;

      // "alerts.source_type" enum currently allows only telematics values.
      // We use "wialon" for internal driver compliance alerts to avoid schema churn.
      await query(
        `INSERT INTO alerts (tenant_id, source_type, external_id, type, severity, title, description, occurred_at)
         VALUES ($1, 'wialon', $2, 'license_expiry', $3, $4, $5, NOW())
         ON DUPLICATE KEY UPDATE
           severity = VALUES(severity),
           title = VALUES(title),
           description = VALUES(description),
           occurred_at = VALUES(occurred_at)`,
        [tenantId, externalId, severity, title, description]
      );
      alerted++;

      if (daysLeft < 0 && policy.expiredAction === 'off_duty') {
        await query(
          `UPDATE drivers
           SET status = 'off-duty', updated_at = NOW()
           WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND status <> 'off-duty'`,
          [d.id, tenantId]
        ).catch(() => undefined);
      }
    }

    return { checked: rows.length, alerted };
  }

  static async syncLicenseExpiryAlertsAllTenants(): Promise<{ tenants: number; checked: number; alerted: number }> {
    await this.ensureSchema();
    const { rows } = await query<{ tenant_id: string }>(
      `SELECT DISTINCT tenant_id FROM drivers WHERE deleted_at IS NULL`
    );
    let checked = 0;
    let alerted = 0;
    for (const t of rows) {
      const r = await this.syncLicenseExpiryAlerts(t.tenant_id);
      checked += r.checked;
      alerted += r.alerted;
    }
    return { tenants: rows.length, checked, alerted };
  }

  static async getConfig(tenantId: string): Promise<DriverPenaltyConfig> {
    await this.ensureSchema();
    const { rows } = await query<{
      tenant_id: string;
      base_score: number | string;
      penalties: unknown;
      good_min: number | string;
      bad_min: number | string;
      updated_at: string;
    }>(
      `SELECT tenant_id, base_score, penalties, good_min, bad_min, updated_at
       FROM tenant_driver_penalty_configs WHERE tenant_id = $1`,
      [tenantId]
    );
    const row = rows[0];
    if (!row) {
      return {
        tenantId,
        ...DEFAULT_CONFIG,
        penalties: { ...DEFAULT_PENALTIES },
        updatedAt: null,
      };
    }
    return {
      tenantId,
      baseScore: Number(row.base_score) || 100,
      penalties: { ...DEFAULT_PENALTIES, ...parseJson<PenaltyWeights>(row.penalties, {}) },
      goodMin: Number(row.good_min) || 80,
      badMin: Number(row.bad_min) || 55,
      updatedAt: row.updated_at || null,
    };
  }

  static async saveConfig(
    tenantId: string,
    input: Partial<{
      baseScore: number;
      penalties: PenaltyWeights;
      goodMin: number;
      badMin: number;
    }>
  ): Promise<DriverPenaltyConfig> {
    await this.ensureSchema();
    const current = await this.getConfig(tenantId);
    const next = {
      baseScore: input.baseScore ?? current.baseScore,
      penalties: { ...current.penalties, ...(input.penalties || {}) },
      goodMin: input.goodMin ?? current.goodMin,
      badMin: input.badMin ?? current.badMin,
    };
    await query(
      `INSERT INTO tenant_driver_penalty_configs (tenant_id, base_score, penalties, good_min, bad_min)
       VALUES ($1, $2, $3, $4, $5)
       ON DUPLICATE KEY UPDATE
         base_score = VALUES(base_score),
         penalties = VALUES(penalties),
         good_min = VALUES(good_min),
         bad_min = VALUES(bad_min),
         updated_at = NOW()`,
      [tenantId, next.baseScore, JSON.stringify(next.penalties), next.goodMin, next.badMin]
    );
    return this.getConfig(tenantId);
  }

  /** Score one driver from eco (+ optional alert) violations in a date window. */
  static scoreViolations(
    config: DriverPenaltyConfig,
    violationTypes: string[]
  ): { score: number; penaltyPoints: number; grade: DriverGrade; byType: Record<string, number> } {
    const byType: Record<string, number> = {};
    let penaltyPoints = 0;
    for (const raw of violationTypes) {
      const key = normalizeViolationKey(raw);
      const pts = Number(config.penalties[key] ?? config.penalties.eco_violation ?? 3) || 0;
      byType[key] = (byType[key] || 0) + 1;
      penaltyPoints += pts;
    }
    const score = Math.max(0, Math.round((config.baseScore - penaltyPoints) * 10) / 10);
    return {
      score,
      penaltyPoints: Math.round(penaltyPoints * 10) / 10,
      grade: gradeFromScore(score, config.goodMin, config.badMin),
      byType,
    };
  }

  static async linkEcoViolationsForDriver(
    tenantId: string,
    driver: { id: string; name: string; assigned_asset_id: string | null }
  ): Promise<number> {
    await this.ensureSchema();
    const { rowCount } = await query(
      `UPDATE eco_driving_violations
       SET driver_id = $3
       WHERE tenant_id = $1
         AND driver_id IS NULL
         AND (
           (driver_name IS NOT NULL AND LOWER(driver_name) = LOWER($2))
           OR ($4::text IS NOT NULL AND asset_id = $4)
         )`,
      [tenantId, driver.name, driver.id, driver.assigned_asset_id]
    ).catch(() => ({ rowCount: 0 }));
    return rowCount || 0;
  }

  /** Backfill driver_id on eco rows for every driver in the tenant. */
  static async linkEcoViolationsAllDrivers(tenantId: string): Promise<number> {
    await this.ensureSchema();
    const { rows } = await query<{ id: string; name: string; assigned_asset_id: string | null }>(
      `SELECT id, name, assigned_asset_id FROM drivers
       WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId],
    );
    let linked = 0;
    for (const d of rows) {
      linked += await this.linkEcoViolationsForDriver(tenantId, d);
    }
    return linked;
  }

  /** Recompute today's snapshot for one driver from eco + alert violations. */
  static async recomputeDriver(
    tenantId: string,
    driverId: string,
    days = 30
  ): Promise<{
    driverId: string;
    score: number;
    grade: DriverGrade;
    penaltyPoints: number;
    violationsCount: number;
    byType: Record<string, number>;
  }> {
    await this.ensureSchema();
    const config = await this.getConfig(tenantId);
    const { rows: driverRows } = await query<{
      id: string;
      name: string;
      assigned_asset_id: string | null;
    }>(
      `SELECT id, name, assigned_asset_id FROM drivers
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [tenantId, driverId]
    );
    const d = driverRows[0];
    if (!d) throw new Error('Driver not found');

    await this.linkEcoViolationsForDriver(tenantId, d);

    const since = new Date();
    since.setDate(since.getDate() - Math.max(1, days));
    const sinceIso = since.toISOString().slice(0, 19).replace('T', ' ');

    const { rows: ecos } = d.assigned_asset_id
      ? await query<{ violation_type: string }>(
          `SELECT violation_type FROM eco_driving_violations
           WHERE tenant_id = $1 AND occurred_at >= $2 AND asset_id = $3`,
          [tenantId, sinceIso, d.assigned_asset_id],
        )
      : { rows: [] as Array<{ violation_type: string }> };

    const { rows: alertRows } = d.assigned_asset_id
      ? await query<{ type: string }>(
          `SELECT type FROM alerts
           WHERE tenant_id = $1 AND occurred_at >= $2 AND asset_id = $3
             AND (
               type IN ('fatigue', 'camera', 'video', 'unauthorized', 'overspeed', 'speeding',
                 'harsh_braking', 'harsh_acceleration', 'harsh_cornering', 'speeding', 'idling', 'eco_violation')
               OR LOWER(COALESCE(type, '')) LIKE '%fatigue%'
               OR LOWER(COALESCE(type, '')) LIKE '%camera%'
               OR LOWER(COALESCE(type, '')) LIKE '%video%'
               OR LOWER(COALESCE(type, '')) LIKE '%unauth%'
               OR LOWER(COALESCE(type, '')) LIKE '%speed%'
               OR LOWER(COALESCE(type, '')) LIKE '%harsh%'
               OR LOWER(COALESCE(type, '')) LIKE '%brak%'
               OR LOWER(COALESCE(type, '')) LIKE '%accel%'
               OR video_url IS NOT NULL
             )
           LIMIT 500`,
          [tenantId, sinceIso, d.assigned_asset_id],
        ).catch(() => ({ rows: [] as Array<{ type: string }> }))
      : { rows: [] as Array<{ type: string }> };

    const types = [
      ...ecos.map((e) => e.violation_type),
      ...alertRows.map((a) => a.type || 'camera'),
    ];
    const scored = this.scoreViolations(config, types);

    const { rows: trips } = d.assigned_asset_id
      ? await query<{
          trips_count: number;
          total_distance: number;
        }>(
          `SELECT COUNT(*)::int AS trips_count, COALESCE(SUM(mileage), 0)::float AS total_distance
           FROM trip_summaries
           WHERE tenant_id = $1 AND departure_time >= $2 AND asset_id = $3`,
          [tenantId, sinceIso, d.assigned_asset_id],
        ).catch(() => ({ rows: [{ trips_count: 0, total_distance: 0 }] }))
      : { rows: [{ trips_count: 0, total_distance: 0 }] };

    const today = new Date().toISOString().slice(0, 10);
    await query(
      `INSERT INTO driver_performance_snapshots
         (tenant_id, driver_id, snapshot_date, safety_score, grade, penalty_points,
          fuel_efficiency, on_time_rate, violations_count, trips_count, total_distance)
       VALUES ($1, $2, $3, $4, $5, $6, 0, 0, $7, $8, $9)
       ON DUPLICATE KEY UPDATE
         safety_score = VALUES(safety_score),
         grade = VALUES(grade),
         penalty_points = VALUES(penalty_points),
         violations_count = VALUES(violations_count),
         trips_count = VALUES(trips_count),
         total_distance = VALUES(total_distance)`,
      [
        tenantId,
        d.id,
        today,
        scored.score,
        scored.grade,
        scored.penaltyPoints,
        types.length,
        trips[0]?.trips_count || 0,
        trips[0]?.total_distance || 0,
      ]
    );

    return {
      driverId: d.id,
      score: scored.score,
      grade: scored.grade,
      penaltyPoints: scored.penaltyPoints,
      violationsCount: types.length,
      byType: scored.byType,
    };
  }

  /** Recompute today's performance snapshots for all drivers in a tenant. */
  static async recomputeTenant(tenantId: string, days = 30): Promise<{ drivers: number }> {
    await this.ensureSchema();
    const { rows: drivers } = await query<{ id: string }>(
      `SELECT id FROM drivers WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId]
    );

    for (const d of drivers) {
      await this.recomputeDriver(tenantId, d.id, days);
    }

    return { drivers: drivers.length };
  }
}
