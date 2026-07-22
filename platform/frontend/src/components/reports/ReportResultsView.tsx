import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { format } from 'date-fns';
import { Download, BarChart3, Table2, Printer } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { WialonReportChart, WialonReportResult, WialonReportTable } from '@/lib/reportUtils';
import { formatReportCell, numericColumns, tableToCsv, downloadTextFile } from '@/lib/reportUtils';
import { cn } from '@/lib/utils';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { notify } from '@/lib/notify';
import { BrandedReportFooter, BrandedReportHeader, BrandedReportDocument } from '@/components/reports/BrandedReportChrome';
import { FuelReportPerformanceCharts } from '@/components/fuel/FuelReportPerformanceCharts';
import { discoverFuelPerformanceMetrics } from '@/lib/fuelReportPerformance';
import { buildReportFilename } from '@/lib/reportFilename';

type Props = {
  data: WialonReportResult;
  templateName?: string;
  unitName?: string;
  moduleLabel?: string;
  className?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Extract a renderable image src from Wialon chart payloads. */
function chartImageSrc(data: unknown): string | null {
  if (typeof data === 'string') {
    const s = data.trim();
    if (/^https?:\/\//i.test(s) || s.startsWith('data:image/')) return s;
    if (/^[A-Za-z0-9+/=]+$/.test(s) && s.length > 80) return `data:image/png;base64,${s}`;
    return null;
  }
  const obj = asRecord(data);
  if (!obj) return null;

  for (const key of ['url', 'imageUrl', 'img', 'src', 'href']) {
    const v = obj[key];
    if (typeof v === 'string' && (/^https?:\/\//i.test(v) || v.startsWith('data:image/'))) return v;
  }
  for (const key of ['base64', 'png', 'image', 'data', 'content']) {
    const v = obj[key];
    if (typeof v !== 'string') continue;
    if (v.startsWith('data:image/')) return v;
    if (/^https?:\/\//i.test(v)) return v;
    if (/^[A-Za-z0-9+/=]+$/.test(v) && v.length > 80) return `data:image/png;base64,${v}`;
  }
  if (Array.isArray(obj.urls) && typeof obj.urls[0] === 'string') return obj.urls[0];
  if (Array.isArray(obj.images)) {
    const first = obj.images[0];
    if (typeof first === 'string') {
      if (first.startsWith('data:image/') || /^https?:\/\//i.test(first)) return first;
      if (first.length > 80) return `data:image/png;base64,${first}`;
    }
  }
  return null;
}

type ChartSeriesPoint = { label: string; value: number; [key: string]: string | number };

/** Best-effort series extraction for simple Wialon chart JSON. */
function chartSeries(data: unknown): { points: ChartSeriesPoint[]; keys: string[] } | null {
  const obj = asRecord(data);
  if (!obj) return null;

  const datasets = (obj.datasets ?? obj.series ?? obj.lines ?? obj.y) as unknown;
  const labelsRaw = (obj.labels ?? obj.x ?? obj.categories ?? obj.abscissa) as unknown;

  if (Array.isArray(datasets) && datasets.length) {
    const labels = Array.isArray(labelsRaw)
      ? labelsRaw.map((l, i) => String(l ?? i + 1))
      : null;
    const keys: string[] = [];
    const points: ChartSeriesPoint[] = [];
    const first = datasets[0];
    if (Array.isArray(first) || (asRecord(first) && Array.isArray(asRecord(first)?.data))) {
      const seriesList = datasets.map((ds, di) => {
        const rec = asRecord(ds);
        const values = Array.isArray(ds)
          ? ds.map(Number)
          : Array.isArray(rec?.data)
            ? (rec!.data as unknown[]).map(Number)
            : [];
        const key = String(rec?.name ?? rec?.label ?? `series_${di + 1}`);
        keys.push(key);
        return { key, values };
      });
      const len = Math.max(...seriesList.map((s) => s.values.length), labels?.length ?? 0);
      if (len < 2) return null;
      for (let i = 0; i < len; i++) {
        const point: ChartSeriesPoint = { label: labels?.[i] ?? String(i + 1), value: 0 };
        for (const s of seriesList) {
          const v = Number(s.values[i]);
          point[s.key] = Number.isFinite(v) ? v : 0;
        }
        point.value = Number(point[seriesList[0].key] ?? 0);
        points.push(point);
      }
      return { points, keys };
    }
  }

  if (Array.isArray(labelsRaw) && Array.isArray(obj.y)) {
    const y = obj.y as unknown[];
    const points = labelsRaw.map((l, i) => ({
      label: String(l),
      value: Number(y[i]) || 0,
    }));
    if (points.length >= 2) return { points, keys: ['value'] };
  }

  if (Array.isArray(obj.points)) {
    const points = (obj.points as unknown[])
      .map((p, i) => {
        const rec = asRecord(p);
        if (!rec) return null;
        const value = Number(rec.y ?? rec.v ?? rec.value ?? rec[1]);
        if (!Number.isFinite(value)) return null;
        return {
          label: String(rec.x ?? rec.t ?? rec.label ?? i + 1),
          value,
        };
      })
      .filter((p): p is ChartSeriesPoint => p != null);
    if (points.length >= 2) return { points, keys: ['value'] };
  }

  return null;
}

function WialonReportChartView({ chart, primaryColor }: { chart: WialonReportChart; primaryColor: string }) {
  const imageSrc = useMemo(() => chartImageSrc(chart.data), [chart.data]);
  const series = useMemo(() => chartSeries(chart.data), [chart.data]);

  if (imageSrc) {
    return (
      <div
        data-report-chart-card
        className="rounded-lg border border-slate-200/80 bg-slate-50/40 p-4"
        style={{ marginTop: 8, marginBottom: 8 }}
      >
        <p className="text-xs font-semibold text-slate-700 mb-2" data-report-chart-title>
          {chart.name}
        </p>
        <div data-report-chart-body className="overflow-visible flex justify-center">
          <img
            src={imageSrc}
            alt={chart.name}
            data-report-chart-img
            className="max-w-full h-auto rounded-md border border-slate-100 bg-white"
          />
        </div>
      </div>
    );
  }

  if (series?.points.length) {
    return (
      <div
        data-report-chart-card
        className="rounded-lg border border-slate-200/80 bg-slate-50/40 p-4"
        style={{ marginTop: 8, marginBottom: 8 }}
      >
        <p className="text-xs font-semibold text-slate-700 mb-2" data-report-chart-title>
          {chart.name}
        </p>
        <div data-report-chart-body className="overflow-visible h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series.points} margin={{ top: 12, right: 16, left: 12, bottom: 28 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} tickMargin={6} height={28} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} width={52} tickMargin={6} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              {series.keys.map((key, i) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={i === 0 ? primaryColor : ['#2563eb', '#ea580c', '#7c3aed', '#0891b2'][i % 4]}
                  strokeWidth={2}
                  dot={series.points.length <= 24}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-4 text-xs text-muted-foreground">
      Chart data for {chart.name} is not in a supported image or series format.
    </div>
  );
}

function ReportTableView({
  table,
  branded,
}: {
  table: WialonReportTable;
  branded?: boolean;
}) {
  const branding = useTenantBranding();
  const cols = useMemo(() => {
    if (table.columns.length) return table.columns;
    if (!table.rows[0]) return [];
    return Object.keys(table.rows[0]).map((k) => ({ key: k, label: k.replace(/_/g, ' ') }));
  }, [table]);

  const trends = useMemo(() => numericColumns(table), [table]);
  const minWidth = Math.max(960, cols.length * 140);
  const previewRows = branded ? table.rows : table.rows.slice(0, 400);

  return (
    <div className="space-y-3 min-w-0" style={{ marginTop: 8 }}>
      {trends.length > 0 && (
        <div className="flex flex-wrap gap-2" data-no-print={branded ? undefined : true}>
          {trends.slice(0, 6).map((t) => (
            <div
              key={t.key}
              className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 min-w-[120px]"
            >
              <p className="text-[10px] text-slate-500 uppercase tracking-wide truncate">{t.label}</p>
              <p className="text-sm font-semibold tabular-nums" style={{ color: branding.primaryColor }}>
                Σ {t.sum.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-slate-500 tabular-nums">
                avg {t.avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
          ))}
        </div>
      )}

      <div
        className={cn(
          'rounded-md border border-slate-200 overflow-auto overscroll-contain',
          !branded && 'max-h-[min(78vh,820px)]',
        )}
      >
        <table className="text-sm border-collapse" style={{ minWidth, width: 'max-content' }}>
          <thead className="sticky top-0 z-10">
            <tr>
              {cols.map((c) => (
                <th
                  key={c.key}
                  className="text-left text-xs font-medium whitespace-nowrap px-3 py-2 border"
                  style={{
                    background: branding.primaryColor,
                    color: '#fff',
                    borderColor: branding.primaryColor,
                  }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, ri) => (
              <tr key={ri} className={ri % 2 ? 'bg-slate-50' : 'bg-white'}>
                {cols.map((c) => (
                  <td
                    key={c.key}
                    className="text-xs py-2 px-3 whitespace-nowrap border border-slate-200 text-black"
                  >
                    {formatReportCell(row[c.key])}
                  </td>
                ))}
              </tr>
            ))}
            {!previewRows.length && (
              <tr>
                <td colSpan={Math.max(cols.length, 1)} className="text-center text-muted-foreground py-8">
                  No rows in this table
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {(table.totalRows > table.rows.length || (!branded && table.rows.length > previewRows.length)) && (
        <p className="text-[11px] text-muted-foreground">
          Showing {previewRows.length} of {table.totalRows} rows
          {table.totalRows > table.rows.length ? ' (report limit applied)' : ' (preview trimmed for speed)'}
        </p>
      )}
    </div>
  );
}

function PrintChartPlaceholders() {
  return (
    <div
      data-report-chart-grid
      className="grid grid-cols-2 gap-3"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
        width: '100%',
        marginTop: '24px',
        marginBottom: '24px',
      }}
    >
      {[0, 1].map((i) => (
        <div
          key={i}
          data-report-chart-card
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            background: 'rgba(248,250,252,0.6)',
            padding: '14px',
            minHeight: '250px',
          }}
        />
      ))}
    </div>
  );
}

export function ReportResultsView({ data, templateName, unitName, moduleLabel = 'Reports', className }: Props) {
  const branding = useTenantBranding();
  const { tables, charts, summary } = data;
  const defaultTab = tables[0] ? String(tables[0].index) : charts[0] ? `chart-${charts[0].index}` : '0';
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [busy, setBusy] = useState(false);
  const [mountPrint, setMountPrint] = useState(false);
  const [metricKeysByTable, setMetricKeysByTable] = useState<Record<string, string[]>>({});
  const printRef = useRef<HTMLDivElement>(null);
  const chartsPreviewRef = useRef<HTMLDivElement>(null);

  const activeTable = tables.find((t) => String(t.index) === activeTab);
  const showFuelPerformance = moduleLabel.toLowerCase() === 'fuel';
  const chartPeriod = useMemo(
    () => ({ from: summary.interval.from, to: summary.interval.to }),
    [summary.interval.from, summary.interval.to],
  );
  const periodLabel = `${format(new Date(summary.interval.from * 1000), 'yyyy-MM-dd HH:mm')} → ${format(
    new Date(summary.interval.to * 1000),
    'yyyy-MM-dd HH:mm',
  )}`;

  useEffect(() => {
    const valid =
      tables.some((table) => String(table.index) === activeTab) ||
      charts.some((c) => `chart-${c.index}` === activeTab);
    if (!valid) {
      setActiveTab(tables[0] ? String(tables[0].index) : charts[0] ? `chart-${charts[0].index}` : '0');
    }
  }, [tables, charts, activeTab]);

  useEffect(() => {
    if (!showFuelPerformance) return;
    setMetricKeysByTable((prev) => {
      const next = { ...prev };
      for (const table of tables) {
        const key = String(table.index);
        if (next[key]?.length) continue;
        const discovered = discoverFuelPerformanceMetrics(table)
          .slice(0, 3)
          .map((metric) => metric.sourceKey);
        if (discovered.length) next[key] = discovered;
      }
      return next;
    });
  }, [tables, showFuelPerformance]);

  const exportTableCsv = (table: WialonReportTable) => {
    const name = buildReportFilename({
      clientName: branding.name,
      reportName: templateName || table.label || table.name,
      date: new Date().toISOString().slice(0, 10),
      unitName,
    });
    downloadTextFile(tableToCsv(table), `${name}.csv`, 'text/csv');
  };

  const exportBranded = async (mode: 'download' | 'print') => {
    if (!activeTable) return;
    setBusy(true);
    flushSync(() => setMountPrint(true));
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      await new Promise((r) => setTimeout(r, 280));

      const node = printRef.current;
      if (!node) throw new Error('Could not prepare report sheet');
      const { printReportDocument } = await import('@/lib/printReport');
      const filename = buildReportFilename({
        clientName: branding.name,
        reportName: templateName || 'Fuel report',
        date: new Date().toISOString().slice(0, 10),
        unitName,
      });
      await printReportDocument({
        root: node,
        chartSourceRoot: showFuelPerformance ? chartsPreviewRef.current : null,
        title: `${branding.name || 'Client'} - ${templateName || 'Fuel report'}`,
        filename,
        primaryColor: branding.primaryColor,
        secondaryColor: branding.secondaryColor,
        mode,
      });
    } catch (e) {
      notify.error(
        mode === 'download' ? 'Download failed' : 'Print failed',
        e instanceof Error ? e.message : 'Could not prepare report',
      );
    } finally {
      setMountPrint(false);
      setBusy(false);
    }
  };

  const wialonChartsBlock =
    charts.length > 0 ? (
      <div
        className="space-y-3"
        style={{ marginTop: 24, marginBottom: 24 }}
        data-report-chart-grid
      >
        {charts.map((c) => (
          <WialonReportChartView key={c.index} chart={c} primaryColor={branding.primaryColor} />
        ))}
      </div>
    ) : null;

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2" data-no-print>
        <div className="min-w-0">
          <h3 className="font-semibold text-sm truncate">{templateName || 'Report results'}</h3>
          <p className="text-xs text-muted-foreground">
            {unitName && <span>{unitName} · </span>}
            {periodLabel}
            <span className="ml-2 text-muted-foreground/80">
              Generated {format(new Date(summary.generatedAt), 'HH:mm:ss')}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">
            {summary.tableCount} table{summary.tableCount !== 1 ? 's' : ''}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {summary.rowCount} rows
          </Badge>
          {summary.chartCount > 0 && (
            <Badge variant="outline" className="text-[10px]">
              {summary.chartCount} chart{summary.chartCount !== 1 ? 's' : ''}
            </Badge>
          )}
          {activeTable && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={busy}
              onClick={() => exportTableCsv(activeTable)}
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              CSV
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs border-primary/40 text-primary"
            disabled={busy || !activeTable}
            onClick={() => void exportBranded('download')}
          >
            <Download className="h-3.5 w-3.5 mr-1" />
            Download PDF
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs border-primary/40 text-primary"
            disabled={busy || !activeTable}
            onClick={() => void exportBranded('print')}
          >
            <Printer className="h-3.5 w-3.5 mr-1" />
            Print / PDF
          </Button>
        </div>
      </div>

      {mountPrint && activeTable && (
        <div className="fixed left-[-10000px] top-0 w-[1100px] pointer-events-none" aria-hidden>
          <div ref={printRef} className="bg-white text-slate-900 p-1">
            <BrandedReportDocument branding={branding}>
              <BrandedReportHeader
                branding={branding}
                reportTitle={templateName || activeTable.label || 'Report'}
                moduleLabel={moduleLabel}
                periodLabel={periodLabel}
                objectLabel={unitName}
                generatedAt={new Date(summary.generatedAt)}
              />
              <div className="border border-slate-200 border-t-0 px-3 py-3 bg-white/90">
                <p className="text-xs font-medium text-slate-700 mb-2">{activeTable.label}</p>
                {showFuelPerformance && <PrintChartPlaceholders />}
                <ReportTableView table={activeTable} branded />
              </div>
              <BrandedReportFooter
                branding={branding}
                generatedAt={new Date(summary.generatedAt)}
              />
            </BrandedReportDocument>
          </div>
        </div>
      )}

      {tables.length === 0 && charts.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">Report completed with no tabular data.</p>
      ) : tables.length === 0 ? (
        <div>{wialonChartsBlock}</div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-9 flex-wrap justify-start" data-no-print>
            {tables.map((t) => (
              <TabsTrigger key={t.index} value={String(t.index)} className="text-xs gap-1">
                <Table2 className="h-3 w-3" />
                {t.label}
                <span className="text-muted-foreground">({t.rows.length})</span>
              </TabsTrigger>
            ))}
            {charts.map((c) => (
              <TabsTrigger key={`chart-${c.index}`} value={`chart-${c.index}`} className="text-xs gap-1">
                <BarChart3 className="h-3 w-3" />
                {c.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {tables.map((t) => {
            const tableKey = String(t.index);
            const isActive = activeTab === tableKey;
            return (
              <TabsContent key={t.index} value={tableKey} className="mt-4">
                <div className="flex flex-col">
                  {isActive && wialonChartsBlock}
                  {showFuelPerformance && (
                    <div ref={isActive ? chartsPreviewRef : undefined}>
                      <FuelReportPerformanceCharts
                        table={t}
                        assetName={unitName}
                        primaryColor={branding.primaryColor}
                        period={chartPeriod}
                        metricSourceKeys={metricKeysByTable[tableKey] || []}
                        onMetricSourceKeysChange={(keys) =>
                          setMetricKeysByTable((prev) => ({ ...prev, [tableKey]: keys }))
                        }
                      />
                    </div>
                  )}
                  <ReportTableView table={t} />
                </div>
              </TabsContent>
            );
          })}
          {charts.map((c) => (
            <TabsContent key={`chart-${c.index}`} value={`chart-${c.index}`} className="mt-4">
              <WialonReportChartView chart={c} primaryColor={branding.primaryColor} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
