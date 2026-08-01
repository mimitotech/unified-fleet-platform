-- Petrol-station fill sheets for FLS vs station variance.

CREATE TABLE IF NOT EXISTS fuel_station_uploads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    period_from DATE,
    period_to DATE,
    row_count INT NOT NULL DEFAULT 0,
    imported_count INT NOT NULL DEFAULT 0,
    skipped_count INT NOT NULL DEFAULT 0,
    uploaded_by UUID,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fuel_station_uploads_tenant_time
  ON fuel_station_uploads(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS fuel_station_fills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    upload_id UUID NOT NULL REFERENCES fuel_station_uploads(id) ON DELETE CASCADE,
    filled_at TIMESTAMPTZ NOT NULL,
    registration TEXT NOT NULL DEFAULT '',
    registration_key TEXT NOT NULL DEFAULT '',
    unit_id TEXT,
    unit_name TEXT,
    quantity NUMERIC NOT NULL DEFAULT 0,
    product TEXT NOT NULL DEFAULT '',
    unit_price NUMERIC,
    amount NUMERIC,
    card_number TEXT,
    card_name TEXT,
    receipt_number TEXT,
    driver_code TEXT,
    mileage NUMERIC,
    customer_name TEXT,
    raw JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fuel_station_fills_tenant_time
  ON fuel_station_fills(tenant_id, filled_at DESC);

CREATE INDEX IF NOT EXISTS idx_fuel_station_fills_tenant_reg
  ON fuel_station_fills(tenant_id, registration_key, filled_at DESC);

CREATE INDEX IF NOT EXISTS idx_fuel_station_fills_upload
  ON fuel_station_fills(upload_id);
