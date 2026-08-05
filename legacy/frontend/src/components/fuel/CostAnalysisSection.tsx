import { PieChart, Radio, AlertTriangle, Fuel, FileSpreadsheet } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { FuelCostAnalysis } from '@/services/fleet/googleSheets';

interface CostAnalysisSectionProps {
  costAnalysis?: FuelCostAnalysis;
  isLoading: boolean;
}

// Format currency for Uganda
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    maximumFractionDigits: 0
  }).format(amount);
};

export function CostAnalysisSection({ costAnalysis, isLoading }: CostAnalysisSectionProps) {
  return (
    <div className="fleet-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <PieChart className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">System vs Non-System Cost Analysis</h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Data from Fuel Station Sheet</span>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          {/* Summary Cards Skeleton */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="p-4 rounded-lg border">
                <div className="flex items-center gap-2 mb-3">
                  <Skeleton className="w-5 h-5 rounded" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-8 w-24 mb-2" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>

          {/* Table Skeleton */}
          <div className="rounded-lg border overflow-hidden">
            <div className="bg-muted/30 p-3 border-b">
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="divide-y">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="p-3 flex items-center gap-4">
                  <Skeleton className="w-4 h-4 rounded" />
                  <Skeleton className="h-4 w-24 flex-1" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : !costAnalysis ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileSpreadsheet className="w-10 h-10 mx-auto opacity-30 mb-2" />
          <p className="font-medium">No fuel station data available</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-info/10 border border-info/20">
              <div className="flex items-center gap-2 mb-2">
                <Radio className="w-4 h-4 text-info" />
                <span className="text-sm font-medium">On System</span>
              </div>
              <p className="text-2xl font-bold">{costAnalysis.wialonVehicles.count}</p>
              <p className="text-sm text-muted-foreground">
                {formatCurrency(costAnalysis.wialonVehicles.totalCost)} total
              </p>
            </div>

            <div className="p-4 rounded-lg bg-warning/10 border border-warning/20">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-warning" />
                <span className="text-sm font-medium">Off System</span>
              </div>
              <p className="text-2xl font-bold">{costAnalysis.nonWialonVehicles.count}</p>
              <p className="text-sm text-muted-foreground">
                {formatCurrency(costAnalysis.nonWialonVehicles.totalCost)} total
              </p>
            </div>

            <div className="p-4 rounded-lg bg-muted border border-border">
              <div className="flex items-center gap-2 mb-2">
                <Fuel className="w-4 h-4" />
                <span className="text-sm font-medium">Total Fleet</span>
              </div>
              <p className="text-2xl font-bold">{costAnalysis.totals.totalVehicles}</p>
              <p className="text-sm text-muted-foreground">
                {formatCurrency(costAnalysis.totals.totalCost)} total
              </p>
            </div>
          </div>

          {/* Comparison Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase">Category</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase">Vehicles</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase">Total Liters</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase">Total Cost</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase">Avg Cost/Vehicle</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase">Avg Cost/Liter</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/50 hover:bg-muted/20">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Radio className="w-4 h-4 text-info" />
                      <span className="font-medium">On System</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-mono">{costAnalysis.wialonVehicles.count}</td>
                  <td className="py-3 px-4 text-right font-mono">{costAnalysis.wialonVehicles.totalLiters.toLocaleString()} L</td>
                  <td className="py-3 px-4 text-right font-mono font-medium">{formatCurrency(costAnalysis.wialonVehicles.totalCost)}</td>
                  <td className="py-3 px-4 text-right font-mono">{formatCurrency(costAnalysis.wialonVehicles.avgCostPerVehicle)}</td>
                  <td className="py-3 px-4 text-right font-mono">{formatCurrency(costAnalysis.wialonVehicles.avgCostPerLiter)}</td>
                </tr>
                <tr className="border-b border-border/50 hover:bg-muted/20">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-warning" />
                      <span className="font-medium">Off System</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-mono">{costAnalysis.nonWialonVehicles.count}</td>
                  <td className="py-3 px-4 text-right font-mono">{costAnalysis.nonWialonVehicles.totalLiters.toLocaleString()} L</td>
                  <td className="py-3 px-4 text-right font-mono font-medium">{formatCurrency(costAnalysis.nonWialonVehicles.totalCost)}</td>
                  <td className="py-3 px-4 text-right font-mono">{formatCurrency(costAnalysis.nonWialonVehicles.avgCostPerVehicle)}</td>
                  <td className="py-3 px-4 text-right font-mono">{formatCurrency(costAnalysis.nonWialonVehicles.avgCostPerLiter)}</td>
                </tr>
                <tr className="bg-muted/30 font-medium">
                  <td className="py-3 px-4">
                    <span className="font-semibold">Total</span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono">{costAnalysis.totals.totalVehicles}</td>
                  <td className="py-3 px-4 text-right font-mono">{costAnalysis.totals.totalLiters.toLocaleString()} L</td>
                  <td className="py-3 px-4 text-right font-mono font-bold">{formatCurrency(costAnalysis.totals.totalCost)}</td>
                  <td className="py-3 px-4 text-right font-mono">-</td>
                  <td className="py-3 px-4 text-right font-mono">{formatCurrency(costAnalysis.totals.avgCostPerLiter)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

