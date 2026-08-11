-- =============================================================================
-- MAMS — upgrade AFTER importing u454222977_mams2.sql
-- Target DB: u632889724_mams (or whichever Hostinger DB you imported into)
--
-- SAFE FOR EXISTING DATA:
--   - No DROP TABLE / TRUNCATE / DROP DATABASE
--   - Only ADD missing columns/indexes, dedupe alerts before unique key,
--     upsert system checklist templates, refresh empty SMTP defaults
--
-- HOW TO USE (phpMyAdmin):
--   1) Select database u632889724_mams
--   2) Import your dump u454222977_mams2.sql (Import tab)
--      - Do NOT create a second database from the dump name
--      - If import fails on database name, edit the dump header only:
--          replace u454222977_mams2 → u632889724_mams
--   3) Open SQL tab and run THIS entire file
--   4) Redeploy Node from current master + hostinger.env
--
-- Safe to re-run. Duplicate indexes/columns are skipped via information_schema.
-- =============================================================================

SET NAMES utf8mb4;
SET @OLD_FOREIGN_KEY_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- Helpers (session-scoped procedures)
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS ufp_add_column_if_missing;
DROP PROCEDURE IF EXISTS ufp_add_index_if_missing;
DROP PROCEDURE IF EXISTS ufp_modify_column_if_needed;

DELIMITER $$

CREATE PROCEDURE ufp_add_column_if_missing(
  IN p_table VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_ddl TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND COLUMN_NAME = p_column
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN ', p_ddl);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

CREATE PROCEDURE ufp_add_index_if_missing(
  IN p_table VARCHAR(64),
  IN p_index VARCHAR(64),
  IN p_ddl TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND INDEX_NAME = p_index
    LIMIT 1
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD ', p_ddl);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

DELIMITER ;

-- ---------------------------------------------------------------------------
-- 1) Alerts: external_id shape + unique key (only real gap vs your dump)
-- ---------------------------------------------------------------------------
-- Dump already has VARCHAR(191) and ack/type indexes; unique key is missing.
ALTER TABLE alerts
  MODIFY COLUMN external_id VARCHAR(191) NULL;

-- Keep oldest row when duplicates exist (required before unique index).
-- Prefer the batched DELETE below in phpMyAdmin if this times out (#1205).
-- Stop the Node app first so alert sync is not locking rows.
SET innodb_lock_wait_timeout = 120;

DELETE FROM alerts
WHERE id IN (
  SELECT id FROM (
    SELECT a.id
    FROM alerts a
    INNER JOIN (
      SELECT tenant_id, source_type, external_id, MIN(id) AS keep_id
      FROM alerts
      WHERE external_id IS NOT NULL
      GROUP BY tenant_id, source_type, external_id
      HAVING COUNT(*) > 1
    ) d
      ON a.tenant_id = d.tenant_id
     AND a.source_type = d.source_type
     AND a.external_id = d.external_id
     AND a.id <> d.keep_id
    LIMIT 2000
  ) doomed
);

-- Re-run the DELETE above until it says 0 rows affected, then:
CALL ufp_add_index_if_missing(
  'alerts',
  'uq_alerts_tenant_source_external',
  'UNIQUE KEY `uq_alerts_tenant_source_external` (`tenant_id`, `source_type`, `external_id`)'
);

CALL ufp_add_index_if_missing(
  'alerts',
  'idx_alerts_tenant_ack_time',
  'KEY `idx_alerts_tenant_ack_time` (`tenant_id`, `acknowledged`, `occurred_at`)'
);

CALL ufp_add_index_if_missing(
  'alerts',
  'idx_alerts_tenant_type_time',
  'KEY `idx_alerts_tenant_type_time` (`tenant_id`, `type`, `occurred_at`)'
);

-- ---------------------------------------------------------------------------
-- 2) Hot-path indexes (already present on your dump — no-ops if so)
-- ---------------------------------------------------------------------------
CALL ufp_add_index_if_missing(
  'vehicle_inspections',
  'idx_insp_tenant_deleted_date',
  'KEY `idx_insp_tenant_deleted_date` (`tenant_id`, `deleted_at`, `inspection_date`)'
);
CALL ufp_add_index_if_missing(
  'vehicle_inspections',
  'idx_insp_tenant_status_date',
  'KEY `idx_insp_tenant_status_date` (`tenant_id`, `overall_status`, `inspection_date`)'
);
CALL ufp_add_index_if_missing(
  'maintenance_logs',
  'idx_maint_tenant_deleted_start',
  'KEY `idx_maint_tenant_deleted_start` (`tenant_id`, `deleted_at`, `start_date`)'
);
CALL ufp_add_index_if_missing(
  'maintenance_logs',
  'idx_maint_tenant_status',
  'KEY `idx_maint_tenant_status` (`tenant_id`, `status`, `deleted_at`)'
);
CALL ufp_add_index_if_missing(
  'breakdown_reports',
  'idx_brk_tenant_deleted_time',
  'KEY `idx_brk_tenant_deleted_time` (`tenant_id`, `deleted_at`, `breakdown_time`)'
);
CALL ufp_add_index_if_missing(
  'breakdown_reports',
  'idx_brk_tenant_severity',
  'KEY `idx_brk_tenant_severity` (`tenant_id`, `severity`, `deleted_at`)'
);
CALL ufp_add_index_if_missing(
  'fuel_live_snapshots',
  'idx_fuel_live_recorded',
  'KEY `idx_fuel_live_recorded` (`recorded_at`)'
);
CALL ufp_add_index_if_missing(
  'activity_feed',
  'idx_activity_tenant_created',
  'KEY `idx_activity_tenant_created` (`tenant_id`, `created_at`)'
);

-- ---------------------------------------------------------------------------
-- 3) Workshop rich columns (already in dump — added only if missing)
-- ---------------------------------------------------------------------------
CALL ufp_add_column_if_missing('vehicle_inspections', 'next_service_mileage',
  '`next_service_mileage` DECIMAL(18,4) NULL');
CALL ufp_add_column_if_missing('vehicle_inspections', 'truck_head_checklist',
  '`truck_head_checklist` JSON NULL');
CALL ufp_add_column_if_missing('vehicle_inspections', 'trailer_checklist',
  '`trailer_checklist` JSON NULL');
CALL ufp_add_column_if_missing('vehicle_inspections', 'asset_category',
  "`asset_category` VARCHAR(32) NOT NULL DEFAULT 'vehicle'");
CALL ufp_add_column_if_missing('vehicle_inspections', 'engine_hours',
  '`engine_hours` DECIMAL(18,4) NULL');
CALL ufp_add_column_if_missing('vehicle_inspections', 'checklist_sections',
  '`checklist_sections` JSON NULL');
CALL ufp_add_column_if_missing('vehicle_inspections', 'inspector_date',
  '`inspector_date` DATE NULL');
CALL ufp_add_column_if_missing('vehicle_inspections', 'inspector_signature',
  '`inspector_signature` TEXT NULL');

CALL ufp_add_column_if_missing('maintenance_logs', 'parts_used',
  '`parts_used` JSON NULL');
CALL ufp_add_column_if_missing('maintenance_logs', 'odometer_reading',
  '`odometer_reading` DECIMAL(18,4) NULL');
CALL ufp_add_column_if_missing('maintenance_logs', 'next_service_km',
  '`next_service_km` DECIMAL(18,4) NULL');
CALL ufp_add_column_if_missing('maintenance_logs', 'next_service_hours',
  '`next_service_hours` DECIMAL(18,4) NULL');
CALL ufp_add_column_if_missing('maintenance_logs', 'next_service_days',
  '`next_service_days` INT NULL');
CALL ufp_add_column_if_missing('maintenance_logs', 'asset_category',
  "`asset_category` VARCHAR(32) NOT NULL DEFAULT 'vehicle'");
CALL ufp_add_column_if_missing('maintenance_logs', 'engine_hours',
  '`engine_hours` DECIMAL(18,4) NULL');
CALL ufp_add_column_if_missing('maintenance_logs', 'checklist_sections',
  '`checklist_sections` JSON NULL');
CALL ufp_add_column_if_missing('maintenance_logs', 'mechanic_date',
  '`mechanic_date` DATE NULL');
CALL ufp_add_column_if_missing('maintenance_logs', 'mechanic_signature',
  '`mechanic_signature` TEXT NULL');

CALL ufp_add_column_if_missing('breakdown_reports', 'towing_cost',
  '`towing_cost` DECIMAL(18,4) NOT NULL DEFAULT 0');
CALL ufp_add_column_if_missing('breakdown_reports', 'repair_cost',
  '`repair_cost` DECIMAL(18,4) NOT NULL DEFAULT 0');
CALL ufp_add_column_if_missing('breakdown_reports', 'trip_id',
  '`trip_id` VARCHAR(128) NULL');
CALL ufp_add_column_if_missing('breakdown_reports', 'maintenance_log_id',
  '`maintenance_log_id` CHAR(36) NULL');
CALL ufp_add_column_if_missing('breakdown_reports', 'asset_category',
  "`asset_category` VARCHAR(32) NOT NULL DEFAULT 'vehicle'");
CALL ufp_add_column_if_missing('breakdown_reports', 'failure_system',
  '`failure_system` VARCHAR(64) NULL');
CALL ufp_add_column_if_missing('breakdown_reports', 'reported_by',
  '`reported_by` TEXT NULL');
CALL ufp_add_column_if_missing('breakdown_reports', 'reported_date',
  '`reported_date` DATE NULL');
CALL ufp_add_column_if_missing('breakdown_reports', 'reported_signature',
  '`reported_signature` TEXT NULL');

CALL ufp_add_column_if_missing('assets', 'asset_category',
  '`asset_category` VARCHAR(32) NULL');

CALL ufp_add_column_if_missing('users', 'allowed_alert_types',
  '`allowed_alert_types` JSON NULL');

CALL ufp_add_column_if_missing('tenant_files', 'content',
  '`content` LONGBLOB NULL');
CALL ufp_add_column_if_missing('tenant_files', 'public_url',
  '`public_url` VARCHAR(512) NULL');

CALL ufp_add_column_if_missing('data_sources', 'wialon_operate_as',
  '`wialon_operate_as` BIGINT NULL');
CALL ufp_add_column_if_missing('data_sources', 'wialon_mother_account_id',
  '`wialon_mother_account_id` CHAR(36) NULL');

-- ---------------------------------------------------------------------------
-- 4) Checklist templates table + purpose column + system seeds
--     (your dump already has daily vs monthly generator split)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workshop_checklist_templates (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NULL,
  asset_category VARCHAR(32) NOT NULL,
  purpose VARCHAR(32) NOT NULL DEFAULT 'inspection',
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

CALL ufp_add_column_if_missing('workshop_checklist_templates', 'purpose',
  "`purpose` VARCHAR(32) NOT NULL DEFAULT 'inspection'");

-- Ensure generator inspection is daily-only (do not overwrite tenant-owned rows)
UPDATE workshop_checklist_templates
SET name = 'Generator daily inspection',
    description = 'Daily generator inspection checklist',
    purpose = 'inspection',
    is_system = 1,
    is_active = 1,
    updated_at = CURRENT_TIMESTAMP(3)
WHERE id = 'a1000001-0000-4000-8000-000000000002'
  AND tenant_id IS NULL;

-- Ensure monthly PM exists under Maintenance purpose
INSERT INTO workshop_checklist_templates
  (id, tenant_id, asset_category, purpose, name, description, sections, is_system, is_active)
SELECT
  'a1000001-0000-4000-8000-000000000004',
  NULL,
  'generator',
  'maintenance',
  'Generator monthly preventive maintenance',
  'Monthly preventive maintenance checklist for generators',
  '[{"id":"monthly-pm","title":"Monthly preventive maintenance","items":[{"name":"Check generator control panel for alarms and fault indications","category":"monthly"},{"name":"Test automatic start and stop (AMF) operation","category":"monthly"},{"name":"Check engine oil level and condition","category":"monthly"},{"name":"Check coolant level and condition","category":"monthly"},{"name":"Inspect radiator and cooling fan","category":"monthly"},{"name":"Inspect fuel tank condition","category":"monthly"},{"name":"Inspect fuel lines, hoses, and fittings for leaks","category":"monthly"},{"name":"Record fuel level","category":"monthly"},{"name":"Check battery voltage and condition","category":"monthly"},{"name":"Clean battery terminals and apply protection if required","category":"monthly"},{"name":"Verify battery charger operation","category":"monthly"},{"name":"Inspect alternator condition","category":"monthly"},{"name":"Inspect electrical terminal connections and tighten if necessary","category":"monthly"},{"name":"Inspect engine belts for wear and correct tension","category":"monthly"},{"name":"Inspect coolant hoses and clamps for damage or leaks","category":"monthly"},{"name":"Inspect the exhaust system for leaks or damage","category":"monthly"},{"name":"Check engine mountings and supports","category":"monthly"},{"name":"Tighten loose bolts, nuts, and fasteners where necessary","category":"monthly"},{"name":"Verify instrument panel/dashboard indicators are functioning correctly","category":"monthly"},{"name":"Record generator running hours","category":"monthly"},{"name":"Check for abnormal noise or excessive vibration during operation","category":"monthly"},{"name":"Clean the generator exterior and surrounding area","category":"monthly"},{"name":"Remove any oil, fuel, or coolant spills","category":"monthly"},{"name":"Inspect and secure fuel tank covers / reservoirs","category":"monthly"},{"name":"Ensure all generator access doors are locked after inspection","category":"monthly"}]}]',
  1,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM workshop_checklist_templates
  WHERE id = 'a1000001-0000-4000-8000-000000000004'
);

UPDATE workshop_checklist_templates
SET purpose = 'maintenance',
    name = 'Generator monthly preventive maintenance',
    description = 'Monthly preventive maintenance checklist for generators',
    is_system = 1,
    is_active = 1,
    updated_at = CURRENT_TIMESTAMP(3)
WHERE id = 'a1000001-0000-4000-8000-000000000004'
  AND tenant_id IS NULL;

-- ---------------------------------------------------------------------------
-- 5) Platform branding / SMTP defaults (only when still empty or old Frontstar)
--     Does NOT wipe credentials you already set in Hostinger UI / app.
-- ---------------------------------------------------------------------------
UPDATE system_settings
SET value = JSON_SET(
      COALESCE(value, JSON_OBJECT()),
      '$.fromEmail', 'mams@mimitotracking.com',
      '$.fromName', 'MAMS',
      '$.smtpHost', 'smtp.hostinger.com',
      '$.smtpPort', 465,
      '$.smtpSecure', true,
      '$.smtpUser', 'mams@mimitotracking.com'
    ),
    updated_at = CURRENT_TIMESTAMP(3)
WHERE `key` = 'email'
  AND (
    JSON_UNQUOTE(JSON_EXTRACT(value, '$.smtpHost')) IN ('', 'null')
    OR JSON_UNQUOTE(JSON_EXTRACT(value, '$.smtpHost')) IS NULL
    OR JSON_UNQUOTE(JSON_EXTRACT(value, '$.fromEmail')) LIKE '%frontstardigital%'
  );

UPDATE system_settings
SET value = JSON_SET(
      COALESCE(value, JSON_OBJECT()),
      '$.platformName', 'MAMS',
      '$.defaultTimezone', 'Africa/Kampala'
    ),
    updated_at = CURRENT_TIMESTAMP(3)
WHERE `key` = 'general'
  AND (
    JSON_UNQUOTE(JSON_EXTRACT(value, '$.platformName')) IS NULL
    OR JSON_UNQUOTE(JSON_EXTRACT(value, '$.platformName')) = ''
  );

-- ---------------------------------------------------------------------------
-- 6) Cleanup helpers
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS ufp_add_column_if_missing;
DROP PROCEDURE IF EXISTS ufp_add_index_if_missing;

SET FOREIGN_KEY_CHECKS = @OLD_FOREIGN_KEY_CHECKS;

-- Done. Verify:
--   SHOW INDEX FROM alerts WHERE Key_name = 'uq_alerts_tenant_source_external';
--   SELECT id, asset_category, purpose, name FROM workshop_checklist_templates WHERE tenant_id IS NULL;
