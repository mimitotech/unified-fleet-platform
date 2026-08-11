-- =============================================================================
-- MAMS production hardening — run once in phpMyAdmin on u632889724_mams
-- Safe to re-run: ignore "Duplicate key name" / "Duplicate column" errors.
-- Prefer a low-traffic window.
-- =============================================================================

-- 1) Alerts: searchable external_id + uniqueness + hot filters
ALTER TABLE alerts
  MODIFY COLUMN external_id VARCHAR(191) NULL;

-- Keep oldest row when duplicates exist
DELETE a FROM alerts a
INNER JOIN alerts b
  ON a.tenant_id = b.tenant_id
 AND a.source_type = b.source_type
 AND a.external_id IS NOT NULL
 AND a.external_id = b.external_id
 AND a.id > b.id;

-- Unique + covering indexes (skip if already present)
ALTER TABLE alerts
  ADD UNIQUE KEY uq_alerts_tenant_source_external (tenant_id, source_type, external_id);

ALTER TABLE alerts
  ADD KEY idx_alerts_tenant_ack_time (tenant_id, acknowledged, occurred_at);

ALTER TABLE alerts
  ADD KEY idx_alerts_tenant_type_time (tenant_id, type, occurred_at);

-- 2) Workshop list / stats
ALTER TABLE vehicle_inspections
  ADD KEY idx_insp_tenant_deleted_date (tenant_id, deleted_at, inspection_date);

ALTER TABLE vehicle_inspections
  ADD KEY idx_insp_tenant_status_date (tenant_id, overall_status, inspection_date);

ALTER TABLE maintenance_logs
  ADD KEY idx_maint_tenant_deleted_start (tenant_id, deleted_at, start_date);

ALTER TABLE maintenance_logs
  ADD KEY idx_maint_tenant_status (tenant_id, status, deleted_at);

ALTER TABLE breakdown_reports
  ADD KEY idx_brk_tenant_deleted_time (tenant_id, deleted_at, breakdown_time);

ALTER TABLE breakdown_reports
  ADD KEY idx_brk_tenant_severity (tenant_id, severity, deleted_at);

-- 3) Fuel snapshots + activity feed
ALTER TABLE fuel_live_snapshots
  ADD KEY idx_fuel_live_recorded (recorded_at);

ALTER TABLE activity_feed
  ADD KEY idx_activity_tenant_created (tenant_id, created_at);
