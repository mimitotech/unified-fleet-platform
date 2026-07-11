-- 023: Tenant Fuel module configuration (reports + visible table columns)

CREATE TABLE IF NOT EXISTS tenant_fuel_module_configs (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  selected_reports JSONB NOT NULL DEFAULT '[]'::jsonb,
  visible_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
