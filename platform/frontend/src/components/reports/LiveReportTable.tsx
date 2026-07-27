import { useState, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { format } from 'date-fns';
import { Download, Loader2, Printer, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { LiveReportDef } from '@/lib/reportCatalog';
import { formatReportCell } from '@/lib/reportUtils';
import { buildReportCsv, downloadReportCsv } from '@/lib/reportCsv';
import { renderReportCell } from '@/lib/reportCellStyles';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { notify } from '@/lib/notify';
import {
  BrandedReportDocument,
  BrandedReportFooter,
  BrandedReportHeader,
} from '@/components/reports/BrandedReportChrome';
import { buildReportFilename } from '@/lib/reportFilename';
import { cn } from '@/lib/utils';
import { importPrintReport } from '@/lib/importPrintReport';

type Props = {
  def: LiveReportDef;
  rows: Record<string, unknown>[];
  fetchedAt?: string;
  isLoading?: boolean;
  isFetching?: boolean;
  onRefresh?: () => void;
  emptyHint?: string;
  periodLabel?: string;
  objectLabel?: string;
  moduleLabel?: string;
  className?: string;
};

export function LiveReportTable({
  def,
  rows,
  fetchedAt,
  isLoading,
  isFetching,
  onRefresh,
  emptyHint,
  periodLabel,
  objectLabel,
  moduleLabel = 'Reports',
  className,
}: Props) {
  const branding = useTenantBranding();
  const [busy, setBusy] = useState(false);

  const filenameBase = () =>
    buildReportFilename({
      clientName: branding.name,
      reportName: def.label,
      date: new Date().toISOString().slice(0, 10),
      unitName: objectLabel,
    });

  const exportCsv = () => {
    const csv = buildReportCsv({
      meta: {
        title: def.label,
        moduleLabel,
        clientName: branding.name,
        periodLabel: periodLabel || undefined,
        objectLabel: objectLabel || undefined,
        generatedAt: fetchedAt ? new Date(fetchedAt) : new Date(),
        notes: [def.description, emptyHint].filter((n): n is string => Boolean(n?.trim())),
        extraMeta: [
          { label: 'Report id', value: def.id },
          ...(fetchedAt ? [{ label: 'Fetched at', value: format(new Date(fetchedAt), 'yyyy-MM-dd HH:mm:ss') }] : []),
        ],
      },
      columns: def.columns.map((c) => ({ key: c.key, label: c.label })),
      rows,
      formatCell: (_key, value) => {
        if (value == null || value === '') return '';
        if (typeof value === 'number' || typeof value === 'boolean') return value;
        return formatReportCell(value);
      },
    });
    downloadReportCsv(csv, `${filenameBase()}.csv`);
  };

  const exportPdf = async (mode: 'download' | 'print') => {
    setBusy(true);
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1100px;pointer-events:none;';
    document.body.appendChild(host);
    const root = createRoot(host);

    try {
      await new Promise<void>((resolve) => {
        root.render(
          createElement(
            'div',
            { className: 'bg-white text-slate-900' },
            createElement(BrandedReportDocument, {
              branding,
              children: [
                createElement(BrandedReportHeader, {
                  branding,
                  reportTitle: def.label,
                  moduleLabel,
                  periodLabel,
                  objectLabel,
                  generatedAt: fetchedAt ? new Date(fetchedAt) : new Date(),
                }),
                createElement(
                  'div',
                  { className: 'border border-slate-200 border-t-0 px-4 py-3', key: 'body' },
                  createElement(
                    'table',
                    { className: 'w-full text-sm border-collapse' },
                    createElement(
                      'thead',
                      null,
                      createElement(
                        'tr',
                        null,
                        def.columns.map((col) =>
                          createElement(
                            'th',
                            {
                              key: col.key,
                              className: cn(
                                'border px-2 py-1.5 text-xs font-medium',
                                col.align === 'right' ? 'text-right' : 'text-left',
                              ),
                              style: {
                                background: branding.primaryColor,
                                color: '#fff',
                                borderColor: branding.primaryColor,
                              },
                            },
                            col.label,
                          ),
                        ),
                      ),
                    ),
                    createElement(
                      'tbody',
                      null,
                      rows.map((row, ri) =>
                        createElement(
                          'tr',
                          { key: ri, className: ri % 2 ? 'bg-slate-50' : 'bg-white' },
                          def.columns.map((col) =>
                            createElement(
                              'td',
                              {
                                key: col.key,
                                className: cn(
                                  'border border-slate-200 px-2 py-1 text-xs',
                                  col.align === 'right' && 'text-right',
                                ),
                              },
                              formatReportCell(row[col.key]),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                createElement(BrandedReportFooter, {
                  branding,
                  generatedAt: fetchedAt ? new Date(fetchedAt) : new Date(),
                }),
              ],
            }),
          ),
        );
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

      const { printReportDocument } = await importPrintReport();
      await printReportDocument({
        root: host.firstElementChild as HTMLElement,
        title: `${branding.name || 'Client'} - ${def.label}`,
        filename: filenameBase(),
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
      root.unmount();
      host.remove();
      setBusy(false);
    }
  };

  return (
    <div className={cn('flex flex-col h-full min-h-0', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 shrink-0">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm">{def.label}</h3>
          <p className="text-xs text-muted-foreground">{def.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {fetchedAt && (
            <span className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-1">
              {isFetching && <Loader2 className="h-3 w-3 animate-spin text-status-moving" />}
              Updated {format(new Date(fetchedAt), 'HH:mm:ss')}
            </span>
          )}
          {onRefresh && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onRefresh} disabled={isFetching}>
              <RefreshCw className={cn('h-3 w-3 mr-1', isFetching && 'animate-spin')} />
              Refresh
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={exportCsv} disabled={!rows.length}>
            <Download className="h-3 w-3 mr-1" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs border-primary/40 text-primary"
            onClick={() => void exportPdf('download')}
            disabled={busy || !rows.length}
          >
            <Download className="h-3 w-3 mr-1" />
            Download PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void exportPdf('print')}
            disabled={busy || !rows.length}
          >
            <Printer className="h-3 w-3 mr-1" />
            Print
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border/60 flex-1 min-h-0 relative bg-card/50">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/60 backdrop-blur-[1px]">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        <ScrollArea className="h-[min(58vh,560px)]">
          <Table>
            <TableHeader className="sticky top-0 bg-gradient-to-r from-primary/10 via-card to-card z-[1]">
              <TableRow className="hover:bg-transparent border-b border-primary/20">
                {def.columns.map((col) => (
                  <TableHead
                    key={col.key}
                    className={cn(
                      'text-xs whitespace-nowrap h-9 font-semibold text-foreground/90',
                      col.align === 'right' && 'text-right',
                    )}
                  >
                    {col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, ri) => (
                <TableRow key={ri} className="hover:bg-muted/30 even:bg-muted/10">
                  {def.columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn(
                        'text-xs py-2 max-w-[220px]',
                        col.align === 'right' && 'text-right',
                        !['status', 'fuelPercent', 'fuelLive'].includes(col.key) && 'truncate',
                      )}
                    >
                      {renderReportCell(col.key, row[col.key], row) ?? formatReportCell(row[col.key])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {!rows.length && !isLoading && (
                <TableRow>
                  <TableCell
                    colSpan={def.columns.length}
                    className="text-center text-muted-foreground py-16 text-sm"
                  >
                    {emptyHint ?? 'Waiting for live data…'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1.5 shrink-0">
        {rows.length} row{rows.length !== 1 ? 's' : ''} · columns fixed for this report · data refreshes automatically
      </p>
    </div>
  );
}
