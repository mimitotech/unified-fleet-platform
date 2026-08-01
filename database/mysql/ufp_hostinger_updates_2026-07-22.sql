-- =============================================================================
-- MAMS Hostinger MySQL updates — run in phpMyAdmin on database u454222977_mams
-- Date: 2026-07-22
-- Safe to re-run: if a column/index already exists, skip that statement (ignore
-- duplicate-column / duplicate-key errors) and continue with the rest.
-- The Node app also auto-adds these on startup, but running this once is safer.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Durable logos / favicons (survive Hostinger redeploys that wipe uploads/)
-- -----------------------------------------------------------------------------
ALTER TABLE tenant_files ADD COLUMN content LONGBLOB NULL;
ALTER TABLE tenant_files ADD COLUMN public_url VARCHAR(512) NULL;
CREATE INDEX idx_tenant_files_public_url ON tenant_files (public_url);

-- After this: re-upload each client logo/favicon once in Admin → Client → Branding
-- so bytes are stored in tenant_files.content.

-- -----------------------------------------------------------------------------
-- 2) Workshop rich fields (MAMSv2 checklists, parts, service intervals, costs)
-- -----------------------------------------------------------------------------
ALTER TABLE vehicle_inspections ADD COLUMN next_service_mileage DECIMAL(18,4) NULL;
ALTER TABLE vehicle_inspections ADD COLUMN truck_head_checklist JSON NULL;
ALTER TABLE vehicle_inspections ADD COLUMN trailer_checklist JSON NULL;

ALTER TABLE maintenance_logs ADD COLUMN parts_used JSON NULL;
ALTER TABLE maintenance_logs ADD COLUMN odometer_reading DECIMAL(18,4) NULL;
ALTER TABLE maintenance_logs ADD COLUMN next_service_km DECIMAL(18,4) NULL;
ALTER TABLE maintenance_logs ADD COLUMN next_service_hours DECIMAL(18,4) NULL;
ALTER TABLE maintenance_logs ADD COLUMN next_service_days INT NULL;

ALTER TABLE breakdown_reports ADD COLUMN towing_cost DECIMAL(18,4) NOT NULL DEFAULT 0;
ALTER TABLE breakdown_reports ADD COLUMN repair_cost DECIMAL(18,4) NOT NULL DEFAULT 0;
ALTER TABLE breakdown_reports ADD COLUMN trip_id VARCHAR(128) NULL;
ALTER TABLE breakdown_reports ADD COLUMN maintenance_log_id CHAR(36) NULL;

-- -----------------------------------------------------------------------------
-- 3) Optional cleanup — alerts older than 30 days (app also purges on sync)
-- -----------------------------------------------------------------------------
-- DELETE FROM alerts WHERE occurred_at < (NOW() - INTERVAL 30 DAY);

-- =============================================================================
-- No other schema changes required for this release:
-- - Dashboard chart prefs = browser localStorage (not DB)
-- - Client Admin = display label only (role key stays tenant_admin)
-- - Fuel %, geocode, report filenames = application logic only
-- =============================================================================
