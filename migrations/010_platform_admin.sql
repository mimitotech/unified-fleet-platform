-- 010: Platform admin extensions

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS country TEXT DEFAULT '';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'inactive', 'suspended', 'warning'));
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_vehicles INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_users INTEGER NOT NULL DEFAULT 50;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_storage_gb NUMERIC NOT NULL DEFAULT 100;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT '#3b82f6';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS custom_css TEXT;

ALTER TABLE tenant_modules ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    language TEXT DEFAULT 'en',
    timezone TEXT DEFAULT 'UTC',
    date_format TEXT DEFAULT 'YYYY-MM-DD',
    time_format TEXT DEFAULT '24h',
    unit_system TEXT DEFAULT 'metric',
    email_notifications BOOLEAN NOT NULL DEFAULT true,
    in_app_notifications BOOLEAN NOT NULL DEFAULT true,
    sms_notifications BOOLEAN NOT NULL DEFAULT false,
    dashboard_layout JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_settings (key, value) VALUES
  ('general', '{"platformName":"Unified Fleet Platform","defaultLanguage":"en","defaultTimezone":"UTC"}'::jsonb),
  ('email', '{"smtpHost":"","smtpPort":587,"fromEmail":"noreply@ufp.local","fromName":"Fleet Platform"}'::jsonb),
  ('webhooks', '{"globalSecret":"","events":["alerts","status"]}'::jsonb),
  ('backup', '{"autoBackup":true,"frequency":"daily","backupTime":"02:00","retentionDays":30}'::jsonb),
  ('security', '{"minPasswordLength":8,"requireSpecialChar":true,"sessionTimeoutMinutes":30,"twoFactorPolicy":"optional"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    user_email TEXT,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS activity_feed (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_feed_created ON activity_feed(created_at DESC);

CREATE TABLE IF NOT EXISTS tenant_api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    permissions TEXT[] NOT NULL DEFAULT '{read}',
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_api_keys_tenant ON tenant_api_keys(tenant_id);

CREATE TABLE IF NOT EXISTS tenant_backups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    backup_type TEXT NOT NULL DEFAULT 'full' CHECK (backup_type IN ('full', 'incremental')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'failed')),
    size_bytes BIGINT DEFAULT 0,
    file_path TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tenant_backups_tenant ON tenant_backups(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tenant_backup_settings (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    auto_backup BOOLEAN NOT NULL DEFAULT true,
    frequency TEXT NOT NULL DEFAULT 'daily',
    backup_time TEXT NOT NULL DEFAULT '02:00',
    retention_days INTEGER NOT NULL DEFAULT 30,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration_sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_type source_type NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'running')),
    message TEXT,
    vehicles_synced INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_tenant ON integration_sync_logs(tenant_id, started_at DESC);

CREATE TABLE IF NOT EXISTS marketplace_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'telematics',
    is_enabled_globally BOOLEAN NOT NULL DEFAULT false,
    is_builtin BOOLEAN NOT NULL DEFAULT false,
    config_schema JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO marketplace_integrations (key, name, description, category, is_enabled_globally, is_builtin) VALUES
  ('wialon', 'Wialon', 'GPS tracking, fuel, trips, commands', 'telematics', true, true),
  ('loconav', 'LocoNav', 'Video surveillance and camera alerts', 'video', true, true),
  ('tracksolid', 'TrackSolid Pro', 'GPS + video fleet tracking', 'telematics', true, true),
  ('ram', 'RAM Fleet', 'Fleet management integration', 'telematics', false, false),
  ('twilio', 'Twilio SMS', 'SMS notifications', 'communications', false, false),
  ('maintenance_pro', 'Maintenance Pro', 'Workshop management', 'maintenance', false, false)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS sync_interval_minutes INTEGER DEFAULT 5;
ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS webhook_secret TEXT;
