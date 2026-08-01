import { buildReportCsv, columnsFromRows } from '@/lib/reportCsv';

export type WialonReportColumn = { key: string; label: string; type?: string };

export type WialonReportTable = {
  index: number;
  name: string;
  label: string;
  columns: WialonReportColumn[];
  rows: Record<string, unknown>[];
  totalRows: number;
};

export type WialonReportChart = {
  index: number;
  name: string;
  data: unknown;
};

export type WialonReportResult = {
  result: Record<string, unknown>;
  rows: Record<string, unknown>[];
  tables: WialonReportTable[];
  charts: WialonReportChart[];
  summary: {
    tableCount: number;
    rowCount: number;
    chartCount: number;
    generatedAt: string;
    interval: { from: number; to: number };
  };
};

export type WialonReportTemplate = {
  resourceId: number;
  resourceName: string;
  id: number;
  name: string;
  type?: string;
};

export type ReportRunParams = {
  reportResourceId: number;
  reportTemplateId: number;
  reportObjectId: number;
  from: number;
  to: number;
  reportObjectSecId?: number;
};

export type ReportDatePreset = 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'custom';

export function reportPresetRange(preset: ReportDatePreset, customFrom?: Date, customTo?: Date): { from: number; to: number } {
  const now = new Date();
  const end = new Date(now);
  end.setSeconds(59, 999);
  let start = new Date(now);

  switch (preset) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case 'yesterday':
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    case 'last7':
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      break;
    case 'last30':
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      break;
    case 'thisMonth':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'custom':
      if (customFrom && customTo) {
        return { from: Math.floor(customFrom.getTime() / 1000), to: Math.floor(customTo.getTime() / 1000) };
      }
      start.setDate(start.getDate() - 7);
      break;
  }

  return { from: Math.floor(start.getTime() / 1000), to: Math.floor(end.getTime() / 1000) };
}

export function formatReportCell(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Prefer buildReportCsv / downloadReportCsv from reportCsv.ts for new callers. */
export function tableToCsv(table: WialonReportTable, meta?: {
  title?: string;
  moduleLabel?: string;
  clientName?: string;
  periodLabel?: string;
  objectLabel?: string;
  generatedAt?: Date | string;
}): string {
  const columns = columnsFromRows(
    table.rows,
    table.columns.length
      ? table.columns.map((c) => ({ key: c.key, label: c.label }))
      : undefined,
  );
  return buildReportCsv({
    meta: {
      title: meta?.title || table.label || table.name || 'Report',
      moduleLabel: meta?.moduleLabel,
      clientName: meta?.clientName,
      periodLabel: meta?.periodLabel,
      objectLabel: meta?.objectLabel,
      generatedAt: meta?.generatedAt,
      extraMeta: table.name ? [{ label: 'Source table', value: table.name }] : undefined,
    },
    columns,
    rows: table.rows,
  });
}

export function downloadTextFile(content: string, filename: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function numericColumns(table: WialonReportTable): { key: string; label: string; sum: number; avg: number }[] {
  const cols = table.columns.length
    ? table.columns
    : table.rows[0]
      ? Object.keys(table.rows[0]).map((k) => ({ key: k, label: k }))
      : [];

  return cols
    .map((col) => {
      const nums = table.rows
        .map((r) => r[col.key])
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      if (nums.length < 2) return null;
      const sum = nums.reduce((a, b) => a + b, 0);
      return { key: col.key, label: col.label, sum, avg: sum / nums.length };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
}
