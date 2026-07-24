import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { FuelTransaction } from '@/types/entities';
import type { FuelAssetCategory } from '@/lib/fuelTypes';
import { aggregateUnitFuelColumns } from './fuelColumnMetrics';
import { filterFuelTransactionsByDate, isSyntheticFuelRow, isWialonGroupSummary } from './fuelTransactionFilters';
import { PeriodAssetControls } from '@/components/shared/PeriodAssetControls';
import { resolveDashboardFuelPrice } from '@/lib/dashboardWidgetPrefs';

type LiveMap = Map<string, number>;

type ChartRow = {
  name: string;
  fullName: string;
  filled: number;
  used: number;
  drop: number;
  level: number;
  cost: number;
  mileage: number;
  net: number;
};

function downloadChartPng(root: HTMLElement | null, filename: string) {
  if (!root) return;
  const svg = root.querySelector('svg');
  if (!svg) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const bbox = svg.getBoundingClientRect();
  const width = Math.max(bbox.width || 800, 400);
  const height = Math.max(bbox.height || 320, 240);
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  const xml = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(url);
    const a = document.createElement('a');
    a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  };
  img.src = url;
}

function shortName(name: string, count: number): string {
  const max = count > 40 ? 8 : count > 25 ? 10 : count > 15 ? 12 : 16;
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

function eachDayInclusive(fromDate: string, toDate: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${fromDate}T12:00:00`);
  const end = new Date(`${toDate}T12:00:00`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime()) || cur > end) return out;
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function buildPerAssetRows(
  transactions: FuelTransaction[],
  fromDate: string,
  toDate: string,
  liveLevels: LiveMap | undefined,
  assetNames: string[],
  selectedAsset: string,
): ChartRow[] {
  const names =
    selectedAsset !== 'all'
      ? [selectedAsset]
      : assetNames.length
        ? assetNames
        : [...new Set(transactions.map((t) => t.unitName).filter(Boolean))];

  const ranged = filterFuelTransactionsByDate(transactions, fromDate, toDate);

  return [...names].sort((a, b) => a.localeCompare(b)).map((unitName) => {
    const unitTxs = ranged.filter((t) => t.unitName === unitName);
    const cols = aggregateUnitFuelColumns(unitTxs, {
      fromDate,
      toDate,
      liveLevel: liveLevels?.get(unitName),
    });
    const mileage = unitTxs.reduce((s, t) => {
      if (isSyntheticFuelRow(t) || t.section !== 'consumption' || t.tank === 'reserve') return s;
      return s + (t.mileage || 0);
    }, 0);
    const filled = Math.round((cols.filledMain + cols.filledReserve) * 10) / 10;
    const used = Math.round(cols.totalUsed * 10) / 10;
    return {
      name: shortName(unitName, names.length),
      fullName: unitName,
      filled,
      used,
      drop: Math.round(cols.totalDrop * 10) / 10,
      level: Math.round((cols.totalLevel || liveLevels?.get(unitName) || 0) * 10) / 10,
      cost: Math.round(cols.totalCost * 100) / 100,
      mileage: Math.round(mileage * 10) / 10,
      net: Math.round((filled - used) * 10) / 10,
    };
  });
}

/**
 * Daily trend: leaf events by day.
 * When a unit has only an exact-range group summary (no leaf fills/uses),
 * plot that period total on the end date so charts match the table.
 */
function buildDailyTrend(
  transactions: FuelTransaction[],
  fromDate: string,
  toDate: string,
  asset: string,
) {
  const ranged = filterFuelTransactionsByDate(transactions, fromDate, toDate).filter(
    (t) => asset === 'all' || t.unitName === asset,
  );
  const byDay = new Map<string, { filled: number; used: number; mileage: number }>();
  for (const day of eachDayInclusive(fromDate, toDate)) {
    byDay.set(day, { filled: 0, used: 0, mileage: 0 });
  }

  const unitsWithLeafFill = new Set<string>();
  const unitsWithLeafUse = new Set<string>();

  for (const t of ranged) {
    if (isSyntheticFuelRow(t) || isWialonGroupSummary(t)) continue;
    if (!t.timestamp) continue;
    const key = new Date(t.timestamp * 1000).toISOString().slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, { filled: 0, used: 0, mileage: 0 });
    const row = byDay.get(key)!;
    if (t.section === 'filling' && Number(t.filled) > 0) {
      row.filled += Number(t.filled);
      unitsWithLeafFill.add(t.unitName);
    }
    if (t.section === 'consumption' && Number(t.fuelUsed) > 0) {
      row.used += Number(t.fuelUsed);
      unitsWithLeafUse.add(t.unitName);
      if (t.tank !== 'reserve') row.mileage += t.mileage || 0;
    }
  }

  // Gap-fill from exact-range summaries onto the period end day
  const endBucket = byDay.get(toDate) ?? { filled: 0, used: 0, mileage: 0 };
  if (!byDay.has(toDate)) byDay.set(toDate, endBucket);

  const byUnit = new Map<string, typeof ranged>();
  for (const t of ranged) {
    if (!isWialonGroupSummary(t)) continue;
    if (!t.periodFromTs || !t.periodToTs) continue;
    const pFrom = new Date(t.periodFromTs * 1000).toISOString().slice(0, 10);
    const pTo = new Date(t.periodToTs * 1000).toISOString().slice(0, 10);
    if (pFrom !== fromDate || pTo !== toDate) continue;
    const list = byUnit.get(t.unitName) ?? [];
    list.push(t);
    byUnit.set(t.unitName, list);
  }

  for (const [unitName, summaries] of byUnit) {
    let summaryFilled = 0;
    let summaryUsed = 0;
    for (const t of summaries) {
      if (t.filled > summaryFilled) summaryFilled = t.filled;
      if (t.fuelUsed > summaryUsed) summaryUsed = t.fuelUsed;
    }
    if (!unitsWithLeafFill.has(unitName) && summaryFilled > 0) {
      endBucket.filled += summaryFilled;
      unitsWithLeafFill.add(unitName);
    }
    if (!unitsWithLeafUse.has(unitName) && summaryUsed > 0) {
      endBucket.used += summaryUsed;
      unitsWithLeafUse.add(unitName);
    }
  }

  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, v]) => ({
      name: new Date(`${day}T12:00:00`).toLocaleDateString('en-UG', { month: 'short', day: 'numeric' }),
      filled: Math.round(v.filled * 10) / 10,
      used: Math.round(v.used * 10) / 10,
      mileage: Math.round(v.mileage * 10) / 10,
    }));
}

function ChartCard({
  title,
  description,
  filename,
  minWidth,
  empty,
  children,
}: {
  title: string;
  description?: string;
  filename: string;
  minWidth: number;
  empty?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <Card className="branded-panel overflow-hidden border-border/70 shadow-none">
      <CardHeader className="py-2.5 px-3 flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-sm font-medium text-primary">{title}</CardTitle>
          {description && <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{description}</p>}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 shrink-0 border-primary/25 px-2 text-[11px]"
          disabled={empty}
          onClick={() => downloadChartPng(ref.current, filename)}
        >
          <Download className="h-3.5 w-3.5 mr-1" />
          PNG
        </Button>
      </CardHeader>
      <CardContent className="px-2 pb-3 pt-0">
        {empty ? (
          <p className="text-sm text-muted-foreground py-16 text-center">No data for this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <div ref={ref} style={{ minWidth }} className="h-[280px]">
              {children}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export type FuelAssetChartsProps = {
  transactions: FuelTransaction[];
  fromDate: string;
  toDate: string;
  todayStr: string;
  liveLevels?: LiveMap;
  assetNames: string[];
  unitLabel: string;
  assetCategory?: FuelAssetCategory;
  isLoading?: boolean;
  onFromDateChange?: (v: string) => void;
  onToDateChange?: (v: string) => void;
};

export function FuelAssetCharts({
  transactions,
  fromDate,
  toDate,
  todayStr,
  liveLevels,
  assetNames,
  unitLabel,
  assetCategory = 'vehicle',
  isLoading,
  onFromDateChange,
  onToDateChange,
}: FuelAssetChartsProps) {
  const [asset, setAsset] = useState('all');
  const [fuelPrice, setFuelPrice] = useState(() => resolveDashboardFuelPrice());
  const showMileage = assetCategory === 'vehicle';

  useEffect(() => {
    const sync = () => setFuelPrice(resolveDashboardFuelPrice());
    window.addEventListener('mams:fuel-price', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('mams:fuel-price', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const names = useMemo(() => [...assetNames].sort((a, b) => a.localeCompare(b)), [assetNames]);

  const rows = useMemo(
    () => buildPerAssetRows(transactions, fromDate, toDate, liveLevels, names, asset),
    [transactions, fromDate, toDate, liveLevels, names, asset],
  );
  const daily = useMemo(
    () => buildDailyTrend(transactions, fromDate, toDate, asset),
    [transactions, fromDate, toDate, asset],
  );

  const barGap = (n: number) => Math.max(28, Math.min(56, Math.round(720 / Math.max(n, 1))));
  const barSize = (n: number) => Math.max(6, Math.min(22, Math.round(420 / Math.max(n, 1))));
  const hasBars = rows.some((r) => r.level > 0 || r.filled > 0 || r.used > 0 || r.mileage > 0);
  const hasTrend = daily.some((d) => d.filled > 0 || d.used > 0);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground px-1">Loading charts…</p>;
  }

  if (!names.length && !transactions.length) {
    return null;
  }

  const tip = (v: number, label: string) => [`${v} L`, label] as [string, string];
  // Fill cost and use cost are always separate — never summed for monetization.
  const moneyRows = rows.map((r) => ({
    ...r,
    fillCost: Math.round(r.filled * fuelPrice),
    usedCost: Math.round(r.used * fuelPrice),
  }));

  return (
    <section className="space-y-3">
      <div className="rounded-lg border border-border/70 bg-card px-3 py-2.5 space-y-2">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Fuel charts</h3>
            <p className="text-[11px] text-muted-foreground">
              Totals match the period table · one filter applies to every chart
            </p>
          </div>
        </div>
        <PeriodAssetControls
          compact
          fromDate={fromDate}
          toDate={toDate}
          todayStr={todayStr}
          asset={asset}
          assetNames={names}
          assetLabel={unitLabel}
          onFromChange={(v) => onFromDateChange?.(v)}
          onToChange={(v) => onToDateChange?.(v)}
          onAssetChange={setAsset}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard
          title={`Current level by ${unitLabel}`}
          description="Live / latest period liters"
          filename={`fuel-levels-${fromDate}-${toDate}`}
          minWidth={Math.max(420, rows.length * barGap(rows.length))}
          empty={!hasBars && !rows.some((r) => r.level > 0)}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 12, right: 12, left: 8, bottom: 64 }} barCategoryGap="12%">
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} height={64} tickMargin={8} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={44} tickMargin={6} />
              <Tooltip
                formatter={(v: number) => tip(v, 'Level')}
                labelFormatter={(_, payload) => (payload?.[0]?.payload as ChartRow | undefined)?.fullName || ''}
              />
              <Bar dataKey="level" name="Level (L)" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} maxBarSize={barSize(rows.length)} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title={`Filled by ${unitLabel}`}
          description="Fill event liters in range"
          filename={`fuel-filled-${fromDate}-${toDate}`}
          minWidth={Math.max(420, rows.length * barGap(rows.length))}
          empty={!rows.some((r) => r.filled > 0)}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 12, right: 12, left: 8, bottom: 64 }} barCategoryGap="12%">
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} height={64} tickMargin={8} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={44} tickMargin={6} />
              <Tooltip
                formatter={(v: number) => tip(v, 'Filled')}
                labelFormatter={(_, payload) => (payload?.[0]?.payload as ChartRow | undefined)?.fullName || ''}
              />
              <Bar dataKey="filled" name="Filled (L)" fill="#0ea5e9" radius={[2, 2, 0, 0]} maxBarSize={barSize(rows.length)} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title={`Consumed by ${unitLabel}`}
          description="Consumption liters in range"
          filename={`fuel-used-${fromDate}-${toDate}`}
          minWidth={Math.max(420, rows.length * barGap(rows.length))}
          empty={!rows.some((r) => r.used > 0)}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 12, right: 12, left: 8, bottom: 64 }} barCategoryGap="12%">
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} height={64} tickMargin={8} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={44} tickMargin={6} />
              <Tooltip
                formatter={(v: number) => tip(v, 'Used')}
                labelFormatter={(_, payload) => (payload?.[0]?.payload as ChartRow | undefined)?.fullName || ''}
              />
              <Bar dataKey="used" name="Used (L)" fill="#f59e0b" radius={[2, 2, 0, 0]} maxBarSize={barSize(rows.length)} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title={`Money by ${unitLabel}`}
          description={`Fill cost vs use cost @ ${fuelPrice.toLocaleString()} UGX/L · separate bars`}
          filename={`fuel-money-${fromDate}-${toDate}`}
          minWidth={Math.max(420, rows.length * barGap(rows.length))}
          empty={!moneyRows.some((r) => r.fillCost > 0 || r.usedCost > 0)}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={moneyRows}
              margin={{ top: 12, right: 12, left: 8, bottom: 64 }}
              barCategoryGap="12%"
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} height={64} tickMargin={8} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={52} tickMargin={6} />
              <Tooltip
                labelFormatter={(_, payload) => (payload?.[0]?.payload as ChartRow | undefined)?.fullName || ''}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="fillCost" name="Fill cost" fill="#0ea5e9" radius={[2, 2, 0, 0]} maxBarSize={barSize(rows.length)} />
              <Bar dataKey="usedCost" name="Use cost" fill="#f59e0b" radius={[2, 2, 0, 0]} maxBarSize={barSize(rows.length)} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Daily filled · used"
          description="Leaf events by calendar day"
          filename={`fuel-daily-${fromDate}-${toDate}`}
          minWidth={Math.max(420, Math.max(daily.length, 7) * 44)}
          empty={!hasTrend}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={daily} margin={{ top: 12, right: 14, left: 8, bottom: 24 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={44} tickMargin={6} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="filled" name="Filled" stroke="#0ea5e9" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="used" name="Used" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard
        title={
          showMileage
            ? `Filled · Consumed · Mileage by ${unitLabel}`
            : `Filled · Consumed by ${unitLabel}`
        }
        description={
          showMileage
            ? 'Same aggregation as the transactions table'
            : 'Mileage hidden for stationary assets'
        }
        filename={`fuel-combo-${fromDate}-${toDate}`}
        minWidth={Math.max(560, rows.length * Math.max(48, barGap(rows.length) + 8))}
        empty={!hasBars}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 12, right: 14, left: 8, bottom: 64 }} barCategoryGap="16%">
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
            <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} height={64} tickMargin={8} tick={{ fontSize: 10 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 10 }} width={36} />
            {showMileage && <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} width={36} />}
            <Tooltip
              labelFormatter={(_, payload) => (payload?.[0]?.payload as ChartRow | undefined)?.fullName || ''}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="left" dataKey="filled" name="Filled (L)" fill="#0ea5e9" radius={[2, 2, 0, 0]} maxBarSize={barSize(rows.length)} />
            <Bar yAxisId="left" dataKey="used" name="Used (L)" fill="#f59e0b" radius={[2, 2, 0, 0]} maxBarSize={barSize(rows.length)} />
            {showMileage && (
              <Bar
                yAxisId="right"
                dataKey="mileage"
                name="Mileage (km)"
                fill="#64748b"
                radius={[2, 2, 0, 0]}
                maxBarSize={barSize(rows.length)}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
    </section>
  );
}
