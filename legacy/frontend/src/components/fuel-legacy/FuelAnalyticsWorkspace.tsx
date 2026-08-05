import { format } from 'date-fns';
import { useState } from 'react';
import { MetricCard } from '@/components/app/MetricCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Droplets,
  Flame,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FuelAnalyticsResult, FuelPeriod, WialonFuelAssetRow } from '@/lib/fuelTypes';
import { FuelAssetSidebar } from '@/components/fuel/FuelAssetSidebar';
import { FuelAnalyticsCharts } from '@/components/fuel/FuelAnalyticsCharts';
import { FuelBalanceCard } from '@/components/fuel/FuelBalanceCard';
import { FuelLedgerPanel } from '@/components/fuel/FuelLedgerPanel';
import { monthOptions } from '@/hooks/useFuelAnalytics';

type Props = {
  assets: WialonFuelAssetRow[];
  selectedUnitId: number | null;
  onSelectUnit: (id: number | null) => void;
  period: FuelPeriod;
  onPeriodChange: (p: FuelPeriod) => void;
  month: string;
  onMonthChange: (m: string) => void;
  fromDate: string;
  toDate: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  analytics?: FuelAnalyticsResult;
  isLoading: boolean;
  isRefreshing: boolean;
  error?: Error;
  onRefresh: () => void;
};

const SEVERITY_STYLE = {
  high: 'border-red-500/50 text-red-700 dark:text-red-400',
  medium: 'border-amber-500/50 text-amber-700 dark:text-amber-400',
  low: 'border-muted-foreground/40 text-muted-foreground',
};

export function FuelAnalyticsWorkspace({
  assets,
  selectedUnitId,
  onSelectUnit,
  period,
  onPeriodChange,
  month,
  onMonthChange,
  fromDate,
  toDate,
  onFromChange,
  onToChange,
  analytics,
  isLoading,
  isRefreshing,
  error,
  onRefresh,
}: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [eventsOpen, setEventsOpen] = useState(false);

  const selectedName =
    selectedUnitId == null
      ? 'All fleet'
      : assets.find((a) => a.unitId === selectedUnitId)?.name ?? 'Asset';

  const k = analytics?.kpis;
  const ledger = analytics?.ledger;

  return (
    <div className="fleet-card overflow-hidden">
      <div className="flex flex-col lg:flex-row min-h-0">
        {sidebarOpen && (
          <div className="w-full lg:w-[280px] shrink-0 border-b lg:border-b-0 lg:border-r max-h-[280px] lg:max-h-none lg:min-h-[420px]">
            <FuelAssetSidebar
              assets={assets}
              selectedId={selectedUnitId}
              onSelect={onSelectUnit}
              byAsset={analytics?.byAsset}
            />
          </div>
        )}

        <div className="flex-1 min-w-0 flex flex-col">
          <div className="sticky top-0 z-10 bg-card border-b px-3 py-2 space-y-2">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0"
                  onClick={() => setSidebarOpen((v) => !v)}
                >
                  {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
                </Button>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold truncate">Fleet analytics — {selectedName}</h2>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {analytics
                      ? `${analytics.from} → ${analytics.to} · ${analytics.transactionCount} events · ${analytics.source}`
                      : isLoading
                        ? 'Loading report data…'
                        : `${fromDate} → ${toDate}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {isRefreshing && (
                  <Badge variant="secondary" className="text-[10px] gap-1 h-6">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Refreshing…
                  </Badge>
                )}
                <Button size="sm" variant="outline" className="h-7 px-2" onClick={onRefresh} disabled={isRefreshing}>
                  {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 items-end">
              <Tabs value={period} onValueChange={(v) => onPeriodChange(v as FuelPeriod)}>
                <TabsList className="h-7">
                  {(['day', 'week', 'month', 'year', 'custom'] as const).map((p) => (
                    <TabsTrigger key={p} value={p} className="text-[10px] px-2 capitalize h-6">
                      {p === 'day' ? 'Daily' : p}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              {period === 'month' && (
                <Select value={month} onValueChange={onMonthChange}>
                  <SelectTrigger className="h-7 w-[150px] text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions(24).map((m) => (
                      <SelectItem key={m.value} value={m.value} className="text-xs">
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {period === 'custom' && (
                <>
                  <Input type="date" className="h-7 w-[130px] text-[10px]" value={fromDate} onChange={(e) => onFromChange(e.target.value)} />
                  <Input type="date" className="h-7 w-[130px] text-[10px]" value={toDate} onChange={(e) => onToChange(e.target.value)} />
                </>
              )}
            </div>
          </div>

          <div className="p-3 space-y-3 overflow-auto flex-1">
            {error && (
              <p className="text-sm text-destructive fleet-card p-3">{error.message}</p>
            )}

            {isLoading && !analytics ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-52 w-full" />
              </div>
            ) : (
              <>
                <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
                  <MetricCard title="Used" value={`${k?.totalConsumed ?? 0} L`} icon={Flame} variant="warning" size="xxs" />
                  <MetricCard title="Filled" value={`${k?.totalFilled ?? 0} L`} icon={Droplets} variant="primary" size="xxs" />
                  <MetricCard title="Lost" value={`${k?.totalTheft ?? 0} L`} icon={ShieldAlert} variant="destructive" size="xxs" />
                  <MetricCard title="Alerts" value={analytics?.anomalies.length ?? 0} icon={AlertTriangle} variant="destructive" size="xxs" />
                </div>

                {ledger && <FuelBalanceCard ledger={ledger} />}

                {analytics && (
                  <>
                    <FuelLedgerPanel
                      dailySummaries={analytics.dailySummaries}
                      ledgerPreview={analytics.ledgerPreview}
                      unitName={selectedUnitId == null ? null : selectedName}
                    />

                    <FuelAnalyticsCharts data={analytics} showFleetAssets={selectedUnitId == null} />

                    {analytics.anomalies.length > 0 && (
                  <div className="fleet-card p-3">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between text-sm font-semibold"
                      onClick={() => setEventsOpen((v) => !v)}
                    >
                      <span className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        Suspicious events ({analytics.anomalies.length})
                      </span>
                      {eventsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    {eventsOpen && (
                      <div className="space-y-1.5 mt-2 max-h-52 overflow-y-auto">
                        {analytics.anomalies.slice(0, 20).map((a) => (
                          <div
                            key={a.id}
                            className={cn('text-xs border rounded px-2 py-1.5 flex justify-between gap-2', SEVERITY_STYLE[a.severity])}
                          >
                            <span>
                              <strong>{a.unitName}</strong> — {a.message}
                              {a.initialLevel != null && a.finalLevel != null && (
                                <span className="block font-mono text-[10px] opacity-90 mt-0.5">
                                  {a.initialLevel} L → {a.finalLevel} L
                                  {a.deltaLiters != null ? ` (${a.deltaLiters > 0 ? '+' : ''}${a.deltaLiters} L)` : ''}
                                </span>
                              )}
                            </span>
                            <span className="whitespace-nowrap text-muted-foreground text-[10px]">
                              {format(new Date(a.timestamp * 1000), 'MMM d HH:mm')}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {selectedUnitId == null && analytics.byAsset.length > 0 && (
                  <div className="fleet-card overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Asset</TableHead>
                          <TableHead className="text-right text-xs">Used (L)</TableHead>
                          <TableHead className="text-right text-xs">Filled (L)</TableHead>
                          <TableHead className="text-right text-xs">Lost (L)</TableHead>
                          <TableHead className="text-right text-xs">Remaining</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analytics.byAsset.map((a) => (
                          <TableRow
                            key={a.unitId}
                            className="cursor-pointer hover:bg-muted/40 h-8"
                            onClick={() => onSelectUnit(a.unitId)}
                          >
                            <TableCell className="font-medium text-xs py-1.5 max-w-[200px] break-words">{a.unitName}</TableCell>
                            <TableCell className="text-right tabular-nums text-xs py-1">{a.consumed}</TableCell>
                            <TableCell className="text-right tabular-nums text-xs py-1">{a.filled}</TableCell>
                            <TableCell className="text-right tabular-nums text-xs py-1">{a.theft}</TableCell>
                            <TableCell className="text-right tabular-nums text-xs py-1">
                              {a.remainingFuel != null ? `${a.remainingFuel} L` : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                  </>
                )}

                {!analytics && !isLoading && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No fuel events for this period. Try another month or click refresh.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
