-- 011: Command history and tenant file metadata

CREATE TABLE IF NOT EXISTS command_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
    external_asset_id TEXT,
    asset_name TEXT,
    command TEXT NOT NULL,
    params JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'success', 'failed', 'timeout')),
    response JSONB,
    source_type source_type DEFAULT 'wialon',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_command_logs_tenant ON command_logs(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tenant_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    file_type TEXT NOT NULL CHECK (file_type IN ('logo', 'favicon', 'document', 'import')),
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_files_tenant ON tenant_files(tenant_id, file_type);
