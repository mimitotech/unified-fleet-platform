/**
 * Interactive renderer for Wialon report/render_json chart payloads —
 * Processed fuel level, Engine/Genset On/Off, markers (fills/drains).
 * Matches Hosting report chart layout as closely as Recharts allows.
 */

import { useMemo } from 'react';
import { format } from 'date-fns';
import {
  Area,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from 'recharts';
import type { WialonReportChart } from '@/lib/reportUtils';

type Dataset = {
  key: string;
  name: string;
  color: string;
  yAxis: 0 | 1;
  units: string;
  points: Array<{ t: number; y: number | null }>;
};

type Marker = { type: number; times: number[] };

function colorFromWialon(n: unknown, fallback: string): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  // Wialon packs BGR int
  const r = v & 0xff;
  const g = (v >> 8) & 0xff;
  const b = (v >> 16) & 0xff;
  return `rgb(${r},${g},${b})`;
}

const FALLBACK_COLORS = ['#2563eb', '#16a34a', '#ea580c', '#7c3aed', '#0891b2', '#dc2626'];

function parseDatasets(data: unknown): Dataset[] {
  const obj = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  if (!obj?.datasets || typeof obj.datasets !== 'object') return [];
  const entries = Object.entries(obj.datasets as Record<string, unknown>);
  const out: Dataset[] = [];
  let i = 0;
  for (const [key, raw] of entries) {
    if (!raw || typeof raw !== 'object') continue;
    const d = raw as Record<string, unknown>;
    const series = d.data as { x?: unknown[]; y?: unknown[] } | undefined;
    const xs = Array.isArray(series?.x) ? series!.x! : [];
    const ys = Array.isArray(series?.y) ? series!.y! : [];
    const points: Array<{ t: number; y: number | null }> = [];
    const n = Math.min(xs.length, ys.length);
    for (let j = 0; j < n; j++) {
      const t = Number(xs[j]);
      const yRaw = ys[j];
      const y = yRaw == null || yRaw === '' ? null : Number(yRaw);
      if (!Number.isFinite(t)) continue;
      points.push({ t, y: Number.isFinite(y as number) ? (y as number) : null });
    }
    if (points.length < 2) continue;
    out.push({
      key: `ds-${key}`,
      name: String(d.name || key),
      color: colorFromWialon(d.color, FALLBACK_COLORS[i % FALLBACK_COLORS.length]),
      yAxis: Number(d.y_axis) === 1 ? 1 : 0,
      units: d.units != null ? String(d.units) : '',
      points,
    });
    i += 1;
  }
  return out;
}

function parseMarkers(data: unknown): Marker[] {
  const obj = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  if (!Array.isArray(obj?.markers)) return [];
  return (obj!.markers as unknown[])
    .map((m) => {
      const rec = m && typeof m === 'object' ? (m as Record<string, unknown>) : null;
      if (!rec) return null;
      const times = Array.isArray(rec.x) ? rec.x.map(Number).filter(Number.isFinite) : [];
      return { type: Number(rec.type) || 0, times };
    })
    .filter((m): m is Marker => m != null && m.times.length > 0);
}

function isOnOffSeries(name: string, units: string): boolean {
  const n = `${name} ${units}`.toLowerCase();
  return /on\/?off|engine operation|ignition|genset|digital|boolean|status/.test(n);
}

function isFuelSeries(name: string, units: string): boolean {
  const n = `${name} ${units}`.toLowerCase();
  return /fuel|liter|litre|gallon|л|volume|tank/.test(n);
}

type Row = {
  t: number;
  tMs: number;
  timeLabel: string;
  [key: string]: number | string | null;
};

export function WialonProcessedFuelChart({
  chart,
  className,
}: {
  chart: WialonReportChart;
  className?: string;
}) {
  const datasets = useMemo(() => parseDatasets(chart.data), [chart.data]);
  const markers = useMemo(() => parseMarkers(chart.data), [chart.data]);

  const { rows, leftLabel, rightLabel, hasRight } = useMemo(() => {
    if (!datasets.length) {
      return { rows: [] as Row[], leftLabel: 'Value', rightLabel: '', hasRight: false };
    }

    const timeSet = new Set<number>();
    for (const d of datasets) for (const p of d.points) timeSet.add(p.t);
    for (const m of markers) for (const t of m.times) timeSet.add(t);
    const times = [...timeSet].sort((a, b) => a - b);

    const maps = datasets.map((d) => {
      const m = new Map<number, number | null>();
      for (const p of d.points) m.set(p.t, p.y);
      return m;
    });

    // Carry-forward so dual-axis lines stay continuous across sparse sensors
    const last: Array<number | null> = datasets.map(() => null);
    const rowsOut: Row[] = times.map((t) => {
      const row: Row = {
        t,
        tMs: t * 1000,
        timeLabel: format(new Date(t * 1000), 'HH:mm\nMM-dd'),
      };
      datasets.forEach((d, i) => {
        const v = maps[i].has(t) ? maps[i].get(t)! : last[i];
        if (maps[i].has(t) && maps[i].get(t) != null) last[i] = maps[i].get(t)!;
        row[d.key] = v;
      });
      // Marker flags for tooltip / optional dots
      row.fillMark = markers.some((m) => (m.type === 1 || m.type === 2) && m.times.includes(t))
        ? 1
        : null;
      row.drainMark = markers.some((m) => (m.type === 3 || m.type === 4) && m.times.includes(t))
        ? 1
        : null;
      return row;
    });

    const left = datasets.find((d) => d.yAxis === 0 && isFuelSeries(d.name, d.units)) || datasets.find((d) => d.yAxis === 0);
    const right =
      datasets.find((d) => d.yAxis === 1) ||
      datasets.find((d) => isOnOffSeries(d.name, d.units) && d !== left);

    return {
      rows: rowsOut,
      leftLabel: left ? `${left.name}${left.units ? ` (${left.units})` : ''}` : 'Value',
      rightLabel: right ? `${right.name}${right.units ? ` (${right.units})` : ''}` : 'On/Off',
      hasRight: Boolean(right),
    };
  }, [datasets, markers]);

  if (!datasets.length || rows.length < 2) return null;

  const fillCount = markers.filter((m) => m.type === 1 || m.type === 2).reduce((n, m) => n + m.times.length, 0);
  const drainCount = markers.filter((m) => m.type === 3 || m.type === 4).reduce((n, m) => n + m.times.length, 0);

  return (
    <div className={`fleet-card ${className || ''}`}>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{chart.name || 'Processed fuel level'}</h3>
          <p className="text-[11px] text-muted-foreground">
            Wialon report chart · {datasets.length} series · {rows.length.toLocaleString()} points
            {fillCount ? ` · ${fillCount} fill markers` : ''}
            {drainCount ? ` · ${drainCount} drain markers` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
          {datasets.map((d) => (
            <span key={d.key} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: d.color }} />
              {d.name}
            </span>
          ))}
        </div>
      </div>

      <div className="h-[420px] min-h-[300px] rounded-md border border-border/60 bg-white">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 16, right: hasRight ? 48 : 16, left: 8, bottom: 8 }}>
            <CartesianGrid stroke="#e5e7eb" vertical={false} />
            <XAxis
              dataKey="tMs"
              type="number"
              domain={['dataMin', 'dataMax']}
              scale="time"
              tickFormatter={(ms: number) => {
                const d = new Date(ms);
                return `${format(d, 'HH:mm')} ${format(d, 'MM-dd')}`;
              }}
              stroke="#9ca3af"
              fontSize={10}
              tickLine={false}
              minTickGap={40}
              height={36}
            />
            <YAxis
              yAxisId="left"
              stroke="#9ca3af"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={52}
              label={{
                value: leftLabel,
                angle: -90,
                position: 'insideLeft',
                offset: 2,
                style: { fontSize: 10, fill: '#6b7280' },
              }}
            />
            {hasRight && (
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 1]}
                ticks={[0, 0.5, 1]}
                stroke="#9ca3af"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                width={40}
                label={{
                  value: rightLabel,
                  angle: 90,
                  position: 'insideRight',
                  style: { fontSize: 10, fill: '#6b7280' },
                }}
              />
            )}
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0]?.payload as Row | undefined;
                if (!row) return null;
                const sec = Number(row.t);
                return (
                  <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-md min-w-[180px]">
                    <p className="font-semibold mb-1">
                      {format(new Date(sec * 1000), 'MMM d, yyyy · HH:mm:ss')}
                    </p>
                    {datasets.map((d) => {
                      const v = row[d.key];
                      if (v == null || typeof v === 'string') return null;
                      return (
                        <p key={d.key} style={{ color: d.color }} className="font-medium">
                          {d.name}: {Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          {d.units ? ` ${d.units}` : ''}
                        </p>
                      );
                    })}
                  </div>
                );
              }}
            />
            {datasets.map((d) => {
              const axis = d.yAxis === 1 || isOnOffSeries(d.name, d.units) ? 'right' : 'left';
              const onOff = isOnOffSeries(d.name, d.units);
              return (
                <g key={d.key}>
                  {!onOff && isFuelSeries(d.name, d.units) && (
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey={d.key}
                      stroke="none"
                      fill={d.color}
                      fillOpacity={0.08}
                      connectNulls
                      isAnimationActive={false}
                    />
                  )}
                  <Line
                    yAxisId={axis}
                    type={onOff ? 'stepAfter' : 'monotone'}
                    dataKey={d.key}
                    stroke={d.color}
                    strokeWidth={onOff ? 1.5 : 2}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                    name={d.name}
                  />
                </g>
              );
            })}
            {/* Fill / drain marker times as vertical guides */}
            {markers.slice(0, 80).flatMap((m) =>
              m.times.slice(0, 40).map((t) => (
                <ReferenceLine
                  key={`m-${m.type}-${t}`}
                  x={t * 1000}
                  stroke={m.type === 3 || m.type === 4 ? '#ef4444' : '#22c55e'}
                  strokeOpacity={0.35}
                  strokeDasharray="2 3"
                />
              )),
            )}
            {rows.length > 40 && (
              <Brush dataKey="tMs" height={26} stroke="#2563eb" travellerWidth={8} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function chartHasWialonDatasets(chart: WialonReportChart): boolean {
  return parseDatasets(chart.data).length > 0;
}
