import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Droplets, Flame, Gauge, TrendingDown, X, Truck, Clock, MapPin } from 'lucide-react';
import { FuelTransaction } from '@/types/entities';
import { cn } from '@/lib/utils';
import { MetricCard } from '@/components/app/MetricCard';
import type { FuelReportKpis } from './fuelReportStats';

interface FuelKpiCardsProps {
  kpis: FuelReportKpis;
  fuelTransactions?: FuelTransaction[];
  isLoading: boolean;
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

export function FuelKpiCards({ kpis, fuelTransactions = [], isLoading }: FuelKpiCardsProps) {
  const [showDropModal, setShowDropModal] = useState(false);

  const suddenDropAlerts = useMemo((): SuddenDropAlert[] => {
    return fuelTransactions
      .filter((t) => t.section === 'theft' && t.suddenFuelDrop > 0)
      .map((t) => ({
        id: t.id,
        unitName: t.unitName,
        tank: t.tank || 'unknown',
        timestamp: t.timestamp,
        time: t.time,
        location: t.location,
        volume: t.suddenFuelDrop,
      }))
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [fuelTransactions]);

  const totalDropVolume = suddenDropAlerts.reduce((sum, a) => sum + a.volume, 0);
  const uniqueVehiclesWithDrops = new Set(suddenDropAlerts.map((a) => a.unitName)).size;

  if (isLoading) {
    return (
      <div className="fuel-kpi-grid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="fuel-kpi-grid">
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
          subtitle={`${kpis.totalMileage.toLocaleString()} km`}
          icon={Flame}
          variant="warning"
          size="xs"
        />
        <MetricCard
          title="Fleet Efficiency"
          value={kpis.avgConsumption > 0 ? `${kpis.avgConsumption} L/100km` : '—'}
          subtitle={`${kpis.vehiclesTracked} vehicle${kpis.vehiclesTracked !== 1 ? 's' : ''}`}
          icon={Gauge}
          variant="success"
          size="xs"
        />
        <MetricCard
          title="Sudden Drops"
          value={`${suddenDropAlerts.length}`}
          subtitle={`${totalDropVolume.toFixed(1)} L · ${uniqueVehiclesWithDrops} unit${uniqueVehiclesWithDrops !== 1 ? 's' : ''}`}
          icon={TrendingDown}
          variant={suddenDropAlerts.length > 0 ? 'destructive' : 'default'}
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
