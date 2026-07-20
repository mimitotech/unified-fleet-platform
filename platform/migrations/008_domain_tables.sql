-- 008: App-owned domain tables (tenant-scoped)

-- Drivers
CREATE TABLE drivers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    license_number TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    email TEXT,
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'driving', 'off-duty')),
    assigned_asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
    photo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (tenant_id, license_number)
);

CREATE INDEX idx_drivers_tenant ON drivers(tenant_id) WHERE deleted_at IS NULL;

-- Fleet routes (planned trips)
CREATE TABLE fleet_routes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in-progress', 'completed', 'cancelled')),
    asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
    asset_name TEXT,
    asset_plate TEXT,
    driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
    driver_name TEXT,
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    actual_start_time TIMESTAMPTZ,
    distance NUMERIC NOT NULL DEFAULT 0,
    waypoints JSONB NOT NULL DEFAULT '[]'::jsonb,
    eta TIMESTAMPTZ,
    color TEXT NOT NULL DEFAULT 'blue',
    estimated_duration INTEGER NOT NULL DEFAULT 0,
    actual_duration INTEGER,
    fuel_usage NUMERIC,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_fleet_routes_tenant ON fleet_routes(tenant_id) WHERE deleted_at IS NULL;

-- Trip summaries (telematics cache)
CREATE TABLE trip_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    trip_id TEXT NOT NULL,
    asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
    unit_id TEXT NOT NULL,
    unit_name TEXT NOT NULL,
    departure_time TIMESTAMPTZ NOT NULL,
    departure_lat NUMERIC NOT NULL DEFAULT 0,
    departure_lng NUMERIC NOT NULL DEFAULT 0,
    departure_address TEXT,
    arrival_time TIMESTAMPTZ NOT NULL,
    arrival_lat NUMERIC NOT NULL DEFAULT 0,
    arrival_lng NUMERIC NOT NULL DEFAULT 0,
    arrival_address TEXT,
    mileage NUMERIC NOT NULL DEFAULT 0,
    duration INTEGER NOT NULL DEFAULT 0,
    fuel_used NUMERIC NOT NULL DEFAULT 0,
    avg_speed NUMERIC NOT NULL DEFAULT 0,
    max_speed NUMERIC NOT NULL DEFAULT 0,
    route_coordinates JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, unit_id, departure_time)
);

CREATE INDEX idx_trip_summaries_tenant ON trip_summaries(tenant_id);

-- Fuel transactions
CREATE TABLE fuel_transactions (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
    unit_id TEXT NOT NULL,
    unit_name TEXT NOT NULL,
    section TEXT NOT NULL CHECK (section IN ('consumption', 'filling', 'theft')),
    tank TEXT NOT NULL DEFAULT 'main' CHECK (tank IN ('main', 'reserve', 'unknown')),
    timestamp BIGINT NOT NULL,
    time_str TEXT NOT NULL,
    location TEXT,
    latitude NUMERIC,
    longitude NUMERIC,
    initial_level NUMERIC NOT NULL DEFAULT 0,
    final_level NUMERIC NOT NULL DEFAULT 0,
    filled NUMERIC NOT NULL DEFAULT 0,
    fuel_used NUMERIC NOT NULL DEFAULT 0,
    mileage NUMERIC NOT NULL DEFAULT 0,
    avg_consumption NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fuel_transactions_tenant ON fuel_transactions(tenant_id);
CREATE INDEX idx_fuel_transactions_time ON fuel_transactions(tenant_id, timestamp DESC);

-- Eco-driving violations
CREATE TABLE eco_driving_violations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
    unit_id TEXT NOT NULL,
    unit_name TEXT NOT NULL,
    violation_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    latitude NUMERIC,
    longitude NUMERIC,
    value NUMERIC,
    threshold NUMERIC,
    driver_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_eco_violations_tenant ON eco_driving_violations(tenant_id);

-- Workshop
CREATE TABLE mechanics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    specialization TEXT,
    hourly_rate NUMERIC NOT NULL DEFAULT 0,
    is_external BOOLEAN NOT NULL DEFAULT false,
    workshop_name TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE vehicle_inspections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
    vehicle_id TEXT NOT NULL,
    vehicle_name TEXT NOT NULL,
    vehicle_plate TEXT NOT NULL,
    driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
    driver_name TEXT,
    inspection_type TEXT NOT NULL CHECK (inspection_type IN ('pre-trip', 'post-trip', 'pre-delivery', 'scheduled')),
    inspection_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    odometer_reading NUMERIC NOT NULL DEFAULT 0,
    overall_status TEXT NOT NULL DEFAULT 'pass' CHECK (overall_status IN ('pass', 'fail', 'needs-attention')),
    notes TEXT,
    inspector_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE breakdown_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
    vehicle_id TEXT NOT NULL,
    vehicle_name TEXT NOT NULL,
    vehicle_plate TEXT NOT NULL,
    driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
    driver_name TEXT,
    location JSONB NOT NULL DEFAULT '{"lat":0,"lng":0,"address":""}'::jsonb,
    breakdown_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolution_time TIMESTAMPTZ,
    severity TEXT NOT NULL DEFAULT 'minor' CHECK (severity IN ('minor', 'major', 'critical')),
    description TEXT NOT NULL,
    cause TEXT,
    resolution TEXT,
    downtime_hours NUMERIC NOT NULL DEFAULT 0,
    total_cost NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE maintenance_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
    vehicle_id TEXT NOT NULL,
    vehicle_name TEXT NOT NULL,
    vehicle_plate TEXT NOT NULL,
    driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
    driver_name TEXT,
    inspection_id UUID REFERENCES vehicle_inspections(id) ON DELETE SET NULL,
    breakdown_id UUID REFERENCES breakdown_reports(id) ON DELETE SET NULL,
    maintenance_type TEXT NOT NULL CHECK (maintenance_type IN ('scheduled', 'repair', 'breakdown', 'preventive')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    description TEXT NOT NULL,
    mechanic_name TEXT NOT NULL,
    start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_date TIMESTAMPTZ,
    labor_hours NUMERIC NOT NULL DEFAULT 0,
    labor_cost NUMERIC NOT NULL DEFAULT 0,
    parts_cost NUMERIC NOT NULL DEFAULT 0,
    total_cost NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'completed', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Geofences
CREATE TABLE geofences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('circle', 'polygon')),
    center JSONB,
    radius NUMERIC,
    points JSONB,
    color TEXT NOT NULL DEFAULT '#3B82F6',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_geofences_tenant ON geofences(tenant_id) WHERE deleted_at IS NULL;

-- Driver performance snapshots
CREATE TABLE driver_performance_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    safety_score NUMERIC NOT NULL DEFAULT 0,
    fuel_efficiency NUMERIC NOT NULL DEFAULT 0,
    on_time_rate NUMERIC NOT NULL DEFAULT 0,
    violations_count INTEGER NOT NULL DEFAULT 0,
    trips_count INTEGER NOT NULL DEFAULT 0,
    total_distance NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, driver_id, snapshot_date)
);
