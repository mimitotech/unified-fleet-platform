import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
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
import {
  adaptiveBarSize,
  buildAssetActivityLines,
  buildAssetAlertVolume,
  buildAssetResponseStatus,
  buildAssetSeverityProfile,
  buildAssetShare,
  buildCategoryHeatmap,
  chartHeightForRows,
  heatFill,
  heatTextColor,
} from '@/lib/alertsReportCharts';
import type { AlertChartRow } from '@/lib/alertsReportCharts';
import { ALERT_SEVERITY, CHART } from '@/lib/chartColors';
import { cn } from '@/lib/utils';
import { ReportChartLegend } from '@/components/reports/ReportChartLegend';

type Props = {
  rows: AlertChartRow[];
  fromDate: string;
  toDate: string;
  primaryColor?: string;
  className?: string;
};

const TICK = { fontSize: 10, fill: '#64748b' } as const;
const TICK_LABEL = { fontSize: 10, fill: '#475569' } as const;
const TICK_RATE = { fontSize: 10, fill: '#6d28d9' } as const;

const CHART_BODY_CLASS =
  '[&_.recharts-wrapper]:overflow-visible [&_svg]:overflow-visible [&_.recharts-cartesian-axis-tick_text]:!text-[10px]';

function yAxisWidth(...values: number[]): number {
  const max = Math.max(0, ...values);
  const digits = String(max).length;
  return Math.max(30, digits * 7 + 12);
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
      className="rounded-lg border border-slate-200 bg-white p-3 flex flex-col min-h-[240px] print:break-inside-avoid"
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        background: '#ffffff',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '240px',
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
          No asset alerts in this period
        </div>
      ) : (
        <div
          className="flex-1 overflow-visible"
          data-report-chart-body
          style={{ flex: 1, overflow: 'visible' }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function CategoryHeatmap({
  categories,
  rows,
  max,
}: {
  categories: string[];
  rows: { name: string; fullName: string; values: number[]; total: number }[];
  max: number;
}) {
  return (
    <div data-report-heatmap className="w-full overflow-x-auto" style={{ width: '100%', overflowX: 'auto' }}>
      <table
        className="w-full border-collapse"
        style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '9px' }}
      >
        <thead>
          <tr>
            <th
              className="text-left font-medium text-slate-500 pb-1.5 pr-2"
              style={{
                textAlign: 'left',
                fontWeight: 500,
                color: '#64748b',
                paddingBottom: '6px',
                paddingRight: '8px',
                width: '28%',
              }}
            >
              Asset
            </th>
            {categories.map((cat) => (
              <th
                key={cat}
                className="font-medium text-slate-500 pb-1.5 text-center"
                style={{
                  fontWeight: 500,
                  color: '#64748b',
                  paddingBottom: '6px',
                  textAlign: 'center',
                }}
                title={cat}
              >
                {cat.length > 6 ? `${cat.slice(0, 5)}…` : cat}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.fullName}>
              <td
                className="py-0.5 pr-2 text-slate-700 truncate"
                style={{
                  padding: '2px 8px 2px 0',
                  color: '#334155',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={row.fullName}
              >
                {row.name}
              </td>
              {row.values.map((v, i) => {
                const bg = heatFill(v, max);
                const fg = heatTextColor(v, max);
                return (
                  <td key={categories[i]} className="py-0.5 px-0.5" style={{ padding: '2px' }}>
                    <div
                      className="rounded-sm flex items-center justify-center tabular-nums"
                      style={{
                        background: bg,
                        color: fg,
                        borderRadius: '3px',
                        height: '20px',
                        fontSize: '8px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title={`${row.fullName} · ${categories[i]}: ${v}`}
                    >
                      {v > 0 ? v : ''}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div
        className="mt-2 flex items-center gap-2 text-[9px] text-slate-500"
        style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '9px', color: '#64748b' }}
      >
        <span>Low</span>
        <div
          className="h-2 flex-1 max-w-[120px] rounded-sm"
          style={{
            height: '8px',
            flex: 1,
            maxWidth: '120px',
            borderRadius: '3px',
            background: `linear-gradient(90deg, ${heatFill(0, 1)}, ${heatFill(0.5, 1)}, ${heatFill(1, 1)})`,
          }}
        />
        <span>High</span>
      </div>
    </div>
  );
}

/**
 * Six diverse asset analytics charts, always two per row:
 * standing bars, heatmap, horizontal composition, combined bars+line, pie, multi-line.
 */
export function AlertsReportCharts({ rows, fromDate, toDate, primaryColor, className }: Props) {
  const brand = primaryColor || CHART.brand;

  const volume = useMemo(() => buildAssetAlertVolume(rows), [rows]);
  const heatmap = useMemo(() => buildCategoryHeatmap(rows), [rows]);
  const severity = useMemo(() => buildAssetSeverityProfile(rows), [rows]);
  const response = useMemo(() => buildAssetResponseStatus(rows), [rows]);
  const share = useMemo(() => buildAssetShare(rows), [rows]);
  const lines = useMemo(
    () => buildAssetActivityLines(rows, fromDate, toDate),
    [rows, fromDate, toDate],
  );

  const hasData = rows.length > 0 && volume.length > 0;
  const severityH = chartHeightForRows(severity.length, 24, 40);
  const standingH = 184;
  const volY = yAxisWidth(...volume.map((r) => Math.max(r.total, r.critical)));
  const respY = yAxisWidth(...response.map((r) => r.open + r.acknowledged));
  const lineY = yAxisWidth(
    ...lines.data.flatMap((d) => lines.series.map((s) => Number(d[s.key] ?? 0))),
  );

  const volumeConfig = {
    total: { label: 'Total', color: brand },
    critical: { label: 'Critical', color: ALERT_SEVERITY.critical },
  };
  const severityConfig = {
    critical: { label: 'Critical', color: ALERT_SEVERITY.critical },
    warning: { label: 'Warning', color: ALERT_SEVERITY.warning },
    info: { label: 'Info', color: ALERT_SEVERITY.info },
  };
  const responseConfig = {
    open: { label: 'Open', color: '#c2410c' },
    acknowledged: { label: 'Acknowledged', color: brand },
    ackRate: { label: 'Ack rate %', color: '#6d28d9' },
  };
  const shareConfig = Object.fromEntries(
    share.map((s) => [
      s.name,
      { label: s.name.length > 12 ? `${s.name.slice(0, 11)}…` : s.name, color: String(s.fill) },
    ]),
  );
  const lineConfig = Object.fromEntries(
    lines.series.map((s) => [s.key, { label: s.label, color: s.color }]),
  );

  return (
    <div
      data-report-chart-grid
      className={cn('grid grid-cols-2 gap-3', className)}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
      }}
    >
      {/* 1 — standing grouped bars */}
      <ChartShell
        title="Alert volume by asset"
        subtitle="Standing bars — total and critical per unit"
        empty={!hasData}
      >
        <PlotWithLegend config={volumeConfig} height={standingH}>
          <BarChart
            data={volume}
            margin={{ top: 4, right: 6, left: 2, bottom: 4 }}
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
              angle={-32}
              textAnchor="end"
              height={38}
              tickMargin={4}
            />
            <YAxis
              tick={TICK}
              tickLine={false}
              axisLine={false}
              width={volY}
              allowDecimals={false}
              tickMargin={4}
            />
            <ChartTooltip content={<ChartTooltipContent className="text-[10px]" />} cursor={{ fill: '#f8fafc' }} />
            <Bar dataKey="total" fill="var(--color-total)" radius={[3, 3, 0, 0]} barSize={adaptiveBarSize(volume.length, 2)} />
            <Bar dataKey="critical" fill="var(--color-critical)" radius={[3, 3, 0, 0]} barSize={adaptiveBarSize(volume.length, 2)} />
          </BarChart>
        </PlotWithLegend>
      </ChartShell>

      {/* 2 — category heatmap */}
      <ChartShell
        title="Category by asset"
        subtitle="Heat intensity — darker means more alerts in that category"
        empty={!hasData || heatmap.rows.length === 0}
      >
        <CategoryHeatmap categories={heatmap.categories} rows={heatmap.rows} max={heatmap.max} />
      </ChartShell>

      {/* 3 — severity composition (100% horizontal) */}
      <ChartShell
        title="Severity mix by asset"
        subtitle="Share of critical / warning / info within each unit"
        empty={!hasData}
      >
        <PlotWithLegend config={severityConfig} height={severityH}>
          <BarChart
            layout="vertical"
            data={severity}
            margin={{ top: 2, right: 8, left: 2, bottom: 2 }}
            stackOffset="expand"
            barCategoryGap="18%"
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
            <XAxis
              type="number"
              tick={TICK}
              tickLine={false}
              axisLine={false}
              tickMargin={4}
              tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={68}
              tick={TICK_LABEL}
              tickLine={false}
              axisLine={false}
              tickMargin={4}
            />
            <ChartTooltip content={<ChartTooltipContent className="text-[10px]" />} />
            <Bar dataKey="critical" stackId="sev" fill="var(--color-critical)" radius={[3, 0, 0, 3]} barSize={adaptiveBarSize(severity.length, 1)} />
            <Bar dataKey="warning" stackId="sev" fill="var(--color-warning)" barSize={adaptiveBarSize(severity.length, 1)} />
            <Bar dataKey="info" stackId="sev" fill="var(--color-info)" radius={[0, 3, 3, 0]} barSize={adaptiveBarSize(severity.length, 1)} />
          </BarChart>
        </PlotWithLegend>
      </ChartShell>

      {/* 4 — combined bars + line */}
      <ChartShell
        title="Open vs acknowledged"
        subtitle="Combined — stacked status bars with acknowledgement-rate line"
        empty={!hasData}
      >
        <PlotWithLegend config={responseConfig} height={standingH}>
          <ComposedChart data={response} margin={{ top: 4, right: 4, left: 2, bottom: 4 }} barCategoryGap="24%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey="name"
              tick={{ ...TICK_LABEL, dy: 4 }}
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={-32}
              textAnchor="end"
              height={38}
              tickMargin={4}
            />
            <YAxis
              yAxisId="count"
              tick={TICK}
              tickLine={false}
              axisLine={false}
              width={respY}
              allowDecimals={false}
              tickMargin={4}
            />
            <YAxis
              yAxisId="rate"
              orientation="right"
              domain={[0, 100]}
              tick={TICK_RATE}
              tickLine={false}
              axisLine={false}
              width={34}
              tickMargin={4}
              tickFormatter={(v) => `${v}%`}
            />
            <ChartTooltip content={<ChartTooltipContent className="text-[10px]" />} cursor={{ fill: '#f8fafc' }} />
            <Bar yAxisId="count" dataKey="open" stackId="status" fill="var(--color-open)" barSize={adaptiveBarSize(response.length, 1)} />
            <Bar yAxisId="count" dataKey="acknowledged" stackId="status" fill="var(--color-acknowledged)" radius={[3, 3, 0, 0]} barSize={adaptiveBarSize(response.length, 1)} />
            <Line
              yAxisId="rate"
              type="monotone"
              dataKey="ackRate"
              stroke="var(--color-ackRate)"
              strokeWidth={2}
              dot={{ r: 2.5, fill: '#6d28d9' }}
            />
          </ComposedChart>
        </PlotWithLegend>
      </ChartShell>

      {/* 5 — pie share */}
      <ChartShell
        title="Alert share by asset"
        subtitle="Proportion of fleet alert load"
        empty={!hasData || share.length === 0}
      >
        <PlotWithLegend config={shareConfig} height={standingH}>
          <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <ChartTooltip content={<ChartTooltipContent hideLabel className="text-[10px]" />} />
            <Pie
              data={share}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={34}
              outerRadius={58}
              paddingAngle={2}
              strokeWidth={1}
            >
              {share.map((entry, i) => (
                <Cell key={i} fill={String(entry.fill)} />
              ))}
            </Pie>
          </PieChart>
        </PlotWithLegend>
      </ChartShell>

      {/* 6 — multi-line trend */}
      <ChartShell
        title="Asset load over time"
        subtitle="Daily alert trend for the busiest units"
        empty={!hasData || lines.series.length === 0}
      >
        <PlotWithLegend config={lineConfig} height={standingH}>
          <LineChart data={lines.data} margin={{ top: 4, right: 6, left: 2, bottom: 2 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey="day"
              tick={TICK}
              tickLine={false}
              axisLine={false}
              tickMargin={4}
              minTickGap={8}
            />
            <YAxis
              tick={TICK}
              tickLine={false}
              axisLine={false}
              width={lineY}
              allowDecimals={false}
              tickMargin={4}
            />
            <ChartTooltip content={<ChartTooltipContent className="text-[10px]" />} />
            {lines.series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={`var(--color-${s.key})`}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
              />
            ))}
          </LineChart>
        </PlotWithLegend>
      </ChartShell>
    </div>
  );
}
