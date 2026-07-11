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
] as const;

export type FuelTableColumnKey = (typeof FUEL_TABLE_COLUMNS)[number];

export type FuelReportSelection = {
  resourceId: number;
  templateId: number;
  templateName: string;
  module?: string;
  isGroupReport?: boolean;
};

export type TenantFuelModuleConfig = {
  tenantId: string;
  selectedReports: FuelReportSelection[];
  visibleColumns: FuelTableColumnKey[];
  updatedAt: string | null;
};

const DEFAULT_COLUMNS: FuelTableColumnKey[] = [...FUEL_TABLE_COLUMNS];

function isColumnKey(v: string): v is FuelTableColumnKey {
  return (FUEL_TABLE_COLUMNS as readonly string[]).includes(v);
}

function sanitizeColumns(input: unknown): FuelTableColumnKey[] {
  if (!Array.isArray(input)) return [...DEFAULT_COLUMNS];
  const out = input
    .map((v) => String(v))
    .filter(isColumnKey);
  return out.length ? [...new Set(out)] : [...DEFAULT_COLUMNS];
}

function sanitizeReports(input: unknown): FuelReportSelection[] {
  if (!Array.isArray(input)) return [];
  const out: FuelReportSelection[] = [];
  for (const raw of input as Array<Record<string, unknown>>) {
    const resourceId = Number(raw.resourceId);
    const templateId = Number(raw.templateId);
    const templateName = String(raw.templateName || '').trim();
    if (!Number.isFinite(resourceId) || !Number.isFinite(templateId) || !templateName) continue;
    out.push({
      resourceId,
      templateId,
      templateName,
      module: raw.module ? String(raw.module) : undefined,
      isGroupReport: raw.isGroupReport === true,
    });
  }
  const seen = new Set<string>();
  return out.filter((r) => {
    const k = `${r.resourceId}:${r.templateId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export class TenantFuelModuleConfigService {
  static async getConfig(tenantId: string): Promise<TenantFuelModuleConfig> {
    const { rows } = await query<{
      selected_reports: unknown;
      visible_columns: unknown;
      updated_at: string;
    }>(
      `SELECT selected_reports, visible_columns, updated_at
       FROM tenant_fuel_module_configs
       WHERE tenant_id = $1`,
      [tenantId],
    );
    const row = rows[0];
    return {
      tenantId,
      selectedReports: sanitizeReports(row?.selected_reports),
      visibleColumns: sanitizeColumns(row?.visible_columns),
      updatedAt: row?.updated_at || null,
    };
  }

  static async saveConfig(
    tenantId: string,
    input: { selectedReports?: unknown; visibleColumns?: unknown },
  ): Promise<TenantFuelModuleConfig> {
    const selectedReports = sanitizeReports(input.selectedReports);
    const visibleColumns = sanitizeColumns(input.visibleColumns);
    await query(
      `INSERT INTO tenant_fuel_module_configs (tenant_id, selected_reports, visible_columns, updated_at)
       VALUES ($1, $2::jsonb, $3::jsonb, NOW())
       ON CONFLICT (tenant_id)
       DO UPDATE SET selected_reports = EXCLUDED.selected_reports,
                     visible_columns = EXCLUDED.visible_columns,
                     updated_at = NOW()`,
      [tenantId, JSON.stringify(selectedReports), JSON.stringify(visibleColumns)],
    );
    return this.getConfig(tenantId);
  }
}

