-- Enrich workshop tables to match MAMSv2 inspection checklists, parts, and service fields.

ALTER TABLE vehicle_inspections
  ADD COLUMN IF NOT EXISTS next_service_mileage NUMERIC,
  ADD COLUMN IF NOT EXISTS truck_head_checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS trailer_checklist JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE maintenance_logs
  ADD COLUMN IF NOT EXISTS parts_used JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS odometer_reading NUMERIC,
  ADD COLUMN IF NOT EXISTS next_service_km NUMERIC,
  ADD COLUMN IF NOT EXISTS next_service_hours NUMERIC,
  ADD COLUMN IF NOT EXISTS next_service_days INTEGER;

ALTER TABLE breakdown_reports
  ADD COLUMN IF NOT EXISTS towing_cost NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repair_cost NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trip_id TEXT,
  ADD COLUMN IF NOT EXISTS maintenance_log_id UUID REFERENCES maintenance_logs(id) ON DELETE SET NULL;
