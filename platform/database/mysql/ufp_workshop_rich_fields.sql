-- MySQL / Hostinger — enrich workshop tables for MAMSv2-style checklists & parts.
-- Safe to run once; ignore duplicate-column errors if re-run.
-- App also auto-adds these columns on startup via WorkshopSchema.ensure().

ALTER TABLE vehicle_inspections
  ADD COLUMN next_service_mileage DECIMAL(18,4) NULL,
  ADD COLUMN truck_head_checklist JSON NULL,
  ADD COLUMN trailer_checklist JSON NULL;

ALTER TABLE maintenance_logs
  ADD COLUMN parts_used JSON NULL,
  ADD COLUMN odometer_reading DECIMAL(18,4) NULL,
  ADD COLUMN next_service_km DECIMAL(18,4) NULL,
  ADD COLUMN next_service_hours DECIMAL(18,4) NULL,
  ADD COLUMN next_service_days INT NULL;

ALTER TABLE breakdown_reports
  ADD COLUMN towing_cost DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN repair_cost DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN trip_id VARCHAR(128) NULL,
  ADD COLUMN maintenance_log_id CHAR(36) NULL;
