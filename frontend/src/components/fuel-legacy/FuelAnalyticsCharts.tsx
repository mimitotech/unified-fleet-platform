import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { FuelAnalyticsAssetRow, FuelAnalyticsResult } from '@/lib/fuelTypes';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Props = {
  data: FuelAnalyticsResult;
  showFleetAssets?: boolean;
};

type SortMode = 'name' | 'value-desc' | 'value-asc';

function sortAssets(rows: FuelAnalyticsAssetRow[], key: keyof FuelAnalyticsAssetRow, mode: SortMode) {
  const copy = [...rows];
  if (mode === 'name') return copy.sort((a, b) => a.unitName.localeCompare(b.unitName));
  if (mode === 'value-desc') {
    return copy.sort((a, b) => Number(b[key] ?? 0) - Number(a[key] ?? 0));
  }
  return copy.sort((a, b) => Number(a[key] ?? 0) - Number(b[key] ?? 0));
}

function yAxisWidthForNames(names: string[]): number {
  const longest = names.reduce((max, n) => Math.max(max, n.length), 0);
  return Math.min(320, Math.max(168, longest * 7.2));
}

function AssetBarChart({
  title,
  subtitle,
  rows,
  dataKey,
  unit,
  color,
  sortMode,
  onSortChange,
}: {
  title: string;
  subtitle?: string;
  rows: FuelAnalyticsAssetRow[];
  dataKey: keyof FuelAnalyticsAssetRow;
  unit: string;
  color: string;
  sortMode: SortMode;
  onSortChange: (m: SortMode) => void;
}) {
  const chartData = useMemo(() => {
    const sorted = sortAssets(rows, dataKey, sortMode);
    return sorted.map((a) => ({
      name: a.unitName,
      fullName: a.unitName,
      value: Number(a[dataKey] ?? 0),
    }));
  }, [rows, dataKey, sortMode]);

  const yAxisWidth = yAxisWidthForNames(chartData.map((d) => d.name));
  const height = Math.min(1200, Math.max(280, chartData.length * 34 + 72));

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      sortMode={sortMode}
      onSortChange={onSortChange}
      count={chartData.length}
    >
      {chartData.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">No data for this period</p>
      ) : (
        <div className="overflow-y-auto max-h-[min(75vh,640px)] pr-2">
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 4, right: 24, top: 12, bottom: 12 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} unit={` ${unit}`} />
              <YAxis
                type="category"
                dataKey="name"
                width={yAxisWidth}
                tick={{ fontSize: 11 }}
                interval={0}
                tickMargin={6}
              />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(v: number) => [`${v.toLocaleString()} ${unit}`, title]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ''}
              />
              <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

function PeriodBarChart({
  title,
  points,
  dataKey,
  unit,
  color,
}: {
  title: string;
  points: FuelAnalyticsResult['timeSeries'];
  dataKey: 'filled' | 'consumed' | 'theft' | 'cost';
  unit: string;
  color: string;
}) {
  const chartData = points.map((p) => ({
    name: p.label,
    value: p[dataKey],
  }));

  return (
    <ChartCard title={title} count={chartData.length}>
      {chartData.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">No data for this period</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ left: 4, right: 12, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} width={52} />
            <Tooltip
              contentStyle={{ fontSize: 12 }}
              formatter={(v: number) => [`${v.toLocaleString()} ${unit}`, title]}
            />
            <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

export function FuelAnalyticsCharts({ data, showFleetAssets = true }: Props) {
  const [consumedSort, setConsumedSort] = useState<SortMode>('value-desc');
  const [filledSort, setFilledSort] = useState<SortMode>('value-desc');
  const [theftSort, setTheftSort] = useState<SortMode>('value-desc');
  const [costSort, setCostSort] = useState<SortMode>('value-desc');
  const [remainingSort, setRemainingSort] = useState<SortMode>('value-desc');

  const assetRows = showFleetAssets ? data.byAsset : [];
  const hasCost = data.fuelPricePerLiter > 0;
  const hasRemaining = assetRows.some((a) => a.remainingFuel != null);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <PeriodBarChart
          title="Used over time"
          points={data.timeSeries}
          dataKey="consumed"
          unit="L"
          color="hsl(var(--destructive))"
        />
        <PeriodBarChart
          title="Filled over time"
          points={data.timeSeries}
          dataKey="filled"
          unit="L"
          color="hsl(var(--primary))"
        />
        <PeriodBarChart
          title="Lost / theft over time"
          points={data.timeSeries}
          dataKey="theft"
          unit="L"
          color="#f59e0b"
        />
        {hasCost && (
          <PeriodBarChart
            title="Fuel spend over time"
            points={data.timeSeries}
            dataKey="cost"
            unit=""
            color="hsl(var(--chart-2))"
          />
        )}
      </div>

      {showFleetAssets && assetRows.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">By asset — each metric separate</h3>
          <div className="grid gap-4 xl:grid-cols-2">
            <AssetBarChart
              title="Fuel used"
              subtitle="Liters consumed in period"
              rows={assetRows}
              dataKey="consumed"
              unit="L"
              color="hsl(var(--destructive))"
              sortMode={consumedSort}
              onSortChange={setConsumedSort}
            />
            <AssetBarChart
              title="Fuel filled"
              subtitle="Liters refilled in period"
              rows={assetRows}
              dataKey="filled"
              unit="L"
              color="hsl(var(--primary))"
              sortMode={filledSort}
              onSortChange={setFilledSort}
            />
            <AssetBarChart
              title="Fuel lost"
              subtitle="Theft & sudden drops"
              rows={assetRows}
              dataKey="theft"
              unit="L"
              color="#f59e0b"
              sortMode={theftSort}
              onSortChange={setTheftSort}
            />
            {hasCost && (
              <AssetBarChart
                title="Fuel spend"
                subtitle={`Filled litres × ${data.fuelPricePerLiter}/L`}
                rows={assetRows}
                dataKey="cost"
                unit=""
                color="hsl(var(--chart-2))"
                sortMode={costSort}
                onSortChange={setCostSort}
              />
            )}
            {hasRemaining && (
              <AssetBarChart
                title="Remaining fuel"
                subtitle="Current live sensor reading"
                rows={assetRows.filter((a) => a.remainingFuel != null)}
                dataKey="remainingFuel"
                unit="L"
                color="hsl(var(--chart-3, var(--primary)))"
                sortMode={remainingSort}
                onSortChange={setRemainingSort}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  sortMode,
  onSortChange,
  count,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  sortMode?: SortMode;
  onSortChange?: (m: SortMode) => void;
  count?: number;
}) {
  return (
    <div className="fleet-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <h4 className="text-sm font-semibold leading-tight">
            {title}
            {count != null ? <span className="text-muted-foreground font-normal"> ({count})</span> : null}
          </h4>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        {onSortChange && sortMode && (
          <Select value={sortMode} onValueChange={(v) => onSortChange(v as SortMode)}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="value-desc" className="text-xs">Highest first</SelectItem>
              <SelectItem value="value-asc" className="text-xs">Lowest first</SelectItem>
              <SelectItem value="name" className="text-xs">By name</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
      {children}
    </div>
  );
}
