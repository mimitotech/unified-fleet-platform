/** Normalize Wialon report table rows into flat objects for the client. */

export type WialonReportColumn = { key: string; label: string; type?: string };

export type WialonReportTableResult = {
  index: number;
  name: string;
  label: string;
  columns: WialonReportColumn[];
  rows: Record<string, unknown>[];
  totalRows: number;
};

export type WialonReportChartResult = {
  index: number;
  name: string;
  data: unknown;
};

function cellValue(cell: unknown): unknown {
  if (cell == null) return null;
  if (typeof cell === 'object' && cell !== null) {
    const o = cell as Record<string, unknown>;
    if ('t' in o) return o.t;
    if ('v' in o) return o.v;
    if ('y' in o && 'x' in o) return cell;
  }
  return cell;
}

function defaultColumns(count: number, tableLabel: string): WialonReportColumn[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `col_${i}`,
    label: i === 0 ? tableLabel : `Column ${i + 1}`,
  }));
}

export function parseWialonReportRow(
  row: unknown,
  columns: WialonReportColumn[]
): Record<string, unknown> {
  if (row && typeof row === 'object' && !Array.isArray(row)) {
    const r = row as Record<string, unknown>;
    if (Array.isArray(r.c)) {
      const out: Record<string, unknown> = {};
      (r.c as unknown[]).forEach((cell, i) => {
        const col = columns[i] || { key: `col_${i}`, label: `Column ${i + 1}` };
        out[col.key] = cellValue(cell);
      });
      return out;
    }
    if (Array.isArray(r.cells)) {
      const out: Record<string, unknown> = {};
      (r.cells as unknown[]).forEach((cell, i) => {
        const col = columns[i] || { key: `col_${i}`, label: `Column ${i + 1}` };
        out[col.key] = cellValue(cell);
      });
      return out;
    }
    return r;
  }
  if (Array.isArray(row)) {
    const out: Record<string, unknown> = {};
    row.forEach((cell, i) => {
      const col = columns[i] || { key: `col_${i}`, label: `Column ${i + 1}` };
      out[col.key] = cellValue(cell);
    });
    return out;
  }
  return { value: row };
}

export function columnsFromTableMeta(
  table: Record<string, unknown>,
  tableLabel: string
): WialonReportColumn[] {
  const header = table.header as Array<{ n?: string; name?: string; type?: string }> | undefined;
  if (header?.length) {
    return header.map((h, i) => ({
      key: `col_${i}`,
      label: String(h.n ?? h.name ?? `Column ${i + 1}`),
      type: h.type,
    }));
  }
  const colCount = Number(table.columns ?? table.cols ?? 0);
  if (colCount > 0) return defaultColumns(colCount, tableLabel);
  return [];
}

export function inferColumnsFromRows(
  rows: Record<string, unknown>[],
  fallback: WialonReportColumn[]
): WialonReportColumn[] {
  if (fallback.length) return fallback;
  const first = rows[0];
  if (!first) return [];
  return Object.keys(first).map((k) => ({ key: k, label: k.replace(/_/g, ' ') }));
}
