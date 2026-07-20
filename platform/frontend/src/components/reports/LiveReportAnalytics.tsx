import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Area,
  AreaChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import { buildReportCharts, buildReportKpis, type ReportChartSpec } from '@/lib/liveReportAnalytics';
import { kpiToneClass } from '@/lib/reportCellStyles';
import { CHART } from '@/lib/chartColors';
import { cn } from '@/lib/utils';

type Props = {
  reportId: string;
  rows: Record<string, unknown>[];
  className?: string;
};

function chartConfig(spec: ReportChartSpec) {
  const cfg: Record<string, { label: string; color: string }> = {};
  for (const s of spec.series) cfg[s.key] = { label: s.label, color: s.color };
  return cfg;
}

function ReportChartCard({ spec }: { spec: ReportChartSpec }) {
  if (!spec.data.length) {
    return (
      <div className="rounded-xl border border-border/60 bg-gradient-to-br from-card to-muted/20 p-3 min-h-[180px] flex flex-col">
        <p className="text-xs font-semibold">{spec.title}</p>
        {spec.subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{spec.subtitle}</p>}
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">No data yet</div>
      </div>
    );
  }

  const config = chartConfig(spec);

  return (
    <div className="rounded-xl border border-border/60 bg-gradient-to-br from-card via-card to-primary/[0.03] p-3 min-h-[180px] flex flex-col shadow-sm">
      <div className="mb-1 shrink-0">
        <p className="text-xs font-semibold text-foreground">{spec.title}</p>
        {spec.subtitle && <p className="text-[10px] text-muted-foreground">{spec.subtitle}</p>}
      </div>
      <ChartContainer config={config} className="h-[140px] w-full flex-1">
        {spec.type === 'pie' ? (
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Pie data={spec.data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={28} outerRadius={52} paddingAngle={2}>
              {spec.data.map((entry, i) => (
                <Cell key={i} fill={String(entry.fill || spec.series[0]?.color || CHART.brand)} />
              ))}
            </Pie>
            <ChartLegend content={<ChartLegendContent />} />
          </PieChart>
        ) : spec.type === 'line' ? (
          <LineChart data={spec.data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey={spec.xKey} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={28} />
            <ChartTooltip content={<ChartTooltipContent />} />
            {spec.series.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} stroke={`var(--color-${s.key})`} strokeWidth={2} dot={{ r: 2 }} />
            ))}
          </LineChart>
        ) : spec.type === 'area' ? (
          <AreaChart data={spec.data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey={spec.xKey} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={28} />
            <ChartTooltip content={<ChartTooltipContent />} />
            {spec.series.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={`var(--color-${s.key})`}
                fill={`var(--color-${s.key})`}
                fillOpacity={0.25}
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        ) : (
          <BarChart
            data={spec.data}
            layout={spec.horizontal ? 'vertical' : 'horizontal'}
            margin={{ top: 4, right: 4, left: spec.horizontal ? 4 : -20, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={!spec.horizontal} horizontal={spec.horizontal} />
            {spec.horizontal ? (
              <>
                <XAxis type="number" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey={spec.xKey} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={72} />
              </>
            ) : (
              <>
                <XAxis dataKey={spec.xKey} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={28} />
              </>
            )}
            <ChartTooltip content={<ChartTooltipContent />} cursor={{ fill: CHART.brandLight, opacity: 0.4 }} />
            {spec.series.map((s) => (
              <Bar key={s.key} dataKey={s.key} radius={[4, 4, 0, 0]} fill={`var(--color-${s.key})`}>
                {spec.data.map((entry, i) => (
                  <Cell key={i} fill={String(entry.fill || `var(--color-${s.key})`)} />
                ))}
              </Bar>
            ))}
          </BarChart>
        )}
      </ChartContainer>
      {spec.forecastNote && (
        <p className="text-[10px] text-muted-foreground mt-1 flex items-start gap-1">
          <TrendingUp className="h-3 w-3 shrink-0 text-status-idle mt-0.5" />
          {spec.forecastNote}
        </p>
      )}
    </div>
  );
}

export function LiveReportAnalytics({ reportId, rows, className }: Props) {
  const charts = buildReportCharts(reportId, rows);
  const kpis = buildReportKpis(reportId, rows);

  return (
    <div className={cn('space-y-3 shrink-0', className)}>
      {kpis.length > 1 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {kpis.map((k) => (
            <div key={k.label} className={cn('rounded-lg border px-3 py-2', kpiToneClass(k.tone))}>
              <p className="text-[10px] uppercase tracking-wide opacity-80">{k.label}</p>
              <p className="text-lg font-bold tabular-nums">{k.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {charts.map((spec) => (
          <ReportChartCard key={spec.id} spec={spec} />
        ))}
      </div>
    </div>
  );
}
