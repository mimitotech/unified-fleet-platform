-- Workshop asset-category support (vehicles, generators, machinery)
-- Run on Hostinger MySQL if auto-migrate did not apply.

ALTER TABLE vehicle_inspections
  ADD COLUMN IF NOT EXISTS asset_category VARCHAR(32) NOT NULL DEFAULT 'vehicle',
  ADD COLUMN IF NOT EXISTS engine_hours DECIMAL(18,4) NULL,
  ADD COLUMN IF NOT EXISTS checklist_sections JSON NULL;

ALTER TABLE maintenance_logs
  ADD COLUMN IF NOT EXISTS asset_category VARCHAR(32) NOT NULL DEFAULT 'vehicle',
  ADD COLUMN IF NOT EXISTS engine_hours DECIMAL(18,4) NULL;

ALTER TABLE breakdown_reports
  ADD COLUMN IF NOT EXISTS asset_category VARCHAR(32) NOT NULL DEFAULT 'vehicle',
  ADD COLUMN IF NOT EXISTS failure_system VARCHAR(64) NULL;

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS asset_category VARCHAR(32) NULL;

CREATE TABLE IF NOT EXISTS workshop_checklist_templates (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NULL,
  asset_category VARCHAR(32) NOT NULL,
  name VARCHAR(191) NOT NULL,
  description TEXT NULL,
  sections JSON NOT NULL,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_wct_tenant_cat (tenant_id, asset_category),
  KEY idx_wct_category (asset_category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Note: MariaDB before 10.3.x may not support ADD COLUMN IF NOT EXISTS.
-- Prefer app startup ensureWorkshopSchema() which checks information_schema.
