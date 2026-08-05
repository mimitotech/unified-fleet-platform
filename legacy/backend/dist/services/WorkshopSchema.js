import { query } from '../config/database.js';
import { DEFAULT_CHECKLIST_BY_CATEGORY, TEMPLATE_META, WORKSHOP_ASSET_CATEGORIES, } from './WorkshopChecklistTemplates.js';
async function columnExists(table, column) {
    const { rows } = await query(`SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = $1
       AND COLUMN_NAME = $2`, [table, column]);
    return Number(rows[0]?.cnt) > 0;
}
async function tableExists(table) {
    const { rows } = await query(`SELECT COUNT(*) AS cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = $1`, [table]);
    return Number(rows[0]?.cnt) > 0;
}
async function addColumn(table, column, ddl) {
    if (await columnExists(table, column))
        return;
    try {
        await query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
    catch (e) {
        console.warn(`[workshop] could not add ${table}.${column}:`, e.message);
    }
}
async function ensureChecklistTemplatesTable() {
    if (!(await tableExists('workshop_checklist_templates'))) {
        try {
            await query(`
        CREATE TABLE workshop_checklist_templates (
          id CHAR(36) NOT NULL PRIMARY KEY,
          tenant_id CHAR(36) NULL,
          asset_category VARCHAR(32) NOT NULL,
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
        }
        catch (e) {
            console.warn('[workshop] could not create workshop_checklist_templates:', e.message);
            return;
        }
    }
    for (const category of WORKSHOP_ASSET_CATEGORIES) {
        const meta = TEMPLATE_META[category];
        const sections = DEFAULT_CHECKLIST_BY_CATEGORY[category];
        const id = `00000000-0000-4000-8000-wct${category.slice(0, 5).padEnd(5, '0')}`;
        // Stable-ish UUIDs per category for system seeds
        const stableId = category === 'vehicle'
            ? 'a1000001-0000-4000-8000-000000000001'
            : category === 'generator'
                ? 'a1000001-0000-4000-8000-000000000002'
                : 'a1000001-0000-4000-8000-000000000003';
        void id;
        try {
            await query(`INSERT INTO workshop_checklist_templates
           (id, tenant_id, asset_category, name, description, sections, is_system, is_active)
         VALUES ($1, NULL, $2, $3, $4, $5::jsonb, 1, 1)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           sections = EXCLUDED.sections,
           is_active = 1,
           updated_at = NOW()`, [stableId, category, meta.name, meta.description, JSON.stringify(sections)]);
        }
        catch (e) {
            // MySQL may lack ON CONFLICT if rewriter fails — try insert-ignore path
            try {
                const { rows } = await query(`SELECT COUNT(*) AS cnt FROM workshop_checklist_templates WHERE id = $1`, [stableId]);
                if (Number(rows[0]?.cnt) === 0) {
                    await query(`INSERT INTO workshop_checklist_templates
               (id, tenant_id, asset_category, name, description, sections, is_system, is_active)
             VALUES ($1, NULL, $2, $3, $4, $5::jsonb, 1, 1)`, [stableId, category, meta.name, meta.description, JSON.stringify(sections)]);
                }
                else {
                    await query(`UPDATE workshop_checklist_templates
             SET name = $2, description = $3, sections = $4::jsonb, is_active = 1, updated_at = NOW()
             WHERE id = $1`, [stableId, meta.name, meta.description, JSON.stringify(sections)]);
                }
            }
            catch (e2) {
                console.warn(`[workshop] seed template ${category}:`, e2.message);
            }
        }
    }
}
/** Ensure MAMSv2-rich workshop columns exist on MySQL Hostinger. */
export async function ensureWorkshopSchema() {
    await addColumn('vehicle_inspections', 'next_service_mileage', 'next_service_mileage DECIMAL(18,4) NULL');
    await addColumn('vehicle_inspections', 'truck_head_checklist', 'truck_head_checklist JSON NULL');
    await addColumn('vehicle_inspections', 'trailer_checklist', 'trailer_checklist JSON NULL');
    await addColumn('vehicle_inspections', 'asset_category', "asset_category VARCHAR(32) NOT NULL DEFAULT 'vehicle'");
    await addColumn('vehicle_inspections', 'engine_hours', 'engine_hours DECIMAL(18,4) NULL');
    await addColumn('vehicle_inspections', 'checklist_sections', 'checklist_sections JSON NULL');
    await addColumn('maintenance_logs', 'parts_used', 'parts_used JSON NULL');
    await addColumn('maintenance_logs', 'odometer_reading', 'odometer_reading DECIMAL(18,4) NULL');
    await addColumn('maintenance_logs', 'next_service_km', 'next_service_km DECIMAL(18,4) NULL');
    await addColumn('maintenance_logs', 'next_service_hours', 'next_service_hours DECIMAL(18,4) NULL');
    await addColumn('maintenance_logs', 'next_service_days', 'next_service_days INT NULL');
    await addColumn('maintenance_logs', 'asset_category', "asset_category VARCHAR(32) NOT NULL DEFAULT 'vehicle'");
    await addColumn('maintenance_logs', 'engine_hours', 'engine_hours DECIMAL(18,4) NULL');
    await addColumn('breakdown_reports', 'towing_cost', 'towing_cost DECIMAL(18,4) NOT NULL DEFAULT 0');
    await addColumn('breakdown_reports', 'repair_cost', 'repair_cost DECIMAL(18,4) NOT NULL DEFAULT 0');
    await addColumn('breakdown_reports', 'trip_id', 'trip_id VARCHAR(128) NULL');
    await addColumn('breakdown_reports', 'maintenance_log_id', 'maintenance_log_id CHAR(36) NULL');
    await addColumn('breakdown_reports', 'asset_category', "asset_category VARCHAR(32) NOT NULL DEFAULT 'vehicle'");
    await addColumn('breakdown_reports', 'failure_system', 'failure_system VARCHAR(64) NULL');
    await addColumn('assets', 'asset_category', "asset_category VARCHAR(32) NULL");
    await ensureChecklistTemplatesTable();
}
export async function getChecklistTemplateForCategory(tenantId, category) {
    try {
        const { rows } = await query(`SELECT name, description, sections, tenant_id, is_system
       FROM workshop_checklist_templates
       WHERE is_active = true
         AND asset_category = $1
         AND (tenant_id = $2 OR tenant_id IS NULL)
       ORDER BY (tenant_id IS NOT NULL) DESC, updated_at DESC
       LIMIT 1`, [category, tenantId]);
        if (rows[0]) {
            let sections = rows[0].sections;
            if (typeof sections === 'string') {
                try {
                    sections = JSON.parse(sections);
                }
                catch {
                    sections = DEFAULT_CHECKLIST_BY_CATEGORY[category];
                }
            }
            return {
                assetCategory: category,
                name: rows[0].name,
                description: rows[0].description || TEMPLATE_META[category].description,
                sections: sections ?? DEFAULT_CHECKLIST_BY_CATEGORY[category],
                source: rows[0].tenant_id ? 'tenant' : 'system',
            };
        }
    }
    catch {
        /* fall through to builtin */
    }
    const meta = TEMPLATE_META[category];
    return {
        assetCategory: category,
        name: meta.name,
        description: meta.description,
        sections: DEFAULT_CHECKLIST_BY_CATEGORY[category],
        source: 'builtin',
    };
}
