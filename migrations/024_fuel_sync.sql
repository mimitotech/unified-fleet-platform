-- Fuel report persistence: extra columns for accurate KPIs + background sync tracking.

ALTER TABLE fuel_transactions
  ADD COLUMN IF NOT EXISTS sensor TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS duration TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS duration_seconds BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sudden_fuel_drop NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS event_count INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_fuel_transactions_tenant_unit_time
  ON fuel_transactions(tenant_id, unit_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_fuel_transactions_tenant_section_time
  ON fuel_transactions(tenant_id, section, timestamp DESC);

-- Live fuel sensor snapshots (historical tank levels; UI still reads live from Wialon).
CREATE TABLE IF NOT EXISTS fuel_live_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    unit_id TEXT NOT NULL,
    unit_name TEXT NOT NULL,
    fuel_liters NUMERIC,
    fuel_percent NUMERIC,
    filled_liters NUMERIC,
    main_tank_liters NUMERIC,
    reserve_tank_liters NUMERIC,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fuel_live_snapshots_tenant_unit_time
  ON fuel_live_snapshots(tenant_id, unit_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_fuel_live_snapshots_tenant_time
  ON fuel_live_snapshots(tenant_id, recorded_at DESC);

-- Per-tenant sync cursor (background Wialon → Postgres).
CREATE TABLE IF NOT EXISTS fuel_sync_cursor (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    cursor_key TEXT NOT NULL,
    last_synced_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    row_count INT NOT NULL DEFAULT 0,
    last_error TEXT,
    PRIMARY KEY (tenant_id, cursor_key)
);
