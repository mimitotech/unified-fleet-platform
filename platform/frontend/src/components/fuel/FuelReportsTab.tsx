import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Play } from 'lucide-react';
import { useWialonReportCatalog, useWialonReportRun } from '@/hooks/useWialonReports';
import { useFleetUnits } from '@/hooks/useFleetUnits';
import { useWialonContext } from '@/hooks/useWialon';
import { ReportResultsView } from '@/components/reports/ReportResultsView';
import { QueryErrorBanner } from '@/components/shared/QueryErrorBanner';
import { reportPresetRange, type ReportDatePreset } from '@/lib/reportUtils';
import {
  catalogTemplatesByModule,
  WIALON_MODULE_LABELS,
  WIALON_MODULE_ORDER,
  type WialonCatalogTemplate,
} from '@/lib/reportCatalog';
import type { FuelTabDateRangeProps } from './fuelTabTypes';

function localDateString(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function presetDateStrings(preset: Exclude<ReportDatePreset, 'custom'>): {
  from: string;
  to: string;
} {
  const range = reportPresetRange(preset);
  return {
    from: localDateString(new Date(range.from * 1000)),
    to: localDateString(new Date(range.to * 1000)),
  };
}

/**
 * Fuel → Reports: top control bar (category / report / object / period / run),
 * full-width preview below with horizontal scroll for wide Wialon tables.
 */
export function FuelReportsTab(_props: FuelTabDateRangeProps & {
  fleetSummary?: { vehicles: number; generators: number; machinery: number };
}) {
  const { connected } = useWialonContext();
  const { units } = useFleetUnits();
  const { data: catalog, isLoading, isError, refetch } = useWialonReportCatalog(connected);

  const templates = catalog?.templates ?? [];
  const byModule = useMemo(() => catalogTemplatesByModule(templates), [templates]);

  const [moduleFilter, setModuleFilter] = useState<string>('fuel');
  const [selectedKey, setSelectedKey] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [datePreset, setDatePreset] = useState<ReportDatePreset>('today');
  const [reportFrom, setReportFrom] = useState(() => localDateString());
  const [reportTo, setReportTo] = useState(() => localDateString());
  const [runParams, setRunParams] = useState<{
    reportResourceId: number;
    reportTemplateId: number;
    reportObjectId: number;
    from: number;
    to: number;
    useRunEndpoint: true;
    module?: string;
    objectKind: 'unit' | 'group' | 'user' | 'resource';
    maxRowsPerTable?: number;
  } | null>(null);

  const moduleOptions = useMemo(() => {
    const keys = new Set<string>(['all', 'fuel']);
    for (const k of Object.keys(byModule)) keys.add(k);
    return [...keys].sort((a, b) => {
      if (a === 'all') return -1;
      if (b === 'all') return 1;
      if (a === 'fuel') return -1;
      if (b === 'fuel') return 1;
      const ia = WIALON_MODULE_ORDER.indexOf(a as (typeof WIALON_MODULE_ORDER)[number]);
      const ib = WIALON_MODULE_ORDER.indexOf(b as (typeof WIALON_MODULE_ORDER)[number]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }, [byModule]);

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (moduleFilter !== 'all' && (t.module || 'other') !== moduleFilter) return false;
      return true;
    });
  }, [templates, moduleFilter]);

  useEffect(() => {
    if (!filtered.length) {
      setSelectedKey('');
      return;
    }
    if (!selectedKey || !filtered.some((t) => `${t.resourceId}:${t.templateId}` === selectedKey)) {
      setSelectedKey(`${filtered[0].resourceId}:${filtered[0].templateId}`);
    }
  }, [filtered, selectedKey]);

  const selected = useMemo((): WialonCatalogTemplate | null => {
    if (!selectedKey) return null;
    return templates.find((t) => `${t.resourceId}:${t.templateId}` === selectedKey) ?? null;
  }, [templates, selectedKey]);

  useEffect(() => {
    setRunParams(null);
  }, [selectedKey, selectedUnitId, selectedGroupId, selectedUserId, datePreset, reportFrom, reportTo]);

  const selectedKind = selected?.objectKind ?? (selected?.isGroupReport ? 'group' : 'unit');

  useEffect(() => {
    if (!selected || selectedKind !== 'unit') return;
    if (selectedUnitId) return;
    const first = units[0];
    if (first) setSelectedUnitId(String(first.wialonId ?? first.id));
  }, [selected, selectedKind, selectedUnitId, units]);

  useEffect(() => {
    if (selectedKind !== 'group') return;
    if (selectedGroupId) return;
    const first = catalog?.groups?.[0];
    if (first) setSelectedGroupId(String(first.id));
  }, [selectedKind, selectedGroupId, catalog?.groups]);

  useEffect(() => {
    if (selectedKind !== 'user') return;
    if (selectedUserId) return;
    const first = catalog?.users?.[0];
    if (first) setSelectedUserId(String(first.id));
  }, [selectedKind, selectedUserId, catalog?.users]);

  const {
    data: reportResult,
    isLoading: reportLoading,
    isError: reportError,
    isFetching: reportFetching,
    refetch: refetchRun,
  } = useWialonReportRun(runParams, false);

  const runReport = () => {
    if (!selected) return;
    const from = Math.floor(new Date(`${reportFrom}T00:00:00`).getTime() / 1000);
    const to = Math.floor(new Date(`${reportTo}T23:59:59`).getTime() / 1000);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return;
    const kind = selected.objectKind ?? (selected.isGroupReport ? 'group' : 'unit');
    let objectId = 0;
    if (kind === 'group') objectId = Number(selectedGroupId);
    else if (kind === 'user') objectId = Number(selectedUserId);
    else if (kind === 'resource') objectId = Number(selected.resourceId);
    else objectId = Number(selectedUnitId);
    if (!Number.isFinite(objectId) || objectId <= 0) return;
    setRunParams({
      reportResourceId: selected.resourceId,
      reportTemplateId: selected.templateId,
      reportObjectId: objectId,
      from,
      to,
      useRunEndpoint: true,
      module: selected.module,
      objectKind: kind,
      maxRowsPerTable: kind === 'group' ? 5000 : 8000,
    });
  };

  const changePreset = (value: string) => {
    const preset = value as ReportDatePreset;
    setDatePreset(preset);
    if (preset === 'custom') return;
    const range = presetDateStrings(preset);
    setReportFrom(range.from);
    setReportTo(range.to);
  };

  if (!connected) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Connect telematics to load this client&apos;s report templates.
        </CardContent>
      </Card>
    );
  }

  const busy = reportLoading || reportFetching;

  return (
    <div className="space-y-3 min-w-0 flex flex-col min-h-[min(78vh,880px)]">
      {isError && (
        <QueryErrorBanner message="Could not load report catalog." onRetry={() => refetch()} />
      )}

      <Card className="border-primary/20 shrink-0">
        <CardContent className="pt-3 pb-3 px-3">
          <div className="flex flex-nowrap items-end gap-2 overflow-x-auto pb-0.5">
            <div className="space-y-1 shrink-0">
              <Label className="text-[10px] text-muted-foreground">Category</Label>
              <Select value={moduleFilter} onValueChange={setModuleFilter}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {moduleOptions.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m === 'all'
                        ? 'All modules'
                        : WIALON_MODULE_LABELS[m as keyof typeof WIALON_MODULE_LABELS] || m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 min-w-[220px] flex-1">
              <Label className="text-[10px] text-muted-foreground">Report</Label>
              <Select
                value={selectedKey || undefined}
                onValueChange={setSelectedKey}
                disabled={isLoading || !filtered.length}
              >
                <SelectTrigger className="h-8 text-xs min-w-[220px]">
                  <SelectValue placeholder={isLoading ? 'Loading…' : 'Select report'} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {filtered.map((r) => (
                    <SelectItem
                      key={`${r.resourceId}:${r.templateId}`}
                      value={`${r.resourceId}:${r.templateId}`}
                    >
                      {r.templateName}
                      {r.objectKind === 'group' || r.isGroupReport
                        ? ' (Group)'
                        : r.objectKind === 'user'
                          ? ' (User)'
                          : r.objectKind === 'resource'
                            ? ' (Account)'
                            : ' (Unit)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedKind === 'group' ? (
              <div className="space-y-1 shrink-0">
                <Label className="text-[10px] text-muted-foreground">Group</Label>
                <Select value={selectedGroupId || undefined} onValueChange={setSelectedGroupId}>
                  <SelectTrigger className="h-8 w-[180px] text-xs">
                    <SelectValue placeholder="Select group" />
                  </SelectTrigger>
                  <SelectContent>
                    {(catalog?.groups ?? []).map((g) => (
                      <SelectItem key={g.id} value={String(g.id)}>
                        {g.nm}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : selectedKind === 'user' ? (
              <div className="space-y-1 shrink-0">
                <Label className="text-[10px] text-muted-foreground">User</Label>
                <Select value={selectedUserId || undefined} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="h-8 w-[200px] text-xs">
                    <SelectValue placeholder={(catalog?.users?.length ? 'Select user' : 'No users found')} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {(catalog?.users ?? []).map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.nm}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : selectedKind === 'resource' ? (
              <div className="space-y-1 shrink-0 self-end pb-0.5">
                <p className="text-[11px] text-muted-foreground max-w-[180px]">
                  Account report — no unit required
                </p>
              </div>
            ) : (
              <div className="space-y-1 shrink-0">
                <Label className="text-[10px] text-muted-foreground">Unit</Label>
                <Select value={selectedUnitId || undefined} onValueChange={setSelectedUnitId}>
                  <SelectTrigger className="h-8 w-[200px] text-xs">
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {units.map((u) => (
                      <SelectItem key={String(u.wialonId ?? u.id)} value={String(u.wialonId ?? u.id)}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1 shrink-0">
              <Label className="text-[10px] text-muted-foreground">Period</Label>
              <Select value={datePreset} onValueChange={changePreset}>
                <SelectTrigger className="h-8 w-[125px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="last7">Last 7 days</SelectItem>
                  <SelectItem value="last30">Last 30 days</SelectItem>
                  <SelectItem value="thisMonth">This month</SelectItem>
                  <SelectItem value="custom">Custom dates</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 shrink-0">
              <Label className="text-[10px] text-muted-foreground">From</Label>
              <Input
                type="date"
                value={reportFrom}
                max={reportTo}
                className="h-8 w-[140px] text-xs"
                onChange={(e) => {
                  setDatePreset('custom');
                  setReportFrom(e.target.value);
                }}
              />
            </div>

            <div className="space-y-1 shrink-0">
              <Label className="text-[10px] text-muted-foreground">To</Label>
              <Input
                type="date"
                value={reportTo}
                min={reportFrom}
                max={localDateString()}
                className="h-8 w-[140px] text-xs"
                onChange={(e) => {
                  setDatePreset('custom');
                  setReportTo(e.target.value);
                }}
              />
            </div>

            <Button
              size="sm"
              className="h-8 gap-1.5 shrink-0"
              onClick={runReport}
              disabled={busy || !selected || !reportFrom || !reportTo || reportFrom > reportTo}
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              Run report
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            {templates.length} template{templates.length === 1 ? '' : 's'} on this client
            {filtered.length !== templates.length ? ` · showing ${filtered.length}` : ''}
            {selected
              ? ` · ${selectedKind === 'group' ? 'group' : selectedKind === 'user' ? 'user' : selectedKind === 'resource' ? 'account' : 'unit'} report`
              : ''}
          </p>
        </CardContent>
      </Card>

      <Card className="min-w-0 overflow-hidden flex-1">
        <CardContent className="p-2 sm:p-3 min-w-0">
          {reportError && (
            <QueryErrorBanner
              message="Could not run the selected report. Check the selected object and try again."
              onRetry={() => refetchRun()}
              className="mb-3"
            />
          )}
          {!runParams && !busy && (
            <div className="text-sm text-muted-foreground py-24 text-center space-y-1">
              <p className="font-medium text-foreground">Report preview</p>
              <p>Choose category, report, object and period above, then Run report.</p>
            </div>
          )}
          {busy && (
            <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Running report — fetching all tables…
            </div>
          )}
          {reportResult && runParams && !busy && (
            <ReportResultsView
              data={reportResult}
              templateName={selected?.templateName}
              moduleLabel={selected?.module === 'fuel' || !selected?.module ? 'Fuel' : (selected.module || 'Fuel')}
              unitName={
                selectedKind === 'group'
                  ? catalog?.groups?.find((g) => String(g.id) === selectedGroupId)?.nm
                  : selectedKind === 'user'
                    ? catalog?.users?.find((u) => String(u.id) === selectedUserId)?.nm
                    : selectedKind === 'resource'
                      ? selected?.resourceName
                      : units.find((u) => String(u.wialonId ?? u.id) === selectedUnitId)?.name
              }
              className="min-w-0"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
