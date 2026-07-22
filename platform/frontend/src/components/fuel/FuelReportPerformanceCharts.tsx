import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { WialonReportTable } from '@/lib/reportUtils';
import {
  buildFuelPerformanceCharts,
  discoverFuelPerformanceMetrics,
  type FuelPerformancePeriod,
} from '@/lib/fuelReportPerformance';
import { ReportChartLegend } from '@/components/reports/ReportChartLegend';

type Props = {
  table: WialonReportTable;
  assetName?: string;
  primaryColor?: string;
  compact?: boolean;
  /** Selected report duration (unix seconds) — keeps timeline continuous. */
  period?: FuelPerformancePeriod | null;
  /** Controlled metric picks — first is primary (line + ranking). */
  metricSourceKeys?: string[];
  onMetricSourceKeysChange?: (keys: string[]) => void;
  /** Hide the metric picker (print placeholders / embedded export). */
  hideControls?: boolean;
};

const tick = { fontSize: 10, fill: '#64748b' } as const;
const labelTick = { fontSize: 10, fill: '#475569' } as const;

const CHART_BODY_CLASS =
  '[&_.recharts-wrapper]:overflow-visible [&_svg]:overflow-visible [&_.recharts-cartesian-axis-tick_text]:!text-[10px]';

function axisWidth(values: number[]): number {
  const max = Math.max(0, ...values.map((value) => Math.abs(value)));
  return Math.max(32, String(Math.round(max)).length * 7 + 12);
}

function barSize(assetCount: number, metricCount: number): number {
  const slots = Math.max(1, assetCount * metricCount);
  if (slots <= 4) return 22;
  if (slots <= 10) return 14;
  if (slots <= 20) return 9;
  return 6;
}

function tableFingerprint(table: WialonReportTable): string {
  const cols = table.columns.map((c) => `${c.key}:${c.label}`).join('|');
  return `${table.index}:${table.name}:${cols}:${table.rows.length}`;
}

function PlotWithLegend({
  config,
  height,
  children,
}: {
  config: ChartConfig;
  height: number;
  children: React.ComponentProps<typeof ChartContainer>['children'];
}) {
  return (
    <div className="flex w-full min-w-0 flex-col" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <ChartContainer
        config={config}
        className={cn('w-full aspect-auto', CHART_BODY_CLASS)}
        style={{ height, width: '100%', aspectRatio: 'auto' }}
      >
        {children}
      </ChartContainer>
      <ReportChartLegend config={config} />
    </div>
  );
}

function PerformanceChartShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-report-chart-card
      className="rounded-lg border border-slate-200/80 bg-slate-50/50 p-3.5 min-w-0"
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        background: 'rgba(248, 250, 252, 0.55)',
        padding: '14px',
        minWidth: 0,
        pageBreakInside: 'avoid',
        breakInside: 'avoid',
      }}
    >
      <div className="mb-2" data-report-chart-title>
        <p
          className="text-[12px] font-semibold text-slate-800"
          style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: '#0f172a' }}
        >
          {title}
        </p>
        <p
          className="text-[10px] text-slate-500"
          style={{ margin: '3px 0 0', fontSize: '10px', color: '#64748b' }}
        >
          {subtitle}
        </p>
      </div>
      <div
        data-report-chart-body
        className="overflow-visible"
        style={{ overflow: 'visible' }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Generic performance charts for dynamic Wialon fuel tables.
 * Metric picker lets operators choose primary + compare metrics explicitly.
 */
export function FuelReportPerformanceCharts({
  table,
  assetName,
  primaryColor = '#004225',
  compact,
  period,
  metricSourceKeys,
  onMetricSourceKeysChange,
  hideControls,
}: Props) {
  const available = useMemo(() => discoverFuelPerformanceMetrics(table), [table]);
  const fingerprint = useMemo(() => tableFingerprint(table), [table]);
  const controlled = metricSourceKeys !== undefined;

  const [localPrimary, setLocalPrimary] = useState(available[0]?.sourceKey || '');
  const [localCompare, setLocalCompare] = useState<string[]>([]);

  useEffect(() => {
    if (controlled) return;
    const nextPrimary = available[0]?.sourceKey || '';
    setLocalPrimary(nextPrimary);
    setLocalCompare(
      available
        .slice(1, 3)
        .map((metric) => metric.sourceKey)
        .filter((key) => key && key !== nextPrimary),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, controlled]);

  const primaryKey = controlled
    ? metricSourceKeys[0] || available[0]?.sourceKey || ''
    : localPrimary;
  const compareKeys = controlled
    ? metricSourceKeys.slice(1, 3)
    : localCompare.filter((key) => key !== primaryKey);

  const setPrimaryKey = (key: string) => {
    if (controlled) {
      const next = [key, ...compareKeys.filter((k) => k !== key)].slice(0, 3);
      onMetricSourceKeysChange?.(next);
      return;
    }
    setLocalPrimary(key);
    setLocalCompare((prev) => prev.filter((k) => k !== key));
  };

  const toggleCompare = (sourceKey: string) => {
    if (sourceKey === primaryKey) return;
    const nextCompare = compareKeys.includes(sourceKey)
      ? compareKeys.filter((key) => key !== sourceKey)
      : compareKeys.length >= 2
        ? [...compareKeys.slice(1), sourceKey]
        : [...compareKeys, sourceKey];
    if (controlled) {
      onMetricSourceKeysChange?.([primaryKey, ...nextCompare].filter(Boolean).slice(0, 3));
      return;
    }
    setLocalCompare(nextCompare);
  };

  const selectedKeys = useMemo(() => {
    const keys = [primaryKey, ...compareKeys].filter(Boolean);
    return [...new Set(keys)].slice(0, 3);
  }, [primaryKey, compareKeys]);

  const data = useMemo(
    () =>
      buildFuelPerformanceCharts(table, assetName || 'Selected asset', {
        period,
        metricSourceKeys: selectedKeys,
      }),
    [table, assetName, period, selectedKeys],
  );

  if (!available.length || (!data.barRows.length && !data.lineRows.length)) return null;

  const metrics = data.metrics.map((metric, index) =>
    index === 0 ? { ...metric, color: primaryColor } : metric,
  );
  const barConfig = Object.fromEntries(
    metrics.map((metric) => [
      metric.key,
      { label: metric.label, color: metric.color },
    ]),
  ) as ChartConfig;
  const lineConfig = Object.fromEntries(
    data.lineSeries.map((series) => [
      series.key,
      { label: series.label, color: series.color },
    ]),
  ) as ChartConfig;

  const barValues = data.barRows.flatMap((row) =>
    metrics.map((metric) => Number(row[metric.key] || 0)),
  );
  const lineValues = data.lineRows.flatMap((row) =>
    data.lineSeries.map((series) => Number(row[series.key] || 0)),
  );
  const height = compact ? 190 : 210;
  const compareOptions = available.filter((metric) => metric.sourceKey !== primaryKey);

  return (
    <section className="space-y-2.5 min-w-0" style={{ marginTop: 24, marginBottom: 24 }}>
      {!hideControls && (
      <div
        data-no-print
        className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2"
      >
        <div className="space-y-1 min-w-[180px]">
          <Label className="text-[10px] text-muted-foreground">Primary metric</Label>
          <Select value={primaryKey || undefined} onValueChange={setPrimaryKey}>
            <SelectTrigger className="h-8 text-xs bg-white">
              <SelectValue placeholder="Select metric" />
            </SelectTrigger>
            <SelectContent>
              {available.map((metric) => (
                <SelectItem key={metric.sourceKey} value={metric.sourceKey}>
                  {metric.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {compareOptions.length > 0 && (
          <div className="space-y-1 min-w-0 flex-1">
            <Label className="text-[10px] text-muted-foreground">
              Also compare on bars (optional, max 2)
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {compareOptions.map((metric) => {
                const active = compareKeys.includes(metric.sourceKey);
                return (
                  <button
                    key={metric.sourceKey}
                    type="button"
                    onClick={() => toggleCompare(metric.sourceKey)}
                    className={cn(
                      'h-7 rounded-md border px-2 text-[11px] transition-colors',
                      active
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    {metric.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      )}

      <div
        data-report-chart-grid
        className="grid grid-cols-1 lg:grid-cols-2 gap-3 min-w-0"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          width: '100%',
          marginTop: '8px',
          marginBottom: '4px',
        }}
      >
        <PerformanceChartShell
          title="Asset performance comparison"
          subtitle={`Standing bars · ${metrics.map((metric) => metric.label).join(' · ')}`}
        >
          <PlotWithLegend config={barConfig} height={height}>
            <BarChart
              data={data.barRows}
              margin={{ top: 10, right: 14, left: 12, bottom: 64 }}
              barGap={2}
              barCategoryGap="20%"
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="asset"
                tick={{ ...labelTick, dy: 4 }}
                tickLine={false}
                axisLine={false}
                interval={0}
                angle={data.barRows.length > 3 ? -35 : 0}
                textAnchor={data.barRows.length > 3 ? 'end' : 'middle'}
                height={data.barRows.length > 3 ? 64 : 28}
                tickMargin={8}
              />
              <YAxis
                tick={tick}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={axisWidth(barValues)}
                tickMargin={4}
              />
              <ChartTooltip
                content={<ChartTooltipContent className="text-[10px]" />}
                cursor={{ fill: '#f8fafc' }}
              />
              {metrics.map((metric) => (
                <Bar
                  key={metric.key}
                  dataKey={metric.key}
                  fill={`var(--color-${metric.key})`}
                  radius={[3, 3, 0, 0]}
                  barSize={barSize(data.barRows.length, metrics.length)}
                />
              ))}
            </BarChart>
          </PlotWithLegend>
        </PerformanceChartShell>

        <PerformanceChartShell
          title="Performance trend"
          subtitle={`${data.primaryMetricLabel} · continuous flow by ${data.lineAxisLabel.toLowerCase()}`}
        >
          <PlotWithLegend config={lineConfig} height={height}>
            <LineChart
              data={data.lineRows}
              margin={{ top: 10, right: 16, left: 10, bottom: 28 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tick={tick}
                tickLine={false}
                axisLine={false}
                minTickGap={8}
                tickMargin={4}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={tick}
                tickLine={false}
                axisLine={false}
                width={axisWidth(lineValues)}
                tickMargin={4}
              />
              <ChartTooltip content={<ChartTooltipContent className="text-[10px]" />} />
              {data.lineSeries.map((series) => (
                <Line
                  key={series.key}
                  type="monotone"
                  dataKey={series.key}
                  stroke={`var(--color-${series.key})`}
                  strokeWidth={2}
                  dot={data.lineRows.length <= 10 ? { r: 2.5 } : false}
                  activeDot={{ r: 3.5 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </PlotWithLegend>
        </PerformanceChartShell>
      </div>
    </section>
  );
}
