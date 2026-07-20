-- Dedup key for eco violation sync from Wialon reports.

ALTER TABLE eco_driving_violations
  ADD COLUMN IF NOT EXISTS external_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_eco_violations_tenant_external
  ON eco_driving_violations (tenant_id, external_id)
  WHERE external_id IS NOT NULL;
