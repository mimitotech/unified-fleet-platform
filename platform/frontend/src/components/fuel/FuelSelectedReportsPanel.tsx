import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Loader2, Play } from 'lucide-react';
import type { FuelAssetCategory } from '@/lib/fuelTypes';
import { useWialonReportCatalog, useWialonReportRun } from '@/hooks/useWialonReports';
import { reportPresetRange, type ReportDatePreset } from '@/lib/reportUtils';
import { ReportResultsView } from '@/components/reports/ReportResultsView';
import { QueryErrorBanner } from '@/components/shared/QueryErrorBanner';
import { cn } from '@/lib/utils';

type ReportSelection = {
  resourceId: number;
  templateId: number;
  templateName: string;
  module?: string;
  isGroupReport?: boolean;
};

export function FuelSelectedReportsPanel({
  reports,
  assetCategory,
  unitNames,
  unitOptions = [],
  fromDate,
  toDate,
}: {
  reports: ReportSelection[];
  assetCategory: FuelAssetCategory;
  unitNames?: string[];
  unitOptions?: Array<{ id: string | number; name: string; wialonId?: number }>;
  fromDate?: string;
  toDate?: string;
}) {
  const lower = assetCategory === 'vehicle' ? 'fuel report' : 'fuel usage report';
  const filtered = reports.filter((r) => r.templateName.toLowerCase().includes(lower));

  const [open, setOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [datePreset, setDatePreset] = useState<ReportDatePreset>('today');
  const [runParams, setRunParams] = useState<{
    reportResourceId: number;
    reportTemplateId: number;
    reportObjectId: number;
    from: number;
    to: number;
    useRunEndpoint: true;
    module?: string;
    objectKind: 'unit' | 'group';
  } | null>(null);

  useEffect(() => {
    if (!filtered.length) return;
    if (!selectedKey && filtered.length) {
      setSelectedKey(`${filtered[0].resourceId}:${filtered[0].templateId}`);
    }
  }, [filtered, selectedKey]);

  const selectedReport = useMemo(
    () => filtered.find((r) => `${r.resourceId}:${r.templateId}` === selectedKey) ?? null,
    [filtered, selectedKey],
  );
  const needsCatalog = open && Boolean(selectedReport?.isGroupReport);
  const { data: catalog } = useWialonReportCatalog(needsCatalog);

  const reportUnits = useMemo(() => {
    if (!unitNames?.length) return unitOptions;
    const set = new Set(unitNames.map((n) => n.trim().toLowerCase()));
    return unitOptions.filter((u) => set.has(u.name.trim().toLowerCase()));
  }, [unitNames, unitOptions]);

  useEffect(() => {
    if (!selectedReport || selectedReport.isGroupReport) return;
    if (selectedUnitId) return;
    const first = reportUnits[0];
    if (first) setSelectedUnitId(String(first.wialonId ?? first.id));
  }, [selectedReport, selectedUnitId, reportUnits]);

  useEffect(() => {
    if (!selectedReport?.isGroupReport) return;
    if (selectedGroupId) return;
    const first = catalog?.groups?.[0];
    if (first) setSelectedGroupId(String(first.id));
  }, [selectedReport, selectedGroupId, catalog?.groups]);

  useEffect(() => {
    setRunParams(null);
  }, [selectedKey, selectedUnitId, selectedGroupId, datePreset, fromDate, toDate]);

  const {
    data: reportResult,
    isLoading: reportLoading,
    isError: reportError,
    refetch,
  } = useWialonReportRun(runParams, false);

  const runReport = () => {
    if (!selectedReport) return;
    let from: number;
    let to: number;
    if (fromDate && toDate) {
      from = Math.floor(new Date(`${fromDate}T00:00:00Z`).getTime() / 1000);
      to = Math.floor(new Date(`${toDate}T23:59:59Z`).getTime() / 1000);
    } else {
      const preset = reportPresetRange(datePreset);
      from = preset.from;
      to = preset.to;
    }

    const objectId = selectedReport.isGroupReport ? Number(selectedGroupId) : Number(selectedUnitId);
    if (!Number.isFinite(objectId) || objectId <= 0) return;
    setRunParams({
      reportResourceId: selectedReport.resourceId,
      reportTemplateId: selectedReport.templateId,
      reportObjectId: objectId,
      from,
      to,
      useRunEndpoint: true,
      module: selectedReport.module,
      objectKind: selectedReport.isGroupReport ? 'group' : 'unit',
    });
  };

  if (!filtered.length) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardContent className="p-3">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between h-9 px-2 text-left">
              <span className="text-sm font-semibold">
                Reports ({filtered.length}) — click to view full report contents
              </span>
              <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180')} />
            </Button>
          </CollapsibleTrigger>
        </CardContent>
      </Card>
      <CollapsibleContent className="pt-1">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
      <Card className="xl:col-span-4">
        <CardContent className="p-3 space-y-3">
          <div>
            <p className="text-sm font-semibold">Enabled reports</p>
            <p className="text-xs text-muted-foreground">
              Click a report, set filter, and run to view all contents/structure.
            </p>
          </div>
          <div className="space-y-1.5 max-h-[320px] overflow-auto">
            {filtered.map((r) => {
              const key = `${r.resourceId}:${r.templateId}`;
              const active = key === selectedKey;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedKey(key)}
                  className={`w-full text-left rounded-md border px-2 py-2 ${
                    active ? 'border-primary/40 bg-primary/10' : 'border-border/60 bg-muted/20'
                  }`}
                >
                  <p className="text-xs font-medium">{r.templateName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Resource {r.resourceId} · Template {r.templateId}
                  </p>
                  <div className="mt-1">
                    <Badge variant="outline" className="text-[10px]">
                      {r.isGroupReport ? 'Group report' : 'Unit report'}
                    </Badge>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedReport && (
            <div className="space-y-2 pt-1 border-t border-border/60">
              {selectedReport.isGroupReport ? (
                <div>
                  <Label className="text-xs">Group</Label>
                  <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                    <SelectTrigger className="h-8 mt-1"><SelectValue placeholder="Select group" /></SelectTrigger>
                    <SelectContent>
                      {(catalog?.groups ?? []).map((g) => (
                        <SelectItem key={g.id} value={String(g.id)}>{g.nm}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <Label className="text-xs">Unit</Label>
                  <Select value={selectedUnitId} onValueChange={setSelectedUnitId}>
                    <SelectTrigger className="h-8 mt-1"><SelectValue placeholder="Select unit" /></SelectTrigger>
                    <SelectContent>
                      {reportUnits.map((u) => (
                        <SelectItem key={String(u.wialonId ?? u.id)} value={String(u.wialonId ?? u.id)}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {!fromDate || !toDate ? (
                <div>
                  <Label className="text-xs">Period</Label>
                  <Select value={datePreset} onValueChange={(v) => setDatePreset(v as ReportDatePreset)}>
                    <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="yesterday">Yesterday</SelectItem>
                      <SelectItem value="last7">Last 7 days</SelectItem>
                      <SelectItem value="last30">Last 30 days</SelectItem>
                      <SelectItem value="thisMonth">This month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Using Fuel range: {fromDate} → {toDate}
                </p>
              )}

              <Button size="sm" className="w-full h-8 gap-1.5" onClick={runReport} disabled={reportLoading}>
                {reportLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Run report
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="xl:col-span-8">
        <CardContent className="p-3">
          {reportError && (
            <QueryErrorBanner message="Could not run selected report." onRetry={refetch} className="mb-3" />
          )}
          {!runParams && (
            <div className="text-sm text-muted-foreground py-12 text-center">
              Select a report and click <strong>Run report</strong> to view all tables and structures.
            </div>
          )}
          {reportResult && runParams && (
            <ReportResultsView
              data={reportResult}
              templateName={selectedReport?.templateName}
              moduleLabel="Fuel"
              reportObjectId={runParams.reportObjectId}
              objectKind={runParams.objectKind}
              unitName={
                selectedReport?.isGroupReport
                  ? catalog?.groups?.find((g) => String(g.id) === selectedGroupId)?.nm
                  : reportUnits.find((u) => String(u.wialonId ?? u.id) === selectedUnitId)?.name
              }
            />
          )}
        </CardContent>
      </Card>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

