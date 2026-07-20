import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileText, Printer, ArrowUpDown, Search, Download } from 'lucide-react';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { cn } from '@/lib/utils';
import { PeriodAssetControls } from '@/components/shared/PeriodAssetControls';
import { notify } from '@/lib/notify';
import { BrandedReportFooter, BrandedReportHeader, BrandedReportDocument } from '@/components/reports/BrandedReportChrome';
import { DomainReportCharts } from '@/components/reports/DomainReportCharts';
import type { DomainChartSpec } from '@/lib/domainReportCharts';

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
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
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
}: Props) {
  const branding = useTenantBranding();
  const [localKind, setLocalKind] = useState(reports[0]?.id ?? 'executive');
  const kind = selectedReportId ?? localKind;
  const setKind = onSelectedReportIdChange ?? setLocalKind;
  const [localFrom, setLocalFrom] = useState(defaultFrom || daysAgo(6));
  const [localTo, setLocalTo] = useState(defaultTo || todayIso());
  const [localAsset, setLocalAsset] = useState('all');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [q, setQ] = useState('');
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

  const exportPreview = async (mode: 'download' | 'print') => {
    const node = previewRef.current;
    if (!node) return;
    setPrinting(true);
    try {
      const { printReportDocument } = await import('@/lib/printReport');
      await printReportDocument({
        root: node,
        title: `${branding.name || 'Client'} - ${active?.title ?? moduleLabel}`,
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

  return (
    <div className="space-y-3">
      <Card className="border-primary/20">
        <CardContent className="pt-3 pb-3 px-4 space-y-2.5">
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
          />
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search report rows…"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-1.5">
        {reports.map((r) => {
          const activeCard = kind === r.id;
          return (
            <button
              key={r.id}
              type="button"
              title={r.blurb}
              onClick={() => setKind(r.id)}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors',
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
          <div ref={previewRef} className="rounded-lg border bg-white text-slate-900 overflow-hidden">
            <BrandedReportDocument branding={branding}>
              <div className="px-5 pt-5 pb-4 space-y-4">
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
                  {kpis.map((k) => (
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
                <DomainReportCharts
                  rows={filteredRows}
                  spec={charts}
                  primaryColor={branding.primaryColor}
                />
              )}
              {extraPreview}
            </div>

            {filteredRows.length === 0 ? (
              <p className="text-sm text-slate-500 py-10 text-center px-5">{emptyMessage}</p>
            ) : (
              <div className="overflow-x-auto px-5 pb-3">
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
