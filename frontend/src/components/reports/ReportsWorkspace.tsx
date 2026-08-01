import { useMemo, useState, useEffect } from 'react';
import { FileText, Play, Radio, Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
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
import { ReportResultsView } from '@/components/reports/ReportResultsView';
import { useWialonContext } from '@/hooks/useWialon';
import { useFleetUnits } from '@/hooks/useFleetUnits';
import { useLiveReportData } from '@/hooks/useLiveReportData';
import { useWialonReportCatalog, useWialonReportRun } from '@/hooks/useWialonReports';
import {
  LIVE_REPORTS,
  WIALON_MODULE_LABELS,
  WIALON_MODULE_ORDER,
  catalogTemplatesByModule,
  parseTemplateReportKey,
  reportsByCategory,
  templateReportKey,
  type WialonCatalogTemplate,
} from '@/lib/reportCatalog';
import { reportPresetRange, type ReportDatePreset, type ReportRunParams } from '@/lib/reportUtils';
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

type TemplateRunParams = ReportRunParams & {
  useRunEndpoint: true;
  module?: string;
  objectKind: 'unit' | 'group' | 'user' | 'resource';
};

export function ReportsWorkspace() {
  const { connected } = useWialonContext();
  const { units } = useFleetUnits();
  const grouped = useMemo(() => reportsByCategory(), []);
  const { data: catalog, isLoading: catalogLoading } = useWialonReportCatalog(connected);

  const [selectedReportId, setSelectedReportId] = useState(DEFAULT_REPORT_ID);
  const [scope, setScope] = useState<'fleet' | 'unit'>('fleet');
  const [unitId, setUnitId] = useState<string>('');
  const [groupId, setGroupId] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [datePreset, setDatePreset] = useState<ReportDatePreset>('last7');
  const [templateRunParams, setTemplateRunParams] = useState<TemplateRunParams | null>(null);

  const isTemplate = selectedReportId.startsWith('tpl:');
  const selectedLiveReport = !isTemplate
    ? (LIVE_REPORTS.find((r) => r.id === selectedReportId) ?? LIVE_REPORTS[0])
    : null;

  const selectedTemplate = useMemo((): WialonCatalogTemplate | null => {
    if (!isTemplate || !catalog?.templates.length) return null;
    const ids = parseTemplateReportKey(selectedReportId);
    if (!ids) return null;
    return (
      catalog.templates.find(
        (t) => t.resourceId === ids.resourceId && t.templateId === ids.templateId
      ) ?? null
    );
  }, [isTemplate, selectedReportId, catalog?.templates]);

  const templatesByModule = useMemo(
    () => catalogTemplatesByModule(catalog?.templates ?? []),
    [catalog?.templates]
  );

  useEffect(() => {
    if (!selectedLiveReport) return;
    if (selectedLiveReport.scope === 'unit') setScope('unit');
    if (selectedLiveReport.scope === 'fleet') setScope('fleet');
  }, [selectedLiveReport]);

  useEffect(() => {
    setTemplateRunParams(null);
  }, [selectedReportId, unitId, groupId, userId, datePreset]);

  useEffect(() => {
    if (scope !== 'unit' || unitId || !units.length) return;
    setUnitId(String(units[0].wialonId ?? units[0].id));
  }, [scope, unitId, units]);

  const templateKind =
    selectedTemplate?.objectKind ?? (selectedTemplate?.isGroupReport ? 'group' : 'unit');

  useEffect(() => {
    if (templateKind !== 'group' || groupId || !catalog?.groups.length) return;
    setGroupId(String(catalog.groups[0].id));
  }, [templateKind, groupId, catalog?.groups]);

  useEffect(() => {
    if (templateKind !== 'user' || userId || !(catalog?.users?.length)) return;
    setUserId(String(catalog.users[0].id));
  }, [templateKind, userId, catalog?.users]);

  useEffect(() => {
    if (!isTemplate || templateKind !== 'unit' || unitId || !units.length) return;
    setUnitId(String(units[0].wialonId ?? units[0].id));
  }, [isTemplate, templateKind, unitId, units]);

  const wialonUnitId = useMemo(() => {
    if (isTemplate && templateKind !== 'unit') return null;
    if (!isTemplate && scope !== 'unit') return null;
    if (!unitId) return null;
    const u = units.find((x) => String(x.wialonId ?? x.id) === unitId);
    return u?.wialonId ?? (Number.isFinite(Number(unitId)) ? Number(unitId) : null);
  }, [scope, unitId, units, isTemplate, templateKind]);

  const wialonGroupId = useMemo(() => {
    if (templateKind !== 'group' || !groupId) return null;
    const n = Number(groupId);
    return Number.isFinite(n) ? n : null;
  }, [templateKind, groupId]);

  const wialonUserId = useMemo(() => {
    if (templateKind !== 'user' || !userId) return null;
    const n = Number(userId);
    return Number.isFinite(n) ? n : null;
  }, [templateKind, userId]);

  const needsUnit =
    !isTemplate &&
    (selectedLiveReport?.scope === 'unit' ||
      (scope === 'unit' && selectedLiveReport?.scope === 'both'));
  const needsPeriod = isTemplate || Boolean(selectedLiveReport?.needsPeriod);
  const canLoadLive = connected && !isTemplate && (!needsUnit || wialonUnitId != null);

  const { data, def, isLoading, isFetching, isError, refetch } = useLiveReportData(
    isTemplate ? 'fleet-status' : selectedReportId,
    {
      unitId: scope === 'unit' ? wialonUnitId : null,
      datePreset,
      enabled: canLoadLive,
    }
  );

  const canRunTemplate =
    connected &&
    isTemplate &&
    selectedTemplate != null &&
    (templateKind === 'group'
      ? wialonGroupId != null
      : templateKind === 'user'
        ? wialonUserId != null
        : templateKind === 'resource'
          ? true
          : wialonUnitId != null);

  const {
    data: templateResult,
    isLoading: templateLoading,
    isError: templateError,
    refetch: refetchTemplate,
  } = useWialonReportRun(templateRunParams, false);

  const handleRunTemplate = () => {
    if (!selectedTemplate) return;
    const { from, to } = reportPresetRange(datePreset);
    const objectId =
      templateKind === 'group'
        ? wialonGroupId!
        : templateKind === 'user'
          ? wialonUserId!
          : templateKind === 'resource'
            ? selectedTemplate.resourceId
            : wialonUnitId!;
    setTemplateRunParams({
      reportResourceId: selectedTemplate.resourceId,
      reportTemplateId: selectedTemplate.templateId,
      reportObjectId: objectId,
      from,
      to,
      useRunEndpoint: true,
      module: selectedTemplate.module,
      objectKind: templateKind,
    });
  };

  const selectedUnitName =
    templateKind === 'user'
      ? catalog?.users?.find((u) => u.id === wialonUserId)?.nm
      : templateKind === 'group'
        ? catalog?.groups?.find((g) => g.id === wialonGroupId)?.nm
        : units.find((u) => (u.wialonId ?? Number(u.id)) === wialonUnitId)?.name;

  const periodLabel = useMemo(() => {
    if (!needsPeriod) return 'Live snapshot';
    const preset = DATE_PRESETS.find((p) => p.id === datePreset);
    const { from, to } = reportPresetRange(datePreset);
    return `${preset?.label ?? datePreset} (${from} → ${to})`;
  }, [datePreset, needsPeriod]);

  if (!connected) {
    return (
      <div className="space-y-4">
        <WialonContextBanner />
        <div className="fleet-card py-16 text-center text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Connect telematics for live reports</p>
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
            <h2 className="text-lg font-semibold">Reports</h2>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Radio className="h-3 w-3 text-status-moving" />
              Live tables auto-refresh {livePollLabel(LIVE_POLL.fleet)} · Saved templates run on demand
            </p>
          </div>
        </div>

        <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-12">
          <div className="lg:col-span-3 border-r border-border/60 overflow-auto min-h-0 p-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-1">
              Live
            </p>
            {[...grouped.entries()].map(([category, reports]) =>
              reports.length ? (
                <div key={category} className="mb-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-1">
                    {category}
                  </p>
                  {reports.map((r) => (
                    <ReportNavItem
                      key={r.id}
                      title={r.label}
                      description={r.description}
                      meta={`${r.columns.length} columns · live`}
                      active={selectedReportId === r.id}
                      onSelect={() => setSelectedReportId(r.id)}
                    />
                  ))}
                </div>
              ) : null
            )}

            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-1 mt-4">
              Report templates
            </p>
            {catalogLoading ? (
              <p className="text-xs text-muted-foreground px-2 py-4">Loading templates…</p>
            ) : (
              WIALON_MODULE_ORDER.map((mod) => {
                const items = templatesByModule.get(mod) ?? [];
                if (!items.length) return null;
                return (
                  <div key={mod} className="mb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-1">
                      {WIALON_MODULE_LABELS[mod]}
                    </p>
                    {items.map((t) => {
                      const key = templateReportKey(t.resourceId, t.templateId);
                      const kind = t.objectKind ?? (t.isGroupReport ? 'group' : 'unit');
                      return (
                        <ReportNavItem
                          key={key}
                          title={t.templateName}
                          description={`${t.resourceName} · ${kind} report`}
                          meta={t.fallback ? 'fallback template' : 'exec_report'}
                          active={selectedReportId === key}
                          onSelect={() => setSelectedReportId(key)}
                        />
                      );
                    })}
                  </div>
                );
              })
            )}
            {!catalogLoading && !catalog?.templates.length && (
              <p className="text-xs text-muted-foreground px-2 py-2">No report templates in this account.</p>
            )}
          </div>

          <div className="lg:col-span-9 flex flex-col min-h-0 p-4">
            <div className="flex flex-wrap gap-3 mb-3 shrink-0 pb-3 border-b border-border/40">
              {!isTemplate && (
                <div className="flex gap-1 p-0.5 rounded-lg bg-muted/50 border border-border/60">
                  <button
                    type="button"
                    onClick={() => setScope('fleet')}
                    disabled={selectedLiveReport?.scope === 'unit'}
                    className={cn(
                      'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                      scope === 'fleet' ? 'bg-card shadow-sm' : 'text-muted-foreground',
                      selectedLiveReport?.scope === 'unit' && 'opacity-40 cursor-not-allowed'
                    )}
                  >
                    All assets
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope('unit')}
                    disabled={selectedLiveReport?.scope === 'fleet'}
                    className={cn(
                      'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                      scope === 'unit' ? 'bg-card shadow-sm' : 'text-muted-foreground',
                      selectedLiveReport?.scope === 'fleet' && 'opacity-40 cursor-not-allowed'
                    )}
                  >
                    Single asset
                  </button>
                </div>
              )}

              {(isTemplate && templateKind === 'unit') || (!isTemplate && scope === 'unit') ? (
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
              ) : null}

              {isTemplate && templateKind === 'group' && (
                <div className="min-w-[200px]">
                  <Label className="text-[10px] text-muted-foreground">Unit group</Label>
                  <Select value={groupId} onValueChange={setGroupId}>
                    <SelectTrigger className="h-8 mt-0.5 text-xs">
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
              )}

              {isTemplate && templateKind === 'user' && (
                <div className="min-w-[200px]">
                  <Label className="text-[10px] text-muted-foreground">User</Label>
                  <Select value={userId} onValueChange={setUserId}>
                    <SelectTrigger className="h-8 mt-0.5 text-xs">
                      <SelectValue placeholder={catalog?.users?.length ? 'Select user' : 'No users found'} />
                    </SelectTrigger>
                    <SelectContent>
                      {(catalog?.users ?? []).map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.nm}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {isTemplate && templateKind === 'resource' && (
                <p className="text-[11px] text-muted-foreground self-end pb-1">
                  Account report — no unit required
                </p>
              )}

              {needsPeriod && (
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

              {isTemplate && (
                <div className="flex items-end">
                  <Button
                    size="sm"
                    className="h-8 gap-1.5"
                    disabled={!canRunTemplate || templateLoading}
                    onClick={handleRunTemplate}
                  >
                    {templateLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    Run report
                  </Button>
                </div>
              )}
            </div>

            {isTemplate ? (
              <>
                {selectedTemplate && (
                  <p className="text-xs text-muted-foreground mb-3">
                    {selectedTemplate.templateName} on {selectedTemplate.resourceName}
                    {selectedTemplate.fallback ? ' · fallback match' : ''}
                  </p>
                )}
                {templateError && (
                  <QueryErrorBanner
                    message="Could not run report."
                    onRetry={refetchTemplate}
                    className="mb-3"
                  />
                )}
                {!templateRunParams && (
                  <div className="fleet-card flex-1 flex items-center justify-center text-sm text-muted-foreground p-8">
                    Select period and asset{selectedTemplate?.isGroupReport ? ' group' : ''}, then click Run report.
                  </div>
                )}
                {templateResult && templateRunParams && (
                  <ReportResultsView
                    data={templateResult}
                    templateName={selectedTemplate?.templateName}
                    moduleLabel={
                      selectedTemplate?.module === 'fuel' ? 'Fuel' : WIALON_MODULE_LABELS[selectedTemplate?.module as keyof typeof WIALON_MODULE_LABELS] || 'Reports'
                    }
                    unitName={selectedUnitName}
                    reportObjectId={templateRunParams.reportObjectId}
                    objectKind={templateRunParams.objectKind}
                    className="flex-1 min-h-0"
                  />
                )}
              </>
            ) : (
              <>
                {isError && (
                  <QueryErrorBanner message="Could not load live report data." onRetry={refetch} className="mb-3" />
                )}
                {def && selectedLiveReport && (
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
                      isLoading={canLoadLive ? isLoading : false}
                      isFetching={canLoadLive ? isFetching : false}
                      onRefresh={canLoadLive ? refetch : undefined}
                      periodLabel={periodLabel}
                      objectLabel={scope === 'unit' && selectedUnitName ? selectedUnitName : undefined}
                      moduleLabel="Reports"
                      emptyHint={
                        needsUnit && !wialonUnitId
                          ? 'Select an asset above — column structure is ready, rows fill automatically.'
                          : undefined
                      }
                      className="flex-1"
                    />
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportNavItem({
  title,
  description,
  meta,
  active,
  onSelect,
}: {
  title: string;
  description: string;
  meta: string;
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
      <p className="text-xs font-medium">{title}</p>
      <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{description}</p>
      <p className="text-[10px] text-muted-foreground/80 mt-1">{meta}</p>
    </button>
  );
}
