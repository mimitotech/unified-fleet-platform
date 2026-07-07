import { useMemo } from 'react';
import { format } from 'date-fns';
import { Download, BarChart3, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { WialonReportResult, WialonReportTable } from '@/lib/reportUtils';
import { formatReportCell, numericColumns, tableToCsv, downloadTextFile } from '@/lib/reportUtils';
import { cn } from '@/lib/utils';

type Props = {
  data: WialonReportResult;
  templateName?: string;
  unitName?: string;
  className?: string;
};

function ReportTableView({ table }: { table: WialonReportTable }) {
  const cols = useMemo(() => {
    if (table.columns.length) return table.columns;
    if (!table.rows[0]) return [];
    return Object.keys(table.rows[0]).map((k) => ({ key: k, label: k.replace(/_/g, ' ') }));
  }, [table]);

  const trends = useMemo(() => numericColumns(table), [table]);

  return (
    <div className="space-y-3">
      {trends.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {trends.slice(0, 6).map((t) => (
            <div key={t.key} className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 min-w-[120px]">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">{t.label}</p>
              <p className="text-sm font-semibold tabular-nums">
                Σ {t.sum.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-muted-foreground tabular-nums">
                avg {t.avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
          ))}
        </div>
      )}

      <ScrollArea className="h-[min(52vh,520px)] rounded-lg border border-border/60">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              {cols.map((c) => (
                <TableHead key={c.key} className="text-xs whitespace-nowrap">
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.rows.map((row, ri) => (
              <TableRow key={ri} className="hover:bg-muted/30">
                {cols.map((c) => (
                  <TableCell key={c.key} className="text-xs py-2 max-w-[240px] truncate">
                    {formatReportCell(row[c.key])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {!table.rows.length && (
              <TableRow>
                <TableCell colSpan={Math.max(cols.length, 1)} className="text-center text-muted-foreground py-8">
                  No rows in this table
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ScrollArea>
      {table.totalRows > table.rows.length && (
        <p className="text-[11px] text-muted-foreground">
          Showing {table.rows.length} of {table.totalRows} rows (Wialon report limit applied)
        </p>
      )}
    </div>
  );
}

export function ReportResultsView({ data, templateName, unitName, className }: Props) {
  const { tables, charts, summary } = data;
  const defaultTab = tables[0] ? String(tables[0].index) : '0';

  const exportTable = (table: WialonReportTable) => {
    const safeName = (templateName || table.name).replace(/[^\w-]+/g, '_');
    downloadTextFile(tableToCsv(table), `${safeName}-${table.name}.csv`, 'text/csv');
  };

  const exportAll = () => {
    for (const t of tables) exportTable(t);
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm truncate">{templateName || 'Report results'}</h3>
          <p className="text-xs text-muted-foreground">
            {unitName && <span>{unitName} · </span>}
            {format(new Date(summary.interval.from * 1000), 'MMM d, HH:mm')} –{' '}
            {format(new Date(summary.interval.to * 1000), 'MMM d, HH:mm')}
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
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={exportAll}>
            <Download className="h-3.5 w-3.5 mr-1" />
            Export CSV
          </Button>
        </div>
      </div>

      {tables.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">Report completed with no tabular data.</p>
      ) : (
        <Tabs defaultValue={defaultTab}>
          <TabsList className="h-9 flex-wrap justify-start">
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
          {tables.map((t) => (
            <TabsContent key={t.index} value={String(t.index)} className="mt-3">
              <div className="flex justify-end mb-2">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => exportTable(t)}>
                  <Download className="h-3 w-3 mr-1" />
                  Download this table
                </Button>
              </div>
              <ReportTableView table={t} />
            </TabsContent>
          ))}
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
