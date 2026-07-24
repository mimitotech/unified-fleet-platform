import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
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
import type { FuelTransaction } from '@/types/entities';
import { aggregateUnitFuelColumns } from './fuelColumnMetrics';
import { filterFuelTransactionsByDate } from './fuelTransactionFilters';
import { PeriodAssetControls } from '@/components/shared/PeriodAssetControls';
import {
  DEFAULT_FUEL_PRICE_UGX,
  resolveDashboardFuelPrice,
  saveFuelPrice,
} from '@/lib/dashboardWidgetPrefs';

function fmtUgx(n: number): string {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    maximumFractionDigits: 0,
  }).format(n);
}

export function FuelCostingPanel({
  transactions,
  fromDate,
  toDate,
  todayStr,
  liveLevels,
  assetNames = [],
  unitLabel,
  onFromDateChange,
  onToDateChange,
}: {
  transactions: FuelTransaction[];
  fromDate: string;
  toDate: string;
  todayStr: string;
  liveLevels?: Map<string, number>;
  assetNames?: string[];
  unitLabel: string;
  onFromDateChange?: (v: string) => void;
  onToDateChange?: (v: string) => void;
}) {
  const [price, setPrice] = useState(() => resolveDashboardFuelPrice() || DEFAULT_FUEL_PRICE_UGX);
  const [selected, setSelected] = useState<string>('all');

  useEffect(() => {
    const sync = () => setPrice(resolveDashboardFuelPrice());
    window.addEventListener('mams:fuel-price', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('mams:fuel-price', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const names = useMemo(() => {
    const set = new Set(assetNames);
    for (const t of transactions) if (t.unitName) set.add(t.unitName);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [assetNames, transactions]);

  const rows = useMemo(() => {
    const ranged = filterFuelTransactionsByDate(transactions, fromDate, toDate);
    return names.map((unitName) => {
      const cols = aggregateUnitFuelColumns(
        ranged.filter((t) => t.unitName === unitName),
        { fromDate, toDate, liveLevel: liveLevels?.get(unitName) },
      );
      const filled = cols.filledMain + cols.filledReserve;
      const used = cols.totalUsed;
      // Always price × liters — filled and used stay separate (never summed).
      const fillCost = filled * price;
      const usedCost = used * price;
      const stationSpend = cols.totalCost > 0 ? cols.totalCost : 0;
      return {
        name: unitName.length > 12 ? `${unitName.slice(0, 11)}…` : unitName,
        fullName: unitName,
        filled: Math.round(filled * 10) / 10,
        used: Math.round(used * 10) / 10,
        fillCost: Math.round(fillCost),
        usedCost: Math.round(usedCost),
        stationSpend: Math.round(stationSpend),
      };
    });
  }, [transactions, fromDate, toDate, liveLevels, price, names]);

  const filtered = selected === 'all' ? rows : rows.filter((r) => r.fullName === selected);
  const totals = filtered.reduce(
    (a, r) => ({
      fillCost: a.fillCost + r.fillCost,
      usedCost: a.usedCost + r.usedCost,
      filled: a.filled + r.filled,
      used: a.used + r.used,
      stationSpend: a.stationSpend + r.stationSpend,
    }),
    { fillCost: 0, usedCost: 0, filled: 0, used: 0, stationSpend: 0 },
  );

  const chartWidth = Math.max(
    480,
    filtered.length * Math.max(36, Math.round(640 / Math.max(filtered.length, 1))),
  );

  const persistPrice = () => {
    const saved = saveFuelPrice(price);
    setPrice(saved);
  };

  return (
    <Card className="branded-panel border-border/70 shadow-none">
      <CardHeader className="py-3 px-4 space-y-3">
        <div>
          <CardTitle className="text-sm font-medium text-primary">Fuel costing</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            One price for the whole system · fill cost and use cost stay separate · same period as the
            table
          </p>
        </div>
        <PeriodAssetControls
          compact
          fromDate={fromDate}
          toDate={toDate}
          todayStr={todayStr}
          asset={selected}
          assetNames={names}
          assetLabel={unitLabel}
          onFromChange={(v) => onFromDateChange?.(v)}
          onToChange={(v) => onToDateChange?.(v)}
          onAssetChange={setSelected}
        />
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Price per liter (UGX)</Label>
            <Input
              type="number"
              min={0}
              step="1"
              className="w-36 h-9"
              value={price || ''}
              onChange={(e) => setPrice(Number(e.target.value) || 0)}
              onBlur={persistPrice}
            />
          </div>
          <Button type="button" size="sm" variant="secondary" className="h-9" onClick={persistPrice}>
            Save price
          </Button>
          <p className="text-[11px] text-muted-foreground max-w-xs">
            Saving updates dashboard money tiles and all fuel charts immediately.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Filled (L)</p>
            <p className="text-sm font-semibold tabular-nums">{totals.filled.toFixed(1)} L</p>
          </div>
          <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Fill cost</p>
            <p className="text-sm font-semibold tabular-nums">{fmtUgx(totals.fillCost)}</p>
          </div>
          <div className="rounded-md border border-orange-500/20 bg-orange-500/5 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Used (L)</p>
            <p className="text-sm font-semibold tabular-nums">{totals.used.toFixed(1)} L</p>
          </div>
          <div className="rounded-md border border-orange-500/20 bg-orange-500/5 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Use cost</p>
            <p className="text-sm font-semibold tabular-nums">{fmtUgx(totals.usedCost)}</p>
          </div>
        </div>

        {totals.stationSpend > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Station sheet spend in period (reference): {fmtUgx(totals.stationSpend)} — not mixed into
            fill/use cost above.
          </p>
        )}

        <div className="overflow-x-auto">
          <div style={{ minWidth: chartWidth }} className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={filtered}
                margin={{ top: 8, right: 8, left: 4, bottom: 48 }}
                barCategoryGap="18%"
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis
                  dataKey="name"
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                  height={56}
                  tick={{ fontSize: 10 }}
                />
                <YAxis tick={{ fontSize: 10 }} width={56} />
                <Tooltip
                  formatter={(v: number, name: string) => [
                    fmtUgx(v),
                    name === 'fillCost' ? 'Fill cost' : 'Use cost',
                  ]}
                  labelFormatter={(_, payload) =>
                    String(payload?.[0]?.payload?.fullName || payload?.[0]?.payload?.name || '')
                  }
                />
                <Legend
                  formatter={(v) => (v === 'fillCost' ? 'Fill cost' : 'Use cost')}
                  wrapperStyle={{ fontSize: 11 }}
                />
                <Bar dataKey="fillCost" name="fillCost" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="usedCost" name="usedCost" fill="#ea580c" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
