import { format } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WialonFuelReportData, WialonFuelTransaction } from '@/lib/fuelTypes';
import { FuelReportKpiCards } from '@/components/fuel/FuelReportKpiCards';
import { FuelReportTrendChart } from '@/components/fuel/FuelReportTrendChart';

const SECTION_STYLE: Record<WialonFuelTransaction['section'], string> = {
  consumption: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  filling: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  theft: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300',
};

type Props = {
  fromDate: string;
  toDate: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  report?: WialonFuelReportData;
  isLoading?: boolean;
  isRefreshing?: boolean;
  error?: Error;
  onLoad?: () => void;
  hideDatePickers?: boolean;
};

export function FuelReportHistoryPanel({
  fromDate,
  toDate,
  onFromChange,
  onToChange,
  report,
  isLoading,
  isRefreshing,
  error,
  onLoad,
  hideDatePickers,
}: Props) {
  const transactions = report?.transactions ?? [];
  const kpis = report?.kpis;
  const trend = report?.trend ?? [];

  return (
    <div className="space-y-4">
      <div className="fleet-card p-4 flex flex-wrap items-end gap-4">
        {!hideDatePickers && (
          <>
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" className="h-9 mt-1 w-[160px]" value={fromDate} onChange={(e) => onFromChange(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" className="h-9 mt-1 w-[160px]" value={toDate} onChange={(e) => onToChange(e.target.value)} />
            </div>
          </>
        )}
        {hideDatePickers && (
          <div>
            <p className="text-xs font-medium">Fuel report</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {fromDate} → {toDate}
            </p>
          </div>
        )}
        {isRefreshing && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Updating…
          </span>
        )}
        {onLoad && (
          <Button size="sm" variant="outline" className="h-9" disabled={isRefreshing} onClick={onLoad}>
            {isRefreshing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
            Refresh
          </Button>
        )}
        {report?.fetchedAt && (
          <p className="text-xs text-muted-foreground ml-auto">
            Loaded {format(new Date(report.fetchedAt), 'yyyy-MM-dd HH:mm')}
            {report.source ? ` · ${report.source}` : ''}
          </p>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive fleet-card p-3">{error.message}</p>
      )}

      <FuelReportKpiCards kpis={kpis} isLoading={isLoading && !transactions.length} />

      <div className="fleet-card p-4">
        <h3 className="text-sm font-semibold mb-3">Monthly filled vs consumed</h3>
        {isLoading && !trend.length ? (
          <Skeleton className="h-[220px]" />
        ) : (
          <FuelReportTrendChart trend={trend} />
        )}
      </div>

      <div className="fleet-card overflow-hidden">
        {isLoading && !transactions.length ? (
          <Skeleton className="h-64 m-4" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Sensor</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Filled</TableHead>
                <TableHead className="text-right">Used</TableHead>
                <TableHead className="text-right">Before</TableHead>
                <TableHead className="text-right">After</TableHead>
                <TableHead>Location</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {t.timestamp ? format(new Date(t.timestamp * 1000), 'yyyy-MM-dd HH:mm') : t.time}
                  </TableCell>
                  <TableCell className="font-medium text-sm max-w-[200px] break-words">{t.unitName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate" title={t.sensor}>
                    {t.sensor || '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('text-[10px] capitalize', SECTION_STYLE[t.section])}>
                      {t.section}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{t.filled > 0 ? t.filled : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.fuelUsed > 0 ? t.fuelUsed : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.initialLevel > 0 ? t.initialLevel : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.finalLevel > 0 ? t.finalLevel : '—'}</TableCell>
                  <TableCell className="text-xs truncate max-w-[160px]">{t.location || '—'}</TableCell>
                </TableRow>
              ))}
              {!transactions.length && !isLoading && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    No fuel events in report for {fromDate} → {toDate}.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
