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
  FileText,
  Fuel,
  Gauge,
  MapPinned,
  PlugZap,
  Radio,
  ShieldAlert,
  Thermometer,
  WifiOff,
  Wrench,
  Zap,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertsModuleReports } from '@/components/reports/moduleReportPanels';
import { WialonNotificationsPanel } from '@/components/app/WialonLivePanels';
import { useModules } from '@/hooks/useModules';
import { cn } from '@/lib/utils';

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

const severityStyles: Record<string, { label: string; row: string; badge: string; icon: typeof AlertTriangle }> = {
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
  { id: 'power', label: 'Power & generators', match: (t) => !!t && /generator|power_cut|power_restore|battery/.test(t) },
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

function clientFacingText(text?: string) {
  if (!text) return text;
  return text
    .replace(/\bWialon\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim();
}

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function AlertsPage() {
  const [fromDate, setFromDate] = useState(() => shiftDays(todayStr(), -6));
  const [toDate, setToDate] = useState(() => todayStr());
  const [category, setCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'acked'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: alerts, isLoading, isError, refetch, isFetching } = useAlerts(300, true, {
    from: `${fromDate}T00:00:00`,
    to: `${toDate}T23:59:59`,
  });
  const acknowledge = useAcknowledgeAlert();
  const bulkAck = useBulkAcknowledge();
  const list = (alerts ?? []) as AlertRow[];

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

  // Categories present in the current period drive which tabs each client sees.
  // Always keep Fuel when the fuel module is enabled (generators need it even before first promote).
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
    const unacked = list.filter((a) => !a.acknowledged).length;
    return {
      total: list.length,
      critical: list.filter((a) => ['critical', 'emergency'].includes(a.severity)).length,
      warning: list.filter((a) => a.severity === 'warning').length,
      unacked,
      acked: list.length - unacked,
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
        <TabsList className="branded-tabs">
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1">
            <FileText className="h-3.5 w-3.5" />
            Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-0 space-y-3">
          {/* Summary strip */}
          <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
            <div className="fleet-card border-l-4 border-l-primary py-2.5">
              <p className="text-[11px] text-muted-foreground">Total in period</p>
              <p className="text-xl font-semibold">{counts.total}</p>
            </div>
            <div className="fleet-card border-l-4 border-l-destructive py-2.5">
              <p className="text-[11px] text-muted-foreground">Critical</p>
              <p className="text-xl font-semibold text-destructive">{counts.critical}</p>
            </div>
            <div className="fleet-card border-l-4 border-l-amber-500 py-2.5">
              <p className="text-[11px] text-muted-foreground">Warnings</p>
              <p className="text-xl font-semibold text-amber-700">{counts.warning}</p>
            </div>
            <div className="fleet-card border-l-4 border-l-sky-500 py-2.5">
              <p className="text-[11px] text-muted-foreground">Open</p>
              <p className="text-xl font-semibold text-sky-700">{counts.unacked}</p>
            </div>
          </div>

          {/* Toolbar: period + refresh */}
          <div className="fleet-card flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium flex items-center gap-2">
                <Radio className="h-4 w-4 text-primary" />
                Live alert stream
              </p>
              <p className="text-xs text-muted-foreground">
                Configured notifications for this account — refreshed every few seconds.
              </p>
            </div>
            <div className="flex items-end gap-2 flex-wrap">
              <PeriodAssetControlsInline
                fromDate={fromDate}
                toDate={toDate}
                onFrom={setFromDate}
                onTo={setToDate}
                onPreset={applyPreset}
              />
              <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="h-7">
                {isFetching ? 'Syncing…' : 'Refresh'}
              </Button>
            </div>
          </div>

          {/* Category tabs (client-specific) + status + bulk */}
          <div className="fleet-card space-y-2.5 py-3">
            <div className="flex flex-wrap gap-1.5">
              {availableCategories.map((c) => (
                <Button
                  key={c.id}
                  type="button"
                  size="sm"
                  variant={activeCategory === c.id ? 'default' : 'outline'}
                  className={cn('h-7 text-xs', activeCategory !== c.id && 'border-primary/15')}
                  onClick={() => setCategory(c.id)}
                >
                  {c.label}
                  <span className="ml-1.5 text-[10px] opacity-80">{counts.byCat[c.id] ?? 0}</span>
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['all', 'All', counts.total],
                    ['open', 'Open', counts.unacked],
                    ['acked', 'Acknowledged', counts.acked],
                  ] as const
                ).map(([id, label, n]) => (
                  <Button
                    key={id}
                    type="button"
                    size="sm"
                    variant={statusFilter === id ? 'secondary' : 'ghost'}
                    className="h-7 text-xs"
                    onClick={() => setStatusFilter(id)}
                  >
                    {label}
                    <span className="ml-1.5 tabular-nums opacity-80">{n}</span>
                  </Button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                {selectableIds.length > 0 && (
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none pr-1">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    Select open
                  </label>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={!selectedOpen.length || bulkAck.isPending}
                  onClick={ackSelected}
                >
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Ack selected{selectedOpen.length ? ` (${selectedOpen.length})` : ''}
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={!counts.unacked || bulkAck.isPending}
                  onClick={ackAll}
                >
                  <CheckCheck className="h-3.5 w-3.5 mr-1" />
                  Ack all
                </Button>
              </div>
            </div>
          </div>

          {/* List */}
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Bell}
              title={list.length === 0 ? 'No alerts in this period' : 'No alerts in this filter'}
              description={
                list.length === 0
                  ? 'Events from vehicles, generators, sensors, geofences, driving behaviour and fuel appear here as they fire on this account. Try widening the period.'
                  : activeCategory === 'fuel' && (counts.byCat.fuel ?? 0) === 0
                    ? 'No fuel fill or drop alerts in this period yet. They appear after the next fuel sync from your generators and tanks.'
                    : 'Try another category or clear the status filter.'
              }
            />
          ) : (
            <div className="space-y-1.5">
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
                      'cv-auto group rounded-lg border border-border/70 border-l-[3px] bg-card/70 px-3 py-2 flex items-start gap-2.5 transition-colors hover:bg-muted/40',
                      severity.row,
                      alert.acknowledged && 'opacity-60',
                    )}
                  >
                    {!alert.acknowledged && (
                      <Checkbox
                        checked={isSel}
                        onCheckedChange={() => toggleOne(alert.id)}
                        className="mt-1 shrink-0"
                        aria-label="Select alert"
                      />
                    )}
                    <div className={cn('mt-0.5 rounded-md border p-1 shrink-0', severity.badge)}>
                      <SeverityIcon className="h-3.5 w-3.5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-sm leading-tight">
                          {clientFacingText(alert.title)}
                        </span>
                        <Badge variant="outline" className="capitalize gap-1 bg-card/70 text-[10px] py-0 h-4">
                          <TypeIcon className="h-2.5 w-2.5" />
                          {prettyType(alert.type)}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] py-0 h-4">
                          {prettySource(alert.sourceType)}
                        </Badge>
                        {alert.acknowledged && (
                          <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-[10px] py-0 h-4">
                            Acknowledged
                          </Badge>
                        )}
                      </div>

                      {alert.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 break-words">
                          {clientFacingText(alert.description)}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
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
                        className="h-7 text-xs shrink-0 opacity-70 group-hover:opacity-100"
                      >
                        <Check className="w-3.5 h-3.5 mr-1" />
                        Ack
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="fleet-card">
            <WialonNotificationsPanel />
          </div>
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
            className="h-7 px-2 text-[11px]"
            onClick={() => onPreset(id)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="space-y-0.5">
        <label className="text-[10px] text-muted-foreground block">From</label>
        <input
          type="date"
          value={fromDate}
          max={toDate}
          className="h-7 w-[132px] rounded-md border border-input bg-background px-2 text-xs"
          onChange={(e) => onFrom(e.target.value)}
        />
      </div>
      <div className="space-y-0.5">
        <label className="text-[10px] text-muted-foreground block">To</label>
        <input
          type="date"
          value={toDate}
          min={fromDate}
          max={todayStr()}
          className="h-7 w-[132px] rounded-md border border-input bg-background px-2 text-xs"
          onChange={(e) => onTo(e.target.value)}
        />
      </div>
    </div>
  );
}
