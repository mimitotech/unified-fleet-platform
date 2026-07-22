import type { WialonReportColumn, WialonReportTable } from '@/lib/reportUtils';

export type FuelPerformanceMetric = {
  sourceKey: string;
  key: string;
  label: string;
  mode: 'sum' | 'average';
  color: string;
};

export type FuelPerformanceBarRow = {
  asset: string;
  fullAsset: string;
  [key: string]: string | number;
};

export type FuelPerformanceLineRow = {
  label: string;
  fullLabel: string;
  sortKey: number;
  [key: string]: string | number | null;
};

export type FuelPerformanceChartsData = {
  metrics: FuelPerformanceMetric[];
  barRows: FuelPerformanceBarRow[];
  lineRows: FuelPerformanceLineRow[];
  lineSeries: Array<{ key: string; label: string; color: string }>;
  primaryMetricLabel: string;
  assetLabel: string;
  lineAxisLabel: string;
};

export type FuelPerformancePeriod = {
  from: number;
  to: number;
};

export type FuelPerformanceMetricOption = {
  sourceKey: string;
  label: string;
  mode: 'sum' | 'average';
  score: number;
};

export type FuelPerformanceOptions = {
  period?: FuelPerformancePeriod | null;
  /** Ordered metric source keys — first drives ranking + line chart. */
  metricSourceKeys?: string[];
};

const COLORS = ['#004225', '#d97706', '#2563eb'];
const SERIES_COLORS = ['#004225', '#d97706', '#6d28d9', '#0f766e', '#2563eb'];
const SUMMARY_RE = /^(total|totals|summary|grand total|all units|fleet|итого|всего)$/i;
const ASSET_RE = /unit|asset|vehicle|object|generator|machin|equipment|registration|plate|name|grouping/i;
const TIME_RE = /date|time|day|period|start|end|interval|activity/i;
const EXCLUDED_NUMERIC_RE =
  /(^|[^a-z])(id|latitude|longitude|coordinate|timestamp|unix|year|month|day of|row|index)([^a-z]|$)/i;
const AVERAGE_RE = /average|avg|mean|rate|ratio|percent|%|per 100|consumption|speed|level|temperature/i;
const PERFORMANCE_PRIORITY = [
  /fuel used|consum/i,
  /mileage|distance/i,
  /engine hour|duration|hours/i,
  /filled|filling|refuel/i,
  /drain|theft|drop/i,
  /trip|activity|count/i,
  /speed|efficien/i,
  /level|percent|%/i,
];

function columnsFor(table: WialonReportTable): WialonReportColumn[] {
  if (table.columns.length) return table.columns;
  const first = table.rows[0];
  return first
    ? Object.keys(first).map((key) => ({ key, label: key.replace(/_/g, ' ') }))
    : [];
}

function text(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') return '';
  return String(value).trim();
}

/** Parse Wialon numbers such as "1 234.5 L", "18,2 km" and "42%". */
export function reportNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  let raw = value.trim().replace(/\u00a0/g, ' ');
  if (!raw || /^\d{1,2}:\d{2}(:\d{2})?$/.test(raw)) return null;
  // Avoid treating date-like strings as metrics.
  if (/^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/.test(raw)) return null;
  raw = raw.replace(/\s/g, '');
  const match = raw.match(/[-+]?\d[\d.,]*/);
  if (!match) return null;
  let numeric = match[0];
  const comma = numeric.lastIndexOf(',');
  const dot = numeric.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    numeric =
      comma > dot
        ? numeric.replace(/\./g, '').replace(',', '.')
        : numeric.replace(/,/g, '');
  } else if (comma >= 0) {
    const decimals = numeric.length - comma - 1;
    numeric = decimals > 0 && decimals <= 2 ? numeric.replace(',', '.') : numeric.replace(/,/g, '');
  }
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Best-effort chronological key for Wialon date/time cells.
 * Supports ISO, dd.mm.yyyy, dd/mm/yyyy, unix seconds/ms, and plain times.
 */
export function reportChronoKey(value: unknown, rowIndex = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Unix seconds vs milliseconds.
    if (value > 1e11) return value;
    if (value > 1e9) return value * 1000;
    return value;
  }

  const raw = text(value);
  if (!raw) return rowIndex;

  // dd.mm.yyyy[ hh:mm[:ss]] or dd/mm/yyyy
  const eu = raw.match(
    /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (eu) {
    const day = Number(eu[1]);
    const month = Number(eu[2]);
    let year = Number(eu[3]);
    if (year < 100) year += 2000;
    const hour = Number(eu[4] || 0);
    const minute = Number(eu[5] || 0);
    const second = Number(eu[6] || 0);
    const ms = Date.UTC(year, month - 1, day, hour, minute, second);
    if (Number.isFinite(ms)) return ms;
  }

  // yyyy-mm-dd[ hh:mm[:ss]]
  const iso = raw.match(
    /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (iso) {
    const ms = Date.UTC(
      Number(iso[1]),
      Number(iso[2]) - 1,
      Number(iso[3]),
      Number(iso[4] || 0),
      Number(iso[5] || 0),
      Number(iso[6] || 0),
    );
    if (Number.isFinite(ms)) return ms;
  }

  // Time-only HH:mm[:ss]
  const timeOnly = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (timeOnly) {
    return (
      Number(timeOnly[1]) * 3_600_000 +
      Number(timeOnly[2]) * 60_000 +
      Number(timeOnly[3] || 0) * 1000
    );
  }

  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) return parsed;

  // Stable fallback so identical labels stay grouped and original row order is preserved.
  return rowIndex;
}

function formatChronoLabel(raw: string, sortKey: number, grain: 'day' | 'time' | 'raw'): string {
  if (!raw) return '';
  if (grain === 'day' && Number.isFinite(sortKey) && sortKey > 1e11) {
    return new Date(sortKey).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  if (grain === 'time' && /^\d{1,2}:\d{2}/.test(raw)) return raw.slice(0, 5);
  if (Number.isFinite(sortKey) && sortKey > 1e11) {
    const d = new Date(sortKey);
    if (!Number.isNaN(d.getTime())) {
      const hasTime = /\d{1,2}:\d{2}/.test(raw);
      return hasTime
        ? d.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
  }
  return shortLabel(raw, 14);
}

/** Bucket timestamps so duration charts form a continuous sequence. */
function chronoGrain(sortKeys: number[]): 'day' | 'time' | 'raw' {
  const dated = sortKeys.filter((key) => key > 1e11);
  if (dated.length < 2) {
    const timed = sortKeys.filter((key) => key >= 0 && key < 86_400_000);
    return timed.length >= Math.max(2, sortKeys.length * 0.5) ? 'time' : 'raw';
  }
  const min = Math.min(...dated);
  const max = Math.max(...dated);
  // Multi-day duration → daily flow; same-day report → keep clock order.
  return max - min >= 20 * 3_600_000 ? 'day' : 'time';
}

function bucketChrono(sortKey: number, grain: 'day' | 'time' | 'raw'): number {
  if (!Number.isFinite(sortKey)) return 0;
  if (grain === 'day' && sortKey > 1e11) {
    const d = new Date(sortKey);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  if (grain === 'time' && sortKey > 1e11) {
    // Keep hour resolution for same-day duration flows.
    const d = new Date(sortKey);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours());
  }
  return sortKey;
}

function dayLabel(sortKey: number): string {
  return new Date(sortKey).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function eachUtcDay(fromMs: number, toMs: number): number[] {
  const start = new Date(fromMs);
  const end = new Date(toMs);
  const cur = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const out: number[] = [];
  for (let t = cur; t <= last; t += 86_400_000) out.push(t);
  return out;
}

/**
 * Keep enough points to show the full duration without crowding:
 * always preserve first/last and sample evenly in between.
 */
function sampleTimeline<T extends { sortKey: number }>(rows: T[], maxPoints = 24): T[] {
  if (rows.length <= maxPoints) return rows;
  const out: T[] = [];
  const last = rows.length - 1;
  const seen = new Set<number>();
  for (let i = 0; i < maxPoints; i++) {
    const index = i === maxPoints - 1 ? last : Math.round((i * last) / (maxPoints - 1));
    if (seen.has(index)) continue;
    seen.add(index);
    out.push(rows[index]);
  }
  return out;
}

function numericCoverage(table: WialonReportTable, col: WialonReportColumn): number {
  if (!table.rows.length) return 0;
  const found = table.rows.reduce(
    (count, row) => count + (reportNumber(row[col.key]) != null ? 1 : 0),
    0,
  );
  return found / table.rows.length;
}

function metricScore(col: WialonReportColumn, coverage: number): number {
  const label = `${col.label} ${col.type || ''}`;
  if (EXCLUDED_NUMERIC_RE.test(label)) return -100;
  const priority = PERFORMANCE_PRIORITY.findIndex((re) => re.test(label));
  return coverage * 10 + (priority < 0 ? 0 : (PERFORMANCE_PRIORITY.length - priority) * 4);
}

function metricKey(index: number): string {
  return `metric${index}`;
}

function toMetric(
  option: FuelPerformanceMetricOption,
  index: number,
): FuelPerformanceMetric {
  return {
    sourceKey: option.sourceKey,
    key: metricKey(index),
    label: option.label,
    mode: option.mode,
    color: COLORS[index % COLORS.length],
  };
}

/** All numeric performance columns available for the metric picker. */
export function discoverFuelPerformanceMetrics(
  table: WialonReportTable,
): FuelPerformanceMetricOption[] {
  const columns = columnsFor(table);
  const found = columns
    .map((col) => {
      const coverage = numericCoverage(table, col);
      const score = metricScore(col, coverage);
      return {
        sourceKey: col.key,
        label: col.label,
        mode: (AVERAGE_RE.test(`${col.label} ${col.type || ''}`) ? 'average' : 'sum') as
          | 'sum'
          | 'average',
        score,
        coverage,
      };
    })
    .filter((item) => item.coverage >= 0.08 && item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ sourceKey, label, mode, score }) => ({ sourceKey, label, mode, score }));

  if (found.length) return found;
  if (!table.rows.length) return [];
  return [
    {
      sourceKey: '__activityCount',
      label: 'Activities',
      mode: 'sum',
      score: 1,
    },
  ];
}

function resolveMetrics(
  table: WialonReportTable,
  selectedSourceKeys?: string[],
): FuelPerformanceMetric[] {
  const options = discoverFuelPerformanceMetrics(table);
  if (!options.length) return [];

  const byKey = new Map(options.map((option) => [option.sourceKey, option]));
  const picked: FuelPerformanceMetricOption[] = [];

  for (const key of selectedSourceKeys || []) {
    const option = byKey.get(key);
    if (option && !picked.some((item) => item.sourceKey === option.sourceKey)) {
      picked.push(option);
    }
    if (picked.length >= 3) break;
  }

  if (!picked.length) {
    return options.slice(0, Math.min(3, options.length)).map(toMetric);
  }

  // Keep selected primary first; if only one chosen, still fine for both charts.
  return picked.map(toMetric);
}

function chooseAssetColumn(
  table: WialonReportTable,
  columns: WialonReportColumn[],
  metricKeys: Set<string>,
): WialonReportColumn | null {
  const explicit = columns.find(
    (col) =>
      !metricKeys.has(col.key) &&
      ASSET_RE.test(`${col.label} ${col.type || ''}`) &&
      !TIME_RE.test(col.label),
  );
  if (explicit) return explicit;
  return (
    columns.find((col) => {
      if (metricKeys.has(col.key) || TIME_RE.test(col.label)) return false;
      const values = table.rows.map((row) => text(row[col.key])).filter(Boolean);
      return values.length > 0 && new Set(values).size <= Math.max(20, values.length * 0.8);
    }) ?? null
  );
}

function chooseTimeColumn(
  table: WialonReportTable,
  columns: WialonReportColumn[],
  excluded: Set<string>,
): WialonReportColumn | null {
  const scored = columns
    .filter((col) => !excluded.has(col.key))
    .map((col) => {
      const labelHit = TIME_RE.test(`${col.label} ${col.type || ''}`) ? 5 : 0;
      const sampleHit = table.rows.slice(0, 12).reduce((n, row) => {
        const value = text(row[col.key]);
        if (!value) return n;
        if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(value)) return n + 2;
        if (/^\d{1,2}[./]\d{1,2}[./]\d{2,4}/.test(value)) return n + 2;
        if (/^\d{1,2}:\d{2}/.test(value)) return n + 1;
        return n;
      }, 0);
      return { col, score: labelHit + sampleHit };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.col ?? null;
}

function shortLabel(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function aggregateMetric(
  rows: Record<string, unknown>[],
  metric: FuelPerformanceMetric,
): number {
  if (metric.sourceKey === '__activityCount') return rows.length;
  const values = rows
    .map((row) => reportNumber(row[metric.sourceKey]))
    .filter((value): value is number => value != null);
  if (!values.length) return 0;
  const sum = values.reduce((total, value) => total + value, 0);
  return rounded(metric.mode === 'average' ? sum / values.length : sum);
}

function rowMetric(row: Record<string, unknown>, metric: FuelPerformanceMetric): number {
  if (metric.sourceKey === '__activityCount') return 1;
  return reportNumber(row[metric.sourceKey]) ?? 0;
}

function rowChrono(
  row: Record<string, unknown>,
  timeColumn: WialonReportColumn | null,
  fallbackColumn: WialonReportColumn | null,
  index: number,
  grain: 'day' | 'time' | 'raw',
): { label: string; fullLabel: string; sortKey: number } {
  const raw =
    text(row[timeColumn?.key || '']) ||
    text(row[fallbackColumn?.key || '']) ||
    String(index + 1);
  const rawKey = reportChronoKey(
    text(row[timeColumn?.key || '']) || text(row[fallbackColumn?.key || '']) || index,
    index,
  );
  const sortKey = bucketChrono(rawKey, grain);
  return {
    fullLabel: raw,
    label: formatChronoLabel(raw, sortKey, grain) || String(index + 1),
    sortKey,
  };
}

/** Keep source rows in chronological order when a date/time column exists. */
function sortRowsChronologically(
  rows: Record<string, unknown>[],
  timeColumn: WialonReportColumn | null,
): Record<string, unknown>[] {
  if (!timeColumn) return rows;
  return [...rows]
    .map((row, index) => ({ row, index, sortKey: reportChronoKey(row[timeColumn.key], index) }))
    .sort((a, b) => a.sortKey - b.sortKey || a.index - b.index)
    .map((item) => item.row);
}

function addMetricValue(
  values: Map<string, number>,
  counts: Map<string, number>,
  key: string,
  sortKey: number,
  value: number,
  mode: 'sum' | 'average',
) {
  const mapKey = `${key}::${sortKey}`;
  const countKey = `${mapKey}__n`;
  const prev = values.get(mapKey) || 0;
  const n = (counts.get(countKey) || 0) + 1;
  counts.set(countKey, n);
  values.set(
    mapKey,
    mode === 'average' ? rounded((prev * (n - 1) + value) / n) : rounded(prev + value),
  );
}

export function buildFuelPerformanceCharts(
  table: WialonReportTable,
  fallbackAsset = 'Selected asset',
  options?: FuelPerformanceOptions | FuelPerformancePeriod | null,
): FuelPerformanceChartsData {
  const normalized: FuelPerformanceOptions =
    options == null
      ? {}
      : typeof options === 'object' && 'from' in options && 'to' in options && !('period' in options) && !('metricSourceKeys' in options)
        ? { period: options as FuelPerformancePeriod }
        : (options as FuelPerformanceOptions);

  const period = normalized.period;
  const metrics = resolveMetrics(table, normalized.metricSourceKeys);
  if (!metrics.length) {
    return {
      metrics: [],
      barRows: [],
      lineRows: [],
      lineSeries: [],
      primaryMetricLabel: 'Performance',
      assetLabel: 'Asset',
      lineAxisLabel: 'Activity',
    };
  }

  const columns = columnsFor(table);
  const metricKeys = new Set(metrics.map((metric) => metric.sourceKey));
  const assetColumn = chooseAssetColumn(table, columns, metricKeys);
  const timeColumn = chooseTimeColumn(
    table,
    columns,
    new Set([...metricKeys, ...(assetColumn ? [assetColumn.key] : [])]),
  );
  const activityColumn =
    columns.find(
      (col) =>
        !metricKeys.has(col.key) &&
        col.key !== assetColumn?.key &&
        col.key !== timeColumn?.key,
    ) ?? null;

  const orderedRows = sortRowsChronologically(table.rows, timeColumn);

  const chronoSeeds = orderedRows.map((row, index) =>
    reportChronoKey(timeColumn ? row[timeColumn.key] : index, index),
  );
  if (period?.from && period?.to) {
    chronoSeeds.push(period.from * 1000, period.to * 1000);
  }
  const grain = chronoGrain(chronoSeeds);

  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of orderedRows) {
    const fromRow = text(row[assetColumn?.key || '']);
    if (fromRow && SUMMARY_RE.test(fromRow)) continue;
    const asset = fromRow || fallbackAsset;
    const group = groups.get(asset) ?? [];
    group.push(row);
    groups.set(asset, group);
  }

  const barRows = [...groups.entries()]
    .map(([fullAsset, rows]) => {
      const out: FuelPerformanceBarRow = {
        asset: shortLabel(fullAsset, groups.size > 7 ? 9 : 13),
        fullAsset,
      };
      metrics.forEach((metric) => {
        out[metric.key] = aggregateMetric(rows, metric);
      });
      return out;
    })
    .sort((a, b) => {
      const diff = Number(b[metrics[0].key]) - Number(a[metrics[0].key]);
      if (diff !== 0) return diff;
      return a.fullAsset.localeCompare(b.fullAsset, undefined, { sensitivity: 'base' });
    })
    .slice(0, 10);

  const primary = metrics[0];
  const groupEntries = [...groups.entries()]
    .sort((a, b) => {
      const diff = aggregateMetric(b[1], primary) - aggregateMetric(a[1], primary);
      if (diff !== 0) return diff;
      return a[0].localeCompare(b[0], undefined, { sensitivity: 'base' });
    })
    .slice(0, 5);

  let lineRows: FuelPerformanceLineRow[] = [];
  let lineSeries: FuelPerformanceChartsData['lineSeries'] = [];

  const useTimeline =
    Boolean(timeColumn) ||
    (period?.from != null && period?.to != null) ||
    orderedRows.length > groupEntries.length;

  if (groupEntries.length > 1 && useTimeline) {
    lineSeries = groupEntries.map(([asset], seriesIndex) => ({
      key: `series${seriesIndex}`,
      label: shortLabel(asset, 14),
      color: SERIES_COLORS[seriesIndex],
    }));

    const spine = new Map<number, { label: string; fullLabel: string; sortKey: number }>();
    const values = new Map<string, number>();
    const counts = new Map<string, number>();

    if (grain === 'day' && period?.from && period?.to) {
      for (const day of eachUtcDay(period.from * 1000, period.to * 1000)) {
        spine.set(day, { label: dayLabel(day), fullLabel: dayLabel(day), sortKey: day });
      }
    }

    groupEntries.forEach(([, rows], seriesIndex) => {
      const seriesKey = `series${seriesIndex}`;
      sortRowsChronologically(rows, timeColumn).forEach((row, index) => {
        const point = rowChrono(row, timeColumn, activityColumn, index, grain);
        if (!spine.has(point.sortKey)) {
          spine.set(point.sortKey, {
            label: point.label,
            fullLabel: point.fullLabel,
            sortKey: point.sortKey,
          });
        }
        addMetricValue(values, counts, seriesKey, point.sortKey, rowMetric(row, primary), primary.mode);
      });
    });

    lineRows = sampleTimeline(
      [...spine.values()]
        .sort((a, b) => a.sortKey - b.sortKey)
        .map((slot) => {
          const row: FuelPerformanceLineRow = {
            label: slot.label,
            fullLabel: slot.fullLabel,
            sortKey: slot.sortKey,
          };
          lineSeries.forEach((series) => {
            row[series.key] = values.get(`${series.key}::${slot.sortKey}`) ?? 0;
          });
          return row;
        }),
      28,
    );
  } else if (groupEntries.length > 1) {
    lineSeries = metrics.map((metric, index) => ({
      key: metric.key,
      label: metric.label,
      color: SERIES_COLORS[index],
    }));
    lineRows = barRows.map((row, index) => {
      const point: FuelPerformanceLineRow = {
        label: row.asset,
        fullLabel: row.fullAsset,
        sortKey: index,
      };
      metrics.forEach((metric) => {
        point[metric.key] = Number(row[metric.key] || 0);
      });
      return point;
    });
  } else {
    lineSeries = metrics.map((metric, index) => ({
      key: metric.key,
      label: metric.label,
      color: SERIES_COLORS[index],
    }));

    const spine = new Map<number, { label: string; fullLabel: string; sortKey: number }>();
    const values = new Map<string, number>();
    const counts = new Map<string, number>();

    if (grain === 'day' && period?.from && period?.to) {
      for (const day of eachUtcDay(period.from * 1000, period.to * 1000)) {
        spine.set(day, { label: dayLabel(day), fullLabel: dayLabel(day), sortKey: day });
      }
    }

    orderedRows.forEach((row, index) => {
      const point = rowChrono(row, timeColumn, activityColumn, index, grain);
      if (!spine.has(point.sortKey)) {
        spine.set(point.sortKey, {
          label: point.label,
          fullLabel: point.fullLabel,
          sortKey: point.sortKey,
        });
      }
      metrics.forEach((metric) => {
        addMetricValue(values, counts, metric.key, point.sortKey, rowMetric(row, metric), metric.mode);
      });
    });

    lineRows = sampleTimeline(
      [...spine.values()]
        .sort((a, b) => a.sortKey - b.sortKey)
        .map((slot) => {
          const row: FuelPerformanceLineRow = {
            label: slot.label,
            fullLabel: slot.fullLabel,
            sortKey: slot.sortKey,
          };
          metrics.forEach((metric) => {
            row[metric.key] = values.get(`${metric.key}::${slot.sortKey}`) ?? 0;
          });
          return row;
        }),
      28,
    );
  }

  return {
    metrics,
    barRows,
    lineRows,
    lineSeries,
    primaryMetricLabel: primary.label,
    assetLabel: assetColumn?.label || 'Asset',
    lineAxisLabel:
      grain === 'day' ? 'Date' : timeColumn?.label || activityColumn?.label || 'Activity',
  };
}

