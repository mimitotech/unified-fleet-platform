-- Unified Fleet Platform / MAMS — complete MySQL 8 / MariaDB schema
-- Import into an EXISTING empty database via phpMyAdmin (Import tab).
-- Do not run CREATE DATABASE here — use your Hostinger DB (e.g. u454222977_mams).

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- ---------------------------------------------------------------------------
-- Core
-- ---------------------------------------------------------------------------

CREATE TABLE tenants (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  name TEXT NOT NULL,
  slug VARCHAR(191) NOT NULL,
  primary_color VARCHAR(32) NOT NULL DEFAULT '#004225',
  secondary_color VARCHAR(32) DEFAULT '#0f172a',
  accent_color VARCHAR(32) DEFAULT '#3b82f6',
  logo_url TEXT NULL,
  favicon_url TEXT NULL,
  custom_css MEDIUMTEXT NULL,
  contact_email TEXT NULL,
  phone TEXT NULL,
  address TEXT NULL,
  country VARCHAR(128) NOT NULL DEFAULT '',
  timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  language VARCHAR(16) NOT NULL DEFAULT 'en',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  max_vehicles INT NOT NULL DEFAULT 1000,
  max_users INT NOT NULL DEFAULT 50,
  max_storage_gb DECIMAL(18,4) NOT NULL DEFAULT 100,
  assigned_manager_id CHAR(36) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_tenants_slug (slug),
  KEY idx_tenants_assigned_manager (assigned_manager_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NULL,
  email VARCHAR(191) NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role ENUM('super_admin','platform_admin','tenant_admin','manager','operator','viewer') NOT NULL DEFAULT 'viewer',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME(3) NULL,
  force_password_change TINYINT(1) NOT NULL DEFAULT 0,
  two_factor_enabled TINYINT(1) NOT NULL DEFAULT 0,
  terms_accepted_at DATETIME(3) NULL,
  wialon_user_id BIGINT NULL,
  wialon_login TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_tenant (tenant_id),
  KEY idx_users_tenant_wialon (tenant_id, wialon_user_id),
  CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE tenants
  ADD CONSTRAINT fk_tenants_manager FOREIGN KEY (assigned_manager_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE data_sources (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  source_type ENUM('wialon','loconav','tracksolid') NOT NULL,
  credentials_encrypted TEXT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  inherits_platform_credentials TINYINT(1) NOT NULL DEFAULT 0,
  sync_interval_minutes INT DEFAULT 5,
  last_error TEXT NULL,
  webhook_secret TEXT NULL,
  connection_verified_at DATETIME(3) NULL,
  preview_asset_count INT NULL,
  preview_sample JSON NULL,
  wialon_resource_id BIGINT NULL,
  wialon_operate_as BIGINT NULL,
  wialon_account_name TEXT NULL,
  wialon_session_meta JSON NULL,
  wialon_mother_account_id CHAR(36) NULL,
  last_sync_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_data_sources_tenant_type (tenant_id, source_type),
  KEY idx_data_sources_tenant (tenant_id),
  KEY idx_data_sources_wialon_resource (wialon_resource_id),
  CONSTRAINT fk_data_sources_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE assets (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  name TEXT NOT NULL,
  registration_plate VARCHAR(64) NULL,
  vin TEXT NULL,
  make TEXT NULL,
  model TEXT NULL,
  year INT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_assets_tenant (tenant_id),
  KEY idx_assets_plate (tenant_id, registration_plate),
  CONSTRAINT fk_assets_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE asset_mappings (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  asset_id CHAR(36) NOT NULL,
  source_type ENUM('wialon','loconav','tracksolid') NOT NULL,
  external_id VARCHAR(191) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_asset_mappings_asset_source (asset_id, source_type),
  KEY idx_asset_mappings_external (source_type, external_id),
  CONSTRAINT fk_asset_mappings_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE asset_status (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  asset_id CHAR(36) NOT NULL,
  source_type ENUM('wialon','loconav','tracksolid') NOT NULL,
  status VARCHAR(32) NOT NULL,
  latitude DOUBLE NULL,
  longitude DOUBLE NULL,
  speed DOUBLE NULL,
  fuel_level DOUBLE NULL,
  engine_on TINYINT(1) NULL,
  recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_asset_status_asset_source (asset_id, source_type),
  KEY idx_asset_status_asset (asset_id),
  CONSTRAINT fk_asset_status_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE alerts (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  asset_id CHAR(36) NULL,
  source_type ENUM('wialon','loconav','tracksolid') NOT NULL,
  external_id TEXT NULL,
  type VARCHAR(128) NOT NULL,
  severity VARCHAR(32) NOT NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  latitude DOUBLE NULL,
  longitude DOUBLE NULL,
  video_url TEXT NULL,
  acknowledged TINYINT(1) NOT NULL DEFAULT 0,
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_alerts_tenant_time (tenant_id, occurred_at),
  KEY idx_alerts_asset (asset_id),
  CONSTRAINT fk_alerts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_alerts_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE module_definitions (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `key` VARCHAR(64) NOT NULL,
  label TEXT NOT NULL,
  description TEXT NULL,
  icon VARCHAR(64) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  default_enabled TINYINT(1) NOT NULL DEFAULT 0,
  sources JSON NULL,
  UNIQUE KEY uq_module_definitions_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tenant_modules (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  module_key VARCHAR(64) NOT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_tenant_modules (tenant_id, module_key),
  CONSTRAINT fk_tenant_modules_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tenant_modules_key FOREIGN KEY (module_key) REFERENCES module_definitions(`key`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_modules (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  module_key VARCHAR(64) NOT NULL,
  is_enabled TINYINT(1) NOT NULL,
  UNIQUE KEY uq_user_modules (user_id, module_key),
  CONSTRAINT fk_user_modules_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_modules_key FOREIGN KEY (module_key) REFERENCES module_definitions(`key`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Domain
-- ---------------------------------------------------------------------------

CREATE TABLE drivers (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  name TEXT NOT NULL,
  license_number VARCHAR(128) NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'available',
  assigned_asset_id CHAR(36) NULL,
  photo_url TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY uq_drivers_license (tenant_id, license_number),
  KEY idx_drivers_tenant (tenant_id),
  CONSTRAINT fk_drivers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_drivers_asset FOREIGN KEY (assigned_asset_id) REFERENCES assets(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE fleet_routes (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  name TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'scheduled',
  asset_id CHAR(36) NULL,
  asset_name TEXT NULL,
  asset_plate TEXT NULL,
  driver_id CHAR(36) NULL,
  driver_name TEXT NULL,
  start_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  end_time DATETIME(3) NULL,
  actual_start_time DATETIME(3) NULL,
  distance DECIMAL(18,4) NOT NULL DEFAULT 0,
  waypoints JSON NOT NULL DEFAULT (JSON_ARRAY()),
  eta DATETIME(3) NULL,
  color VARCHAR(32) NOT NULL DEFAULT 'blue',
  estimated_duration INT NOT NULL DEFAULT 0,
  actual_duration INT NULL,
  fuel_usage DECIMAL(18,4) NULL,
  notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_fleet_routes_tenant (tenant_id),
  CONSTRAINT fk_fleet_routes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_fleet_routes_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL,
  CONSTRAINT fk_fleet_routes_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE trip_summaries (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  trip_id VARCHAR(128) NOT NULL,
  asset_id CHAR(36) NULL,
  unit_id VARCHAR(128) NOT NULL,
  unit_name TEXT NOT NULL,
  departure_time DATETIME(3) NOT NULL,
  departure_lat DECIMAL(18,8) NOT NULL DEFAULT 0,
  departure_lng DECIMAL(18,8) NOT NULL DEFAULT 0,
  departure_address TEXT NULL,
  arrival_time DATETIME(3) NOT NULL,
  arrival_lat DECIMAL(18,8) NOT NULL DEFAULT 0,
  arrival_lng DECIMAL(18,8) NOT NULL DEFAULT 0,
  arrival_address TEXT NULL,
  mileage DECIMAL(18,4) NOT NULL DEFAULT 0,
  duration INT NOT NULL DEFAULT 0,
  fuel_used DECIMAL(18,4) NOT NULL DEFAULT 0,
  avg_speed DECIMAL(18,4) NOT NULL DEFAULT 0,
  max_speed DECIMAL(18,4) NOT NULL DEFAULT 0,
  route_coordinates JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_trip_summaries (tenant_id, unit_id, departure_time),
  KEY idx_trip_summaries_tenant (tenant_id),
  CONSTRAINT fk_trip_summaries_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_trip_summaries_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE fuel_transactions (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  asset_id CHAR(36) NULL,
  unit_id VARCHAR(128) NOT NULL,
  unit_name TEXT NOT NULL,
  section VARCHAR(32) NOT NULL,
  tank VARCHAR(32) NOT NULL DEFAULT 'main',
  timestamp BIGINT NOT NULL,
  time_str TEXT NOT NULL,
  location TEXT NULL,
  latitude DECIMAL(18,8) NULL,
  longitude DECIMAL(18,8) NULL,
  initial_level DECIMAL(18,4) NOT NULL DEFAULT 0,
  final_level DECIMAL(18,4) NOT NULL DEFAULT 0,
  filled DECIMAL(18,4) NOT NULL DEFAULT 0,
  fuel_used DECIMAL(18,4) NOT NULL DEFAULT 0,
  mileage DECIMAL(18,4) NOT NULL DEFAULT 0,
  avg_consumption DECIMAL(18,4) NOT NULL DEFAULT 0,
  sensor TEXT NOT NULL DEFAULT '',
  duration TEXT NOT NULL DEFAULT '',
  duration_seconds BIGINT NOT NULL DEFAULT 0,
  sudden_fuel_drop DECIMAL(18,4) NOT NULL DEFAULT 0,
  event_count INT NOT NULL DEFAULT 0,
  asset_category VARCHAR(32) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_fuel_tx_tenant (tenant_id),
  KEY idx_fuel_tx_time (tenant_id, timestamp),
  KEY idx_fuel_tx_unit_time (tenant_id, unit_id, timestamp),
  KEY idx_fuel_tx_section_time (tenant_id, section, timestamp),
  KEY idx_fuel_tx_category_time (tenant_id, asset_category, timestamp),
  CONSTRAINT fk_fuel_tx_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_fuel_tx_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE eco_driving_violations (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  asset_id CHAR(36) NULL,
  unit_id VARCHAR(128) NOT NULL,
  unit_name TEXT NOT NULL,
  violation_type VARCHAR(128) NOT NULL,
  severity VARCHAR(32) NOT NULL DEFAULT 'medium',
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  latitude DECIMAL(18,8) NULL,
  longitude DECIMAL(18,8) NULL,
  value DECIMAL(18,4) NULL,
  threshold DECIMAL(18,4) NULL,
  driver_name TEXT NULL,
  external_id VARCHAR(191) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_eco_tenant (tenant_id),
  UNIQUE KEY uq_eco_tenant_external (tenant_id, external_id),
  CONSTRAINT fk_eco_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_eco_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE mechanics (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  specialization TEXT NULL,
  hourly_rate DECIMAL(18,4) NOT NULL DEFAULT 0,
  is_external TINYINT(1) NOT NULL DEFAULT 0,
  workshop_name TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_mechanics_tenant (tenant_id),
  CONSTRAINT fk_mechanics_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE vehicle_inspections (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  asset_id CHAR(36) NULL,
  vehicle_id VARCHAR(128) NOT NULL,
  vehicle_name TEXT NOT NULL,
  vehicle_plate TEXT NOT NULL,
  driver_id CHAR(36) NULL,
  driver_name TEXT NULL,
  inspection_type VARCHAR(32) NOT NULL,
  inspection_date DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  odometer_reading DECIMAL(18,4) NOT NULL DEFAULT 0,
  overall_status VARCHAR(32) NOT NULL DEFAULT 'pass',
  notes TEXT NULL,
  inspector_name TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_inspections_tenant (tenant_id),
  CONSTRAINT fk_inspections_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_inspections_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL,
  CONSTRAINT fk_inspections_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE breakdown_reports (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  asset_id CHAR(36) NULL,
  vehicle_id VARCHAR(128) NOT NULL,
  vehicle_name TEXT NOT NULL,
  vehicle_plate TEXT NOT NULL,
  driver_id CHAR(36) NULL,
  driver_name TEXT NULL,
  location JSON NOT NULL DEFAULT (JSON_OBJECT('lat', 0, 'lng', 0, 'address', '')),
  breakdown_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  resolution_time DATETIME(3) NULL,
  severity VARCHAR(32) NOT NULL DEFAULT 'minor',
  description TEXT NOT NULL,
  cause TEXT NULL,
  resolution TEXT NULL,
  downtime_hours DECIMAL(18,4) NOT NULL DEFAULT 0,
  total_cost DECIMAL(18,4) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_breakdowns_tenant (tenant_id),
  CONSTRAINT fk_breakdowns_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_breakdowns_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL,
  CONSTRAINT fk_breakdowns_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE maintenance_logs (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  asset_id CHAR(36) NULL,
  vehicle_id VARCHAR(128) NOT NULL,
  vehicle_name TEXT NOT NULL,
  vehicle_plate TEXT NOT NULL,
  driver_id CHAR(36) NULL,
  driver_name TEXT NULL,
  inspection_id CHAR(36) NULL,
  breakdown_id CHAR(36) NULL,
  maintenance_type VARCHAR(32) NOT NULL,
  priority VARCHAR(32) NOT NULL DEFAULT 'medium',
  description TEXT NOT NULL,
  mechanic_name TEXT NOT NULL,
  start_date DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  end_date DATETIME(3) NULL,
  labor_hours DECIMAL(18,4) NOT NULL DEFAULT 0,
  labor_cost DECIMAL(18,4) NOT NULL DEFAULT 0,
  parts_cost DECIMAL(18,4) NOT NULL DEFAULT 0,
  total_cost DECIMAL(18,4) NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_maint_tenant (tenant_id),
  CONSTRAINT fk_maint_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_maint_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL,
  CONSTRAINT fk_maint_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL,
  CONSTRAINT fk_maint_inspection FOREIGN KEY (inspection_id) REFERENCES vehicle_inspections(id) ON DELETE SET NULL,
  CONSTRAINT fk_maint_breakdown FOREIGN KEY (breakdown_id) REFERENCES breakdown_reports(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE geofences (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  name TEXT NOT NULL,
  type VARCHAR(32) NOT NULL,
  center JSON NULL,
  radius DECIMAL(18,4) NULL,
  points JSON NULL,
  color VARCHAR(32) NOT NULL DEFAULT '#3B82F6',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  KEY idx_geofences_tenant (tenant_id),
  CONSTRAINT fk_geofences_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE driver_performance_snapshots (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  driver_id CHAR(36) NOT NULL,
  snapshot_date DATE NOT NULL,
  safety_score DECIMAL(18,4) NOT NULL DEFAULT 0,
  fuel_efficiency DECIMAL(18,4) NOT NULL DEFAULT 0,
  on_time_rate DECIMAL(18,4) NOT NULL DEFAULT 0,
  violations_count INT NOT NULL DEFAULT 0,
  trips_count INT NOT NULL DEFAULT 0,
  total_distance DECIMAL(18,4) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_driver_perf (tenant_id, driver_id, snapshot_date),
  CONSTRAINT fk_driver_perf_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_driver_perf_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Platform / admin
-- ---------------------------------------------------------------------------

CREATE TABLE user_preferences (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  language VARCHAR(16) DEFAULT 'en',
  timezone VARCHAR(64) DEFAULT 'UTC',
  date_format VARCHAR(32) DEFAULT 'YYYY-MM-DD',
  time_format VARCHAR(16) DEFAULT '24h',
  unit_system VARCHAR(16) DEFAULT 'metric',
  email_notifications TINYINT(1) NOT NULL DEFAULT 1,
  in_app_notifications TINYINT(1) NOT NULL DEFAULT 1,
  sms_notifications TINYINT(1) NOT NULL DEFAULT 0,
  dashboard_layout JSON NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_user_prefs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE system_settings (
  `key` VARCHAR(64) NOT NULL PRIMARY KEY,
  value JSON NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_logs (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NULL,
  user_id CHAR(36) NULL,
  user_email TEXT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NULL,
  resource_id TEXT NULL,
  details JSON NULL,
  ip_address TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_audit_tenant (tenant_id, created_at),
  KEY idx_audit_created (created_at),
  CONSTRAINT fk_audit_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE activity_feed (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NULL,
  event_type VARCHAR(64) NOT NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  metadata JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_activity_created (created_at),
  CONSTRAINT fk_activity_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tenant_api_keys (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  name TEXT NOT NULL,
  key_prefix VARCHAR(64) NOT NULL,
  key_hash TEXT NOT NULL,
  permissions JSON NOT NULL DEFAULT (JSON_ARRAY('read')),
  expires_at DATETIME(3) NULL,
  last_used_at DATETIME(3) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_api_keys_tenant (tenant_id),
  CONSTRAINT fk_api_keys_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tenant_backups (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  backup_type VARCHAR(32) NOT NULL DEFAULT 'full',
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  size_bytes BIGINT DEFAULT 0,
  file_path TEXT NULL,
  error_message TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  completed_at DATETIME(3) NULL,
  KEY idx_backups_tenant (tenant_id, created_at),
  CONSTRAINT fk_backups_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tenant_backup_settings (
  tenant_id CHAR(36) NOT NULL PRIMARY KEY,
  auto_backup TINYINT(1) NOT NULL DEFAULT 1,
  frequency VARCHAR(32) NOT NULL DEFAULT 'daily',
  backup_time VARCHAR(16) NOT NULL DEFAULT '02:00',
  retention_days INT NOT NULL DEFAULT 30,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_backup_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE integration_sync_logs (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  source_type ENUM('wialon','loconav','tracksolid') NOT NULL,
  status VARCHAR(32) NOT NULL,
  message TEXT NULL,
  vehicles_synced INT DEFAULT 0,
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  completed_at DATETIME(3) NULL,
  KEY idx_sync_logs_tenant (tenant_id, started_at),
  CONSTRAINT fk_sync_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE marketplace_integrations (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  `key` VARCHAR(64) NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  category VARCHAR(64) NOT NULL DEFAULT 'telematics',
  is_enabled_globally TINYINT(1) NOT NULL DEFAULT 0,
  is_builtin TINYINT(1) NOT NULL DEFAULT 0,
  config_schema JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_marketplace_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE command_logs (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  asset_id CHAR(36) NULL,
  external_asset_id TEXT NULL,
  asset_name TEXT NULL,
  command TEXT NOT NULL,
  params JSON NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'sent',
  response JSON NULL,
  source_type ENUM('wialon','loconav','tracksolid') DEFAULT 'wialon',
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_command_logs_tenant (tenant_id, created_at),
  CONSTRAINT fk_command_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_command_logs_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL,
  CONSTRAINT fk_command_logs_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tenant_files (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  file_type VARCHAR(32) NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  size_bytes INT NOT NULL DEFAULT 0,
  content LONGBLOB NULL,
  public_url VARCHAR(512) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_tenant_files (tenant_id, file_type),
  KEY idx_tenant_files_public_url (public_url),
  CONSTRAINT fk_tenant_files_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE platform_integrations (
  source_type ENUM('wialon','loconav','tracksolid') NOT NULL PRIMARY KEY,
  credentials_encrypted TEXT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  connection_verified_at DATETIME(3) NULL,
  last_error TEXT NULL,
  session_meta JSON NOT NULL DEFAULT (JSON_OBJECT()),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE wialon_mother_accounts (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(255) NOT NULL,
  credentials_encrypted TEXT NOT NULL,
  base_url VARCHAR(512) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  connection_verified_at DATETIME(3) NULL,
  last_error TEXT NULL,
  session_meta JSON NOT NULL DEFAULT (JSON_OBJECT()),
  account_tier VARCHAR(32) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_wialon_mother_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE data_sources
  ADD CONSTRAINT fk_data_sources_mother FOREIGN KEY (wialon_mother_account_id) REFERENCES wialon_mother_accounts(id) ON DELETE SET NULL;

CREATE TABLE video_share_links (
  token VARCHAR(191) NOT NULL PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  clip_ref JSON NOT NULL,
  label TEXT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_video_share_tenant (tenant_id, created_at),
  KEY idx_video_share_expires (expires_at),
  CONSTRAINT fk_video_share_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_video_share_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tenant_fuel_module_configs (
  tenant_id CHAR(36) NOT NULL PRIMARY KEY,
  selected_reports JSON NOT NULL DEFAULT (JSON_ARRAY()),
  visible_columns JSON NOT NULL DEFAULT (JSON_ARRAY()),
  columns_by_category JSON NOT NULL DEFAULT (JSON_OBJECT()),
  fuel_price_per_liter DECIMAL(12,4) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_fuel_cfg_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE fuel_live_snapshots (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  unit_id VARCHAR(128) NOT NULL,
  unit_name TEXT NOT NULL,
  fuel_liters DECIMAL(18,4) NULL,
  fuel_percent DECIMAL(18,4) NULL,
  filled_liters DECIMAL(18,4) NULL,
  main_tank_liters DECIMAL(18,4) NULL,
  reserve_tank_liters DECIMAL(18,4) NULL,
  recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_fuel_live_unit_time (tenant_id, unit_id, recorded_at),
  KEY idx_fuel_live_time (tenant_id, recorded_at),
  CONSTRAINT fk_fuel_live_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE fuel_sync_cursor (
  tenant_id CHAR(36) NOT NULL,
  cursor_key VARCHAR(128) NOT NULL,
  last_synced_at DATETIME(3) NULL,
  last_success_at DATETIME(3) NULL,
  row_count INT NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  PRIMARY KEY (tenant_id, cursor_key),
  CONSTRAINT fk_fuel_cursor_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE fuel_station_uploads (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  file_name TEXT NOT NULL,
  period_from DATE NULL,
  period_to DATE NULL,
  row_count INT NOT NULL DEFAULT 0,
  imported_count INT NOT NULL DEFAULT 0,
  skipped_count INT NOT NULL DEFAULT 0,
  uploaded_by CHAR(36) NULL,
  notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_fuel_station_uploads (tenant_id, created_at),
  CONSTRAINT fk_fuel_station_uploads_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE fuel_station_fills (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  upload_id CHAR(36) NOT NULL,
  filled_at DATETIME(3) NOT NULL,
  registration TEXT NOT NULL,
  registration_key VARCHAR(128) NOT NULL DEFAULT '',
  unit_id VARCHAR(128) NULL,
  unit_name TEXT NULL,
  quantity DECIMAL(18,4) NOT NULL DEFAULT 0,
  product TEXT NOT NULL,
  unit_price DECIMAL(18,4) NULL,
  amount DECIMAL(18,4) NULL,
  card_number TEXT NULL,
  card_name TEXT NULL,
  receipt_number TEXT NULL,
  driver_code TEXT NULL,
  mileage DECIMAL(18,4) NULL,
  customer_name TEXT NULL,
  raw JSON NOT NULL DEFAULT (JSON_OBJECT()),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_fuel_fills_time (tenant_id, filled_at),
  KEY idx_fuel_fills_reg (tenant_id, registration_key, filled_at),
  KEY idx_fuel_fills_upload (upload_id),
  CONSTRAINT fk_fuel_fills_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_fuel_fills_upload FOREIGN KEY (upload_id) REFERENCES fuel_station_uploads(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Seeds (modules + marketplace + system settings) — no demo fleet data
-- ---------------------------------------------------------------------------

INSERT INTO module_definitions (`key`, label, description, icon, sort_order, default_enabled, sources) VALUES
  ('dashboard', 'Dashboard', 'Fleet operations overview', 'LayoutDashboard', 1, 1, JSON_ARRAY()),
  ('monitoring', 'Monitoring', 'Live map and fleet status', 'Map', 2, 1, JSON_ARRAY('wialon','tracksolid')),
  ('surveillance', 'Surveillance', 'Video feeds and playback', 'Video', 3, 1, JSON_ARRAY('wialon','tracksolid')),
  ('drivers', 'Drivers', 'Driver management', 'Users', 4, 1, JSON_ARRAY()),
  ('routes', 'Routes', 'Route planning and tracking', 'Route', 5, 1, JSON_ARRAY('wialon')),
  ('fuel', 'Fuel', 'Fuel management', 'Fuel', 6, 1, JSON_ARRAY('wialon')),
  ('emissions', 'Emissions', 'CO2 tracking', 'Leaf', 7, 1, JSON_ARRAY('wialon')),
  ('workshop', 'Workshop', 'Maintenance and inspections', 'Wrench', 8, 1, JSON_ARRAY()),
  ('alerts', 'Alerts', 'Unified alert inbox', 'Bell', 10, 1, JSON_ARRAY()),
  ('trailers', 'Trailers', 'Trailer tracking', 'Truck', 11, 0, JSON_ARRAY('wialon','tracksolid')),
  ('sensors', 'Sensors', 'Sensor dashboards', 'Gauge', 12, 0, JSON_ARRAY('wialon')),
  ('geofencing', 'Geofencing', 'Geofence management', 'MapPin', 13, 0, JSON_ARRAY('wialon')),
  ('commands', 'Commands', 'Remote commands', 'Terminal', 14, 0, JSON_ARRAY('wialon','tracksolid'))
ON DUPLICATE KEY UPDATE label = VALUES(label);

INSERT INTO system_settings (`key`, value) VALUES
  ('general', JSON_OBJECT('platformName','MAMS','defaultLanguage','en','defaultTimezone','Africa/Kampala')),
  ('email', JSON_OBJECT('smtpHost','','smtpPort',587,'fromEmail','noreply@mams.frontstardigital.com','fromName','MAMS')),
  ('webhooks', JSON_OBJECT('globalSecret','','events', JSON_ARRAY('alerts','status'))),
  ('backup', JSON_OBJECT('autoBackup',true,'frequency','daily','backupTime','02:00','retentionDays',30)),
  ('security', JSON_OBJECT('minPasswordLength',8,'requireSpecialChar',true,'sessionTimeoutMinutes',30,'twoFactorPolicy','optional'))
ON DUPLICATE KEY UPDATE value = VALUES(value);

INSERT INTO marketplace_integrations (`key`, name, description, category, is_enabled_globally, is_builtin) VALUES
  ('wialon', 'Wialon', 'GPS tracking, fuel, trips, commands', 'telematics', 1, 1),
  ('loconav', 'LocoNav', 'Video surveillance and camera alerts', 'video', 1, 1),
  ('tracksolid', 'TrackSolid Pro', 'GPS + video fleet tracking', 'telematics', 1, 1),
  ('ram', 'RAM Fleet', 'Fleet management integration', 'telematics', 0, 0),
  ('twilio', 'Twilio SMS', 'SMS notifications', 'communications', 0, 0),
  ('maintenance_pro', 'Maintenance Pro', 'Workshop management', 'maintenance', 0, 0)
ON DUPLICATE KEY UPDATE name = VALUES(name);

SET FOREIGN_KEY_CHECKS = 1;
