<?php
/**
 * Ensure workshop columns/tables exist (MySQL Hostinger).
 * Parity with platform/backend services/WorkshopSchema.ts
 */
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/WorkshopChecklistTemplates.php';

final class WorkshopSchema
{
    private static bool $ensured = false;

    public static function ensure(): void
    {
        if (self::$ensured) {
            return;
        }
        self::$ensured = true;

        try {
            self::addColumn('vehicle_inspections', 'asset_category', "VARCHAR(32) NOT NULL DEFAULT 'vehicle'");
            self::addColumn('vehicle_inspections', 'engine_hours', 'DECIMAL(18,4) NULL');
            self::addColumn('vehicle_inspections', 'checklist_sections', 'JSON NULL');
            self::addColumn('maintenance_logs', 'asset_category', "VARCHAR(32) NOT NULL DEFAULT 'vehicle'");
            self::addColumn('breakdown_reports', 'asset_category', "VARCHAR(32) NOT NULL DEFAULT 'vehicle'");
            self::addColumn('assets', 'asset_category', 'VARCHAR(32) NULL');
            self::ensureTemplatesTable();
        } catch (Throwable $e) {
            error_log('WorkshopSchema ensure: ' . $e->getMessage());
        }
    }

    private static function addColumn(string $table, string $column, string $definition): void
    {
        try {
            $rows = Database::query(
                'SELECT 1 FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
                 LIMIT 1',
                [$table, $column]
            );
            if ($rows) {
                return;
            }
            // table may not exist yet
            $exists = Database::query(
                'SELECT 1 FROM information_schema.tables
                 WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1',
                [$table]
            );
            if (!$exists) {
                return;
            }
            Database::execute("ALTER TABLE `{$table}` ADD COLUMN `{$column}` {$definition}");
        } catch (Throwable $e) {
            error_log("WorkshopSchema addColumn {$table}.{$column}: " . $e->getMessage());
        }
    }

    private static function ensureTemplatesTable(): void
    {
        Database::execute(
            "CREATE TABLE IF NOT EXISTS workshop_checklist_templates (
               id CHAR(36) NOT NULL PRIMARY KEY,
               tenant_id CHAR(36) NULL,
               asset_category VARCHAR(32) NOT NULL,
               name VARCHAR(255) NOT NULL,
               description TEXT NULL,
               sections JSON NOT NULL,
               is_system TINYINT(1) NOT NULL DEFAULT 1,
               is_active TINYINT(1) NOT NULL DEFAULT 1,
               created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
               updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
               KEY idx_wct_tenant_cat (tenant_id, asset_category),
               KEY idx_wct_category (asset_category)
             ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );

        // Seed system templates (tenant_id NULL) if missing
        foreach (WorkshopChecklistTemplates::allTemplates() as $tpl) {
            $cat = $tpl['assetCategory'];
            $existing = Database::query(
                'SELECT id FROM workshop_checklist_templates
                 WHERE tenant_id IS NULL AND asset_category = ? AND is_system = 1
                 LIMIT 1',
                [$cat]
            );
            if ($existing) {
                // Keep generator sections current (Daily + Monthly)
                if ($cat === 'generator') {
                    Database::execute(
                        'UPDATE workshop_checklist_templates
                         SET name = ?, description = ?, sections = ?, updated_at = NOW(3)
                         WHERE id = ?',
                        [
                            $tpl['name'],
                            $tpl['description'],
                            json_encode($tpl['sections']),
                            $existing[0]['id'],
                        ]
                    );
                }
                continue;
            }
            $id = self::uuid();
            Database::execute(
                'INSERT INTO workshop_checklist_templates
                   (id, tenant_id, asset_category, name, description, sections, is_system, is_active)
                 VALUES (?, NULL, ?, ?, ?, ?, 1, 1)',
                [
                    $id,
                    $cat,
                    $tpl['name'],
                    $tpl['description'],
                    json_encode($tpl['sections']),
                ]
            );
        }
    }

    private static function uuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }
}
