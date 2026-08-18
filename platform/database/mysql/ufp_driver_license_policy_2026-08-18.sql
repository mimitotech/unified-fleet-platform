-- =============================================================================
-- MAMS Driver License Policy Defaults (SAFE / RE-RUNNABLE)
-- Date: 2026-08-18
--
-- Purpose:
--   1) Seed driver license policy settings used by compliance sync
--   2) Keep existing user-defined values untouched on re-run
--
-- Safety:
--   - No destructive statements
--   - Re-runnable
-- =============================================================================

SET @db := DATABASE();

SET @has_system_settings := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = @db
    AND table_name = 'system_settings'
);

SET @sql := IF(
  @has_system_settings > 0,
  "INSERT INTO system_settings (`key`, value, updated_at)
   VALUES (
     'driver_license_policy',
     JSON_OBJECT('alertDays', JSON_ARRAY(30,14,7), 'expiredAction', 'warn'),
     NOW()
   )
   ON DUPLICATE KEY UPDATE value = value, updated_at = updated_at",
  "SELECT 1"
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
