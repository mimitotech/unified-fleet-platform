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
import { DEFAULT_FUEL_PRICE_UGX, resolveDashboardFuelPrice } from '@/lib/dashboardWidgetPrefs';

const PRICE_KEY = 'mams.fuel.pricePerLiter';

function loadPrice(): number {
  const resolved = resolveDashboardFuelPrice();
  if (resolved > 0) return resolved;
  const raw = localStorage.getItem(PRICE_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_FUEL_PRICE_UGX;
}

export function FuelCostingPanel({
  transactions,
  fromDate: defaultFrom,
  toDate: defaultTo,
  todayStr,
  liveLevels,
  assetNames = [],
  unitLabel,
}: {
  transactions: FuelTransaction[];
  fromDate: string;
  toDate: string;
  todayStr: string;
  liveLevels?: Map<string, number>;
  assetNames?: string[];
  unitLabel: string;
}) {
  const [price, setPrice] = useState(loadPrice);
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [selected, setSelected] = useState<string>('all');

  useEffect(() => {
    setFromDate(defaultFrom);
    setToDate(defaultTo);
  }, [defaultFrom, defaultTo]);

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
      const reportedCost = cols.totalCost;
      const fillCost = reportedCost > 0 ? reportedCost : filled * price;
      const usedCost = used * price;
      return {
        name: unitName.length > 12 ? `${unitName.slice(0, 11)}…` : unitName,
        fullName: unitName,
        filled: Math.round(filled * 10) / 10,
        used: Math.round(used * 10) / 10,
        fillCost: Math.round(fillCost * 100) / 100,
        usedCost: Math.round(usedCost * 100) / 100,
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
    }),
    { fillCost: 0, usedCost: 0, filled: 0, used: 0 },
  );

  const chartWidth = Math.max(480, filtered.length * Math.max(36, Math.round(640 / Math.max(filtered.length, 1))));

  return (
    <Card className="branded-panel border-border/70 shadow-none">
      <CardHeader className="py-3 px-4 space-y-3">
        <div>
          <CardTitle className="text-sm font-medium text-primary">Fuel costing</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Price per liter · defaults follow the tab period · filter by {unitLabel}
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
          onFromChange={setFromDate}
          onToChange={setToDate}
          onAssetChange={setSelected}
        />
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Price per liter</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              className="w-36 h-9"
              value={price || ''}
              onChange={(e) => setPrice(Number(e.target.value) || 0)}
              onBlur={() => localStorage.setItem(PRICE_KEY, String(price))}
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-9"
            onClick={() => localStorage.setItem(PRICE_KEY, String(price))}
          >
            Save price
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-md border border-primary/15 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Filled</p>
            <p className="text-sm font-semibold tabular-nums branded-number">{totals.filled.toFixed(1)} L</p>
          </div>
          <div className="rounded-md border border-primary/15 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Fill cost</p>
            <p className="text-sm font-semibold tabular-nums branded-number">{totals.fillCost.toLocaleString()}</p>
          </div>
          <div className="rounded-md border border-primary/15 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Used</p>
            <p className="text-sm font-semibold tabular-nums branded-number">{totals.used.toFixed(1)} L</p>
          </div>
          <div className="rounded-md border border-primary/15 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Use cost</p>
            <p className="text-sm font-semibold tabular-nums branded-number">{totals.usedCost.toLocaleString()}</p>
          </div>
        </div>

        {filtered.length > 0 && price > 0 && (
          <div className="overflow-x-auto">
            <div style={{ minWidth: chartWidth }} className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filtered} margin={{ top: 12, right: 14, left: 10, bottom: 64 }} barCategoryGap="14%">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="name"
                    angle={-40}
                    textAnchor="end"
                    interval={0}
                    height={68}
                    tickMargin={8}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis tick={{ fontSize: 10 }} width={52} tickMargin={6} />
                  <Tooltip
                    labelFormatter={(_, payload) =>
                      String((payload?.[0]?.payload as { fullName?: string } | undefined)?.fullName || '')
                    }
                  />
                  <Legend />
                  <Bar dataKey="fillCost" name="Fill cost" fill="#0ea5e9" radius={[2, 2, 0, 0]} maxBarSize={18} />
                  <Bar dataKey="usedCost" name="Use cost" fill="#f59e0b" radius={[2, 2, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {price <= 0 && (
          <p className="text-xs text-muted-foreground">
            Set a price per liter (default {DEFAULT_FUEL_PRICE_UGX.toLocaleString()} UGX) to see cost bars by {unitLabel}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
