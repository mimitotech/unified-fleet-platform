import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Droplets, Flame, Gauge, TrendingDown, X, Truck, Clock, MapPin } from 'lucide-react';
import { FuelTransaction } from '@/types/entities';
import type { FuelAssetCategory } from '@/lib/fuelTypes';
import { cn } from '@/lib/utils';
import { MetricCard } from '@/components/app/MetricCard';
import type { FuelReportKpis } from './fuelReportStats';
import { isWialonGroupSummary } from './fuelTransactionFilters';
import { effectiveSuddenDropVolume, fuelTheftEventKey } from './fuelTheftVolume';

interface FuelKpiCardsProps {
  kpis: FuelReportKpis;
  fuelTransactions?: FuelTransaction[];
  isLoading: boolean;
  assetCategory?: FuelAssetCategory;
  unitLabel?: string;
  unitLabelPlural?: string;
  /** Current total fuel litres across live assets. */
  totalLiveFuelLiters?: number;
}

interface SuddenDropAlert {
  id: string;
  unitName: string;
  tank: string;
  timestamp: number;
  time: string;
  location: string;
  volume: number;
}

export function FuelKpiCards({
  kpis,
  fuelTransactions = [],
  isLoading,
  assetCategory = 'vehicle',
  unitLabel = 'Vehicle',
  unitLabelPlural = 'vehicles',
  totalLiveFuelLiters,
}: FuelKpiCardsProps) {
  const [showDropModal, setShowDropModal] = useState(false);
  const isVehicle = assetCategory === 'vehicle';
  const liveTotal =
    totalLiveFuelLiters ??
    kpis.totalLiveFuelLiters ??
    0;

  const suddenDropAlerts = useMemo((): SuddenDropAlert[] => {
    const seen = new Set<string>();
    const out: SuddenDropAlert[] = [];
    for (const t of fuelTransactions) {
      if (isWialonGroupSummary(t) || t.section !== 'theft') continue;
      const volume = effectiveSuddenDropVolume(t);
      if (volume <= 0) continue;
      const key = fuelTheftEventKey({ ...t, suddenFuelDrop: volume });
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: t.id,
        unitName: t.unitName,
        tank: t.tank || 'unknown',
        timestamp: t.timestamp,
        time: t.time,
        location: t.location,
        volume,
      });
    }
    return out.sort((a, b) => b.timestamp - a.timestamp);
  }, [fuelTransactions]);

  // Prefer consolidated KPI volume (includes exact-range summary gap-fill); fall back to leaf sum
  const totalDropVolume =
    kpis.theftVolume > 0
      ? kpis.theftVolume
      : suddenDropAlerts.reduce((sum, a) => sum + a.volume, 0);
  const dropEventCount = Math.max(kpis.theftEvents, suddenDropAlerts.length);
  const uniqueVehiclesWithDrops = new Set(suddenDropAlerts.map((a) => a.unitName)).size;

  const liveCard = (
    <MetricCard
      title="Current fuel"
      value={`${Math.round(liveTotal).toLocaleString()} L`}
      subtitle={`Live tank total · ${unitLabelPlural}`}
      icon={Droplets}
      variant="info"
      size="xs"
    />
  );

  if (isLoading) {
    return (
      <div className="fuel-kpi-grid">
        {liveCard}
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="fuel-kpi-grid">
        {liveCard}
        <MetricCard
          title="Total Filled"
          value={`${kpis.totalFilled.toLocaleString()} L`}
          subtitle={`${kpis.fillingCount} fill event${kpis.fillingCount !== 1 ? 's' : ''}`}
          icon={Droplets}
          variant="primary"
          size="xs"
        />
        <MetricCard
          title="Total Consumed"
          value={`${kpis.totalConsumed.toLocaleString()} L`}
          subtitle={
            isVehicle
              ? `${kpis.totalMileage.toLocaleString()} km`
              : `${kpis.consumptionCount} event${kpis.consumptionCount !== 1 ? 's' : ''}`
          }
          icon={Flame}
          variant="warning"
          size="xs"
        />
        <MetricCard
          title={isVehicle ? 'Fleet Efficiency' : 'Assets tracked'}
          value={
            isVehicle
              ? kpis.avgConsumption > 0
                ? `${kpis.avgConsumption} L/100km`
                : '—'
              : String(kpis.vehiclesTracked)
          }
          subtitle={
            isVehicle
              ? `${kpis.vehiclesTracked} ${kpis.vehiclesTracked === 1 ? unitLabel.toLowerCase() : unitLabelPlural}`
              : `${unitLabelPlural} in period`
          }
          icon={Gauge}
          variant="success"
          size="xs"
        />
        <MetricCard
          title="Sudden Drops"
          value={`${dropEventCount}`}
          subtitle={`${totalDropVolume.toFixed(1)} L · ${uniqueVehiclesWithDrops} ${uniqueVehiclesWithDrops === 1 ? unitLabel.toLowerCase() : unitLabelPlural}`}
          icon={TrendingDown}
          variant={dropEventCount > 0 ? 'destructive' : 'default'}
          size="xs"
          onClick={suddenDropAlerts.length > 0 ? () => setShowDropModal(true) : undefined}
          className={cn(suddenDropAlerts.length > 0 && 'cursor-pointer')}
        />
      </div>

      {showDropModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowDropModal(false)} />
          <div className="relative bg-background border border-border rounded-lg shadow-xl max-w-xl w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-border sticky top-0 bg-background">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-destructive" />
                <h2 className="font-semibold text-sm">Fuel Sudden Drop Alerts</h2>
                <span className="text-[10px] bg-destructive/15 text-destructive px-1.5 py-0.5 rounded-full">
                  {suddenDropAlerts.length}
                </span>
              </div>
              <button onClick={() => setShowDropModal(false)} className="p-1 hover:bg-muted rounded-md transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 overflow-auto max-h-[calc(80vh-64px)] space-y-2">
              {suddenDropAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="p-2.5 rounded-md border border-destructive/30 bg-destructive/5 text-xs"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <Truck className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{alert.unitName}</div>
                        <div className="text-muted-foreground capitalize">{alert.tank} tank</div>
                        <div className="flex items-center gap-1 mt-0.5 text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          <span>{format(new Date(alert.timestamp * 1000), 'MMM dd, HH:mm')}</span>
                        </div>
                        {alert.location && (
                          <div className="flex items-center gap-1 mt-0.5 text-muted-foreground">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate">{alert.location}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="text-destructive font-semibold font-mono shrink-0">
                      -{alert.volume.toFixed(1)} L
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
