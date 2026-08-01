import { CHART, FLEET_STATUS } from '@/lib/chartColors';

export type DomainReportRow = Record<string, string | number | null | undefined>;

export type DomainMetricDef = {
  key: string;
  label: string;
  color?: string;
};

export type DomainBarChartDef = {
  title: string;
  subtitle?: string;
  metrics: DomainMetricDef[];
  topN?: number;
};

export type DomainSecondaryChartDef =
  | {
      type: 'bars';
      title: string;
      subtitle?: string;
      metrics: DomainMetricDef[];
      topN?: number;
    }
  | {
      type: 'category';
      title: string;
      subtitle?: string;
      groupKey: string;
      as?: 'bars' | 'pie';
    }
  | {
      type: 'timeline';
      title: string;
      subtitle?: string;
      dateKey: string;
      /** When set, multi-line by this categorical field (top N series). */
      seriesKey?: string;
      topSeries?: number;
    };

export type DomainChartSpec = {
  heading?: string;
  categoryKey: string;
  bar: DomainBarChartDef;
  secondary: DomainSecondaryChartDef;
};

const PALETTE = [
  CHART.brand,
  '#0d9488',
  '#2563eb',
  '#d97706',
  '#7c3aed',
  '#dc2626',
  '#0891b2',
  '#ca8a04',
  '#4f46e5',
  '#059669',
];

export function parseReportNumber(value: unknown): number {
  if (value == null || value === '' || value === '—') return NaN;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const cleaned = String(value).replace(/,/g, '').replace(/[^\d.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function shortLabel(raw: string, max = 14): string {
  const s = raw.trim() || '—';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function dayIso(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return null;
}

export function buildMetricBarRows(
  rows: DomainReportRow[],
  categoryKey: string,
  metrics: DomainMetricDef[],
  topN = 8,
): Array<Record<string, string | number>> {
  const byCat = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const name = String(row[categoryKey] ?? '—').trim() || '—';
    if (name === '—') continue;
    const agg = byCat.get(name) ?? Object.fromEntries(metrics.map((m) => [m.key, 0]));
    for (const m of metrics) {
      const n = parseReportNumber(row[m.key]);
      if (Number.isFinite(n)) agg[m.key] = (agg[m.key] ?? 0) + n;
    }
    byCat.set(name, agg);
  }

  return [...byCat.entries()]
    .map(([fullName, values]) => {
      const primary = values[metrics[0]?.key ?? ''] ?? 0;
      return {
        name: shortLabel(fullName),
        fullName,
        ...values,
        _sort: primary,
      };
    })
    .sort((a, b) => Number(b._sort) - Number(a._sort))
    .slice(0, topN)
    .map(({ _sort: _, ...rest }) => rest);
}

export function buildCategoryCountRows(
  rows: DomainReportRow[],
  groupKey: string,
  topN = 8,
): Array<{ name: string; fullName: string; value: number; fill: string }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = String(row[groupKey] ?? '—').trim() || '—';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([fullName, value], i) => ({
      name: shortLabel(fullName, 16),
      fullName,
      value,
      fill: statusColor(fullName, i),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, topN);
}

export function buildTimelineSeries(
  rows: DomainReportRow[],
  dateKey: string,
  seriesKey?: string,
  topSeries = 5,
): {
  data: Array<Record<string, string | number>>;
  series: Array<{ key: string; label: string; color: string }>;
} {
  if (!seriesKey) {
    const byDay = new Map<string, number>();
    for (const row of rows) {
      const day = dayIso(row[dateKey]);
      if (!day) continue;
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
    const data = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, count]) => ({
        day: day.slice(5),
        fullDay: day,
        count,
      }));
    return {
      data,
      series: [{ key: 'count', label: 'Count', color: CHART.brand }],
    };
  }

  const totals = new Map<string, number>();
  const grid = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const day = dayIso(row[dateKey]);
    if (!day) continue;
    const series = String(row[seriesKey] ?? '—').trim() || '—';
    totals.set(series, (totals.get(series) ?? 0) + 1);
    const dayMap = grid.get(day) ?? new Map<string, number>();
    dayMap.set(series, (dayMap.get(series) ?? 0) + 1);
    grid.set(day, dayMap);
  }

  const top = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topSeries)
    .map(([name], i) => ({
      key: `s${i}`,
      label: shortLabel(name, 12),
      fullName: name,
      color: PALETTE[i % PALETTE.length],
    }));

  const keyByName = new Map(top.map((s) => [s.fullName, s.key]));
  const data = [...grid.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, dayMap]) => {
      const point: Record<string, string | number> = {
        day: day.slice(5),
        fullDay: day,
      };
      for (const s of top) {
        point[s.key] = dayMap.get(s.fullName) ?? 0;
      }
      for (const [name, count] of dayMap) {
        if (!keyByName.has(name)) continue;
        point[keyByName.get(name)!] = count;
      }
      return point;
    });

  return {
    data,
    series: top.map(({ key, label, color }) => ({ key, label, color })),
  };
}

function statusColor(label: string, index: number): string {
  const k = label.toLowerCase();
  if (k.includes('moving') || k.includes('running') || k.includes('active') || k === 'on') {
    return FLEET_STATUS.moving;
  }
  if (k.includes('idle') || k.includes('scheduled') || k.includes('warning')) {
    return FLEET_STATUS.idle;
  }
  if (k.includes('stop') || k.includes('fail') || k.includes('critical') || k === 'off') {
    return FLEET_STATUS.stopped;
  }
  if (k.includes('offline') || k.includes('off duty') || k.includes('off-duty')) {
    return FLEET_STATUS.offline;
  }
  if (k.includes('available') || k.includes('success') || k.includes('completed') || k.includes('ack')) {
    return CHART.brand;
  }
  if (k.includes('driving') || k.includes('progress')) return '#0d9488';
  return PALETTE[index % PALETTE.length];
}

export function metricColors(metrics: DomainMetricDef[], primaryColor?: string): DomainMetricDef[] {
  return metrics.map((m, i) => ({
    ...m,
    color: m.color || (i === 0 ? primaryColor || CHART.brand : PALETTE[(i + 1) % PALETTE.length]),
  }));
}
