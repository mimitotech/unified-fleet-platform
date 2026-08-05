import { useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileText, Printer } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { notify } from '@/lib/notify';
import { BrandedReportFooter, BrandedReportHeader, BrandedReportDocument } from '@/components/reports/BrandedReportChrome';
import { cn } from '@/lib/utils';
import { importPrintReport } from '@/lib/importPrintReport';

type MaintRow = {
  vehicleName?: string;
  totalCost?: number | string;
  maintenanceType?: string;
  status?: string;
};

type BreakRow = {
  vehicleName?: string;
  totalCost?: number | string;
  severity?: string;
  status?: string;
};

type ReportKind = 'executive' | 'cost-by-asset' | 'breakdowns';

const REPORTS: Array<{ id: ReportKind; title: string; blurb: string }> = [
  {
    id: 'executive',
    title: 'Workshop executive summary',
    blurb: 'Jobs, costs, and open risk for the selected records.',
  },
  {
    id: 'cost-by-asset',
    title: 'Maintenance cost by asset',
    blurb: 'Spend comparison across assets.',
  },
  {
    id: 'breakdowns',
    title: 'Breakdown cost review',
    blurb: 'Open and closed breakdown spend.',
  },
];

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function WorkshopCostingPanel({
  maintenance,
  breakdowns,
}: {
  maintenance?: MaintRow[];
  breakdowns?: BreakRow[];
}) {
  const chartData = useMemo(() => {
    const map = new Map<string, { name: string; maintenance: number; breakdown: number }>();
    for (const m of maintenance ?? []) {
      const name = m.vehicleName || 'Unknown';
      const row = map.get(name) ?? { name, maintenance: 0, breakdown: 0 };
      row.maintenance += num(m.totalCost);
      map.set(name, row);
    }
    for (const b of breakdowns ?? []) {
      const name = b.vehicleName || 'Unknown';
      const row = map.get(name) ?? { name, maintenance: 0, breakdown: 0 };
      row.breakdown += num(b.totalCost);
      map.set(name, row);
    }
    return [...map.values()]
      .map((r) => ({
        ...r,
        total: Math.round((r.maintenance + r.breakdown) * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 40);
  }, [maintenance, breakdowns]);

  const totals = useMemo(() => {
    const maint = (maintenance ?? []).reduce((s, m) => s + num(m.totalCost), 0);
    const brk = (breakdowns ?? []).reduce((s, b) => s + num(b.totalCost), 0);
    return { maint, brk, all: maint + brk };
  }, [maintenance, breakdowns]);

  const minWidth = Math.max(480, chartData.length * 64);

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-medium">Workshop costing</CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">
          Maintenance {totals.maint.toLocaleString()} · Breakdowns {totals.brk.toLocaleString()} · Total{' '}
          {totals.all.toLocaleString()}
        </p>
      </CardHeader>
      <CardContent className="px-2 pb-3">
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground px-2">No cost data yet. Record jobs with costs to populate this chart.</p>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth }} className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} height={60} tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="maintenance" name="Maintenance" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="breakdown" name="Breakdowns" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function WorkshopModuleReports({
  maintenance,
  breakdowns,
  pendingJobs,
  openBreakdowns,
}: {
  maintenance?: MaintRow[];
  breakdowns?: BreakRow[];
  pendingJobs?: number;
  openBreakdowns?: number;
}) {
  const branding = useTenantBranding();
  const [kind, setKind] = useState<ReportKind>('executive');
  const previewRef = useRef<HTMLDivElement>(null);

  const byAsset = useMemo(() => {
    const map = new Map<string, { name: string; maintenance: number; breakdown: number }>();
    for (const m of maintenance ?? []) {
      const name = m.vehicleName || 'Unknown';
      const row = map.get(name) ?? { name, maintenance: 0, breakdown: 0 };
      row.maintenance += num(m.totalCost);
      map.set(name, row);
    }
    for (const b of breakdowns ?? []) {
      const name = b.vehicleName || 'Unknown';
      const row = map.get(name) ?? { name, maintenance: 0, breakdown: 0 };
      row.breakdown += num(b.totalCost);
      map.set(name, row);
    }
    return [...map.values()].sort(
      (a, b) => b.maintenance + b.breakdown - (a.maintenance + a.breakdown),
    );
  }, [maintenance, breakdowns]);

  const totalMaint = byAsset.reduce((s, a) => s + a.maintenance, 0);
  const totalBrk = byAsset.reduce((s, a) => s + a.breakdown, 0);

  const [busy, setBusy] = useState(false);

  const exportPreview = async (mode: 'download' | 'print') => {
    const node = previewRef.current;
    if (!node) return;
    setBusy(true);
    try {
      const { printReportDocument } = await importPrintReport();
      await printReportDocument({
        root: node,
        title: `${branding.name || 'Client'} - Workshop`,
        primaryColor: branding.primaryColor,
        secondaryColor: branding.secondaryColor,
        mode,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {REPORTS.map((r) => (
          <button
            key={r.id}
            type="button"
            title={r.blurb}
            onClick={() => setKind(r.id)}
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors',
              kind === r.id
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-background text-muted-foreground hover:text-primary hover:border-primary/40',
            )}
          >
            <FileText className="h-3 w-3 shrink-0 opacity-80" />
            {r.title}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="py-2.5 px-4 flex-row items-center justify-between space-y-0 gap-2">
          <CardTitle className="text-sm font-medium">Preview</CardTitle>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void exportPreview('download')}
              className="h-8"
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              Download PDF
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void exportPreview('print')}
              className="h-8"
            >
              <Printer className="h-3.5 w-3.5 mr-1" />
              Print / PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div ref={previewRef} className="rounded-md border bg-white text-slate-900 overflow-hidden">
            <BrandedReportDocument branding={branding}>
            <div className="p-5 space-y-4">
              <BrandedReportHeader
                branding={branding}
                reportTitle={REPORTS.find((r) => r.id === kind)?.title || 'Workshop'}
                moduleLabel="Workshop"
              />

            {kind === 'executive' && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="rounded-md border p-2.5">
                  <div className="text-[11px] text-slate-500">Pending jobs</div>
                  <b className="tabular-nums">{pendingJobs ?? 0}</b>
                </div>
                <div className="rounded-md border p-2.5">
                  <div className="text-[11px] text-slate-500">Open breakdowns</div>
                  <b className="tabular-nums">{openBreakdowns ?? 0}</b>
                </div>
                <div className="rounded-md border p-2.5">
                  <div className="text-[11px] text-slate-500">Maintenance cost</div>
                  <b className="tabular-nums">{totalMaint.toLocaleString()}</b>
                </div>
                <div className="rounded-md border p-2.5">
                  <div className="text-[11px] text-slate-500">Breakdown cost</div>
                  <b className="tabular-nums">{totalBrk.toLocaleString()}</b>
                </div>
              </div>
            )}

            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th
                    className="border p-2 text-left text-white"
                    style={{ background: branding.primaryColor, borderColor: branding.primaryColor }}
                  >
                    Asset
                  </th>
                  {(kind === 'executive' || kind === 'cost-by-asset') && (
                    <th
                      className="border p-2 text-right text-white"
                      style={{ background: branding.primaryColor, borderColor: branding.primaryColor }}
                    >
                      Maintenance
                    </th>
                  )}
                  {(kind === 'executive' || kind === 'breakdowns') && (
                    <th
                      className="border p-2 text-right text-white"
                      style={{ background: branding.primaryColor, borderColor: branding.primaryColor }}
                    >
                      Breakdowns
                    </th>
                  )}
                  <th
                    className="border p-2 text-right text-white"
                    style={{ background: branding.primaryColor, borderColor: branding.primaryColor }}
                  >
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {byAsset
                  .filter((a) => {
                    if (kind === 'breakdowns') return a.breakdown > 0;
                    if (kind === 'cost-by-asset') return a.maintenance > 0;
                    return true;
                  })
                  .map((a, i) => (
                    <tr key={a.name} className={i % 2 ? 'bg-slate-50' : 'bg-white'}>
                      <td className="border border-slate-200 p-2">{a.name}</td>
                      {(kind === 'executive' || kind === 'cost-by-asset') && (
                        <td className="border border-slate-200 p-2 text-right tabular-nums">
                          {a.maintenance.toLocaleString()}
                        </td>
                      )}
                      {(kind === 'executive' || kind === 'breakdowns') && (
                        <td className="border border-slate-200 p-2 text-right tabular-nums">
                          {a.breakdown.toLocaleString()}
                        </td>
                      )}
                      <td className="border border-slate-200 p-2 text-right tabular-nums">
                        {(a.maintenance + a.breakdown).toLocaleString()}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
              <BrandedReportFooter branding={branding} />
            </div>
            </BrandedReportDocument>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
