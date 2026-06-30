-- 002: Data sources (per-tenant integrations)
CREATE TYPE source_type AS ENUM ('wialon', 'loconav', 'tracksolid');

CREATE TABLE data_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_type source_type NOT NULL,
    credentials_encrypted TEXT NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT false,
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, source_type)
);

CREATE INDEX idx_data_sources_tenant ON data_sources(tenant_id);
