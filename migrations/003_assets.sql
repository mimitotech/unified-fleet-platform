-- 003: Assets and mappings
CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    registration_plate TEXT,
    vin TEXT,
    make TEXT,
    model TEXT,
    year INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assets_tenant ON assets(tenant_id);
CREATE INDEX idx_assets_plate ON assets(tenant_id, registration_plate) WHERE registration_plate IS NOT NULL;

CREATE TABLE asset_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    source_type source_type NOT NULL,
    external_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (asset_id, source_type),
    UNIQUE (source_type, external_id, asset_id)
);

CREATE INDEX idx_asset_mappings_asset ON asset_mappings(asset_id);
CREATE INDEX idx_asset_mappings_external ON asset_mappings(source_type, external_id);

CREATE TABLE asset_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    source_type source_type NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('moving', 'idle', 'stopped', 'offline')),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    speed DOUBLE PRECISION,
    fuel_level DOUBLE PRECISION,
    engine_on BOOLEAN,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (asset_id, source_type)
);

CREATE INDEX idx_asset_status_asset ON asset_status(asset_id);
