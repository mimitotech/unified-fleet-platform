import { query } from '../config/database.js';
import {
  DEFAULT_CHECKLIST_BY_CATEGORY,
  GENERATOR_MONTHLY_PM_SECTIONS,
  MAINTENANCE_CHECKLIST_BY_CATEGORY,
  TEMPLATE_META,
  WORKSHOP_ASSET_CATEGORIES,
  type ChecklistPurpose,
  type WorkshopAssetCategory,
} from './WorkshopChecklistTemplates.js';

async function columnExists(table: string, column: string): Promise<boolean> {
  const { rows } = await query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = $1
       AND COLUMN_NAME = $2`,
    [table, column],
  );
  return Number(rows[0]?.cnt) > 0;
}

async function tableExists(table: string): Promise<boolean> {
  const { rows } = await query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = $1`,
    [table],
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

async function upsertTemplate(input: {
  id: string;
  category: WorkshopAssetCategory;
  purpose: ChecklistPurpose;
  name: string;
  description: string;
  sections: unknown;
}): Promise<void> {
  const payload = [
    input.id,
    input.category,
    input.name,
    input.description,
    JSON.stringify(input.sections),
    input.purpose,
  ];
  try {
    await query(
      `INSERT INTO workshop_checklist_templates
         (id, tenant_id, asset_category, name, description, sections, is_system, is_active, purpose)
       VALUES ($1, NULL, $2, $3, $4, $5::jsonb, 1, 1, $6)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         sections = EXCLUDED.sections,
         purpose = EXCLUDED.purpose,
         is_active = 1,
         updated_at = NOW()`,
      payload,
    );
  } catch {
    try {
      const { rows } = await query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM workshop_checklist_templates WHERE id = $1`,
        [input.id],
      );
      if (Number(rows[0]?.cnt) === 0) {
        await query(
          `INSERT INTO workshop_checklist_templates
             (id, tenant_id, asset_category, name, description, sections, is_system, is_active, purpose)
           VALUES ($1, NULL, $2, $3, $4, $5::jsonb, 1, 1, $6)`,
          payload,
        );
      } else {
        await query(
          `UPDATE workshop_checklist_templates
           SET name = $2, description = $3, sections = $4::jsonb, purpose = $5, is_active = 1, updated_at = NOW()
           WHERE id = $1`,
          [input.id, input.name, input.description, JSON.stringify(input.sections), input.purpose],
        );
      }
    } catch (e2) {
      console.warn(`[workshop] seed template ${input.id}:`, (e2 as Error).message);
    }
  }
}

async function ensureChecklistTemplatesTable(): Promise<void> {
  if (!(await tableExists('workshop_checklist_templates'))) {
    try {
      await query(`
        CREATE TABLE workshop_checklist_templates (
          id CHAR(36) NOT NULL PRIMARY KEY,
          tenant_id CHAR(36) NULL,
          asset_category VARCHAR(32) NOT NULL,
          purpose VARCHAR(32) NOT NULL DEFAULT 'inspection',
          name VARCHAR(191) NOT NULL,
          description TEXT NULL,
          sections JSON NOT NULL,
          is_system TINYINT(1) NOT NULL DEFAULT 0,
          is_active TINYINT(1) NOT NULL DEFAULT 1,
          created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          KEY idx_wct_tenant_cat (tenant_id, asset_category),
          KEY idx_wct_category (asset_category)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } catch (e) {
      console.warn('[workshop] could not create workshop_checklist_templates:', (e as Error).message);
      return;
    }
  }

  await addColumn(
    'workshop_checklist_templates',
    'purpose',
    "purpose VARCHAR(32) NOT NULL DEFAULT 'inspection'",
  );

  for (const category of WORKSHOP_ASSET_CATEGORIES) {
    const meta = TEMPLATE_META[category];
    const sections = DEFAULT_CHECKLIST_BY_CATEGORY[category];
    const stableId =
      category === 'vehicle'
        ? 'a1000001-0000-4000-8000-000000000001'
        : category === 'generator'
          ? 'a1000001-0000-4000-8000-000000000002'
          : 'a1000001-0000-4000-8000-000000000003';
    await upsertTemplate({
      id: stableId,
      category,
      purpose: 'inspection',
      name: meta.name,
      description: meta.description,
      sections,
    });
  }

  // Generator monthly PM lives under Maintenance (not Inspection).
  await upsertTemplate({
    id: 'a1000001-0000-4000-8000-000000000004',
    category: 'generator',
    purpose: 'maintenance',
    name: 'Generator monthly preventive maintenance',
    description: 'Monthly preventive maintenance checklist for generators',
    sections: GENERATOR_MONTHLY_PM_SECTIONS,
  });
}

/** Ensure MAMSv2-rich workshop columns exist on MySQL Hostinger. */
export async function ensureWorkshopSchema(): Promise<void> {
  await addColumn('vehicle_inspections', 'next_service_mileage', 'next_service_mileage DECIMAL(18,4) NULL');
  await addColumn('vehicle_inspections', 'truck_head_checklist', 'truck_head_checklist JSON NULL');
  await addColumn('vehicle_inspections', 'trailer_checklist', 'trailer_checklist JSON NULL');
  await addColumn('vehicle_inspections', 'asset_category', "asset_category VARCHAR(32) NOT NULL DEFAULT 'vehicle'");
  await addColumn('vehicle_inspections', 'engine_hours', 'engine_hours DECIMAL(18,4) NULL');
  await addColumn('vehicle_inspections', 'checklist_sections', 'checklist_sections JSON NULL');
  await addColumn('vehicle_inspections', 'inspector_date', 'inspector_date DATE NULL');
  await addColumn('vehicle_inspections', 'inspector_signature', 'inspector_signature TEXT NULL');

  await addColumn('maintenance_logs', 'parts_used', 'parts_used JSON NULL');
  await addColumn('maintenance_logs', 'odometer_reading', 'odometer_reading DECIMAL(18,4) NULL');
  await addColumn('maintenance_logs', 'next_service_km', 'next_service_km DECIMAL(18,4) NULL');
  await addColumn('maintenance_logs', 'next_service_hours', 'next_service_hours DECIMAL(18,4) NULL');
  await addColumn('maintenance_logs', 'next_service_days', 'next_service_days INT NULL');
  await addColumn('maintenance_logs', 'asset_category', "asset_category VARCHAR(32) NOT NULL DEFAULT 'vehicle'");
  await addColumn('maintenance_logs', 'engine_hours', 'engine_hours DECIMAL(18,4) NULL');
  await addColumn('maintenance_logs', 'checklist_sections', 'checklist_sections JSON NULL');
  await addColumn('maintenance_logs', 'mechanic_date', 'mechanic_date DATE NULL');
  await addColumn('maintenance_logs', 'mechanic_signature', 'mechanic_signature TEXT NULL');

  await addColumn('breakdown_reports', 'towing_cost', 'towing_cost DECIMAL(18,4) NOT NULL DEFAULT 0');
  await addColumn('breakdown_reports', 'repair_cost', 'repair_cost DECIMAL(18,4) NOT NULL DEFAULT 0');
  await addColumn('breakdown_reports', 'trip_id', 'trip_id VARCHAR(128) NULL');
  await addColumn('breakdown_reports', 'maintenance_log_id', 'maintenance_log_id CHAR(36) NULL');
  await addColumn('breakdown_reports', 'asset_category', "asset_category VARCHAR(32) NOT NULL DEFAULT 'vehicle'");
  await addColumn('breakdown_reports', 'failure_system', 'failure_system VARCHAR(64) NULL');
  await addColumn('breakdown_reports', 'reported_by', 'reported_by TEXT NULL');
  await addColumn('breakdown_reports', 'reported_date', 'reported_date DATE NULL');
  await addColumn('breakdown_reports', 'reported_signature', 'reported_signature TEXT NULL');

  await addColumn('assets', 'asset_category', "asset_category VARCHAR(32) NULL");

  await ensureChecklistTemplatesTable();
  await ensureOperatorWorkshopAccess();
}

/** Operators handle field inspections / maintenance — grant workshop if missing. */
async function ensureOperatorWorkshopAccess(): Promise<void> {
  try {
    await query(
      `INSERT INTO user_modules (id, user_id, module_key, is_enabled)
       SELECT UUID(), u.id, 'workshop', 1
       FROM users u
       WHERE u.role = 'operator'
         AND u.is_active = 1
         AND NOT EXISTS (
           SELECT 1 FROM user_modules um
           WHERE um.user_id = u.id AND um.module_key = 'workshop'
         )`,
    );
    await query(
      `UPDATE user_modules um
       INNER JOIN users u ON u.id = um.user_id
       SET um.is_enabled = 1
       WHERE u.role = 'operator'
         AND um.module_key = 'workshop'
         AND um.is_enabled = 0`,
    );
  } catch (e) {
    console.warn('[workshop] ensureOperatorWorkshopAccess:', (e as Error).message);
  }
}

export async function getChecklistTemplateForCategory(
  tenantId: string,
  category: WorkshopAssetCategory,
  purpose: ChecklistPurpose = 'inspection',
): Promise<{
  assetCategory: WorkshopAssetCategory;
  purpose: ChecklistPurpose;
  name: string;
  description: string;
  sections: unknown;
  source: 'tenant' | 'system' | 'builtin';
}> {
  try {
    const { rows } = await query<{
      name: string;
      description: string | null;
      sections: unknown;
      tenant_id: string | null;
      is_system: number | boolean;
      purpose?: string | null;
    }>(
      `SELECT name, description, sections, tenant_id, is_system, purpose
       FROM workshop_checklist_templates
       WHERE is_active = true
         AND asset_category = $1
         AND (tenant_id = $2 OR tenant_id IS NULL)
         AND (purpose = $3 OR (purpose IS NULL AND $3 = 'inspection'))
       ORDER BY (tenant_id IS NOT NULL) DESC, updated_at DESC
       LIMIT 1`,
      [category, tenantId, purpose],
    );
    if (rows[0]) {
      let sections = rows[0].sections;
      if (typeof sections === 'string') {
        try {
          sections = JSON.parse(sections);
        } catch {
          /* keep */
        }
      }
      // Legacy combined generator inspection templates: strip monthly PM from inspection.
      if (
        purpose === 'inspection' &&
        category === 'generator' &&
        Array.isArray(sections)
      ) {
        sections = (sections as Array<{ id?: string }>).filter((s) => s?.id !== 'monthly-pm');
        if (!(sections as unknown[]).length) {
          sections = DEFAULT_CHECKLIST_BY_CATEGORY.generator;
        }
      }
      return {
        assetCategory: category,
        purpose,
        name: rows[0].name,
        description: rows[0].description || '',
        sections,
        source: rows[0].tenant_id ? 'tenant' : 'system',
      };
    }
  } catch (e) {
    console.warn('[workshop] getChecklistTemplateForCategory:', (e as Error).message);
  }

  if (purpose === 'maintenance') {
    const sections = MAINTENANCE_CHECKLIST_BY_CATEGORY[category] || [];
    return {
      assetCategory: category,
      purpose,
      name:
        category === 'generator'
          ? 'Generator monthly preventive maintenance'
          : 'Maintenance checklist',
      description:
        category === 'generator'
          ? 'Monthly preventive maintenance checklist for generators'
          : '',
      sections,
      source: 'builtin',
    };
  }

  const meta = TEMPLATE_META[category];
  return {
    assetCategory: category,
    purpose,
    name: meta.name,
    description: meta.description,
    sections: DEFAULT_CHECKLIST_BY_CATEGORY[category],
    source: 'builtin',
  };
}
