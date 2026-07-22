import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { ReportChartLegend } from '@/components/reports/ReportChartLegend';
import { CHART } from '@/lib/chartColors';
import { cn } from '@/lib/utils';
import {
  buildCategoryCountRows,
  buildMetricBarRows,
  buildTimelineSeries,
  metricColors,
  type DomainChartSpec,
  type DomainReportRow,
} from '@/lib/domainReportCharts';

type Props = {
  rows: DomainReportRow[];
  spec: DomainChartSpec;
  primaryColor?: string;
  className?: string;
};

const TICK = { fontSize: 10, fill: '#64748b' } as const;
const TICK_LABEL = { fontSize: 10, fill: '#475569' } as const;

const CHART_BODY_CLASS =
  '[&_.recharts-wrapper]:overflow-visible [&_svg]:overflow-visible [&_.recharts-cartesian-axis-tick_text]:!text-[10px]';

function yAxisWidth(...values: number[]): number {
  const max = Math.max(0, ...values.filter((v) => Number.isFinite(v)));
  return Math.max(30, String(Math.round(max)).length * 7 + 12);
}

function barSize(count: number, metricCount: number): number {
  const slots = Math.max(1, count * metricCount);
  if (slots <= 4) return 22;
  if (slots <= 10) return 14;
  if (slots <= 20) return 9;
  return 6;
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

function ChartShell({
  title,
  subtitle,
  empty,
  children,
}: {
  title: string;
  subtitle?: string;
  empty?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      data-report-chart-card
      className="rounded-lg border border-slate-200/80 bg-slate-50/50 p-3.5 flex flex-col min-h-[240px] min-w-0"
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        background: 'rgba(248, 250, 252, 0.55)',
        padding: '14px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '240px',
        minWidth: 0,
        pageBreakInside: 'avoid',
        breakInside: 'avoid',
      }}
    >
      <div className="mb-2 shrink-0" data-report-chart-title>
        <p
          className="text-[12px] font-semibold text-slate-800"
          style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', margin: 0 }}
        >
          {title}
        </p>
        {subtitle && (
          <p
            className="text-[10px] text-slate-500 mt-0.5"
            style={{ fontSize: '10px', color: '#64748b', margin: '3px 0 0' }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {empty ? (
        <div
          className="flex-1 flex items-center justify-center text-[11px] text-slate-400"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            color: '#94a3b8',
          }}
        >
          No chart data in this view
        </div>
      ) : (
        <div data-report-chart-body className="flex-1 overflow-visible" style={{ flex: 1, overflow: 'visible' }}>
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Two print-ready report graphs (standing bars + secondary), matching Fuel/Alerts styling.
 */
export function DomainReportCharts({ rows, spec, primaryColor, className }: Props) {
  const brand = primaryColor || CHART.brand;
  const height = 184;

  const barMetrics = useMemo(
    () => metricColors(spec.bar.metrics, brand),
    [spec.bar.metrics, brand],
  );

  const barRows = useMemo(
    () => buildMetricBarRows(rows, spec.categoryKey, barMetrics, spec.bar.topN ?? 8),
    [rows, spec.categoryKey, barMetrics, spec.bar.topN],
  );

  const barConfig = useMemo(
    () =>
      Object.fromEntries(
        barMetrics.map((m) => [m.key, { label: m.label, color: m.color || brand }]),
      ) as ChartConfig,
    [barMetrics, brand],
  );

  const secondary = useMemo(() => {
    if (spec.secondary.type === 'bars') {
      const metrics = metricColors(spec.secondary.metrics, brand);
      const data = buildMetricBarRows(rows, spec.categoryKey, metrics, spec.secondary.topN ?? 8);
      return {
        kind: 'bars' as const,
        title: spec.secondary.title,
        subtitle: spec.secondary.subtitle,
        metrics,
        data,
        config: Object.fromEntries(
          metrics.map((m) => [m.key, { label: m.label, color: m.color || brand }]),
        ) as ChartConfig,
      };
    }
    if (spec.secondary.type === 'category') {
      const data = buildCategoryCountRows(rows, spec.secondary.groupKey, 8);
      const asPie = (spec.secondary.as ?? 'pie') === 'pie';
      return {
        kind: asPie ? ('pie' as const) : ('categoryBars' as const),
        title: spec.secondary.title,
        subtitle: spec.secondary.subtitle,
        data,
        config: Object.fromEntries(
          data.map((d) => [d.fullName, { label: d.name, color: d.fill }]),
        ) as ChartConfig,
      };
    }
    const timeline = buildTimelineSeries(
      rows,
      spec.secondary.dateKey,
      spec.secondary.seriesKey,
      spec.secondary.topSeries ?? 5,
    );
    return {
      kind: 'line' as const,
      title: spec.secondary.title,
      subtitle: spec.secondary.subtitle,
      data: timeline.data,
      series: timeline.series,
      config: Object.fromEntries(
        timeline.series.map((s) => [s.key, { label: s.label, color: s.color }]),
      ) as ChartConfig,
    };
  }, [rows, spec.secondary, spec.categoryKey, brand]);

  const barValues = barRows.flatMap((r) => barMetrics.map((m) => Number(r[m.key] ?? 0)));
  const hasBar = barRows.length > 0 && barValues.some((v) => v > 0 || Number.isFinite(v));

  return (
    <div className={cn('space-y-2', className)} style={{ marginTop: 24, marginBottom: 24 }}>
      {spec.heading && (
        <p
          className="text-[11px] font-semibold uppercase tracking-wide text-slate-600"
          style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em', color: '#475569', margin: 0 }}
        >
          {spec.heading}
        </p>
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
        <ChartShell
          title={spec.bar.title}
          subtitle={spec.bar.subtitle || `Standing bars · ${barMetrics.map((m) => m.label).join(' · ')}`}
          empty={!hasBar}
        >
          <PlotWithLegend config={barConfig} height={height}>
            <BarChart
              data={barRows}
              margin={{ top: 4, right: 6, left: 2, bottom: 6 }}
              barGap={2}
              barCategoryGap="20%"
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="name"
                tick={{ ...TICK_LABEL, dy: 4 }}
                tickLine={false}
                axisLine={false}
                interval={0}
                angle={barRows.length > 3 ? -30 : 0}
                textAnchor={barRows.length > 3 ? 'end' : 'middle'}
                height={barRows.length > 3 ? 38 : 24}
                tickMargin={4}
              />
              <YAxis
                tick={TICK}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={yAxisWidth(...barValues)}
                tickMargin={4}
              />
              <ChartTooltip content={<ChartTooltipContent className="text-[10px]" />} cursor={{ fill: '#f8fafc' }} />
              {barMetrics.map((m) => (
                <Bar
                  key={m.key}
                  dataKey={m.key}
                  fill={`var(--color-${m.key})`}
                  radius={[3, 3, 0, 0]}
                  barSize={barSize(barRows.length, barMetrics.length)}
                />
              ))}
            </BarChart>
          </PlotWithLegend>
        </ChartShell>

        {secondary.kind === 'bars' && (
          <ChartShell
            title={secondary.title}
            subtitle={secondary.subtitle || `Standing bars · ${secondary.metrics.map((m) => m.label).join(' · ')}`}
            empty={secondary.data.length === 0}
          >
            <PlotWithLegend config={secondary.config} height={height}>
              <BarChart
                data={secondary.data}
                margin={{ top: 4, right: 6, left: 2, bottom: 6 }}
                barGap={2}
                barCategoryGap="20%"
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="name"
                  tick={{ ...TICK_LABEL, dy: 4 }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={secondary.data.length > 3 ? -30 : 0}
                  textAnchor={secondary.data.length > 3 ? 'end' : 'middle'}
                  height={secondary.data.length > 3 ? 38 : 24}
                  tickMargin={4}
                />
                <YAxis
                  tick={TICK}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={yAxisWidth(
                    ...secondary.data.flatMap((r) => secondary.metrics.map((m) => Number(r[m.key] ?? 0))),
                  )}
                  tickMargin={4}
                />
                <ChartTooltip content={<ChartTooltipContent className="text-[10px]" />} cursor={{ fill: '#f8fafc' }} />
                {secondary.metrics.map((m) => (
                  <Bar
                    key={m.key}
                    dataKey={m.key}
                    fill={`var(--color-${m.key})`}
                    radius={[3, 3, 0, 0]}
                    barSize={barSize(secondary.data.length, secondary.metrics.length)}
                  />
                ))}
              </BarChart>
            </PlotWithLegend>
          </ChartShell>
        )}

        {secondary.kind === 'categoryBars' && (
          <ChartShell title={secondary.title} subtitle={secondary.subtitle} empty={secondary.data.length === 0}>
            <PlotWithLegend config={secondary.config} height={height}>
              <BarChart data={secondary.data} margin={{ top: 4, right: 6, left: 2, bottom: 6 }} barCategoryGap="24%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="name"
                  tick={{ ...TICK_LABEL, dy: 4 }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={secondary.data.length > 3 ? -28 : 0}
                  textAnchor={secondary.data.length > 3 ? 'end' : 'middle'}
                  height={secondary.data.length > 3 ? 36 : 24}
                  tickMargin={4}
                />
                <YAxis
                  tick={TICK}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={yAxisWidth(...secondary.data.map((d) => d.value))}
                  tickMargin={4}
                />
                <ChartTooltip content={<ChartTooltipContent className="text-[10px]" hideLabel />} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="value" radius={[3, 3, 0, 0]} barSize={barSize(secondary.data.length, 1)}>
                  {secondary.data.map((entry) => (
                    <Cell key={entry.fullName} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </PlotWithLegend>
          </ChartShell>
        )}

        {secondary.kind === 'pie' && (
          <ChartShell title={secondary.title} subtitle={secondary.subtitle} empty={secondary.data.length === 0}>
            <PlotWithLegend config={secondary.config} height={height}>
              <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <ChartTooltip content={<ChartTooltipContent hideLabel className="text-[10px]" />} />
                <Pie
                  data={secondary.data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={34}
                  outerRadius={58}
                  paddingAngle={2}
                  strokeWidth={1}
                >
                  {secondary.data.map((entry) => (
                    <Cell key={entry.fullName} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </PlotWithLegend>
          </ChartShell>
        )}

        {secondary.kind === 'line' && (
          <ChartShell
            title={secondary.title}
            subtitle={secondary.subtitle || 'Continuous trend over the selected period'}
            empty={secondary.data.length === 0 || secondary.series.length === 0}
          >
            <PlotWithLegend config={secondary.config} height={height}>
              <LineChart data={secondary.data} margin={{ top: 4, right: 8, left: 2, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="day"
                  tick={TICK}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={8}
                  tickMargin={4}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={TICK}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={yAxisWidth(
                    ...secondary.data.flatMap((d) => secondary.series.map((s) => Number(d[s.key] ?? 0))),
                  )}
                  tickMargin={4}
                />
                <ChartTooltip content={<ChartTooltipContent className="text-[10px]" />} />
                {secondary.series.map((s) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    stroke={`var(--color-${s.key})`}
                    strokeWidth={2}
                    dot={secondary.data.length <= 12 ? { r: 2.5 } : false}
                    activeDot={{ r: 3.5 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </PlotWithLegend>
          </ChartShell>
        )}
      </div>
    </div>
  );
}
