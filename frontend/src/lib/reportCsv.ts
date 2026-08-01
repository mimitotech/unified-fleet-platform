/**
 * Shared branded CSV builder for all module / live / Wialon report exports.
 * Produces Excel-friendly UTF-8 CSVs with a full title/meta block, then data.
 */

import { format } from 'date-fns';

function makeReportRef(d: Date = new Date()): string {
  return `RPT-${format(d, 'yyyyMMdd-HHmmss')}`;
}

export type ReportCsvColumn = {
  key: string;
  label: string;
};

export type ReportCsvKpi = {
  label: string;
  value: string | number;
};

export type ReportCsvMeta = {
  title: string;
  moduleLabel?: string;
  clientName?: string;
  periodLabel?: string;
  objectLabel?: string;
  generatedAt?: Date | string | number;
  reportRef?: string;
  notes?: string[];
  kpis?: ReportCsvKpi[];
  filters?: Array<{ label: string; value: string }>;
  extraMeta?: Array<{ label: string; value: string }>;
};

export type ReportCsvSection = {
  name: string;
  columns: ReportCsvColumn[];
  rows: Record<string, unknown>[];
};

export type ReportCsvFormatCell = (
  key: string,
  value: unknown,
  row: Record<string, unknown>,
) => string | number | boolean | null | undefined;

const UTF8_BOM = '\uFEFF';

/** RFC-style CSV cell escaping. */
export function escapeCsvCell(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'object') {
    try {
      return escapeCsvCell(JSON.stringify(value));
    } catch {
      return '';
    }
  }
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function resolveGeneratedAt(value?: Date | string | number): Date {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? new Date() : value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }
  if (typeof value === 'string' && value.trim()) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }
  return new Date();
}

function metaRow(label: string, value: string | number | undefined | null): string {
  if (value == null || value === '') return '';
  return `${escapeCsvCell(label)},${escapeCsvCell(value)}`;
}

function buildMetaBlock(meta: ReportCsvMeta, dataRowCount: number): string[] {
  const generated = resolveGeneratedAt(meta.generatedAt);
  const ref = meta.reportRef || makeReportRef(generated);
  const lines: string[] = [
    metaRow('Report', meta.title),
    metaRow('Client', meta.clientName || 'Client'),
    metaRow('Module', meta.moduleLabel),
    metaRow('Period', meta.periodLabel),
    metaRow('Object', meta.objectLabel || 'All'),
    metaRow('Generated', format(generated, 'yyyy-MM-dd HH:mm:ss')),
    metaRow('Reference', ref),
    metaRow('Data rows', dataRowCount),
  ].filter(Boolean);

  for (const item of meta.extraMeta || []) {
    const row = metaRow(item.label, item.value);
    if (row) lines.push(row);
  }
  for (const f of meta.filters || []) {
    const row = metaRow(`Filter: ${f.label}`, f.value);
    if (row) lines.push(row);
  }
  for (const kpi of meta.kpis || []) {
    const row = metaRow(`KPI: ${kpi.label}`, kpi.value);
    if (row) lines.push(row);
  }
  for (const note of meta.notes || []) {
    if (note?.trim()) lines.push(metaRow('Note', note.trim()));
  }

  return lines;
}

function defaultCellValue(value: unknown): string | number | boolean | null | undefined {
  if (value == null) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function sectionLines(
  columns: ReportCsvColumn[],
  rows: Record<string, unknown>[],
  formatCell?: ReportCsvFormatCell,
): string[] {
  if (!columns.length) return [];
  const header = columns.map((c) => escapeCsvCell(c.label)).join(',');
  const body = rows.map((row) =>
    columns
      .map((c) => {
        const raw = formatCell ? formatCell(c.key, row[c.key], row) : defaultCellValue(row[c.key]);
        return escapeCsvCell(raw);
      })
      .join(','),
  );
  return [header, ...body];
}

/** Single-table branded CSV (meta + blank + headers + rows). */
export function buildReportCsv(opts: {
  meta: ReportCsvMeta;
  columns: ReportCsvColumn[];
  rows: Record<string, unknown>[];
  formatCell?: ReportCsvFormatCell;
}): string {
  const { meta, columns, rows, formatCell } = opts;
  const lines = [
    ...buildMetaBlock(meta, rows.length),
    '',
    ...sectionLines(columns, rows, formatCell),
    '',
  ];
  return lines.join('\n');
}

/** Multi-table branded CSV with named sections. */
export function buildMultiSectionReportCsv(opts: {
  meta: ReportCsvMeta;
  sections: ReportCsvSection[];
  formatCell?: ReportCsvFormatCell;
}): string {
  const { meta, sections, formatCell } = opts;
  const totalRows = sections.reduce((n, s) => n + s.rows.length, 0);
  const lines: string[] = [...buildMetaBlock(meta, totalRows), ''];

  sections.forEach((section, index) => {
    if (index > 0) lines.push('');
    lines.push(metaRow('Table', section.name));
    lines.push(metaRow('Table rows', section.rows.length));
    lines.push('');
    lines.push(...sectionLines(section.columns, section.rows, formatCell));
  });

  lines.push('');
  return lines.join('\n');
}

/** Download with UTF-8 BOM so Excel opens special characters correctly. */
export function downloadReportCsv(content: string, filename: string) {
  const name = filename.toLowerCase().endsWith('.csv') ? filename : `${filename}.csv`;
  const body = content.startsWith(UTF8_BOM) ? content : `${UTF8_BOM}${content}`;
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Infer columns from first row keys when Wialon (or similar) omits column defs. */
export function columnsFromRows(
  rows: Record<string, unknown>[],
  preferred?: ReportCsvColumn[],
): ReportCsvColumn[] {
  if (preferred?.length) return preferred;
  const first = rows[0];
  if (!first) return [];
  return Object.keys(first).map((key) => ({
    key,
    label: key
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, (c) => c.toUpperCase()),
  }));
}
