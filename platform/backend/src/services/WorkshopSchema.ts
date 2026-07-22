import { query } from '../config/database.js';

async function columnExists(table: string, column: string): Promise<boolean> {
  const { rows } = await query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = $1
       AND COLUMN_NAME = $2`,
    [table, column]
  );
  return Number(rows[0]?.cnt) > 0;
}

async function addColumn(table: string, column: string, ddl: string): Promise<void> {
  if (await columnExists(table, column)) return;
  try {
    await query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  } catch (e) {
    console.warn(`[workshop] could not add ${table}.${column}:`, (e as Error).message);
  }
}

/** Ensure MAMSv2-rich workshop columns exist on MySQL Hostinger. */
export async function ensureWorkshopSchema(): Promise<void> {
  await addColumn('vehicle_inspections', 'next_service_mileage', 'next_service_mileage DECIMAL(18,4) NULL');
  await addColumn('vehicle_inspections', 'truck_head_checklist', 'truck_head_checklist JSON NULL');
  await addColumn('vehicle_inspections', 'trailer_checklist', 'trailer_checklist JSON NULL');

  await addColumn('maintenance_logs', 'parts_used', 'parts_used JSON NULL');
  await addColumn('maintenance_logs', 'odometer_reading', 'odometer_reading DECIMAL(18,4) NULL');
  await addColumn('maintenance_logs', 'next_service_km', 'next_service_km DECIMAL(18,4) NULL');
  await addColumn('maintenance_logs', 'next_service_hours', 'next_service_hours DECIMAL(18,4) NULL');
  await addColumn('maintenance_logs', 'next_service_days', 'next_service_days INT NULL');

  await addColumn('breakdown_reports', 'towing_cost', 'towing_cost DECIMAL(18,4) NOT NULL DEFAULT 0');
  await addColumn('breakdown_reports', 'repair_cost', 'repair_cost DECIMAL(18,4) NOT NULL DEFAULT 0');
  await addColumn('breakdown_reports', 'trip_id', 'trip_id VARCHAR(128) NULL');
  await addColumn('breakdown_reports', 'maintenance_log_id', 'maintenance_log_id CHAR(36) NULL');
}
