import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { format } from 'date-fns';
import { Download, BarChart3, Table2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { WialonReportResult, WialonReportTable } from '@/lib/reportUtils';
import { formatReportCell, numericColumns, tableToCsv, downloadTextFile } from '@/lib/reportUtils';
import { cn } from '@/lib/utils';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { notify } from '@/lib/notify';
import { BrandedReportFooter, BrandedReportHeader, BrandedReportDocument } from '@/components/reports/BrandedReportChrome';
import { FuelReportPerformanceCharts } from '@/components/fuel/FuelReportPerformanceCharts';
import { discoverFuelPerformanceMetrics } from '@/lib/fuelReportPerformance';

type Props = {
  data: WialonReportResult;
  templateName?: string;
  unitName?: string;
  moduleLabel?: string;
  className?: string;
};

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
    <div className="space-y-3 min-w-0">
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
      className="grid grid-cols-2 gap-3 mb-3"
      style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', width: '100%' }}
    >
      {[0, 1].map((i) => (
        <div
          key={i}
          data-report-chart-card
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            background: '#ffffff',
            padding: '8px',
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
  const defaultTab = tables[0] ? String(tables[0].index) : '0';
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
    if (!tables.some((table) => String(table.index) === activeTab)) {
      setActiveTab(tables[0] ? String(tables[0].index) : '0');
    }
  }, [tables, activeTab]);

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
    const safeName = (templateName || table.name).replace(/[^\w-]+/g, '_');
    downloadTextFile(tableToCsv(table), `${safeName}-${table.name}.csv`, 'text/csv');
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
      await printReportDocument({
        root: node,
        chartSourceRoot: showFuelPerformance ? chartsPreviewRef.current : null,
        title: `${branding.name || 'Client'} - ${templateName || 'Fuel report'}`,
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

  return (
    <div className={cn('flex flex-col gap-3', className)}>
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

      {tables.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">Report completed with no tabular data.</p>
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
              <TabsContent key={t.index} value={tableKey} className="mt-3">
                <div className="space-y-3">
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
            <TabsContent key={`chart-${c.index}`} value={`chart-${c.index}`} className="mt-3">
              <pre className="text-[11px] max-h-[50vh] overflow-auto rounded-lg border p-3 bg-muted/20">
                {JSON.stringify(c.data, null, 2)}
              </pre>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
