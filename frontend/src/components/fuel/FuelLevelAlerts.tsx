import { AlertTriangle, Droplets } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

export interface FleetFuelLevel {
  vehicleId: string;
  vehicle: string;
  fuelLevel: number;
  fuelPercent: number;
  status: 'critical' | 'warning' | 'ok';
}

interface FuelLevelAlertsProps {
  criticalVehicles: FleetFuelLevel[];
  warningVehicles: FleetFuelLevel[];
}

const ALERTS_PER_ROW = 4;
const MAX_ALERT_ROWS = 2;
const MAX_VISIBLE_ALERTS = ALERTS_PER_ROW * MAX_ALERT_ROWS;

export function FuelLevelAlerts({ criticalVehicles, warningVehicles }: FuelLevelAlertsProps) {
  const totalAlerts = criticalVehicles.length + warningVehicles.length;
  if (totalAlerts === 0) {
    return null;
  }

  const allAlerts = [...criticalVehicles, ...warningVehicles];
  const visibleAlerts = allAlerts.slice(0, MAX_VISIBLE_ALERTS);
  const hiddenCount = totalAlerts - visibleAlerts.length;
  const hiddenCritical = Math.max(0, criticalVehicles.length - visibleAlerts.filter(v => v.status === 'critical').length);

  return (
    <div className="fleet-card branded-panel border-warning/40 py-2.5">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 min-w-0">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
          <h3 className="fuel-section-title">Fuel Level Alerts</h3>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            {criticalVehicles.length} critical · {warningVehicles.length} warning
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
          &lt;15% critical · &lt;30% warning
        </span>
      </div>
      <div className="fuel-alert-grid">
        {visibleAlerts.map((vehicle) => {
          const pct = Math.max(0, Math.min(100, vehicle.fuelPercent));
          return (
            <div
              key={vehicle.vehicleId}
              className={cn(
                'fuel-alert-tile',
                vehicle.status === 'critical' ? 'bg-destructive/10' : 'bg-warning/10',
              )}
            >
              <Droplets
                className={cn(
                  'w-3.5 h-3.5 shrink-0',
                  vehicle.status === 'critical' ? 'text-destructive' : 'text-warning',
                )}
              />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-medium truncate leading-tight">{vehicle.vehicle}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Progress
                    value={pct}
                    className={cn(
                      'h-1 flex-1',
                      vehicle.status === 'critical' ? '[&>div]:bg-destructive' : '[&>div]:bg-warning',
                    )}
                  />
                  <span className="text-[10px] font-mono tabular-nums">{Math.round(pct)}%</span>
                </div>
                <p className="text-[10px] text-muted-foreground tabular-nums leading-tight">
                  {Math.round(vehicle.fuelLevel).toLocaleString()} L
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {hiddenCount > 0 && (
        <p className="text-[10px] text-muted-foreground mt-2">
          +{hiddenCount} more below threshold
          {hiddenCritical > 0 && ` (${hiddenCritical} critical)`}
        </p>
      )}
    </div>
  );
}
