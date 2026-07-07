import { useMemo, useState, useEffect } from 'react';
import { FileText, Radio } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { QueryErrorBanner } from '@/components/shared/QueryErrorBanner';
import { WialonContextBanner } from '@/components/app/WialonContextBanner';
import { LiveReportTable } from '@/components/reports/LiveReportTable';
import { LiveReportAnalytics } from '@/components/reports/LiveReportAnalytics';
import { useWialonContext } from '@/hooks/useWialon';
import { useFleetUnits } from '@/hooks/useFleetUnits';
import { useLiveReportData } from '@/hooks/useLiveReportData';
import { LIVE_REPORTS, reportsByCategory, type LiveReportDef } from '@/lib/reportCatalog';
import { reportPresetRange, type ReportDatePreset } from '@/lib/reportUtils';
import { livePollLabel, LIVE_POLL } from '@/lib/liveRefresh';
import { cn } from '@/lib/utils';

const DATE_PRESETS: { id: ReportDatePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'thisMonth', label: 'This month' },
];

const DEFAULT_REPORT_ID = 'fleet-status';

export function ReportsWorkspace() {
  const { connected } = useWialonContext();
  const { units } = useFleetUnits();
  const grouped = useMemo(() => reportsByCategory(), []);

  const [selectedReportId, setSelectedReportId] = useState(DEFAULT_REPORT_ID);
  const [scope, setScope] = useState<'fleet' | 'unit'>('fleet');
  const [unitId, setUnitId] = useState<string>('');
  const [datePreset, setDatePreset] = useState<ReportDatePreset>('last7');

  const selectedReport = LIVE_REPORTS.find((r) => r.id === selectedReportId) ?? LIVE_REPORTS[0];

  useEffect(() => {
    if (selectedReport.scope === 'unit') setScope('unit');
    if (selectedReport.scope === 'fleet') setScope('fleet');
  }, [selectedReport]);

  useEffect(() => {
    if (scope !== 'unit' || unitId || !units.length) return;
    setUnitId(String(units[0].wialonId ?? units[0].id));
  }, [scope, unitId, units]);

  const wialonUnitId = useMemo(() => {
    if (scope !== 'unit' || !unitId) return null;
    const u = units.find((x) => String(x.wialonId ?? x.id) === unitId);
    return u?.wialonId ?? (Number.isFinite(Number(unitId)) ? Number(unitId) : null);
  }, [scope, unitId, units]);

  const needsUnit = selectedReport.scope === 'unit' || (scope === 'unit' && selectedReport.scope === 'both');
  const canLoad = connected && (!needsUnit || wialonUnitId != null);

  const { data, def, isLoading, isFetching, isError, refetch } = useLiveReportData(selectedReportId, {
    unitId: scope === 'unit' ? wialonUnitId : null,
    datePreset,
    enabled: canLoad,
  });

  if (!connected) {
    return (
      <div className="space-y-4">
        <WialonContextBanner />
        <div className="fleet-card py-16 text-center text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Connect Wialon for live reports</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <WialonContextBanner compact />

      <div className="fleet-card p-0 overflow-hidden min-h-[calc(100dvh-12rem)] flex flex-col">
        <div className="px-4 py-3 border-b shrink-0 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Live Reports</h2>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Radio className="h-3 w-3 text-status-moving" />
              Tables stay open — data updates {livePollLabel(LIVE_POLL.fleet)}
            </p>
          </div>
        </div>

        <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-12">
          {/* Report list — always visible */}
          <div className="lg:col-span-3 border-r border-border/60 overflow-auto min-h-0 p-2">
            {[...grouped.entries()].map(([category, reports]) =>
              reports.length ? (
                <div key={category} className="mb-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-1">
                    {category}
                  </p>
                  {reports.map((r) => (
                    <ReportNavItem
                      key={r.id}
                      report={r}
                      active={selectedReportId === r.id}
                      onSelect={() => setSelectedReportId(r.id)}
                    />
                  ))}
                </div>
              ) : null
            )}
          </div>

          {/* Main table — always visible structure */}
          <div className="lg:col-span-9 flex flex-col min-h-0 p-4">
            <div className="flex flex-wrap gap-3 mb-3 shrink-0 pb-3 border-b border-border/40">
              <div className="flex gap-1 p-0.5 rounded-lg bg-muted/50 border border-border/60">
                <button
                  type="button"
                  onClick={() => setScope('fleet')}
                  disabled={selectedReport.scope === 'unit'}
                  className={cn(
                    'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                    scope === 'fleet' ? 'bg-card shadow-sm' : 'text-muted-foreground',
                    selectedReport.scope === 'unit' && 'opacity-40 cursor-not-allowed'
                  )}
                >
                  All assets
                </button>
                <button
                  type="button"
                  onClick={() => setScope('unit')}
                  disabled={selectedReport.scope === 'fleet'}
                  className={cn(
                    'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                    scope === 'unit' ? 'bg-card shadow-sm' : 'text-muted-foreground',
                    selectedReport.scope === 'fleet' && 'opacity-40 cursor-not-allowed'
                  )}
                >
                  Single asset
                </button>
              </div>

              {scope === 'unit' && (
                <div className="min-w-[200px]">
                  <Label className="text-[10px] text-muted-foreground">Asset</Label>
                  <Select value={unitId} onValueChange={setUnitId}>
                    <SelectTrigger className="h-8 mt-0.5 text-xs">
                      <SelectValue placeholder="Select unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map((u) => (
                        <SelectItem key={u.id} value={String(u.wialonId ?? u.id)}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedReport.needsPeriod && (
                <div>
                  <Label className="text-[10px] text-muted-foreground">Period</Label>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {DATE_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setDatePreset(p.id)}
                        className={cn(
                          'rounded px-2 py-0.5 text-[11px] border',
                          datePreset === p.id
                            ? 'bg-primary/10 border-primary/30 font-medium'
                            : 'border-border/60 text-muted-foreground'
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {isError && (
              <QueryErrorBanner message="Could not load live report data." onRetry={refetch} className="mb-3" />
            )}

            {def && (
              <>
                <LiveReportAnalytics
                  reportId={selectedReportId}
                  rows={needsUnit && !wialonUnitId ? [] : data.rows}
                  className="mb-4"
                />
                <LiveReportTable
                  def={def}
                  rows={needsUnit && !wialonUnitId ? [] : data.rows}
                  fetchedAt={data.fetchedAt}
                  isLoading={canLoad ? isLoading : false}
                  isFetching={canLoad ? isFetching : false}
                  onRefresh={canLoad ? refetch : undefined}
                  emptyHint={
                    needsUnit && !wialonUnitId
                      ? 'Select an asset above — column structure is ready, rows fill automatically.'
                      : undefined
                  }
                  className="flex-1"
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportNavItem({
  report,
  active,
  onSelect,
}: {
  report: LiveReportDef;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full text-left rounded-lg px-2.5 py-2 mb-0.5 transition-colors hover:bg-muted/50',
        active && 'bg-primary/10 ring-1 ring-primary/25'
      )}
    >
      <p className="text-xs font-medium">{report.label}</p>
      <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{report.description}</p>
      <p className="text-[10px] text-muted-foreground/80 mt-1">{report.columns.length} columns · live</p>
    </button>
  );
}
