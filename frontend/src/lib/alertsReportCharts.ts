import { ALERT_SEVERITY, CHART } from '@/lib/chartColors';

export type AlertChartRow = {
  type: string;
  severity: string;
  status: string;
  asset: string;
  _day: string;
};

export const ALERT_CATEGORIES = [
  'Fuel',
  'Driving',
  'Power',
  'Geofence',
  'Engine',
  'Sensors',
  'Other',
] as const;

export type AlertCategory = (typeof ALERT_CATEGORIES)[number];

export const CATEGORY_COLORS: Record<AlertCategory, string> = {
  Fuel: CHART.brand,
  Driving: ALERT_SEVERITY.warning,
  Power: '#6d28d9',
  Geofence: '#0f766e',
  Engine: ALERT_SEVERITY.info,
  Sensors: CHART.neutral,
  Other: '#94a3b8',
};

function eachDayInclusive(fromDate: string, toDate: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${fromDate}T12:00:00`);
  const end = new Date(`${toDate}T12:00:00`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime()) || cur > end) return out;
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function formatDayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function alertCategory(type: string): AlertCategory {
  const t = type.toLowerCase();
  if (/fuel/.test(t)) return 'Fuel';
  if (/harsh|speed|idle|eco|corner|accel|brak|towing|sos|driving/.test(t)) return 'Driving';
  if (/generator|power|battery/.test(t)) return 'Power';
  if (/geofence|zone/.test(t)) return 'Geofence';
  if (/ignition|engine/.test(t)) return 'Engine';
  if (/sensor|temp|door|connection|maintain/.test(t)) return 'Sensors';
  return 'Other';
}

function severityBucket(severity: string): 'critical' | 'warning' | 'info' {
  const s = severity.toLowerCase();
  if (s === 'critical' || s === 'emergency') return 'critical';
  if (s === 'warning') return 'warning';
  return 'info';
}

/** Readable labels; horizontal charts allow longer names, standing charts need tight ones. */
export function shortAsset(name: string, assetCount: number, tight = false): string {
  const n = name && name !== '—' ? name : 'Unknown';
  const max = tight
    ? assetCount >= 6 ? 7 : 9
    : assetCount >= 10 ? 14 : assetCount >= 7 ? 16 : 20;
  return n.length > max ? `${n.slice(0, max - 1)}…` : n;
}

type AssetAgg = {
  fullName: string;
  total: number;
  critical: number;
  warning: number;
  info: number;
  open: number;
  acknowledged: number;
  byCategory: Record<AlertCategory, number>;
};

function emptyCategories(): Record<AlertCategory, number> {
  return { Fuel: 0, Driving: 0, Power: 0, Geofence: 0, Engine: 0, Sensors: 0, Other: 0 };
}

function aggregateByAsset(rows: AlertChartRow[]): Map<string, AssetAgg> {
  const map = new Map<string, AssetAgg>();
  for (const r of rows) {
    const fullName = r.asset && r.asset !== '—' ? r.asset : 'Unknown';
    let cur = map.get(fullName);
    if (!cur) {
      cur = {
        fullName,
        total: 0,
        critical: 0,
        warning: 0,
        info: 0,
        open: 0,
        acknowledged: 0,
        byCategory: emptyCategories(),
      };
      map.set(fullName, cur);
    }
    cur.total += 1;
    cur[severityBucket(r.severity)] += 1;
    if (r.status === 'Open') cur.open += 1;
    else cur.acknowledged += 1;
    cur.byCategory[alertCategory(r.type)] += 1;
  }
  return map;
}

/** Horizontal layouts can show more units before labels crowd. */
export function adaptiveAssetLimit(assetCount: number, preferred = 8): number {
  if (assetCount <= preferred) return assetCount;
  return preferred;
}

function topAssets(map: Map<string, AssetAgg>, limit: number): AssetAgg[] {
  return [...map.values()]
    .sort((a, b) => b.total - a.total || b.critical - a.critical)
    .slice(0, limit);
}

/** Chart height grows with row count so bars stay readable. */
export function chartHeightForRows(n: number, rowPx = 26, pad = 40): number {
  return Math.min(300, Math.max(148, pad + Math.max(1, n) * rowPx));
}

/** Brand-tinted heat cell: empty → light slate, high → deep brand green. */
export function heatFill(value: number, max: number): string {
  if (value <= 0 || max <= 0) return '#f1f5f9';
  const t = Math.min(1, value / max);
  const stops = [
    { t: 0, c: [226, 232, 240] },
    { t: 0.35, c: [197, 221, 208] },
    { t: 0.7, c: [77, 140, 110] },
    { t: 1, c: [0, 66, 37] },
  ];
  let a = stops[0];
  let b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i + 1].t) {
      a = stops[i];
      b = stops[i + 1];
      break;
    }
  }
  const u = (t - a.t) / Math.max(0.0001, b.t - a.t);
  const r = Math.round(a.c[0] + (b.c[0] - a.c[0]) * u);
  const g = Math.round(a.c[1] + (b.c[1] - a.c[1]) * u);
  const bl = Math.round(a.c[2] + (b.c[2] - a.c[2]) * u);
  return `rgb(${r},${g},${bl})`;
}

export function heatTextColor(value: number, max: number): string {
  if (value <= 0 || max <= 0) return '#94a3b8';
  return value / max >= 0.55 ? '#ffffff' : '#0f172a';
}

/** Ranking: total alerts + critical count per asset (standing grouped bars). */
export function buildAssetAlertVolume(rows: AlertChartRow[]) {
  const map = aggregateByAsset(rows);
  const limit = adaptiveAssetLimit(map.size, 7);
  const tops = topAssets(map, limit);
  return tops.map((a) => ({
    name: shortAsset(a.fullName, tops.length, true),
    fullName: a.fullName,
    total: a.total,
    critical: a.critical,
  }));
}

/** Heatmap matrix: asset × category. */
export function buildCategoryHeatmap(rows: AlertChartRow[]) {
  const map = aggregateByAsset(rows);
  const limit = adaptiveAssetLimit(map.size, 8);
  const tops = topAssets(map, limit);
  const categories = ALERT_CATEGORIES.filter((cat) => tops.some((a) => a.byCategory[cat] > 0));
  let max = 0;
  const cells = tops.map((a) => {
    const values = categories.map((cat) => {
      const v = a.byCategory[cat];
      if (v > max) max = v;
      return v;
    });
    return {
      name: shortAsset(a.fullName, tops.length),
      fullName: a.fullName,
      values,
      total: a.total,
    };
  });
  return { categories, rows: cells, max };
}

/** Severity mix as shares (for 100% composition bars). */
export function buildAssetSeverityProfile(rows: AlertChartRow[]) {
  const map = aggregateByAsset(rows);
  const limit = adaptiveAssetLimit(map.size, 8);
  const tops = topAssets(map, limit);
  return tops.map((a) => {
    const t = Math.max(1, a.total);
    return {
      name: shortAsset(a.fullName, tops.length),
      fullName: a.fullName,
      critical: a.critical,
      warning: a.warning,
      info: a.info,
      criticalPct: Math.round((a.critical / t) * 1000) / 10,
      warningPct: Math.round((a.warning / t) * 1000) / 10,
      infoPct: Math.round((a.info / t) * 1000) / 10,
      total: a.total,
    };
  });
}

/** Open backlog + ack rate per asset (combined bars + line). */
export function buildAssetResponseStatus(rows: AlertChartRow[]) {
  const map = aggregateByAsset(rows);
  const limit = adaptiveAssetLimit(map.size, 7);
  const tops = [...map.values()]
    .sort((a, b) => b.open - a.open || b.total - a.total)
    .slice(0, limit);
  return tops.map((a) => ({
    name: shortAsset(a.fullName, tops.length, true),
    fullName: a.fullName,
    open: a.open,
    acknowledged: a.acknowledged,
    ackRate: a.total ? Math.round((a.acknowledged / a.total) * 100) : 0,
    total: a.total,
  }));
}

/** Pie slices — share of fleet alert load per asset. */
export function buildAssetShare(rows: AlertChartRow[]) {
  const map = aggregateByAsset(rows);
  const limit = adaptiveAssetLimit(map.size, 6);
  const tops = topAssets(map, limit);
  const shown = tops.reduce((s, a) => s + a.total, 0);
  const rest = Math.max(0, rows.length - shown);
  const fleet = Math.max(1, rows.length);
  const palette = [
    CHART.brand,
    ALERT_SEVERITY.warning,
    '#6d28d9',
    '#0f766e',
    ALERT_SEVERITY.info,
    '#be185d',
  ];
  const slices = tops.map((a, i) => ({
    name: shortAsset(a.fullName, tops.length),
    fullName: a.fullName,
    value: a.total,
    pct: Math.round((a.total / fleet) * 1000) / 10,
    fill: palette[i % palette.length],
  }));
  if (rest > 0) {
    slices.push({
      name: 'Others',
      fullName: 'Others',
      value: rest,
      pct: Math.round((rest / fleet) * 1000) / 10,
      fill: CHART.neutralLight,
    });
  }
  return slices;
}

/** Multi-line daily load for top assets. */
export function buildAssetActivityLines(rows: AlertChartRow[], fromDate: string, toDate: string) {
  const map = aggregateByAsset(rows);
  const limit = Math.min(5, adaptiveAssetLimit(map.size, 5));
  const tops = topAssets(map, limit);
  const days = eachDayInclusive(fromDate, toDate);
  const assetNames = tops.map((a) => a.fullName);
  const palette = [CHART.brand, ALERT_SEVERITY.warning, '#6d28d9', '#0f766e', ALERT_SEVERITY.info];
  const series = assetNames.map((full, i) => ({
    key: `a${i}`,
    label: shortAsset(full, tops.length),
    fullName: full,
    color: palette[i % palette.length],
  }));

  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const dayMaps = days.map((day) => {
    const counts = new Map<string, number>();
    for (const name of assetNames) counts.set(name, 0);
    return { day, counts };
  });

  for (const r of rows) {
    const full = r.asset && r.asset !== '—' ? r.asset : 'Unknown';
    if (!assetNames.includes(full)) continue;
    const idx = dayIndex.get(r._day);
    if (idx == null) continue;
    const c = dayMaps[idx].counts;
    c.set(full, (c.get(full) || 0) + 1);
  }

  const data = dayMaps.map(({ day, counts }) => {
    const row: Record<string, string | number> = { day: formatDayLabel(day), dayIso: day };
    series.forEach((s, i) => {
      row[s.key] = counts.get(assetNames[i]) || 0;
    });
    return row;
  });

  return { data, series };
}

/** @deprecated alias — prefer buildAssetActivityLines */
export const buildAssetActivityAreas = buildAssetActivityLines;

/** Horizontal bar thickness. */
export function adaptiveBarSize(assetCount: number, seriesCount = 1): number {
  if (seriesCount >= 3) return assetCount >= 7 ? 8 : 10;
  if (seriesCount === 2) return assetCount >= 7 ? 9 : 12;
  return assetCount >= 8 ? 12 : assetCount >= 5 ? 14 : 16;
}
