import { MetricCard } from '@/components/app/MetricCard';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wallet, Droplets, Flame, ShieldAlert } from 'lucide-react';
import type { FuelAnalyticsResult } from '@/lib/fuelTypes';
import { applyFuelPriceToAnalytics } from '@/lib/fuelPriceApply';

type Props = {
  analytics: FuelAnalyticsResult;
  fuelPrice: string;
  onFuelPriceChange: (v: string) => void;
};

/** Spending analysis only — does not change Wialon volume reports. */
export function FuelMonetaryPanel({ analytics, fuelPrice, onFuelPriceChange }: Props) {
  const price = Number(fuelPrice) || 0;
  const monetary = applyFuelPriceToAnalytics(analytics, price);
  const k = monetary.kpis;

  return (
    <div className="fleet-card p-3 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Monetary analysis</h3>
          <p className="text-[10px] text-muted-foreground">
            Enter your fuel purchase price to estimate spend. Litre totals above are unchanged.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-[10px] whitespace-nowrap">Price per litre (filled)</Label>
          <Input
            type="number"
            min={0}
            step={0.01}
            className="h-8 w-[110px] text-xs"
            placeholder="5200"
            value={fuelPrice}
            onChange={(e) => onFuelPriceChange(e.target.value)}
          />
        </div>
      </div>

      {price > 0 ? (
        <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
          <MetricCard
            title="Fuel spend"
            value={k.totalFillCost ? k.totalFillCost.toLocaleString() : '—'}
            icon={Wallet}
            variant="info"
            size="xxs"
            subtitle="Filled × price"
          />
          <MetricCard
            title="Usage cost est."
            value={k.totalUsageCost ? k.totalUsageCost.toLocaleString() : '—'}
            icon={Flame}
            variant="warning"
            size="xxs"
            subtitle="Used × price"
          />
          <MetricCard
            title="Fill purchase"
            value={`${k.totalFilled} L`}
            icon={Droplets}
            variant="primary"
            size="xxs"
            subtitle="From fuel report"
          />
          {k.totalLossCost != null && k.totalLossCost > 0 ? (
            <MetricCard
              title="Loss value"
              value={k.totalLossCost.toLocaleString()}
              icon={ShieldAlert}
              variant="destructive"
              size="xxs"
              subtitle="Lost × price"
            />
          ) : (
            <MetricCard
              title="Avg L/100km"
              value={k.avgConsumption > 0 ? `${k.avgConsumption}` : '—'}
              icon={Flame}
              variant="warning"
              size="xxs"
              subtitle="From fuel report"
            />
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Enter a price per litre to see fuel spend and cost estimates for this period.
        </p>
      )}
    </div>
  );
}
