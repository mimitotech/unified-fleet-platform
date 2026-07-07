import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wallet, Droplets, Flame, ShieldAlert, Gauge } from 'lucide-react';
import type { FuelReportKpis } from './fuelReportStats';
import { applyPriceToKpis } from './fuelReportStats';

type Props = {
  kpis: FuelReportKpis;
  fuelPrice: string;
  onFuelPriceChange: (v: string) => void;
};

const formatUgx = (n: number) =>
  new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(n);

export function FuelReportMonetaryPanel({ kpis, fuelPrice, onFuelPriceChange }: Props) {
  const price = Number(fuelPrice) || 0;
  const costs = applyPriceToKpis(kpis, price);

  return (
    <div className="fleet-card space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Fuel spend estimate</h3>
          <p className="text-xs text-muted-foreground">
            Litres from Wialon fuel reports × your price per litre. Does not change report volumes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="fuel-price-per-litre" className="text-xs whitespace-nowrap">
            Price / litre (UGX)
          </Label>
          <Input
            id="fuel-price-per-litre"
            type="number"
            min={0}
            step={1}
            className="h-8 w-[120px] text-xs"
            placeholder="5200"
            value={fuelPrice}
            onChange={(e) => onFuelPriceChange(e.target.value)}
          />
        </div>
      </div>

      {price > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Wallet className="w-3.5 h-3.5" />
              Fill spend
            </div>
            <p className="text-lg font-semibold tabular-nums">{formatUgx(costs.fillCost)}</p>
            <p className="text-[10px] text-muted-foreground">{kpis.totalFilled} L filled</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Flame className="w-3.5 h-3.5" />
              Usage cost est.
            </div>
            <p className="text-lg font-semibold tabular-nums">{formatUgx(costs.usageCost)}</p>
            <p className="text-[10px] text-muted-foreground">{kpis.totalConsumed} L used</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Droplets className="w-3.5 h-3.5" />
              Total filled
            </div>
            <p className="text-lg font-semibold tabular-nums">{kpis.totalFilled} L</p>
            <p className="text-[10px] text-muted-foreground">Wialon report</p>
          </div>
          {costs.lossCost > 0 ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <ShieldAlert className="w-3.5 h-3.5 text-destructive" />
                Loss value est.
              </div>
              <p className="text-lg font-semibold tabular-nums text-destructive">{formatUgx(costs.lossCost)}</p>
              <p className="text-[10px] text-muted-foreground">{kpis.theftVolume} L lost</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Gauge className="w-3.5 h-3.5" />
                Avg efficiency
              </div>
              <p className="text-lg font-semibold tabular-nums">
                {kpis.avgConsumption > 0 ? `${kpis.avgConsumption} L/100km` : '—'}
              </p>
              <p className="text-[10px] text-muted-foreground">{kpis.totalMileage} km</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Enter a price per litre to estimate fuel spend for this reporting period.
        </p>
      )}
    </div>
  );
}
