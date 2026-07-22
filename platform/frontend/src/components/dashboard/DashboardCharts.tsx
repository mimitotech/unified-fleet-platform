import { useId } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FLEET_STATUS, ALERT_SEVERITY, CHART } from '@/lib/chartColors';
import { cn } from '@/lib/utils';

const TICK = { fontSize: 10, fill: '#64748b' } as const;
const TOOLTIP_STYLE = {
  fontSize: 11,
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  boxShadow: '0 8px 20px -8px rgba(15,23,42,0.18)',
  background: 'rgba(255,255,255,0.97)',
} as const;

type Slice = { name: string; value: number; color: string };

function EmptyChart({ height, message = 'No data yet' }: { height: number; message?: string }) {
  return (
    <div className="flex items-center justify-center text-xs text-muted-foreground" style={{ height }}>
      {message}
    </div>
  );
}

export function CompactDonut({
  data,
  centerLabel,
  centerValue,
  className,
  height = 168,
}: {
  data: Slice[];
  centerLabel?: string;
  centerValue?: string | number;
  className?: string;
  height?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <EmptyChart height={height} />;

  return (
    <div className={cn('relative w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="56%"
            outerRadius="82%"
            paddingAngle={2.5}
            stroke="#fff"
            strokeWidth={2}
            isAnimationActive
            animationDuration={650}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} className="transition-opacity hover:opacity-90" />
            ))}
          </Pie>
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value: number, name: string) => {
              const pct = total > 0 ? Math.round((value / total) * 100) : 0;
              return [`${value.toLocaleString()} (${pct}%)`, name];
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      {(centerLabel != null || centerValue != null) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerValue != null && (
            <span className="text-xl font-semibold tabular-nums text-foreground leading-none">{centerValue}</span>
          )}
          {centerLabel && <span className="text-[10px] text-muted-foreground mt-1">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}

function labelWidth(rows: Array<Record<string, string | number>>, nameKey: string): number {
  const longest = rows.reduce((m, r) => Math.max(m, String(r[nameKey] ?? '').length), 0);
  return Math.min(148, Math.max(88, longest * 6.2));
}

export function CompactBars({
  data,
  dataKey = 'value',
  nameKey = 'name',
  color = CHART.brand,
  height = 168,
  horizontal,
  unit,
  className,
  includeZeros,
}: {
  data: Array<Record<string, string | number>>;
  dataKey?: string;
  nameKey?: string;
  color?: string;
  height?: number;
  horizontal?: boolean;
  unit?: string;
  className?: string;
  /** Keep zero-value rows so the axis stays meaningful */
  includeZeros?: boolean;
}) {
  const usable = includeZeros ? data : data.filter((d) => num(d[dataKey]) > 0);
  if (!usable.length) return <EmptyChart height={height} />;
  const yW = horizontal ? labelWidth(usable, nameKey) : 36;
  const angled = !horizontal && usable.length > 4;

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={usable}
          layout={horizontal ? 'vertical' : 'horizontal'}
          margin={{
            top: 8,
            right: 12,
            left: horizontal ? 4 : 4,
            bottom: angled ? 48 : 8,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={!horizontal} horizontal={horizontal} stroke="#eef2f7" />
          {horizontal ? (
            <>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey={nameKey}
                width={yW}
                tick={TICK}
                tickLine={false}
                axisLine={false}
                interval={0}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey={nameKey}
                tick={TICK}
                tickLine={false}
                axisLine={false}
                interval={0}
                angle={angled ? -28 : 0}
                textAnchor={angled ? 'end' : 'middle'}
                height={angled ? 52 : 24}
                tickMargin={6}
              />
              <YAxis tick={TICK} tickLine={false} axisLine={false} width={yW} allowDecimals={false} />
            </>
          )}
          <Tooltip
            cursor={{ fill: `${color}12` }}
            contentStyle={TOOLTIP_STYLE}
            formatter={(value: number) => [unit ? `${value.toLocaleString()} ${unit}` : value.toLocaleString(), '']}
            labelFormatter={(label, payload) => {
              const full = payload?.[0]?.payload?.fullName;
              return full ? String(full) : String(label);
            }}
          />
          <Bar
            dataKey={dataKey}
            fill={color}
            radius={horizontal ? [0, 5, 5, 0] : [5, 5, 0, 0]}
            barSize={horizontal ? 13 : 18}
            isAnimationActive
            animationDuration={600}
          >
            {usable.map((row, i) => (
              <Cell key={i} fill={String(row.fill || color)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Litres (left) + money (right) — avoids empty-looking dual-unit bars on one scale. */
export function CompactDualAxis({
  data,
  leftKey,
  rightKey,
  leftLabel,
  rightLabel,
  leftColor = CHART.brand,
  rightColor = '#f59e0b',
  height = 188,
  className,
}: {
  data: Array<Record<string, string | number>>;
  leftKey: string;
  rightKey: string;
  leftLabel: string;
  rightLabel: string;
  leftColor?: string;
  rightColor?: string;
  height?: number;
  className?: string;
}) {
  if (!data.length) return <EmptyChart height={height} />;
  const has = data.some((r) => num(r[leftKey]) > 0 || num(r[rightKey]) > 0);
  if (!has) return <EmptyChart height={height} message="No fuel totals in this period" />;

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 16, left: 8, bottom: 8 }} barCategoryGap="28%">
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
          <XAxis dataKey="name" tick={TICK} tickLine={false} axisLine={false} interval={0} />
          <YAxis
            yAxisId="left"
            tick={TICK}
            tickLine={false}
            axisLine={false}
            width={40}
            allowDecimals={false}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={TICK}
            tickLine={false}
            axisLine={false}
            width={48}
            allowDecimals={false}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8fafc' }} />
          <Bar
            yAxisId="left"
            dataKey={leftKey}
            name={leftLabel}
            fill={leftColor}
            radius={[5, 5, 0, 0]}
            barSize={22}
            isAnimationActive
            animationDuration={600}
          />
          <Bar
            yAxisId="right"
            dataKey={rightKey}
            name={rightLabel}
            fill={rightColor}
            radius={[5, 5, 0, 0]}
            barSize={22}
            isAnimationActive
            animationDuration={600}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type SeriesDef = { key: string; label: string; color: string };

export function CompactMultiLine({
  data,
  series,
  xKey = 'name',
  height = 168,
  className,
}: {
  data: Array<Record<string, string | number>>;
  series: SeriesDef[];
  xKey?: string;
  height?: number;
  className?: string;
}) {
  if (!data.length || !series.length) return <EmptyChart height={height} />;
  const hasValues = data.some((row) => series.some((s) => num(row[s.key]) > 0));
  if (!hasValues) return <EmptyChart height={height} message="No events in this period" />;

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 2 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
          <XAxis dataKey={xKey} tick={TICK} tickLine={false} axisLine={false} minTickGap={10} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2.25}
              dot={{ r: 2.5, fill: s.color, stroke: '#fff', strokeWidth: 1 }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
              isAnimationActive
              animationDuration={650}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CompactComposed({
  data,
  bars,
  lines = [],
  xKey = 'name',
  stacked,
  height = 168,
  className,
}: {
  data: Array<Record<string, string | number>>;
  bars: SeriesDef[];
  lines?: SeriesDef[];
  xKey?: string;
  stacked?: boolean;
  height?: number;
  className?: string;
}) {
  if (!data.length) return <EmptyChart height={height} />;
  const keys = [...bars, ...lines].map((s) => s.key);
  const hasValues = data.some((row) => keys.some((k) => num(row[k]) > 0));
  if (!hasValues) return <EmptyChart height={height} />;
  const angled = data.length > 4;
  const yW = Math.min(52, Math.max(36, String(Math.round(Math.max(...data.flatMap((r) => keys.map((k) => num(r[k])))))).length * 7 + 12));

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 10, left: 4, bottom: angled ? 52 : 8 }}
          barCategoryGap="18%"
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
          <XAxis
            dataKey={xKey}
            tick={TICK}
            tickLine={false}
            axisLine={false}
            interval={0}
            angle={angled ? -30 : 0}
            textAnchor={angled ? 'end' : 'middle'}
            height={angled ? 56 : 24}
            tickMargin={6}
            minTickGap={2}
          />
          <YAxis tick={TICK} tickLine={false} axisLine={false} width={yW} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: '#f8fafc' }}
            labelFormatter={(label, payload) => {
              const full = payload?.[0]?.payload?.fullName;
              return full ? String(full) : String(label);
            }}
          />
          {bars.map((b, i) => (
            <Bar
              key={b.key}
              dataKey={b.key}
              name={b.label}
              fill={b.color}
              stackId={stacked ? 'stack' : undefined}
              radius={!stacked || i === bars.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              barSize={Math.max(8, Math.min(18, Math.round(220 / Math.max(data.length, 1))))}
              isAnimationActive
              animationDuration={600}
            />
          ))}
          {lines.map((l) => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.key}
              name={l.label}
              stroke={l.color}
              strokeWidth={2.25}
              dot={{ r: 2.5, fill: l.color, stroke: '#fff', strokeWidth: 1 }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
              isAnimationActive
              animationDuration={650}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal stacked bars — great for motion × ignition matrices. */
export function CompactStackedHBars({
  data,
  series,
  nameKey = 'name',
  height = 168,
  className,
}: {
  data: Array<Record<string, string | number>>;
  series: SeriesDef[];
  nameKey?: string;
  height?: number;
  className?: string;
}) {
  if (!data.length || !series.length) return <EmptyChart height={height} />;
  const hasValues = data.some((row) => series.some((s) => num(row[s.key]) > 0));
  if (!hasValues) return <EmptyChart height={height} />;

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 2 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
          <XAxis type="number" hide />
          <YAxis type="category" dataKey={nameKey} width={72} tick={TICK} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8fafc' }} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="h"
              fill={s.color}
              barSize={14}
              radius={i === series.length - 1 ? [0, 5, 5, 0] : [0, 0, 0, 0]}
              isAnimationActive
              animationDuration={650}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CompactArea({
  data,
  dataKey = 'value',
  label,
  xKey = 'name',
  color = CHART.brand,
  height = 168,
  unit,
  className,
}: {
  data: Array<Record<string, string | number>>;
  dataKey?: string;
  label?: string;
  xKey?: string;
  color?: string;
  height?: number;
  unit?: string;
  className?: string;
}) {
  const gradId = useId().replace(/:/g, '');
  if (!data.length) return <EmptyChart height={height} />;
  if (!data.some((d) => num(d[dataKey]) > 0)) return <EmptyChart height={height} />;

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 2 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.42} />
              <stop offset="100%" stopColor={color} stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
          <XAxis dataKey={xKey} tick={TICK} tickLine={false} axisLine={false} minTickGap={10} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} width={36} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value: number) => [
              unit ? `${value.toLocaleString()} ${unit}` : value.toLocaleString(),
              label ?? '',
            ]}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            name={label}
            stroke={color}
            strokeWidth={2.25}
            fill={`url(#${gradId})`}
            activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
            isAnimationActive
            animationDuration={700}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Colorful stage progress bars with hover. */
export function CompactStageBars({
  stages,
  height = 176,
  className,
}: {
  stages: Slice[];
  height?: number;
  className?: string;
}) {
  const usable = stages.filter((s) => s.value > 0);
  if (!usable.length) return <EmptyChart height={height} />;
  const max = Math.max(...usable.map((s) => s.value), 1);

  return (
    <div className={cn('flex flex-col justify-center gap-3 w-full px-0.5', className)} style={{ height }}>
      {usable.map((s) => {
        const pct = Math.max(8, Math.round((s.value / max) * 100));
        return (
          <div key={s.name} className="group/stage space-y-1 cursor-default">
            <div className="flex items-center justify-between gap-2 text-[10px]">
              <span className="font-medium text-foreground truncate transition-colors group-hover/stage:text-foreground">
                {s.name}
              </span>
              <span className="tabular-nums font-semibold shrink-0" style={{ color: s.color }}>
                {s.value.toLocaleString()}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-100/90 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out group-hover/stage:brightness-110 group-hover/stage:saturate-125"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${s.color}, ${s.color}b8)`,
                  boxShadow: `0 0 8px ${s.color}33`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CompactRadial({
  value,
  max = 100,
  label,
  color = CHART.brand,
  height = 168,
  className,
}: {
  value: number;
  max?: number;
  label?: string;
  color?: string;
  height?: number;
  className?: string;
}) {
  const safeMax = max > 0 ? max : 100;
  const pct = Math.min(100, Math.max(0, Math.round((value / safeMax) * 100)));
  const data = [{ name: label || 'value', value: pct, fill: color }];

  return (
    <div className={cn('relative w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          cx="50%"
          cy="54%"
          innerRadius="64%"
          outerRadius="98%"
          barSize={12}
          data={data}
          startAngle={210}
          endAngle={-30}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar
            background={{ fill: `${color}14` }}
            dataKey="value"
            cornerRadius={8}
            isAnimationActive
            animationDuration={700}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v}%`, label || '']} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-1">
        <span className="text-2xl font-semibold tabular-nums leading-none" style={{ color }}>
          {pct}%
        </span>
        {label && <span className="text-[10px] text-muted-foreground mt-1">{label}</span>}
      </div>
    </div>
  );
}

export function LegendDots({ items }: { items: Array<{ label: string; color: string; value?: number | string }> }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-x-2.5 gap-y-1 justify-center pt-1.5 mt-auto">
      {items.map((item) => (
        <div key={item.label} className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: item.color }} />
          <span>{item.label}</span>
          {item.value != null && (
            <span className="tabular-nums font-semibold text-foreground">{item.value}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function fleetStatusSlices(counts: {
  moving?: number;
  idle?: number;
  stopped?: number;
  offline?: number;
}): Slice[] {
  return [
    { name: 'Moving', value: counts.moving ?? 0, color: FLEET_STATUS.moving },
    { name: 'Idle', value: counts.idle ?? 0, color: FLEET_STATUS.idle },
    { name: 'Stopped', value: counts.stopped ?? 0, color: FLEET_STATUS.stopped },
    { name: 'Offline', value: counts.offline ?? 0, color: FLEET_STATUS.offline },
  ].filter((s) => s.value > 0);
}

export function alertSeveritySlices(rows: Array<{ severity?: string }>): Slice[] {
  const counts = { critical: 0, warning: 0, info: 0 };
  for (const row of rows) {
    const s = String(row.severity || 'info').toLowerCase();
    if (s === 'critical' || s === 'emergency') counts.critical += 1;
    else if (s === 'warning') counts.warning += 1;
    else counts.info += 1;
  }
  return [
    { name: 'Critical', value: counts.critical, color: ALERT_SEVERITY.critical },
    { name: 'Warning', value: counts.warning, color: ALERT_SEVERITY.warning },
    { name: 'Info', value: counts.info, color: ALERT_SEVERITY.info },
  ].filter((s) => s.value > 0);
}
