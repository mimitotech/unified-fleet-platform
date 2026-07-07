import { PieChart, Droplets, Flame, Gauge, Truck } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { VehicleFuelReportRow } from './fuelReportStats';

interface Props {
  rows: VehicleFuelReportRow[];
  isLoading: boolean;
  unitLabel?: string;
  summaryTitle?: string;
}

export function FuelFleetSummarySection({
  rows,
  isLoading,
  unitLabel = 'Vehicle',
  summaryTitle = 'Fleet fuel summary',
}: Props) {
  return (
    <div className="fleet-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <PieChart className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">{summaryTitle}</h3>
        </div>
        <span className="text-xs text-muted-foreground">From Wialon fuel reports</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <Truck className="w-10 h-10 mx-auto opacity-30 mb-2" />
          <p className="font-medium">No fuel report data for this period</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-3 px-3 text-xs font-medium text-muted-foreground uppercase">{unitLabel}</th>
                <th className="text-right py-3 px-3 text-xs font-medium text-muted-foreground uppercase">Filled (L)</th>
                <th className="text-right py-3 px-3 text-xs font-medium text-muted-foreground uppercase">Used (L)</th>
                <th className="text-right py-3 px-3 text-xs font-medium text-muted-foreground uppercase">Mileage (km)</th>
                <th className="text-right py-3 px-3 text-xs font-medium text-muted-foreground uppercase">L/100km</th>
                <th className="text-right py-3 px-3 text-xs font-medium text-muted-foreground uppercase">Theft (L)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.unitId} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="py-2.5 px-3 font-medium">{r.unitName}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-green-600">{r.filled.toFixed(1)}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-orange-600">{r.consumed.toFixed(1)}</td>
                  <td className="py-2.5 px-3 text-right font-mono">{r.mileage.toFixed(1)}</td>
                  <td className="py-2.5 px-3 text-right font-mono">
                    {r.avgConsumption > 0 ? r.avgConsumption.toFixed(1) : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-destructive">
                    {r.theftVolume > 0 ? r.theftVolume.toFixed(1) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30 font-medium">
                <td className="py-3 px-3">Total ({rows.length} units)</td>
                <td className="py-3 px-3 text-right font-mono">
                  {rows.reduce((s, r) => s + r.filled, 0).toFixed(1)}
                </td>
                <td className="py-3 px-3 text-right font-mono">
                  {rows.reduce((s, r) => s + r.consumed, 0).toFixed(1)}
                </td>
                <td className="py-3 px-3 text-right font-mono">
                  {rows.reduce((s, r) => s + r.mileage, 0).toFixed(1)}
                </td>
                <td className="py-3 px-3 text-right font-mono">—</td>
                <td className="py-3 px-3 text-right font-mono text-destructive">
                  {rows.reduce((s, r) => s + r.theftVolume, 0).toFixed(1)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {!isLoading && rows.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Droplets className="w-3.5 h-3.5 text-green-600" /> Filled = filling events
          </span>
          <span className="inline-flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-orange-600" /> Used = consumption rows
          </span>
          <span className="inline-flex items-center gap-1">
            <Gauge className="w-3.5 h-3.5" /> L/100km from report mileage
          </span>
        </div>
      )}
    </div>
  );
}
