-- Scale indexes for 100–500+ clients under multiple Wialon mother accounts.
-- Safe to re-run: wrap with information_schema checks or rely on ensureProductionHardening on boot.

ALTER TABLE data_sources
  ADD KEY idx_data_sources_mother (wialon_mother_account_id);

ALTER TABLE data_sources
  ADD KEY idx_data_sources_type_active_resource (source_type, is_active, wialon_resource_id);

ALTER TABLE tenants
  ADD KEY idx_tenants_active_status (is_active, status);

ALTER TABLE users
  ADD KEY idx_users_tenant_active (tenant_id, is_active);

ALTER TABLE assets
  ADD KEY idx_assets_tenant_updated (tenant_id, updated_at);
