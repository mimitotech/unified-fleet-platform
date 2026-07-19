-- 026: Fuel module columns per asset category + optional fuel price

ALTER TABLE tenant_fuel_module_configs
  ADD COLUMN IF NOT EXISTS columns_by_category JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE tenant_fuel_module_configs
  ADD COLUMN IF NOT EXISTS fuel_price_per_liter NUMERIC(12, 4);

COMMENT ON COLUMN tenant_fuel_module_configs.columns_by_category IS
  'Per asset category visible fuel table columns: { vehicle: [], generator: [], machinery: [] }';
