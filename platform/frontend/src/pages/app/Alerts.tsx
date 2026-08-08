import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/app/AppLayout';
import { useAlerts, useAcknowledgeAlert, useBulkAcknowledge } from '@/hooks/useAlerts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { QueryErrorBanner } from '@/components/shared/QueryErrorBanner';
import { shiftDays, type PeriodPreset } from '@/components/shared/PeriodAssetControls';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Activity,
  AlertTriangle,
  Battery,
  Bell,
  Check,
  CheckCheck,
  Clock,
  DoorOpen,
  Fuel,
  Gauge,
  MapPinned,
  PlugZap,
  ShieldAlert,
  Thermometer,
  WifiOff,
  Wrench,
  Zap,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertsModuleReports } from '@/components/reports/moduleReportPanels';
import { AlertTypesPanel } from '@/components/app/AlertTypesPanel';
import { useModules } from '@/hooks/useModules';
import { cn } from '@/lib/utils';
import { clientFacingText } from '@/lib/clientFacingText';
import { isNoiseAlertTitle } from '@/lib/alertNoise';
import { localDateIso } from '@/lib/localDate';

interface AlertRow {
  id: string;
  title: string;
  description?: string;
  severity: string;
  sourceType: string;
  type?: string;
  timestamp: string;
  acknowledged?: boolean;
}

const severityStyles: Record<
  string,
  { label: string; row: string; badge: string; icon: typeof AlertTriangle }
> = {
  critical: {
    label: 'Critical',
    row: 'border-l-destructive',
    badge: 'border-destructive/30 bg-destructive/10 text-destructive',
    icon: ShieldAlert,
  },
  emergency: {
    label: 'Emergency',
    row: 'border-l-destructive',
    badge: 'border-destructive/30 bg-destructive/10 text-destructive',
    icon: ShieldAlert,
  },
  warning: {
    label: 'Warning',
    row: 'border-l-amber-500',
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-700',
    icon: AlertTriangle,
  },
  info: {
    label: 'Info',
    row: 'border-l-sky-500',
    badge: 'border-sky-500/30 bg-sky-500/10 text-sky-700',
    icon: Bell,
  },
};

type CategoryDef = { id: string; label: string; match: (type?: string) => boolean };

/** Order matters — used to assign each alert to a single category. */
const CATEGORY_DEFS: CategoryDef[] = [
  { id: 'safety', label: 'Driving', match: (t) => !!t && /harsh_|speeding|eco_violation|idling|towing|sos/.test(t) },
  { id: 'fuel', label: 'Fuel', match: (t) => !!t && /fuel_/.test(t) },
  { id: 'power', label: 'Power', match: (t) => !!t && /generator|power_cut|power_restore|battery/.test(t) },
  { id: 'geofence', label: 'Geofence', match: (t) => t === 'geofence' },
  { id: 'engine', label: 'Engine', match: (t) => !!t && /ignition_/.test(t) },
  { id: 'sensors', label: 'Sensors', match: (t) => !!t && /sensor|temperature|door|connection|maintenance/.test(t) },
];

function categoryOf(type?: string): string {
  const found = CATEGORY_DEFS.find((c) => c.match(type));
  return found ? found.id : 'other';
}

function typeIcon(type?: string) {
  if (!type) return Activity;
  if (/fuel/.test(type)) return Fuel;
  if (/speed|brak|accel|corner|eco|idle|tow|sos/.test(type)) return Gauge;
  if (/geo|zone/.test(type)) return MapPinned;
  if (/ignition|engine/.test(type)) return Zap;
  if (/generator|power_/.test(type)) return PlugZap;
  if (/battery/.test(type)) return Battery;
  if (/temp/.test(type)) return Thermometer;
  if (/door/.test(type)) return DoorOpen;
  if (/connection/.test(type)) return WifiOff;
  if (/maintenance/.test(type)) return Wrench;
  return Activity;
}

function prettyType(type?: string) {
  if (!type) return 'Fleet event';
  return (
    type
      .replace(/^wialon[_-]?/i, '')
      .replace(/^fleet[_-]?/i, 'fleet ')
      .replace(/_/g, ' ')
      .trim() || 'Fleet event'
  );
}

function prettySource(sourceType?: string) {
  const s = (sourceType || '').toLowerCase();
  if (!s || s === 'wialon') return 'Fleet';
  if (s === 'tracksolid') return 'Device';
  if (s === 'loconav') return 'Video';
  if (s === 'system' || s === 'fuel') return 'Fuel';
  return sourceType!.replace(/_/g, ' ');
}

/** Drop clocks that have not happened yet (stale period-end stamps). */
function isPastOrNow(iso: string): boolean {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return t <= Date.now() + 60_000;
}

const todayStr = () => localDateIso();

export default function AlertsPage() {
  const [fromDate, setFromDate] = useState(() => shiftDays(todayStr(), -6));
  const [toDate, setToDate] = useState(() => todayStr());
  const [category, setCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'acked'>('open');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: alerts, isLoading, isError, refetch, isFetching } = useAlerts(300, true, {
    from: `${fromDate}T00:00:00`,
    to: `${toDate}T23:59:59`,
  });
  const acknowledge = useAcknowledgeAlert();
  const bulkAck = useBulkAcknowledge();
  const list = useMemo(
    () =>
      ((alerts ?? []) as AlertRow[]).filter(
        (a) =>
          !isNoiseAlertTitle(a.title, a.description, a.type) &&
          isPastOrNow(a.timestamp) &&
          // Period-summary fuel rows carry report EOD as the clock (often "today
          // 02:59:59") — real fill times live on leaf events / Fuel module.
          !/for this period/i.test(String(a.description || '')),
      ),
    [alerts],
  );

  const applyPreset = (p: PeriodPreset) => {
    if (p === 'today') {
      setFromDate(todayStr());
      setToDate(todayStr());
      return;
    }
    const days = p === '7d' ? 6 : p === '14d' ? 13 : 29;
    setFromDate(shiftDays(todayStr(), -days));
    setToDate(todayStr());
  };

  const { modules } = useModules();
  const fuelModuleOn = modules.some((m) => m.moduleKey === 'fuel' && m.isEnabled);

  const availableCategories = useMemo(() => {
    const present = new Set(list.map((a) => categoryOf(a.type)));
    if (fuelModuleOn) present.add('fuel');
    const cats = CATEGORY_DEFS.filter((c) => present.has(c.id));
    if (present.has('other')) cats.push({ id: 'other', label: 'Other', match: () => true });
    return [{ id: 'all', label: 'All', match: () => true } as CategoryDef, ...cats];
  }, [list, fuelModuleOn]);

  const activeCategory = availableCategories.some((c) => c.id === category) ? category : 'all';

  const filtered = useMemo(() => {
    return list.filter((a) => {
      if (activeCategory !== 'all' && categoryOf(a.type) !== activeCategory) return false;
      if (statusFilter === 'open' && a.acknowledged) return false;
      if (statusFilter === 'acked' && !a.acknowledged) return false;
      return true;
    });
  }, [list, activeCategory, statusFilter]);

  const counts = useMemo(() => {
    const byCat: Record<string, number> = { all: list.length };
    for (const c of CATEGORY_DEFS) byCat[c.id] = 0;
    byCat.other = 0;
    for (const a of list) byCat[categoryOf(a.type)] = (byCat[categoryOf(a.type)] ?? 0) + 1;
    const open = list.filter((a) => !a.acknowledged);
    return {
      total: list.length,
      // Critical / warning tiles are open-only — acknowledging clears them.
      openCritical: open.filter((a) => ['critical', 'emergency'].includes(a.severity)).length,
      openWarning: open.filter((a) => a.severity === 'warning').length,
      unacked: open.length,
      acked: list.length - open.length,
      byCat,
    };
  }, [list]);

  const selectableIds = useMemo(
    () => filtered.filter((a) => !a.acknowledged).map((a) => a.id),
    [filtered],
  );
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const selectedOpen = [...selected].filter((id) => selectableIds.includes(id));

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected((prev) => {
      if (selectableIds.every((id) => prev.has(id))) return new Set();
      return new Set(selectableIds);
    });
  };

  const ackSelected = () => {
    if (!selectedOpen.length) return;
    const ids = [...selectedOpen];
    setSelected(new Set());
    bulkAck.mutate(ids);
  };
  const ackAll = () => {
    setSelected(new Set());
    bulkAck.mutate(undefined);
  };

  const ackOne = (id: string) => {
    setSelected((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    acknowledge.mutate(id);
  };

  return (
    <AppLayout title="Alerts" subtitle="Live events from vehicles, generators, sensors and notifications">
      {isError && (
        <QueryErrorBanner message="Could not load alerts." onRetry={() => refetch()} className="mb-4" />
      )}
      <Tabs defaultValue="inbox" className="space-y-3">
        <TabsList className="branded-tabs h-auto flex-wrap w-full sm:w-auto">
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
          <TabsTrigger value="types">Alert types</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-0 space-y-3">
          {/* Open-first KPIs — acknowledging clears critical/warning tiles. */}
          <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
            <div className="branded-panel px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Open</p>
              <p className="text-lg font-semibold tabular-nums leading-tight">{counts.unacked}</p>
            </div>
            <div className="branded-panel px-3 py-2 border-l-[3px] border-l-destructive">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Open critical</p>
              <p className="text-lg font-semibold tabular-nums leading-tight text-destructive">
                {counts.openCritical}
              </p>
            </div>
            <div className="branded-panel px-3 py-2 border-l-[3px] border-l-amber-500">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Open warnings</p>
              <p className="text-lg font-semibold tabular-nums leading-tight text-amber-700">
                {counts.openWarning}
              </p>
            </div>
            <div className="branded-panel px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">In period</p>
              <p className="text-lg font-semibold tabular-nums leading-tight">{counts.total}</p>
              <p className="text-[10px] text-muted-foreground">{counts.acked} acknowledged</p>
            </div>
          </div>

          {/* Period + filters + bulk actions in one branded strip */}
          <div className="branded-panel px-3 py-2.5 space-y-2.5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <PeriodAssetControlsInline
                fromDate={fromDate}
                toDate={toDate}
                onFrom={setFromDate}
                onTo={setToDate}
                onPreset={applyPreset}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => refetch()}
                disabled={isFetching}
                className="h-7 text-xs"
              >
                {isFetching ? 'Syncing…' : 'Refresh'}
              </Button>
            </div>

            <div className="flex flex-wrap gap-1">
              {availableCategories.map((c) => (
                <Button
                  key={c.id}
                  type="button"
                  size="sm"
                  variant={activeCategory === c.id ? 'default' : 'outline'}
                  className={cn('h-6 px-2 text-[11px]', activeCategory !== c.id && 'border-primary/20')}
                  onClick={() => setCategory(c.id)}
                >
                  {c.label}
                  <span className="ml-1 tabular-nums opacity-80">{counts.byCat[c.id] ?? 0}</span>
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ['open', 'Open', counts.unacked],
                    ['acked', 'Acknowledged', counts.acked],
                    ['all', 'All', counts.total],
                  ] as const
                ).map(([id, label, n]) => (
                  <Button
                    key={id}
                    type="button"
                    size="sm"
                    variant={statusFilter === id ? 'secondary' : 'ghost'}
                    className="h-6 px-2 text-[11px]"
                    onClick={() => setStatusFilter(id)}
                  >
                    {label}
                    <span className="ml-1 tabular-nums opacity-80">{n}</span>
                  </Button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                {selectableIds.length > 0 && (
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none pr-1">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    Select
                  </label>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[11px] px-2"
                  disabled={!selectedOpen.length || bulkAck.isPending}
                  onClick={ackSelected}
                >
                  <Check className="h-3 w-3 mr-1" />
                  Ack{selectedOpen.length ? ` (${selectedOpen.length})` : ''}
                </Button>
                <Button
                  size="sm"
                  className="h-6 text-[11px] px-2"
                  disabled={!counts.unacked || bulkAck.isPending}
                  onClick={ackAll}
                >
                  <CheckCheck className="h-3 w-3 mr-1" />
                  Ack all
                </Button>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-1.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 rounded-md" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="branded-panel">
              <EmptyState
                icon={Bell}
                title={list.length === 0 ? 'No alerts in this period' : 'No alerts in this filter'}
                description={
                  list.length === 0
                    ? 'Configured notifications and real fuel fill/drop events appear here as they fire. Period totals stay in the Fuel module.'
                    : 'Try another category or clear the status filter.'
                }
              />
            </div>
          ) : (
            <div className="branded-panel divide-y divide-border/40 overflow-hidden p-0">
              {filtered.map((alert) => {
                const severity = severityStyles[alert.severity] ?? severityStyles.warning;
                const SeverityIcon = severity.icon;
                const TypeIcon = typeIcon(alert.type);
                const occurredAt = new Date(alert.timestamp);
                const isSel = selected.has(alert.id);

                return (
                  <div
                    key={alert.id}
                    className={cn(
                      'cv-auto group px-3 py-1.5 flex items-start gap-2 border-l-[3px] transition-colors hover:bg-muted/30',
                      severity.row,
                      alert.acknowledged && 'bg-muted/15',
                    )}
                  >
                    {!alert.acknowledged ? (
                      <Checkbox
                        checked={isSel}
                        onCheckedChange={() => toggleOne(alert.id)}
                        className="mt-1 shrink-0"
                        aria-label="Select alert"
                      />
                    ) : (
                      <span className="w-4 shrink-0 mt-1" aria-hidden />
                    )}
                    <div className={cn('mt-0.5 rounded border p-0.5 shrink-0', severity.badge)}>
                      <SeverityIcon className="h-3 w-3" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-xs leading-tight">
                          {clientFacingText(alert.title)}
                        </span>
                        <Badge
                          variant="outline"
                          className="capitalize gap-1 bg-card/70 text-[9px] py-0 h-3.5 px-1"
                        >
                          <TypeIcon className="h-2 w-2" />
                          {prettyType(alert.type)}
                        </Badge>
                        <Badge variant="outline" className="text-[9px] py-0 h-3.5 px-1">
                          {prettySource(alert.sourceType)}
                        </Badge>
                        {alert.acknowledged && (
                          <Badge
                            variant="outline"
                            className="bg-success/10 text-success border-success/20 text-[9px] py-0 h-3.5 px-1"
                          >
                            Acknowledged
                          </Badge>
                        )}
                      </div>

                      {alert.description && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 break-words">
                          {clientFacingText(alert.description)}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {formatDistanceToNow(occurredAt, { addSuffix: true })}
                        </span>
                        <span className="tabular-nums">{format(occurredAt, 'MMM d, HH:mm:ss')}</span>
                      </div>
                    </div>

                    {!alert.acknowledged && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => ackOne(alert.id)}
                        disabled={acknowledge.isPending}
                        className="h-6 text-[11px] shrink-0 opacity-70 group-hover:opacity-100 px-2"
                      >
                        <Check className="w-3 h-3 mr-0.5" />
                        Ack
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="types" className="mt-0">
          <AlertTypesPanel />
        </TabsContent>

        <TabsContent value="reports" className="mt-0">
          <AlertsModuleReports />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}

/** Compact period control set (presets + custom range) without asset picker. */
function PeriodAssetControlsInline({
  fromDate,
  toDate,
  onFrom,
  onTo,
  onPreset,
}: {
  fromDate: string;
  toDate: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  onPreset: (p: PeriodPreset) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-wrap gap-1">
        {(
          [
            ['today', 'Today'],
            ['7d', '7d'],
            ['14d', '14d'],
            ['30d', '30d'],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px]"
            onClick={() => onPreset(id)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="space-y-0.5">
        <label className="text-[9px] text-muted-foreground block">From</label>
        <input
          type="date"
          value={fromDate}
          max={toDate}
          className="h-6 w-[124px] rounded-md border border-input bg-background px-1.5 text-[11px]"
          onChange={(e) => onFrom(e.target.value)}
        />
      </div>
      <div className="space-y-0.5">
        <label className="text-[9px] text-muted-foreground block">To</label>
        <input
          type="date"
          value={toDate}
          min={fromDate}
          max={todayStr()}
          className="h-6 w-[124px] rounded-md border border-input bg-background px-1.5 text-[11px]"
          onChange={(e) => onTo(e.target.value)}
        />
      </div>
    </div>
  );
}
