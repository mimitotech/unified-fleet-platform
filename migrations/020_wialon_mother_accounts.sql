-- 020: Multiple Wialon mother accounts (each with its own token)

CREATE TABLE IF NOT EXISTS wialon_mother_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    credentials_encrypted TEXT NOT NULL,
    base_url VARCHAR(512),
    is_active BOOLEAN NOT NULL DEFAULT true,
    connection_verified_at TIMESTAMPTZ,
    last_error TEXT,
    session_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    account_tier VARCHAR(32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wialon_mother_accounts_active ON wialon_mother_accounts (is_active) WHERE is_active = true;

ALTER TABLE data_sources
  ADD COLUMN IF NOT EXISTS wialon_mother_account_id UUID REFERENCES wialon_mother_accounts(id) ON DELETE SET NULL;

-- Migrate legacy single platform_integrations wialon row into first mother account
DO $$
DECLARE
  legacy_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM platform_integrations WHERE source_type = 'wialon')
     AND NOT EXISTS (SELECT 1 FROM wialon_mother_accounts LIMIT 1) THEN
    INSERT INTO wialon_mother_accounts (
      name, credentials_encrypted, base_url, is_active,
      connection_verified_at, last_error, session_meta, account_tier
    )
    SELECT
      COALESCE(NULLIF(session_meta->>'sessionUserName', ''), 'Primary mother account'),
      credentials_encrypted,
      NULLIF(session_meta->>'baseUrl', ''),
      is_active,
      connection_verified_at,
      last_error,
      session_meta,
      NULLIF(session_meta->>'accountTier', '')
    FROM platform_integrations
    WHERE source_type = 'wialon'
    RETURNING id INTO legacy_id;

    UPDATE data_sources
    SET wialon_mother_account_id = legacy_id
    WHERE source_type = 'wialon'
      AND inherits_platform_credentials = true
      AND wialon_mother_account_id IS NULL;
  END IF;
END $$;
