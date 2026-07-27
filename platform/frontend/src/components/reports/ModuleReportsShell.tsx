import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileText, Printer, ArrowUpDown, Search, Download, Play } from 'lucide-react';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { cn } from '@/lib/utils';
import { PeriodAssetControls } from '@/components/shared/PeriodAssetControls';
import { notify } from '@/lib/notify';
import { BrandedReportFooter, BrandedReportHeader, BrandedReportDocument } from '@/components/reports/BrandedReportChrome';
import { DomainReportCharts } from '@/components/reports/DomainReportCharts';
import type { DomainChartSpec } from '@/lib/domainReportCharts';
import { buildReportFilename } from '@/lib/reportFilename';
import { buildReportCsv, downloadReportCsv, type ReportCsvColumn } from '@/lib/reportCsv';
import { getDefaultReportDateRange } from '@/lib/defaultDateRange';
import { importPrintReport } from '@/lib/importPrintReport';

export type ModuleReportDef = {
  id: string;
  title: string;
  blurb: string;
};

export type ModuleReportKpi = {
  label: string;
  value: string | number;
  hint?: string;
};

export type ModuleReportRow = Record<string, string | number | null | undefined>;

type Column = {
  key: string;
  label: string;
  align?: 'left' | 'right';
  sortable?: boolean;
};

const CSV_HELPER_KEYS = new Set([
  'count',
  'fuelN',
  'engineOnN',
  'makeKey',
  'distanceKm',
  'radiusM',
]);

function humanizeCsvKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Declared columns first, then any extra data keys present on rows (full CSV detail). */
function expandCsvColumns(
  columns: Column[],
  rows: ModuleReportRow[],
): ReportCsvColumn[] {
  const out: ReportCsvColumn[] = columns.map((c) => ({ key: c.key, label: c.label }));
  const seen = new Set(out.map((c) => c.key));
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (seen.has(key) || key.startsWith('_') || CSV_HELPER_KEYS.has(key)) continue;
      seen.add(key);
      out.push({ key, label: humanizeCsvKey(key) });
    }
  }
  // Prefer numeric distance/radius helpers when the display column is a formatted string
  if (!seen.has('distanceKm') && rows.some((r) => r.distanceKm != null)) {
    out.push({ key: 'distanceKm', label: 'Distance (km)' });
  }
  if (!seen.has('radiusM') && rows.some((r) => r.radiusM != null)) {
    out.push({ key: 'radiusM', label: 'Radius (m)' });
  }
  return out;
}

type Props = {
  moduleLabel: string;
  reports: ModuleReportDef[];
  /** Controlled report selection */
  selectedReportId?: string;
  onSelectedReportIdChange?: (id: string) => void;
  kpis?: ModuleReportKpi[];
  columns: Column[];
  rows: ModuleReportRow[];
  assetNames?: string[];
  assetKey?: string;
  /** When set, From/To filter rows by this field (ISO date, locale date, or unix ms/sec). */
  dateKey?: string;
  defaultFrom?: string;
  defaultTo?: string;
  todayStr?: string;
  emptyMessage?: string;
  footerNote?: string;
  extraPreview?: ReactNode;
  /** Two standing-bar + secondary graphs from filtered rows (Fuel/Alerts style). */
  charts?: DomainChartSpec;
  /** When provided, parent handles filtering and receives control values */
  controlledFrom?: string;
  controlledTo?: string;
  controlledAsset?: string;
  onFromChange?: (v: string) => void;
  onToChange?: (v: string) => void;
  onAssetChange?: (v: string) => void;
  /** Fetch / refresh data for the selected filters and report. */
  onRun?: () => void | Promise<void>;
  running?: boolean;
};

function todayIso() {
  return getDefaultReportDateRange().todayStr;
}

function rowDayIso(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return null;
}

export function ModuleReportsShell({
  moduleLabel,
  reports,
  selectedReportId,
  onSelectedReportIdChange,
  kpis = [],
  columns,
  rows,
  assetNames = [],
  assetKey = 'name',
  dateKey,
  defaultFrom,
  defaultTo,
  todayStr,
  emptyMessage = 'No data for this report yet.',
  footerNote,
  extraPreview,
  charts,
  controlledFrom,
  controlledTo,
  controlledAsset,
  onFromChange,
  onToChange,
  onAssetChange,
  onRun,
  running = false,
}: Props) {
  const branding = useTenantBranding();
  const [localKind, setLocalKind] = useState(reports[0]?.id ?? 'executive');
  const kind = selectedReportId ?? localKind;
  const setKind = onSelectedReportIdChange ?? setLocalKind;
  const reportDefault = getDefaultReportDateRange();
  const [localFrom, setLocalFrom] = useState(defaultFrom || reportDefault.fromDate);
  const [localTo, setLocalTo] = useState(defaultTo || reportDefault.toDate);
  const [localAsset, setLocalAsset] = useState('all');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [q, setQ] = useState('');
  const [runBusy, setRunBusy] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const fromDate = controlledFrom ?? localFrom;
  const toDate = controlledTo ?? localTo;
  const asset = controlledAsset ?? localAsset;
  const today = todayStr || todayIso();

  const setFrom = onFromChange ?? setLocalFrom;
  const setTo = onToChange ?? setLocalTo;
  const setAsset = onAssetChange ?? setLocalAsset;

  const active = useMemo(() => reports.find((r) => r.id === kind) ?? reports[0], [reports, kind]);

  const filteredRows = useMemo(() => {
    let list = [...rows];
    if (dateKey) {
      list = list.filter((r) => {
        const day = rowDayIso(r[dateKey]);
        if (!day) return true;
        return day >= fromDate && day <= toDate;
      });
    }
    if (asset !== 'all' && assetKey) {
      list = list.filter((r) => String(r[assetKey] ?? '') === asset);
    }
    const hay = q.trim().toLowerCase();
    if (hay) {
      list = list.filter((r) =>
        columns.some((c) => String(r[c.key] ?? '').toLowerCase().includes(hay)),
      );
    }
    if (sortKey) {
      list.sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        const an = typeof av === 'number' ? av : Number(String(av ?? '').replace(/[,%]/g, ''));
        const bn = typeof bv === 'number' ? bv : Number(String(bv ?? '').replace(/[,%]/g, ''));
        if (Number.isFinite(an) && Number.isFinite(bn)) {
          return sortDir === 'asc' ? an - bn : bn - an;
        }
        const as = String(av ?? '');
        const bs = String(bv ?? '');
        return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
      });
    }
    return list;
  }, [rows, dateKey, fromDate, toDate, asset, assetKey, q, columns, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const [printing, setPrinting] = useState(false);

  const reportFilenameBase = () =>
    buildReportFilename({
      clientName: branding.name,
      reportName: active?.title || moduleLabel,
      date: toDate || todayIso(),
      unitName: asset !== 'all' ? asset : undefined,
    });

  const handleRun = async () => {
    if (!onRun) {
      notify.info('Report ready', 'Filters already applied to the preview.');
      return;
    }
    setRunBusy(true);
    try {
      await onRun();
      notify.success('Report updated', 'Data refreshed for the selected filters.');
    } catch (e) {
      notify.error('Run failed', e instanceof Error ? e.message : 'Could not refresh report');
    } finally {
      setRunBusy(false);
    }
  };

  const exportCsv = () => {
    const filters = [
      { label: 'From', value: fromDate },
      { label: 'To', value: toDate },
      { label: 'Asset', value: asset === 'all' ? 'All assets' : asset },
      { label: 'Report type', value: active?.title || kind },
    ];
    if (q.trim()) filters.push({ label: 'Search', value: q.trim() });
    if (sortKey) filters.push({ label: 'Sort', value: `${sortKey} (${sortDir})` });

    const csvColumns = expandCsvColumns(columns, filteredRows);

    const csv = buildReportCsv({
      meta: {
        title: active?.title || moduleLabel,
        moduleLabel,
        clientName: branding.name,
        periodLabel: `${fromDate} → ${toDate}`,
        objectLabel: asset !== 'all' ? asset : 'All assets',
        generatedAt: new Date(),
        notes: [
          active?.blurb,
          footerNote,
          csvColumns.length > columns.length
            ? 'CSV includes every available detail field for the filtered rows.'
            : undefined,
        ].filter((n): n is string => Boolean(n?.trim())),
        kpis: kpis.map((k) => ({ label: k.label, value: k.value })),
        filters,
      },
      columns: csvColumns,
      rows: filteredRows,
    });
    downloadReportCsv(csv, `${reportFilenameBase()}.csv`);
  };

  const exportPreview = async (mode: 'download' | 'print') => {
    const node = previewRef.current;
    if (!node) return;
    setPrinting(true);
    try {
      const { printReportDocument } = await importPrintReport();
      await printReportDocument({
        root: node,
        title: `${branding.name || 'Client'} - ${active?.title ?? moduleLabel}`,
        filename: reportFilenameBase(),
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
      setPrinting(false);
    }
  };

  const busy = runBusy || running;

  return (
    <div className="space-y-3">
      <Card className="border-primary/20">
        <CardContent className="pt-3 pb-3 px-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1">
              {reports.map((r) => {
                const activeCard = kind === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    title={r.blurb}
                    onClick={() => setKind(r.id)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors h-7',
                      activeCard
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-background text-muted-foreground hover:text-primary hover:border-primary/40',
                    )}
                  >
                    <FileText className="h-3 w-3 shrink-0 opacity-80" />
                    {r.title}
                  </button>
                );
              })}
            </div>

            <div className="hidden sm:block h-5 w-px bg-border shrink-0" aria-hidden />

            <PeriodAssetControls
              fromDate={fromDate}
              toDate={toDate}
              todayStr={today}
              asset={asset}
              assetNames={assetNames}
              assetLabel="Asset"
              onFromChange={setFrom}
              onToChange={setTo}
              onAssetChange={setAsset}
              compact
              className="min-w-0 grow"
              trailing={
                <>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Search rows…"
                      className="h-7 w-[148px] pl-7 text-xs"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() => void handleRun()}
                    className="h-7 gap-1.5 shrink-0"
                  >
                    <Play className="h-3.5 w-3.5" />
                    {busy ? 'Running…' : 'Run report'}
                  </Button>
                </>
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden" style={{ borderColor: `${branding.primaryColor}40` }}>
        <CardHeader className="py-2.5 px-4 flex-row items-center justify-between space-y-0 gap-2" style={{ background: `${branding.primaryColor}0F` }}>
          <CardTitle className="text-sm font-medium min-w-0 truncate">
            Preview · {fromDate} → {toDate}
            {asset !== 'all' ? ` · ${asset}` : ''}
            <span className="text-muted-foreground font-normal ml-2">
              {filteredRows.length} row{filteredRows.length === 1 ? '' : 's'}
            </span>
          </CardTitle>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!filteredRows.length}
              onClick={exportCsv}
              className="h-8"
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              CSV
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={printing}
              onClick={() => void exportPreview('download')}
              className="h-8 border-primary/40 text-primary"
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              Download PDF
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={printing}
              onClick={() => void exportPreview('print')}
              className="h-8 border-primary/40 text-primary"
            >
              <Printer className="h-3.5 w-3.5 mr-1" />
              Print / PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div ref={previewRef} className="rounded-lg border bg-white text-slate-900 overflow-visible">
            <BrandedReportDocument branding={branding}>
              <div className="px-5 pt-5 pb-4 space-y-6">
                <BrandedReportHeader
                  branding={branding}
                  reportTitle={active?.title || moduleLabel}
                  moduleLabel={moduleLabel}
                  periodLabel={`${fromDate} → ${toDate}`}
                  objectLabel={asset !== 'all' ? asset : undefined}
                />

              {kpis.length > 0 && (
                <div
                  data-report-kpi-grid
                  data-report-kpi-count={String(Math.min(kpis.length, 4))}
                  className="grid grid-cols-2 md:grid-cols-4 gap-2.5"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${Math.min(kpis.length, 4)}, minmax(0, 1fr))`,
                    gap: '10px',
                  }}
                >
                  {kpis.slice(0, 4).map((k) => (
                    <div
                      key={k.label}
                      data-report-kpi-card
                      className="rounded-md border border-slate-200 bg-slate-50 p-3"
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        background: '#f8fafc',
                        padding: '12px',
                        minWidth: 0,
                      }}
                    >
                      <div
                        data-report-kpi-label
                        className="text-[11px] uppercase tracking-wide text-slate-500"
                        style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}
                      >
                        {k.label}
                      </div>
                      <b
                        data-report-kpi-value
                        className="text-lg tabular-nums block mt-1"
                        style={{ color: branding.primaryColor, fontSize: '18px', display: 'block', marginTop: '4px' }}
                      >
                        {k.value}
                      </b>
                      {k.hint && (
                        <div
                          data-report-kpi-hint
                          className="text-[10px] text-slate-400 mt-0.5"
                          style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}
                        >
                          {k.hint}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {charts && (
                <div style={{ marginTop: 8, marginBottom: 8 }}>
                  <DomainReportCharts
                    rows={filteredRows}
                    spec={charts}
                    primaryColor={branding.primaryColor}
                  />
                </div>
              )}
              {extraPreview}
            </div>

            {filteredRows.length === 0 ? (
              <p className="text-sm text-slate-500 py-10 text-center px-5">{emptyMessage}</p>
            ) : (
              <div className="overflow-x-auto px-5 pb-3" style={{ marginTop: 16 }}>
                <table className="w-full text-[13px] border-collapse min-w-[640px]">
                  <thead>
                    <tr>
                      {columns.map((c) => (
                        <th
                          key={c.key}
                          className={cn(
                            'border px-2.5 py-2 font-medium whitespace-nowrap',
                            c.align === 'right' ? 'text-right' : 'text-left',
                          )}
                          style={{
                            background: branding.primaryColor,
                            color: '#fff',
                            borderColor: branding.primaryColor,
                          }}
                        >
                          {c.sortable !== false ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 hover:opacity-90"
                              onClick={() => toggleSort(c.key)}
                            >
                              {c.label}
                              <ArrowUpDown className="h-3 w-3 opacity-70" />
                            </button>
                          ) : (
                            c.label
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, i) => (
                      <tr key={i} className={i % 2 ? 'bg-slate-50' : 'bg-white'}>
                        {columns.map((c) => (
                          <td
                            key={c.key}
                            className={cn(
                              'border border-slate-200 px-2.5 py-1.5',
                              c.align === 'right' && 'text-right tabular-nums',
                              c.key === 'detail' && 'min-w-[220px] max-w-[420px] whitespace-normal break-words text-[12px] text-slate-700',
                            )}
                          >
                            {row[c.key] ?? '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

              <div className="px-5 pb-5">
                <BrandedReportFooter branding={branding} note={footerNote} />
              </div>
            </BrandedReportDocument>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
