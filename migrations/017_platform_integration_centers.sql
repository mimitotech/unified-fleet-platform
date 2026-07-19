-- 017: Platform-level integration centers (mother accounts configured once)

CREATE TABLE IF NOT EXISTS platform_integrations (
    source_type source_type PRIMARY KEY,
    credentials_encrypted TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    connection_verified_at TIMESTAMPTZ,
    last_error TEXT,
    session_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS inherits_platform_credentials BOOLEAN NOT NULL DEFAULT false;

-- One active tenant per Wialon billing account
CREATE UNIQUE INDEX IF NOT EXISTS idx_data_sources_wialon_account_unique
  ON data_sources (wialon_resource_id)
  WHERE source_type = 'wialon' AND wialon_resource_id IS NOT NULL AND is_active = true;
