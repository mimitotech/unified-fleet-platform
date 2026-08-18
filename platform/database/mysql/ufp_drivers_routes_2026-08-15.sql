-- Drivers / Routes scale-up (MySQL). Safe to re-run via ensureProductionHardening.

-- Fuel card on driver roster
ALTER TABLE drivers
  ADD COLUMN fuel_card_number VARCHAR(64) NULL AFTER email;

ALTER TABLE drivers
  ADD COLUMN hire_date DATE NULL AFTER fuel_card_number;

ALTER TABLE drivers
  ADD COLUMN permit_class VARCHAR(32) NULL AFTER license_number;

ALTER TABLE drivers
  ADD COLUMN license_expiry_date DATE NULL AFTER permit_class;

-- Configurable penalty weights + Good / Bad / Ugly thresholds (per tenant)
CREATE TABLE IF NOT EXISTS tenant_driver_penalty_configs (
  tenant_id CHAR(36) NOT NULL PRIMARY KEY,
  base_score DECIMAL(18,4) NOT NULL DEFAULT 100,
  -- points deducted per violation type
  penalties JSON NOT NULL,
  -- good_min / bad_min: score >= good_min => Good; >= bad_min => Bad; else Ugly
  good_min DECIMAL(18,4) NOT NULL DEFAULT 80,
  bad_min DECIMAL(18,4) NOT NULL DEFAULT 55,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_driver_penalty_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Link eco violations to a driver when known
ALTER TABLE eco_driving_violations
  ADD COLUMN driver_id CHAR(36) NULL AFTER driver_name;

ALTER TABLE eco_driving_violations
  ADD KEY idx_eco_driver (tenant_id, driver_id);

-- Snapshot grade column for Good/Bad/Ugly
ALTER TABLE driver_performance_snapshots
  ADD COLUMN grade VARCHAR(16) NULL AFTER safety_score;

ALTER TABLE driver_performance_snapshots
  ADD COLUMN penalty_points DECIMAL(18,4) NOT NULL DEFAULT 0 AFTER grade;
