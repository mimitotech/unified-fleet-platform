-- 015: Wialon account hierarchy linkage on data sources

ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS wialon_resource_id BIGINT;
ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS wialon_operate_as BIGINT;
ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS wialon_account_name TEXT;
ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS wialon_session_meta JSONB DEFAULT '{}'::jsonb;
