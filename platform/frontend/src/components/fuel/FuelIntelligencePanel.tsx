import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useFuelIntelligence } from '@/hooks/useFuelIntelligence';
import { useFuelReportCapabilities } from '@/hooks/useFuelReportCapabilities';
import type { FuelAssetCategory } from '@/lib/fuelTypes';
import {
  classifyAnomaly,
  DEFAULT_THRESHOLDS,
  FUEL_VIEW_PRESETS,
  loadActivePresetId,
  loadAnomalyThresholds,
  saveActivePresetId,
  saveAnomalyThresholds,
  type FuelAnomalyThresholds,
  type FuelViewPresetId,
} from '@/lib/fuelIntelligencePrefs';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { ArrowDownUp, ChevronDown, Download, Printer, Settings2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { buildMultiSectionReportCsv, downloadReportCsv } from '@/lib/reportCsv';
import { buildReportFilename } from '@/lib/reportFilename';

type Props = {
  from: string;
  to: string;
  assetCategory?: FuelAssetCategory;
  enabled?: boolean;
};

type PeriodMode = 'daily' | 'weekly' | 'monthly';
type SortBy = 'consumed' | 'runtime' | 'efficiency' | 'avg';

function weekKey(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function aggregateTrend(
  rows: Array<{ date: string; consumed: number; filled: number; runtimeHours: number }>,
  mode: PeriodMode,
) {
  if (mode === 'daily') {
    return rows.map((r) => ({ ...r, label: r.date.slice(5) }));
  }
  const map = new Map<string, { consumed: number; filled: number; runtimeHours: number }>();
  for (const r of rows) {
    const key = mode === 'weekly' ? weekKey(r.date) : monthKey(r.date);
    const agg = map.get(key) ?? { consumed: 0, filled: 0, runtimeHours: 0 };
    agg.consumed += r.consumed;
    agg.filled += r.filled;
    agg.runtimeHours += r.runtimeHours;
    map.set(key, agg);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => ({
      date: k,
      label: mode === 'weekly' ? `Wk ${k.slice(5)}` : k,
      consumed: Math.round(v.consumed * 10) / 10,
      filled: Math.round(v.filled * 10) / 10,
      runtimeHours: Math.round(v.runtimeHours * 10) / 10,
    }));
}

function buildPrintHtml(params: {
  title: string;
  from: string;
  to: string;
  presetLabel: string;
  summaryText: string;
  totals: { consumed: number; filled: number; runtimeHours: number; mileage: number; theft: number };
  topAssets: Array<{ unitName: string; consumed: number; runtimeHours: number; avgConsumption: number }>;
  anomalies: Array<{ unitName: string; reason: string; action: string; severityScore: number }>;
  groups: Array<{ label: string; assets: number; consumed: number; runtimeHours: number }>;
  thresholds: FuelAnomalyThresholds;
}): string {
  const rows = params.topAssets
    .map(
      (a) =>
        `<tr><td>${a.unitName}</td><td>${a.consumed.toFixed(1)} L</td><td>${a.runtimeHours.toFixed(1)} h</td><td>${a.avgConsumption.toFixed(1)}</td></tr>`,
    )
    .join('');
  const anomalyRows = params.anomalies
    .map(
      (a) =>
        `<tr><td>${a.unitName}</td><td>${a.severityScore.toFixed(2)}</td><td>${a.reason}</td><td>${a.action}</td></tr>`,
    )
    .join('');
  const groupRows = params.groups
    .map(
      (g) =>
        `<tr><td>${g.label}</td><td>${g.assets}</td><td>${g.consumed.toFixed(1)} L</td><td>${g.runtimeHours.toFixed(1)} h</td></tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${params.title}</title>
  <style>
    body { font-family: Inter, system-ui, sans-serif; color: #111; margin: 32px; font-size: 12px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    h2 { font-size: 14px; margin: 24px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    .meta { color: #555; margin-bottom: 16px; }
    .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 16px 0; }
    .kpi { border: 1px solid #e5e5e5; border-radius: 8px; padding: 10px; }
    .kpi .label { color: #666; font-size: 11px; }
    .kpi .value { font-size: 16px; font-weight: 600; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
    th { font-size: 11px; color: #555; text-transform: uppercase; letter-spacing: 0.02em; }
    .summary { background: #f8f8f8; border-radius: 8px; padding: 12px; line-height: 1.5; }
    .footer { margin-top: 28px; color: #888; font-size: 10px; }
    @media print { body { margin: 16px; } .kpis { break-inside: avoid; } }
  </style>
</head>
<body>
  <h1>${params.title}</h1>
  <div class="meta">Period ${params.from} → ${params.to} · View: ${params.presetLabel}</div>
  <div class="summary">${params.summaryText}</div>
  <div class="kpis">
    <div class="kpi"><div class="label">Consumed</div><div class="value">${params.totals.consumed.toLocaleString()} L</div></div>
    <div class="kpi"><div class="label">Filled</div><div class="value">${params.totals.filled.toLocaleString()} L</div></div>
    <div class="kpi"><div class="label">Runtime</div><div class="value">${params.totals.runtimeHours.toLocaleString()} h</div></div>
    <div class="kpi"><div class="label">Mileage</div><div class="value">${params.totals.mileage.toLocaleString()} km</div></div>
    <div class="kpi"><div class="label">Loss/Theft</div><div class="value">${params.totals.theft.toLocaleString()} L</div></div>
  </div>
  <h2>Group benchmark</h2>
  <table><thead><tr><th>Group</th><th>Assets</th><th>Consumed</th><th>Runtime</th></tr></thead><tbody>${groupRows || '<tr><td colspan="4">No group data</td></tr>'}</tbody></table>
  <h2>Top consuming assets</h2>
  <table><thead><tr><th>Asset</th><th>Consumed</th><th>Runtime</th><th>Avg L/100km</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No assets</td></tr>'}</tbody></table>
  <h2>Priority anomalies</h2>
  <table><thead><tr><th>Asset</th><th>Score</th><th>Why</th><th>Action</th></tr></thead><tbody>${anomalyRows || '<tr><td colspan="4">No anomalies above thresholds</td></tr>'}</tbody></table>
  <h2>Alert thresholds</h2>
  <table><tbody>
    <tr><td>Theft / filled ratio</td><td>${(params.thresholds.theftRatio * 100).toFixed(0)}%</td></tr>
    <tr><td>Runtime L/h</td><td>${params.thresholds.runtimeLitersPerHour}</td></tr>
    <tr><td>Avg L/100km</td><td>${params.thresholds.avgLitersPer100km}</td></tr>
  </tbody></table>
  <div class="footer">Generated ${new Date().toLocaleString()} · Unified Fleet Platform fuel intelligence</div>
</body>
</html>`;
}

export function FuelIntelligencePanel({ from, to, assetCategory, enabled = true }: Props) {
  const branding = useTenantBranding();
  const [selectedUnitId, setSelectedUnitId] = useState<number | undefined>(undefined);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('daily');
  const [assetSearch, setAssetSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('consumed');
  const [selectedAnomalyUnitId, setSelectedAnomalyUnitId] = useState<number | null>(null);
  const [presetId, setPresetId] = useState<FuelViewPresetId>(() => loadActivePresetId());
  const [thresholds, setThresholds] = useState<FuelAnomalyThresholds>(() => loadAnomalyThresholds());
  const [thresholdDraft, setThresholdDraft] = useState<FuelAnomalyThresholds>(thresholds);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);

  const { data, isLoading } = useFuelIntelligence(from, to, assetCategory, selectedUnitId, enabled);
  const { data: capabilityData } = useFuelReportCapabilities();

  const activePreset = useMemo(
    () => FUEL_VIEW_PRESETS.find((p) => p.id === presetId) ?? FUEL_VIEW_PRESETS[0],
    [presetId],
  );

  useEffect(() => {
    const preset = FUEL_VIEW_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setSortBy(preset.sortBy);
    if (preset.periodMode) setPeriodMode(preset.periodMode);
  }, [presetId]);

  const applyPreset = (id: FuelViewPresetId) => {
    setPresetId(id);
    saveActivePresetId(id);
    setSelectedUnitId(undefined);
    if (id === 'theft_watch') setAssetSearch('');
  };

  const openSettings = () => {
    setThresholdDraft({ ...thresholds });
    setSettingsOpen(true);
  };

  const saveSettings = () => {
    const next: FuelAnomalyThresholds = {
      theftRatio: Math.min(1, Math.max(0, Number(thresholdDraft.theftRatio) || 0)),
      runtimeLitersPerHour: Math.max(0, Number(thresholdDraft.runtimeLitersPerHour) || 0),
      avgLitersPer100km: Math.max(0, Number(thresholdDraft.avgLitersPer100km) || 0),
    };
    setThresholds(next);
    saveAnomalyThresholds(next);
    setSettingsOpen(false);
  };

  const resetSettings = () => {
    setThresholdDraft({ ...DEFAULT_THRESHOLDS });
  };

  const assetsForView = useMemo(() => {
    const all = data?.assets ?? [];
    if (presetId === 'theft_watch') {
      return [...all].sort((a, b) => {
        const ar = a.filled > 0 ? a.theft / a.filled : 0;
        const br = b.filled > 0 ? b.theft / b.filled : 0;
        return br - ar || b.theft - a.theft;
      });
    }
    if (presetId === 'generator_runtime') {
      const gens = all.filter((a) => a.assetCategory === 'generator' || a.assetCategory === 'machinery');
      return (gens.length ? gens : all).slice().sort((a, b) => b.runtimeHours - a.runtimeHours);
    }
    if (presetId === 'fleet_efficiency') {
      const vehicles = all.filter((a) => a.assetCategory === 'vehicle');
      return (vehicles.length ? vehicles : all).slice().sort((a, b) => b.avgConsumption - a.avgConsumption);
    }
    return all;
  }, [data?.assets, presetId]);

  const topAssets = useMemo(() => assetsForView.slice(0, 5), [assetsForView]);
  const assetOptions = useMemo(() => assetsForView.slice(0, 30), [assetsForView]);

  const performanceRows = useMemo(() => {
    const rows = assetsForView.filter((a) =>
      a.unitName.toLowerCase().includes(assetSearch.trim().toLowerCase()),
    );
    const sorted = [...rows].sort((a, b) => {
      if (sortBy === 'runtime') return b.runtimeHours - a.runtimeHours;
      if (sortBy === 'efficiency') return b.efficiencyScore - a.efficiencyScore;
      if (sortBy === 'avg') return b.avgConsumption - a.avgConsumption;
      if (presetId === 'theft_watch') {
        const ar = a.filled > 0 ? a.theft / a.filled : 0;
        const br = b.filled > 0 ? b.theft / b.filled : 0;
        return br - ar;
      }
      return b.consumed - a.consumed;
    });
    return sorted.slice(0, 30);
  }, [assetsForView, assetSearch, sortBy, presetId]);

  const topGroups = useMemo(
    () => (data?.groups ?? []).filter((g) => g.key !== 'all').sort((a, b) => b.consumed - a.consumed),
    [data?.groups],
  );

  const dailyTrend = useMemo(() => {
    const source = data?.unitDetail?.daily?.length ? data.unitDetail.daily : data?.daily ?? [];
    const base = source.map((d) => ({
      date: d.date.slice(5),
      fullDate: d.date,
      consumed: Math.round(d.consumed * 10) / 10,
      filled: Math.round(d.filled * 10) / 10,
      runtimeHours: Math.round(d.runtimeHours * 10) / 10,
    }));
    return aggregateTrend(
      base.map((b) => ({ date: b.fullDate, consumed: b.consumed, filled: b.filled, runtimeHours: b.runtimeHours })),
      periodMode,
    );
  }, [data?.daily, data?.unitDetail?.daily, periodMode]);

  const anomalies = useMemo(() => {
    const list = assetsForView
      .map((a) => {
        const runtimeEfficiency = a.runtimeHours > 0 ? a.consumed / a.runtimeHours : a.consumed;
        const theftRatio = a.filled > 0 ? a.theft / a.filled : 0;
        const classified = classifyAnomaly(
          { theftRatio, runtimeEfficiency, avgConsumption: a.avgConsumption },
          thresholds,
        );
        return {
          unitId: a.unitId,
          unitName: a.unitName,
          severityScore: classified.severityScore,
          runtimeEfficiency,
          theftRatio,
          avgConsumption: a.avgConsumption,
          reason: classified.reason,
          action: classified.action,
          flagged: classified.flagged,
        };
      })
      .filter((a) => (presetId === 'theft_watch' ? a.theftRatio > 0 || a.flagged : a.flagged))
      .sort((a, b) => {
        if (presetId === 'theft_watch') return b.theftRatio - a.theftRatio || b.severityScore - a.severityScore;
        return b.severityScore - a.severityScore;
      })
      .slice(0, 8);
    return list;
  }, [assetsForView, thresholds, presetId]);

  const selectedAnomaly = useMemo(
    () => anomalies.find((a) => a.unitId === selectedAnomalyUnitId) ?? null,
    [anomalies, selectedAnomalyUnitId],
  );

  const trendDirection = useMemo(() => {
    if (!dailyTrend.length) return { consumed: 'flat', runtime: 'flat' } as const;
    const mid = Math.max(1, Math.floor(dailyTrend.length / 2));
    const first = dailyTrend.slice(0, mid);
    const second = dailyTrend.slice(mid);
    const avg = (arr: typeof dailyTrend, key: 'consumed' | 'runtimeHours') =>
      arr.length ? arr.reduce((s, v) => s + v[key], 0) / arr.length : 0;
    const consumedDelta = avg(second, 'consumed') - avg(first, 'consumed');
    const runtimeDelta = avg(second, 'runtimeHours') - avg(first, 'runtimeHours');
    return {
      consumed: consumedDelta > 0.5 ? 'up' : consumedDelta < -0.5 ? 'down' : 'flat',
      runtime: runtimeDelta > 0.3 ? 'up' : runtimeDelta < -0.3 ? 'down' : 'flat',
    } as const;
  }, [dailyTrend]);

  const periodSummary = useMemo(() => {
    if (!data) {
      return { text: '', anomalyCount: 0 };
    }
    const totalAssets = assetsForView.length;
    const totalConsumed = assetsForView.reduce((s, a) => s + a.consumed, 0);
    const totalRuntime = assetsForView.reduce((s, a) => s + a.runtimeHours, 0);
    const totalTheft = assetsForView.reduce((s, a) => s + a.theft, 0);
    const top = topAssets[0];
    const anomalyCount = anomalies.length;
    const consumedDirection =
      trendDirection.consumed === 'up' ? 'increasing' : trendDirection.consumed === 'down' ? 'decreasing' : 'stable';
    const runtimeDirection =
      trendDirection.runtime === 'up' ? 'increasing' : trendDirection.runtime === 'down' ? 'decreasing' : 'stable';
    const focus =
      presetId === 'theft_watch'
        ? ` Theft Watch highlights ${anomalyCount} priority loss risks.`
        : presetId === 'generator_runtime'
          ? ' Focus is generator/machinery runtime performance.'
          : presetId === 'fleet_efficiency'
            ? ' Focus is vehicle efficiency and L/100km.'
            : '';
    return {
      text: `From ${from} to ${to}, ${totalAssets} assets consumed ${Math.round(totalConsumed).toLocaleString()}L with ${Math.round(totalRuntime).toLocaleString()} runtime hours. Consumption is ${consumedDirection} while runtime is ${runtimeDirection}. Loss/theft totals ${Math.round(totalTheft).toLocaleString()}L.${focus} ${top ? `Top consumer is ${top.unitName} (${top.consumed.toFixed(1)}L).` : ''}`,
      anomalyCount,
    };
  }, [
    anomalies.length,
    assetsForView,
    data,
    from,
    presetId,
    to,
    topAssets,
    trendDirection.consumed,
    trendDirection.runtime,
  ]);

  const runtimeCap = capabilityData?.capabilities?.find((c) => c.module === 'engineHours');
  const runtimeHint =
    runtimeCap && !runtimeCap.available
      ? 'Runtime report template is not configured for this account.'
      : null;

  const printSummary = () => {
    if (!data) return;
    const html = buildPrintHtml({
      title: 'Fuel Intelligence Period Summary',
      from,
      to,
      presetLabel: activePreset.label,
      summaryText: periodSummary.text,
      totals: {
        consumed: Math.round(assetsForView.reduce((s, a) => s + a.consumed, 0) * 10) / 10,
        filled: Math.round(assetsForView.reduce((s, a) => s + a.filled, 0) * 10) / 10,
        runtimeHours: Math.round(assetsForView.reduce((s, a) => s + a.runtimeHours, 0) * 10) / 10,
        mileage: Math.round(assetsForView.reduce((s, a) => s + a.mileage, 0) * 10) / 10,
        theft: Math.round(assetsForView.reduce((s, a) => s + a.theft, 0) * 10) / 10,
      },
      topAssets,
      anomalies,
      groups: topGroups.map((g) => ({
        label: g.label,
        assets: g.assets,
        consumed: g.consumed,
        runtimeHours: g.runtimeHours,
      })),
      thresholds,
    });

    const iframe = printFrameRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    // Let the browser paint before invoking print / Save as PDF
    window.setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }, 200);
  };

  if (isLoading) return null;
  if (!data) return null;

  const exportCsv = () => {
    const rows = performanceRows;
    const csv = buildMultiSectionReportCsv({
      meta: {
        title: 'Fuel Intelligence Performance',
        moduleLabel: 'Fuel',
        clientName: branding.name,
        periodLabel: `${from} → ${to}`,
        objectLabel: assetCategory ? String(assetCategory) : 'All categories',
        generatedAt: new Date(),
        notes: [periodSummary.text, activePreset.description].filter(Boolean),
        filters: [
          { label: 'View preset', value: activePreset.label },
          { label: 'Sort', value: sortBy },
          ...(assetSearch.trim() ? [{ label: 'Search', value: assetSearch.trim() }] : []),
          ...(assetCategory ? [{ label: 'Category', value: String(assetCategory) }] : []),
        ],
        kpis: [
          { label: 'Assets', value: rows.length },
          { label: 'Consumed (L)', value: Number(rows.reduce((s, r) => s + r.consumed, 0).toFixed(1)) },
          { label: 'Filled (L)', value: Number(rows.reduce((s, r) => s + r.filled, 0).toFixed(1)) },
          { label: 'Theft / loss (L)', value: Number(rows.reduce((s, r) => s + r.theft, 0).toFixed(1)) },
          { label: 'Runtime (h)', value: Number(rows.reduce((s, r) => s + r.runtimeHours, 0).toFixed(1)) },
          { label: 'Mileage (km)', value: Number(rows.reduce((s, r) => s + r.mileage, 0).toFixed(1)) },
          { label: 'Anomalies', value: anomalies.length },
        ],
      },
      sections: [
        {
          name: 'Asset performance',
          columns: [
            { key: 'unitName', label: 'Asset' },
            { key: 'assetCategory', label: 'Category' },
            { key: 'consumed', label: 'Consumed (L)' },
            { key: 'filled', label: 'Filled (L)' },
            { key: 'theft', label: 'Theft / loss (L)' },
            { key: 'runtimeHours', label: 'Runtime (h)' },
            { key: 'mileage', label: 'Mileage (km)' },
            { key: 'avgConsumption', label: 'Avg L/100km' },
            { key: 'efficiencyScore', label: 'Efficiency score' },
          ],
          rows: rows.map((r) => ({
            unitName: r.unitName,
            assetCategory: r.assetCategory,
            consumed: Number(r.consumed.toFixed(2)),
            filled: Number(r.filled.toFixed(2)),
            theft: Number(r.theft.toFixed(2)),
            runtimeHours: Number(r.runtimeHours.toFixed(2)),
            mileage: Number(r.mileage.toFixed(2)),
            avgConsumption: Number(r.avgConsumption.toFixed(2)),
            efficiencyScore: Number(r.efficiencyScore.toFixed(2)),
          })),
        },
        {
          name: 'Anomaly ranking',
          columns: [
            { key: 'unitName', label: 'Asset' },
            { key: 'severityScore', label: 'Severity score' },
            { key: 'reason', label: 'Why' },
            { key: 'action', label: 'Recommended action' },
          ],
          rows: anomalies.map((a) => ({
            unitName: a.unitName,
            severityScore: Number(a.severityScore.toFixed(2)),
            reason: a.reason,
            action: a.action,
          })),
        },
      ],
    });

    downloadReportCsv(
      csv,
      `${buildReportFilename({
        clientName: branding.name,
        reportName: `Fuel_Intelligence_${activePreset.label}`,
        date: to,
      })}.csv`,
    );
  };

  return (
    <div className="space-y-4">
      <iframe ref={printFrameRef} title="Fuel print frame" className="hidden" aria-hidden />

      <div className="rounded-xl border border-border/70 bg-gradient-to-br from-background via-background to-primary/[0.04] p-3 sm:p-4 space-y-3 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-tight">Fuel Intelligence</p>
            <p className="text-xs text-muted-foreground mt-0.5">{activePreset.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="h-8 border-primary/20 hover:bg-primary/5" onClick={openSettings}>
              <Settings2 className="w-4 h-4 text-primary" />
              Alerts
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8 border-primary/20 hover:bg-primary/5" onClick={printSummary}>
              <Printer className="w-4 h-4 text-primary" />
              Print / PDF
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {FUEL_VIEW_PRESETS.map((p) => (
            <Button
              key={p.id}
              type="button"
              size="sm"
              variant={presetId === p.id ? 'default' : 'outline'}
              className={cn(
                'h-8 text-xs rounded-full px-3 transition-colors',
                presetId === p.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-background/80 hover:bg-muted',
              )}
              onClick={() => applyPreset(p.id)}
              title={p.description}
            >
              {p.label}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Card className="border-sky-500/20 bg-sky-500/[0.06] shadow-none">
            <CardContent className="p-3">
              <p className="text-[11px] uppercase tracking-wide text-sky-700/80 dark:text-sky-300">Consumed</p>
              <p className="text-lg font-semibold tabular-nums text-sky-900 dark:text-sky-100">{data.totals.consumed.toLocaleString()} L</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-500/20 bg-emerald-500/[0.06] shadow-none">
            <CardContent className="p-3">
              <p className="text-[11px] uppercase tracking-wide text-emerald-700/80 dark:text-emerald-300">Filled</p>
              <p className="text-lg font-semibold tabular-nums text-emerald-900 dark:text-emerald-100">{data.totals.filled.toLocaleString()} L</p>
            </CardContent>
          </Card>
          <Card className="border-violet-500/20 bg-violet-500/[0.06] shadow-none">
            <CardContent className="p-3">
              <p className="text-[11px] uppercase tracking-wide text-violet-700/80 dark:text-violet-300">Run Time</p>
              <p className="text-lg font-semibold tabular-nums text-violet-900 dark:text-violet-100">{data.totals.runtimeHours.toLocaleString()} h</p>
            </CardContent>
          </Card>
          <Card className="border-amber-500/20 bg-amber-500/[0.06] shadow-none">
            <CardContent className="p-3">
              <p className="text-[11px] uppercase tracking-wide text-amber-700/80 dark:text-amber-300">Mileage</p>
              <p className="text-lg font-semibold tabular-nums text-amber-900 dark:text-amber-100">{data.totals.mileage.toLocaleString()} km</p>
            </CardContent>
          </Card>
          <Card className="border-rose-500/20 bg-rose-500/[0.06] shadow-none">
            <CardContent className="p-3">
              <p className="text-[11px] uppercase tracking-wide text-rose-700/80 dark:text-rose-300">Loss/Theft</p>
              <p className="text-lg font-semibold tabular-nums text-rose-900 dark:text-rose-100">{data.totals.theft.toLocaleString()} L</p>
            </CardContent>
          </Card>
        </div>
        {runtimeHint && <p className="text-xs text-amber-700 dark:text-amber-300">{runtimeHint}</p>}

        <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
          <p className="text-xs font-semibold mb-1">Period Summary</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{periodSummary.text}</p>
          <p className="text-[11px] text-muted-foreground/90 mt-1.5">
            {periodSummary.anomalyCount} high-priority anomalies · thresholds theft {(thresholds.theftRatio * 100).toFixed(0)}% · {thresholds.runtimeLitersPerHour} L/h · {thresholds.avgLitersPer100km} L/100km
          </p>
        </div>

        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-between h-9 text-xs text-muted-foreground hover:text-foreground"
            >
              <span>{detailsOpen ? 'Hide analytics details' : 'Show charts, performance & anomalies'}</span>
              <ChevronDown className={cn('w-4 h-4 transition-transform', detailsOpen && 'rotate-180')} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-2">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Card className="shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2 gap-2">
              <p className="text-sm font-semibold">Consumption / Filling / Runtime</p>
              <div className="flex items-center gap-2">
                <Select value={periodMode} onValueChange={(v) => setPeriodMode(v as PeriodMode)}>
                  <SelectTrigger className="h-8 w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={selectedUnitId != null ? String(selectedUnitId) : 'all'}
                  onValueChange={(v) => setSelectedUnitId(v === 'all' ? undefined : Number(v))}
                >
                  <SelectTrigger className="h-8 w-[220px]">
                    <SelectValue placeholder="All assets" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All assets</SelectItem>
                    {assetOptions.map((a) => (
                      <SelectItem key={a.unitId} value={String(a.unitId)}>
                        {a.unitName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="fuel" fontSize={11} tickLine={false} axisLine={false} width={36} />
                  <YAxis yAxisId="runtime" orientation="right" fontSize={11} tickLine={false} axisLine={false} width={36} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="fuel" dataKey="filled" name="Filled (L)" fill="hsl(var(--primary))" opacity={0.8} />
                  <Line yAxisId="fuel" dataKey="consumed" name="Consumed (L)" stroke="hsl(var(--warning))" strokeWidth={2} dot={false} />
                  <Line yAxisId="runtime" dataKey="runtimeHours" name="Runtime (h)" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <p className="text-sm font-semibold mb-2">Group Benchmark</p>
            <div className="space-y-2">
              {topGroups.map((g) => (
                <div key={g.key} className="text-xs border-b border-border/40 pb-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{g.label}</span>
                    <span className="text-muted-foreground">{g.assets} assets</span>
                  </div>
                  <div className="mt-1 text-muted-foreground tabular-nums">
                    {g.consumed.toFixed(1)}L consumed | {g.runtimeHours.toFixed(1)}h runtime | {g.avgConsumption.toFixed(1)}L/100km
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-3">
          <p className="text-sm font-semibold mb-2">
            {data.unitDetail ? `Asset Drilldown: ${data.unitDetail.unitName}` : 'Top Consuming Assets (Performance View)'}
          </p>
          {!data.unitDetail && (
            <div className="text-xs text-muted-foreground mb-2">
              Trend direction: consumed {trendDirection.consumed}, runtime {trendDirection.runtime}
            </div>
          )}
          <div className="space-y-1">
            {data.unitDetail ? (
              <>
                <div className="text-xs text-muted-foreground">
                  Runtime intervals: {data.unitDetail.runtimeIntervals.length}
                </div>
                {data.unitDetail.runtimeIntervals.slice(0, 6).map((iv, idx) => (
                  <div key={`${iv.start}-${idx}`} className="flex items-center justify-between text-xs border-b border-border/40 pb-1">
                    <span>{new Date(iv.start * 1000).toLocaleString()}</span>
                    <span className="tabular-nums text-muted-foreground">{iv.hours.toFixed(2)} h</span>
                  </div>
                ))}
              </>
            ) : (
              topAssets.map((a) => (
                <div key={a.unitId} className="flex items-center justify-between text-xs border-b border-border/40 pb-1">
                  <span className="truncate pr-2">{a.unitName}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {a.consumed.toFixed(1)}L | {a.runtimeHours.toFixed(1)}h | theft {a.theft.toFixed(1)}L | {a.avgConsumption.toFixed(1)}L/100km
                  </span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {!data.unitDetail && (
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-sm font-semibold">Asset Performance Table</p>
              <div className="flex items-center gap-2">
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                  <SelectTrigger className="h-8 w-[170px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consumed">Sort: Consumed</SelectItem>
                    <SelectItem value="runtime">Sort: Runtime</SelectItem>
                    <SelectItem value="efficiency">Sort: Efficiency</SelectItem>
                    <SelectItem value="avg">Sort: Avg L/100km</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={exportCsv}>
                  <Download className="w-4 h-4" />
                  Export CSV
                </Button>
              </div>
            </div>
            <div className="mb-2 flex items-center gap-2">
              <ArrowDownUp className="w-4 h-4 text-muted-foreground" />
              <Input
                value={assetSearch}
                onChange={(e) => setAssetSearch(e.target.value)}
                placeholder="Search asset..."
                className="h-8 max-w-[260px]"
              />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Consumed</TableHead>
                  <TableHead className="text-right">Theft</TableHead>
                  <TableHead className="text-right">Runtime</TableHead>
                  <TableHead className="text-right">Avg L/100km</TableHead>
                  <TableHead className="text-right">Efficiency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {performanceRows.map((r) => (
                  <TableRow key={r.unitId}>
                    <TableCell>{r.unitName}</TableCell>
                    <TableCell className="capitalize">{r.assetCategory}</TableCell>
                    <TableCell className="text-right">{r.consumed.toFixed(1)} L</TableCell>
                    <TableCell className="text-right">{r.theft.toFixed(1)} L</TableCell>
                    <TableCell className="text-right">{r.runtimeHours.toFixed(1)} h</TableCell>
                    <TableCell className="text-right">{r.avgConsumption.toFixed(1)}</TableCell>
                    <TableCell className="text-right">{r.efficiencyScore.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-3">
          <p className="text-sm font-semibold mb-2">Anomaly Ranking</p>
          <div className="space-y-1">
            {anomalies.length === 0 && (
              <p className="text-xs text-muted-foreground">No assets exceed the configured alert thresholds for this view.</p>
            )}
            {anomalies.map((a) => (
              <button
                key={a.unitId}
                type="button"
                className="text-xs border-b border-border/40 pb-2 w-full text-left hover:bg-muted/40 rounded-sm px-1 transition-colors"
                onClick={() => setSelectedAnomalyUnitId(a.unitId)}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate pr-2 font-medium">{a.unitName}</span>
                  <span className="tabular-nums text-muted-foreground">
                    score {a.severityScore.toFixed(2)} | {a.runtimeEfficiency.toFixed(2)} L/h | theft {(a.theftRatio * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="text-muted-foreground mt-1">Why: {a.reason}</div>
                <div className="text-muted-foreground">Action: {a.action}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <Sheet open={selectedAnomaly != null} onOpenChange={(open) => !open && setSelectedAnomalyUnitId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Anomaly Details</SheetTitle>
            <SheetDescription>
              {selectedAnomaly
                ? `${selectedAnomaly.unitName} operational anomaly analysis`
                : 'Anomaly analysis'}
            </SheetDescription>
          </SheetHeader>
          {selectedAnomaly && (
            <div className="space-y-3 mt-4 text-sm">
              <Card>
                <CardContent className="p-3 space-y-1">
                  <p><span className="text-muted-foreground">Severity score:</span> {selectedAnomaly.severityScore.toFixed(2)}</p>
                  <p><span className="text-muted-foreground">Runtime efficiency:</span> {selectedAnomaly.runtimeEfficiency.toFixed(2)} L/h</p>
                  <p><span className="text-muted-foreground">Theft ratio:</span> {(selectedAnomaly.theftRatio * 100).toFixed(1)}%</p>
                  <p><span className="text-muted-foreground">Average consumption:</span> {selectedAnomaly.avgConsumption.toFixed(1)} L/100km</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 space-y-1">
                  <p className="font-medium">Why flagged</p>
                  <p className="text-muted-foreground">{selectedAnomaly.reason}</p>
                  <p className="font-medium mt-2">Suggested action</p>
                  <p className="text-muted-foreground">{selectedAnomaly.action}</p>
                </CardContent>
              </Card>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alert thresholds</DialogTitle>
            <DialogDescription>
              Customize when assets appear in Anomaly Ranking. Saved per tenant in this browser.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="theft-ratio">Theft / filled ratio (%)</Label>
              <Input
                id="theft-ratio"
                type="number"
                min={0}
                max={100}
                step={1}
                value={Math.round(thresholdDraft.theftRatio * 1000) / 10}
                onChange={(e) =>
                  setThresholdDraft((d) => ({
                    ...d,
                    theftRatio: Math.max(0, Number(e.target.value) || 0) / 100,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">Default 15%. Flag assets whose loss ÷ filled exceeds this.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="runtime-lph">Runtime consumption (L/h)</Label>
              <Input
                id="runtime-lph"
                type="number"
                min={0}
                step={0.5}
                value={thresholdDraft.runtimeLitersPerHour}
                onChange={(e) =>
                  setThresholdDraft((d) => ({
                    ...d,
                    runtimeLitersPerHour: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">Default 10 L/h. Useful for generators and high-idle assets.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="avg-l100">Average consumption (L/100km)</Label>
              <Input
                id="avg-l100"
                type="number"
                min={0}
                step={1}
                value={thresholdDraft.avgLitersPer100km}
                onChange={(e) =>
                  setThresholdDraft((d) => ({
                    ...d,
                    avgLitersPer100km: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">Default 35 L/100km for vehicle efficiency flags.</p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={resetSettings}>
              Reset defaults
            </Button>
            <Button type="button" onClick={saveSettings}>
              Save thresholds
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
