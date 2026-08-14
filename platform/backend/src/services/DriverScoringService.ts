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
      `ALTER TABLE eco_driving_violations ADD COLUMN driver_id CHAR(36) NULL`
    ).catch(() => undefined);
    await query(
      `ALTER TABLE driver_performance_snapshots ADD COLUMN grade VARCHAR(16) NULL`
    ).catch(() => undefined);
    await query(
      `ALTER TABLE driver_performance_snapshots ADD COLUMN penalty_points DECIMAL(18,4) NOT NULL DEFAULT 0`
    ).catch(() => undefined);
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

  /** Recompute today's performance snapshots for all drivers in a tenant. */
  static async recomputeTenant(tenantId: string, days = 30): Promise<{ drivers: number }> {
    await this.ensureSchema();
    const config = await this.getConfig(tenantId);
    const { rows: drivers } = await query<{
      id: string;
      name: string;
      assigned_asset_id: string | null;
    }>(
      `SELECT id, name, assigned_asset_id FROM drivers
       WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId]
    );

    const since = new Date();
    since.setDate(since.getDate() - Math.max(1, days));
    const sinceIso = since.toISOString().slice(0, 19).replace('T', ' ');

    for (const d of drivers) {
      const { rows: ecos } = await query<{ violation_type: string }>(
        `SELECT violation_type FROM eco_driving_violations
         WHERE tenant_id = $1 AND occurred_at >= $2
           AND (
             driver_id = $3
             OR (driver_name IS NOT NULL AND LOWER(driver_name) = LOWER($4))
             OR ($5::text IS NOT NULL AND asset_id = $5)
           )`,
        [tenantId, sinceIso, d.id, d.name, d.assigned_asset_id]
      );

      // Camera / fatigue / surveillance alerts scoped to this driver's assigned asset
      const { rows: alertRows } = d.assigned_asset_id
        ? await query<{ type: string }>(
            `SELECT type FROM alerts
             WHERE tenant_id = $1 AND occurred_at >= $2 AND asset_id = $3
               AND (
                 type IN ('fatigue', 'camera', 'video', 'unauthorized', 'overspeed', 'speeding')
                 OR LOWER(COALESCE(type, '')) LIKE '%fatigue%'
                 OR LOWER(COALESCE(type, '')) LIKE '%camera%'
                 OR LOWER(COALESCE(type, '')) LIKE '%video%'
                 OR LOWER(COALESCE(type, '')) LIKE '%unauth%'
                 OR video_url IS NOT NULL
               )
             LIMIT 500`,
            [tenantId, sinceIso, d.assigned_asset_id]
          ).catch(() => ({ rows: [] as Array<{ type: string }> }))
        : { rows: [] as Array<{ type: string }> };

      const types = [
        ...ecos.map((e) => e.violation_type),
        ...alertRows.map((a) => a.type || 'camera'),
      ];
      const scored = this.scoreViolations(config, types);

      const { rows: trips } = await query<{
        trips_count: number;
        total_distance: number;
      }>(
        `SELECT COUNT(*)::int AS trips_count, COALESCE(SUM(mileage), 0)::float AS total_distance
         FROM trip_summaries
         WHERE tenant_id = $1 AND departure_time >= $2
           AND (
             ($3::text IS NOT NULL AND asset_id = $3)
             OR LOWER(unit_name) LIKE CONCAT('%', LOWER($4), '%')
           )`,
        [tenantId, sinceIso, d.assigned_asset_id, d.name.split(/\s+/)[0] || d.name]
      ).catch(() => ({ rows: [{ trips_count: 0, total_distance: 0 }] }));

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
    }

    return { drivers: drivers.length };
  }
}
