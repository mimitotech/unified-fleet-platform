-- 016: Link MAMS tenant users to Wialon sub-users (auto-provisioned from account scope)

ALTER TABLE users ADD COLUMN IF NOT EXISTS wialon_user_id BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS wialon_login TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_wialon_user
  ON users(tenant_id, wialon_user_id) WHERE wialon_user_id IS NOT NULL;
