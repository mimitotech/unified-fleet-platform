import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowLeftRight, Download, FileSpreadsheet, Loader2, Printer, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandedReportDocument, BrandedReportFooter, BrandedReportHeader } from '@/components/reports/BrandedReportChrome';
import { clientApi } from '@/lib/api';
import { notify } from '@/lib/notify';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { cn } from '@/lib/utils';
import type { FuelTabDateRangeProps } from './fuelTabTypes';
import { QueryErrorBanner } from '@/components/shared/QueryErrorBanner';
import { importPrintReport } from '@/lib/importPrintReport';

export function FuelVarianceTab({ fromDate, toDate }: FuelTabDateRangeProps) {
  const branding = useTenantBranding();
  const printRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['fuel', 'variance', fromDate, toDate],
    queryFn: () => clientApi.getFuelVariance(fromDate, toDate),
    staleTime: 30_000,
  });

  const summary = data?.summary;
  const assets = data?.assets ?? [];
  const details = data?.details ?? [];

  const periodLabel = useMemo(() => {
    try {
      return `${format(new Date(`${fromDate}T12:00:00`), 'dd MMM yyyy')} – ${format(new Date(`${toDate}T12:00:00`), 'dd MMM yyyy')}`;
    } catch {
      return `${fromDate} – ${toDate}`;
    }
  }, [fromDate, toDate]);

  const handlePrint = async (mode: 'download' | 'print') => {
    if (!printRef.current) return;
    setBusy(true);
    try {
      const { printReportDocument } = await importPrintReport();
      await printReportDocument({
        root: printRef.current,
        title: `${branding.name || 'Client'} - Fuel variance ${fromDate} to ${toDate}`,
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
      setBusy(false);
    }
  };

  const thStyle = {
    background: branding.primaryColor,
    color: '#fff',
    borderColor: branding.primaryColor,
  } as const;

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold tracking-tight flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-primary" />
            Fuel variance
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Petrol-station fills (reference) vs FLS sensor fills · {periodLabel}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5" data-no-print>
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Refresh
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs border-primary/40 text-primary" onClick={() => void handlePrint('download')} disabled={busy || (!assets.length && !details.length)}>
            <Download className="h-3.5 w-3.5 mr-1" />
            Download PDF
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => void handlePrint('print')} disabled={busy || (!assets.length && !details.length)}>
            <Printer className="h-3.5 w-3.5 mr-1" />
            Print
          </Button>
        </div>
      </div>

      {isError && <QueryErrorBanner message="Could not load variance data." onRetry={() => refetch()} />}

      <div ref={printRef} className="rounded-lg border bg-white text-slate-900 overflow-hidden">
        <BrandedReportDocument branding={branding}>
          <div className="px-5 pt-5 pb-4 space-y-4">
            <BrandedReportHeader
              branding={branding}
              reportTitle="Fuel variance"
              moduleLabel="Fuel"
              periodLabel={periodLabel}
            />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'Station filled', value: summary ? `${summary.stationLiters.toLocaleString()} L` : '—', icon: FileSpreadsheet, className: 'text-emerald-700' },
            { label: 'FLS filled', value: summary ? `${summary.flsLiters.toLocaleString()} L` : '—', icon: Radio, className: 'text-sky-700' },
            { label: 'Net variance', value: summary ? `${summary.variance > 0 ? '+' : ''}${summary.variance.toLocaleString()} L` : '—', icon: ArrowLeftRight, className: 'text-amber-700' },
            { label: 'Assets / fills', value: summary ? `${summary.assets} · ${summary.stationFills}` : '—', icon: FileSpreadsheet, className: 'text-muted-foreground' },
          ].map((k) => (
            <Card key={k.label} className="shadow-none border-border/70">
              <CardContent className="p-3">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <k.icon className="h-3 w-3" />
                  {k.label}
                </p>
                <p className={cn('text-sm font-semibold tabular-nums mt-1', k.className)}>{k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="shadow-none border-border/70 overflow-hidden">
          <CardHeader className="py-2.5 px-3">
            <CardTitle className="text-sm">Asset comparison</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs">
                    <th className="text-left py-2 px-3 font-medium" style={thStyle}>Asset</th>
                    <th className="text-left py-2 px-3 font-medium" style={thStyle}>Registration</th>
                    <th className="text-right py-2 px-3 font-medium" style={thStyle}>Station (L)</th>
                    <th className="text-right py-2 px-3 font-medium" style={thStyle}>FLS (L)</th>
                    <th className="text-right py-2 px-3 font-medium" style={thStyle}>Variance (L)</th>
                    <th className="text-right py-2 px-3 font-medium" style={thStyle}>Fills</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && !assets.length ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                        Loading variance…
                      </td>
                    </tr>
                  ) : !assets.length ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-muted-foreground text-sm px-4">
                        No petrol-station fills for this period. Ask your administrator to upload the station sheet for these dates.
                      </td>
                    </tr>
                  ) : (
                    assets.map((a) => (
                      <tr key={a.key} className="border-b border-border/40">
                        <td className="py-2 px-3 font-medium">{a.unitName}</td>
                        <td className="py-2 px-3 font-mono text-xs">{a.registration || '—'}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-emerald-700">{a.stationLiters.toFixed(1)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-sky-700">{a.flsLiters.toFixed(1)}</td>
                        <td
                          className={cn(
                            'py-2 px-3 text-right tabular-nums font-medium',
                            a.variance > 0 ? 'text-amber-700' : a.variance < 0 ? 'text-destructive' : 'text-muted-foreground',
                          )}
                        >
                          {a.variance > 0 ? '+' : ''}
                          {a.variance.toFixed(1)}
                        </td>
                        <td className="py-2 px-3 text-right text-xs text-muted-foreground">
                          {a.stationFills} / {a.flsFills}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none border-border/70 overflow-hidden">
          <CardHeader className="py-2.5 px-3">
            <CardTitle className="text-sm">Station fill details</CardTitle>
            <p className="text-[11px] text-muted-foreground">Rows imported from petrol-station sheets for this period</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[420px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b text-xs">
                    <th className="text-left py-2 px-3 font-medium" style={thStyle}>When</th>
                    <th className="text-left py-2 px-3 font-medium" style={thStyle}>Registration</th>
                    <th className="text-left py-2 px-3 font-medium" style={thStyle}>Asset</th>
                    <th className="text-left py-2 px-3 font-medium" style={thStyle}>Product</th>
                    <th className="text-right py-2 px-3 font-medium" style={thStyle}>Qty (L)</th>
                    <th className="text-right py-2 px-3 font-medium" style={thStyle}>Amount</th>
                    <th className="text-left py-2 px-3 font-medium" style={thStyle}>Card / Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {!details.length ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground text-sm">
                        No station detail rows in range.
                      </td>
                    </tr>
                  ) : (
                    details.map((d) => (
                      <tr key={d.id} className="border-b border-border/40">
                        <td className="py-1.5 px-3 text-xs whitespace-nowrap">
                          {format(new Date(d.filledAt), 'dd MMM yyyy HH:mm')}
                        </td>
                        <td className="py-1.5 px-3 font-mono text-xs">{d.registration || '—'}</td>
                        <td className="py-1.5 px-3 text-xs">{d.unitName || '—'}</td>
                        <td className="py-1.5 px-3 text-xs">{d.product || '—'}</td>
                        <td className="py-1.5 px-3 text-right tabular-nums">{d.stationLiters.toFixed(2)}</td>
                        <td className="py-1.5 px-3 text-right tabular-nums text-xs">
                          {d.amount != null ? d.amount.toLocaleString() : '—'}
                        </td>
                        <td className="py-1.5 px-3 text-xs text-muted-foreground">
                          {[d.cardNumber, d.receiptNumber].filter(Boolean).join(' · ') || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
          </div>
          <div className="px-5 pb-5">
            <BrandedReportFooter branding={branding} />
          </div>
        </BrandedReportDocument>
      </div>
    </div>
  );
}
