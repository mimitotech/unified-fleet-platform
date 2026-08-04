import { query } from '../config/database.js';
export const FUEL_TABLE_COLUMNS = [
    'filledMain',
    'filledReserve',
    'filledStation',
    'variance',
    'usedMain',
    'usedReserve',
    'levelMain',
    'levelReserve',
    'totalLevel',
    'dropMain',
    'dropReserve',
    'totalDrop',
    'totalUsed',
    'fuelType',
    'cost',
    'cardNo',
];
const DEFAULT_COLUMNS = [...FUEL_TABLE_COLUMNS];
const CATEGORIES = ['vehicle', 'generator', 'machinery'];
function isColumnKey(v) {
    return FUEL_TABLE_COLUMNS.includes(v);
}
function sanitizeColumns(input) {
    if (!Array.isArray(input))
        return [...DEFAULT_COLUMNS];
    const out = input.map((v) => String(v)).filter(isColumnKey);
    return out.length ? [...new Set(out)] : [...DEFAULT_COLUMNS];
}
function sanitizeColumnsByCategory(input, fallback) {
    const src = input && typeof input === 'object' ? input : {};
    const out = {};
    for (const cat of CATEGORIES) {
        out[cat] = sanitizeColumns(src[cat] ?? fallback);
    }
    return out;
}
function sanitizeReports(input) {
    if (!Array.isArray(input))
        return [];
    const out = [];
    for (const raw of input) {
        const resourceId = Number(raw.resourceId);
        const templateId = Number(raw.templateId);
        const templateName = String(raw.templateName || '').trim();
        if (!Number.isFinite(resourceId) || !Number.isFinite(templateId) || !templateName)
            continue;
        out.push({
            resourceId,
            templateId,
            templateName,
            module: raw.module ? String(raw.module) : undefined,
            isGroupReport: raw.isGroupReport === true,
        });
    }
    const seen = new Set();
    return out.filter((r) => {
        const k = `${r.resourceId}:${r.templateId}`;
        if (seen.has(k))
            return false;
        seen.add(k);
        return true;
    });
}
export class TenantFuelModuleConfigService {
    static async getConfig(tenantId) {
        const { rows } = await query(`SELECT selected_reports, visible_columns, columns_by_category, fuel_price_per_liter, updated_at
       FROM tenant_fuel_module_configs
       WHERE tenant_id = $1`, [tenantId]);
        const row = rows[0];
        const visibleColumns = sanitizeColumns(row?.visible_columns);
        const columnsByCategory = sanitizeColumnsByCategory(row?.columns_by_category, visibleColumns);
        const priceRaw = row?.fuel_price_per_liter;
        const fuelPricePerLiter = priceRaw == null || priceRaw === '' ? null : Number(priceRaw);
        return {
            tenantId,
            selectedReports: sanitizeReports(row?.selected_reports),
            visibleColumns,
            columnsByCategory,
            fuelPricePerLiter: Number.isFinite(fuelPricePerLiter) ? fuelPricePerLiter : null,
            updatedAt: row?.updated_at || null,
        };
    }
    static async saveConfig(tenantId, input) {
        const selectedReports = sanitizeReports(input.selectedReports);
        const visibleColumns = sanitizeColumns(input.visibleColumns);
        const columnsByCategory = sanitizeColumnsByCategory(input.columnsByCategory, visibleColumns);
        const priceNum = input.fuelPricePerLiter == null || input.fuelPricePerLiter === ''
            ? null
            : Number(input.fuelPricePerLiter);
        const fuelPricePerLiter = priceNum != null && Number.isFinite(priceNum) && priceNum >= 0 ? priceNum : null;
        await query(`INSERT INTO tenant_fuel_module_configs
         (tenant_id, selected_reports, visible_columns, columns_by_category, fuel_price_per_liter, updated_at)
       VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5, NOW())
       ON CONFLICT (tenant_id)
       DO UPDATE SET selected_reports = EXCLUDED.selected_reports,
                     visible_columns = EXCLUDED.visible_columns,
                     columns_by_category = EXCLUDED.columns_by_category,
                     fuel_price_per_liter = EXCLUDED.fuel_price_per_liter,
                     updated_at = NOW()`, [
            tenantId,
            JSON.stringify(selectedReports),
            JSON.stringify(visibleColumns),
            JSON.stringify(columnsByCategory),
            fuelPricePerLiter,
        ]);
        return this.getConfig(tenantId);
    }
}
