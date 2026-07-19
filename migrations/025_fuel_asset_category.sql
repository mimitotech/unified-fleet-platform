-- Tag fuel transactions with fleet category at sync time (DB reads without Wialon).

ALTER TABLE fuel_transactions
  ADD COLUMN IF NOT EXISTS asset_category TEXT CHECK (
    asset_category IS NULL OR asset_category IN ('vehicle', 'generator', 'machinery')
  );

CREATE INDEX IF NOT EXISTS idx_fuel_transactions_category_time
  ON fuel_transactions(tenant_id, asset_category, timestamp DESC);
