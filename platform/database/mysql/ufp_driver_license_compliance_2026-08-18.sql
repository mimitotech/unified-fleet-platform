-- =============================================================================
-- MAMS Driver License Compliance Upgrade (SAFE / RE-RUNNABLE)
-- Date: 2026-08-18
--
-- Purpose:
--   1) Add permit class + license expiry on drivers
--   2) Add supporting index for expiry scans
--
-- Safety:
--   - No DROP TABLE / DROP COLUMN / destructive operations
--   - Uses information_schema checks before ALTER
--   - Safe to import multiple times
-- =============================================================================

SET @db := DATABASE();

-- drivers.permit_class
SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = @db
        AND table_name = 'drivers'
        AND column_name = 'permit_class'
    ),
    'SELECT 1',
    'ALTER TABLE drivers ADD COLUMN permit_class VARCHAR(32) NULL AFTER license_number'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- drivers.license_expiry_date
SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = @db
        AND table_name = 'drivers'
        AND column_name = 'license_expiry_date'
    ),
    'SELECT 1',
    'ALTER TABLE drivers ADD COLUMN license_expiry_date DATE NULL AFTER permit_class'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Supporting index for compliance scans:
-- WHERE tenant_id = ? AND license_expiry_date IS NOT NULL ...
SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = @db
        AND table_name = 'drivers'
        AND index_name = 'idx_drivers_tenant_license_expiry'
    ),
    'SELECT 1',
    'ALTER TABLE drivers ADD KEY idx_drivers_tenant_license_expiry (tenant_id, license_expiry_date)'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Optional data hygiene (no-op for valid rows):
-- normalize impossible zero-date placeholders to NULL.
UPDATE drivers
SET license_expiry_date = NULL
WHERE license_expiry_date IN ('0000-00-00');

