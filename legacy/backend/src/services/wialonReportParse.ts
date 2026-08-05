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

function headerLabel(h: unknown, i: number, ht?: (string | number)[]): string {
  if (typeof h === 'string' || typeof h === 'number') {
    const s = String(h).trim();
    if (s) return s;
  }
  if (h && typeof h === 'object') {
    const o = h as { n?: string; name?: string; label?: string };
    const s = String(o.n ?? o.name ?? o.label ?? '').trim();
    if (s) return s;
  }
  const typeHint = ht?.[i] != null ? String(ht[i]).replace(/_/g, ' ') : '';
  return typeHint || `Column ${i + 1}`;
}

export function columnsFromTableMeta(
  table: Record<string, unknown>,
  tableLabel: string
): WialonReportColumn[] {
  const raw = table.header;
  const ht = table.header_type as (string | number)[] | undefined;
  if (Array.isArray(raw) && raw.length) {
    return raw.map((h, i) => {
      const label = headerLabel(h, i, ht);
      const type =
        typeof h === 'object' && h && 'type' in h
          ? String((h as { type?: string }).type ?? '')
          : ht?.[i] != null
            ? String(ht[i])
            : undefined;
      return { key: `col_${i}`, label: label || `Column ${i + 1}`, type: type || undefined };
    });
  }
  // Some Wialon builds only return header_type without header strings.
  if (Array.isArray(ht) && ht.length) {
    return ht.map((t, i) => ({
      key: `col_${i}`,
      label: String(t || '').replace(/_/g, ' ') || (i === 0 ? tableLabel : `Column ${i + 1}`),
      type: t != null ? String(t) : undefined,
    }));
  }
  const colCount = Number(table.columns ?? table.cols ?? 0);
  if (colCount > 0) return defaultColumns(colCount, tableLabel);
  return [];
}

/** Flatten multilevel report rows (`r` children) into display order for preview. */
export function flattenReportRows(rows: unknown[]): unknown[] {
  const out: unknown[] = [];
  const walk = (row: unknown) => {
    if (!row || typeof row !== 'object') return;
    const r = row as { c?: unknown[]; cells?: unknown[]; r?: unknown[] };
    const hasCells = Array.isArray(r.c) || Array.isArray(r.cells) || Array.isArray(row);
    const kids = Array.isArray(r.r) ? r.r : [];
    if (hasCells) out.push(row);
    if (kids.length) {
      for (const child of kids) walk(child);
    }
  };
  for (const row of rows) walk(row);
  return out.length ? out : rows;
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

const SUMMARY_LABEL_RE = /^(total|totals|summary|итого|всего|all units|fleet|grand total)$/i;

function cellText(cell: unknown): string {
  const v = cellValue(cell);
  return v == null ? '' : String(v).trim();
}

function firstCellText(row: unknown): string {
  if (!row || typeof row !== 'object') return '';
  const r = row as { c?: unknown[]; cells?: unknown[] };
  if (Array.isArray(r.c) && r.c.length) return cellText(r.c[0]);
  if (Array.isArray(r.cells) && r.cells.length) return cellText(r.cells[0]);
  if (Array.isArray(row) && row.length) return cellText(row[0]);
  return '';
}

function looksLikeDateOrTime(label: string): boolean {
  return /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(label) || /^\d{1,2}:\d{2}/.test(label);
}

function labelMatchesActiveUnit(label: string, activeNames: Set<string>): boolean {
  const lower = label.toLowerCase();
  if (activeNames.has(lower)) return true;
  for (const name of activeNames) {
    if (lower === name || lower.includes(name) || name.includes(lower)) return true;
  }
  return false;
}

/**
 * Drop deactivated / removed unit trees from raw Wialon report rows.
 * Keeps summary rows and event rows that do not name a unit in the first cell.
 */
export function filterRawReportRowsToActiveUnits(
  rawRows: unknown[],
  activeNames: Set<string>,
): unknown[] {
  if (!activeNames.size || !rawRows.length) return rawRows;
  return rawRows.filter((row) => {
    const label = firstCellText(row);
    if (!label || SUMMARY_LABEL_RE.test(label) || looksLikeDateOrTime(label)) return true;
    return labelMatchesActiveUnit(label, activeNames);
  });
}

/** Filter parsed report table rows to currently active Wialon units only. */
export function filterParsedReportRowsToActiveUnits(
  rows: Record<string, unknown>[],
  columns: WialonReportColumn[],
  activeNames: Set<string>,
): Record<string, unknown>[] {
  if (!activeNames.size || !rows.length) return rows;

  const unitCol =
    columns.find((c) => /group|unit|object|grouping|name|vehicle|asset|генератор/i.test(c.label)) ??
    columns[0];

  return rows.filter((row) => {
    const fromCol = unitCol ? row[unitCol.key] : undefined;
    const label =
      (fromCol != null && String(fromCol).trim()) ||
      String(row.unitName ?? row.unit ?? row.Grouping ?? row.grouping ?? row.name ?? '').trim();
    if (!label || SUMMARY_LABEL_RE.test(label) || looksLikeDateOrTime(label)) return true;
    return labelMatchesActiveUnit(label, activeNames);
  });
}
