import { format } from 'date-fns';
import { ArrowRightLeft, Radio, FileSpreadsheet, Droplets, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FuelTransaction } from '@/types/entities';

interface FleetFuelLevel {
  vehicleId: string;
  vehicle: string;
  sheetFuelLevel: number; // Fuel Station reported
  tankCapacity: number;
  status: 'critical' | 'warning' | 'ok';
  lastSheetUpdate: string;
}

interface FuelVarianceTableProps {
  fleetFuelLevels: FleetFuelLevel[];
  fuelTransactions: FuelTransaction[];
  isLoading: boolean;
}

export function FuelVarianceTable({ fleetFuelLevels, fuelTransactions, isLoading }: FuelVarianceTableProps) {
  // Aggregate total FLS per vehicle from transactions (using unitName to match vehicle name)
  const flsByVehicle: Record<string, number> = {};
  fuelTransactions.forEach(t => {
    const key = t.unitName;
    if (!flsByVehicle[key]) flsByVehicle[key] = 0;
    flsByVehicle[key] += t.filled; // Total FLS per vehicle
  });

  // Compute overall totals (rounded to integers)
  const totalFls = Math.round(Object.values(flsByVehicle).reduce((sum, val) => sum + val, 0));
  const totalSheet = Math.round(fleetFuelLevels.reduce((sum, v) => sum + v.sheetFuelLevel, 0));
  const totalVariance = totalFls - totalSheet;

  return (
    <div className="fleet-card h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Fuel Level Variance</h3>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-info" />
            <span>Fuel Level Sensor</span>
          </div>
          <div className="flex items-center gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5 text-success" />
            <span>Fuel Station Data</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto flex-1">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase">Vehicle</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase">
                <div className="flex items-center justify-end gap-1.5">
                  <Radio className="w-3.5 h-3.5" />
                  FLS (L)
                </div>
              </th>
              <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase">
                <div className="flex items-center justify-end gap-1.5">
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  F. Station (L)
                </div>
              </th>
              <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase">Variance (L)</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase">Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="py-8 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Loading fuel data...</span>
                  </div>
                </td>
              </tr>
            ) : fleetFuelLevels.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground">
                  No vehicles with fuel data
                </td>
              </tr>
            ) : (
              fleetFuelLevels.map((v) => {
                const flsForVehicle = Math.round(flsByVehicle[v.vehicle] || 0);
                const sheetForVehicle = Math.round(v.sheetFuelLevel);
                const variance = flsForVehicle - sheetForVehicle;
                const isSignificantVariance = Math.abs(variance) > 10;

                return (
                  <tr key={v.vehicleId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Droplets className={cn(
                          "w-4 h-4",
                          v.status === 'critical' ? "text-destructive" :
                          v.status === 'warning' ? "text-warning" : "text-success"
                        )} />
                        <span className="text-sm font-medium">{v.vehicle}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-sm font-mono text-info">{flsForVehicle} L</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-sm font-mono text-success">{sheetForVehicle} L</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm font-mono font-medium",
                        isSignificantVariance
                          ? (variance > 0 ? "bg-warning/15 text-warning" : "bg-destructive/15 text-destructive")
                          : "bg-muted text-muted-foreground"
                      )}>
                        {variance > 0 ? <TrendingUp className="w-3 h-3" /> : variance < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                        {variance > 0 ? '+' : ''}{variance} L
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">
                      {v.lastSheetUpdate && v.lastSheetUpdate !== 'No data' && !isNaN(new Date(v.lastSheetUpdate).getTime())
                        ? format(new Date(v.lastSheetUpdate), 'MMM dd, HH:mm')
                        : '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Summary Stats */}
      {!isLoading && fleetFuelLevels.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Total FLS: </span>
            <span className="font-mono font-medium text-info">{totalFls} L</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Total Sheet: </span>
            <span className="font-mono font-medium text-success">{totalSheet} L</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Net Variance: </span>
            <span className={cn("font-mono font-medium", totalVariance > 0 ? "text-warning" : "text-destructive")}>
              {totalVariance > 0 ? '+' : ''}{totalVariance} L
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
