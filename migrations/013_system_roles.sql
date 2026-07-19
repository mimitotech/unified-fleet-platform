-- 013: Super admin, tenant assignment to Mimito staff

DO $$ BEGIN
  ALTER TYPE user_role ADD VALUE 'super_admin';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS assigned_manager_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tenants_assigned_manager ON tenants(assigned_manager_id);
