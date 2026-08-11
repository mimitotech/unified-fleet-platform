/**
 * Apply production indexes / alert external_id shape on boot.
 * Idempotent: ignores duplicate-key / already-modified errors.
 */

import { query } from '../config/database.js';
import { logger } from '../config/logger.js';

async function trySql(label: string, sql: string, params: unknown[] = []): Promise<void> {
  try {
    await query(sql, params);
    logger.info(`[db-harden] ${label}`);
  } catch (err) {
    const msg = (err as Error).message || '';
    if (
      /duplicate key name|duplicate column|already exists|ER_DUP_KEYNAME|ER_DUP_FIELDNAME|Can't DROP/i.test(
        msg,
      )
    ) {
      logger.debug(`[db-harden] skip ${label}: ${msg.slice(0, 120)}`);
      return;
    }
    // Column already VARCHAR(191) etc.
    if (/identical|same|nothing to change/i.test(msg)) {
      logger.debug(`[db-harden] skip ${label}: already applied`);
      return;
    }
    logger.warn(`[db-harden] ${label} failed: ${msg.slice(0, 200)}`);
  }
}

export async function ensureProductionHardening(): Promise<void> {
  await trySql(
    'alerts.external_id VARCHAR(191)',
    `ALTER TABLE alerts MODIFY COLUMN external_id VARCHAR(191) NULL`,
  );

  // Dedup before unique (best-effort; ignore if none)
  await trySql(
    'alerts dedupe external_id',
    `DELETE a FROM alerts a
     INNER JOIN alerts b
       ON a.tenant_id = b.tenant_id
      AND a.source_type = b.source_type
      AND a.external_id IS NOT NULL
      AND a.external_id = b.external_id
      AND a.id > b.id`,
  );

  await trySql(
    'uq_alerts_tenant_source_external',
    `ALTER TABLE alerts ADD UNIQUE KEY uq_alerts_tenant_source_external (tenant_id, source_type, external_id)`,
  );
  await trySql(
    'idx_alerts_tenant_ack_time',
    `ALTER TABLE alerts ADD KEY idx_alerts_tenant_ack_time (tenant_id, acknowledged, occurred_at)`,
  );
  await trySql(
    'idx_alerts_tenant_type_time',
    `ALTER TABLE alerts ADD KEY idx_alerts_tenant_type_time (tenant_id, type, occurred_at)`,
  );

  await trySql(
    'idx_insp_tenant_deleted_date',
    `ALTER TABLE vehicle_inspections ADD KEY idx_insp_tenant_deleted_date (tenant_id, deleted_at, inspection_date)`,
  );
  await trySql(
    'idx_insp_tenant_status_date',
    `ALTER TABLE vehicle_inspections ADD KEY idx_insp_tenant_status_date (tenant_id, overall_status, inspection_date)`,
  );
  await trySql(
    'idx_maint_tenant_deleted_start',
    `ALTER TABLE maintenance_logs ADD KEY idx_maint_tenant_deleted_start (tenant_id, deleted_at, start_date)`,
  );
  await trySql(
    'idx_maint_tenant_status',
    `ALTER TABLE maintenance_logs ADD KEY idx_maint_tenant_status (tenant_id, status, deleted_at)`,
  );
  await trySql(
    'idx_brk_tenant_deleted_time',
    `ALTER TABLE breakdown_reports ADD KEY idx_brk_tenant_deleted_time (tenant_id, deleted_at, breakdown_time)`,
  );
  await trySql(
    'idx_brk_tenant_severity',
    `ALTER TABLE breakdown_reports ADD KEY idx_brk_tenant_severity (tenant_id, severity, deleted_at)`,
  );

  await trySql(
    'idx_fuel_live_recorded',
    `ALTER TABLE fuel_live_snapshots ADD KEY idx_fuel_live_recorded (recorded_at)`,
  );
  await trySql(
    'idx_activity_tenant_created',
    `ALTER TABLE activity_feed ADD KEY idx_activity_tenant_created (tenant_id, created_at)`,
  );
}
