-- 012: Tenant onboarding — draft status and integration verification

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_status_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_status_check
  CHECK (status IN ('draft', 'active', 'inactive', 'suspended', 'warning'));

ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS connection_verified_at TIMESTAMPTZ;
ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS preview_asset_count INTEGER;
ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS preview_sample JSONB DEFAULT '[]'::jsonb;
