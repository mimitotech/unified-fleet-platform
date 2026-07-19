import { useState, useMemo } from 'react';
import { format, formatDistanceToNow, isValid } from 'date-fns';
import { AlertTriangle, Clock, MapPin, Truck, TrendingDown, Eye } from 'lucide-react';
import { FuelEvent } from '@/types/entities';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface FuelDrainAlertsProps {
  alerts: FuelEvent[];
}

/** Alert grouped by vehicle */
interface VehicleAlertGroup {
  unitName: string;
  unitId: string;
  alerts: FuelEvent[];
  totalVolume: number;
  latestAlert: FuelEvent;
}

/**
 * Parse timestamp from various formats (ISO string, Unix timestamp, time string)
 */
function parseTimestamp(timestamp: string | number): Date | null {
  if (!timestamp) return null;

  // If it's a number, treat as Unix timestamp
  if (typeof timestamp === 'number') {
    const date = new Date(timestamp * 1000);
    return isValid(date) ? date : null;
  }

  // If it's a time-only string like "05:33:46", we can't create a valid date
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(timestamp)) {
    return null;
  }

  // Try parsing as ISO string or other date format
  const date = new Date(timestamp);
  return isValid(date) ? date : null;
}

/**
 * Format timestamp for relative display (e.g., "2 hours ago")
 */
function formatRelativeTime(timestamp: string | number): string {
  const date = parseTimestamp(timestamp);
  if (date) {
    try {
      return formatDistanceToNow(date, { addSuffix: true });
    } catch {
      return String(timestamp);
    }
  }
  return String(timestamp);
}

/**
 * Format timestamp for date display (e.g., "Dec 30")
 */
function formatDateOnly(timestamp: string | number): string {
  const date = parseTimestamp(timestamp);
  if (date) {
    try {
      return format(date, 'MMM dd');
    } catch {
      return '';
    }
  }
  return '';
}

/**
 * Format timestamp for time display (e.g., "14:39:11")
 */
function formatTimeOnly(timestamp: string | number): string {
  const date = parseTimestamp(timestamp);
  if (date) {
    try {
      return format(date, 'HH:mm:ss');
    } catch {
      return String(timestamp);
    }
  }
  // If it's already a time-only string, return as-is
  return String(timestamp);
}

export function FuelDrainAlerts({ alerts }: FuelDrainAlertsProps) {
  const [selectedVehicle, setSelectedVehicle] = useState<string>('all');
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<FuelEvent | null>(null);

  // Group alerts by vehicle
  const vehicleGroups = useMemo((): VehicleAlertGroup[] => {
    const groupMap = new Map<string, VehicleAlertGroup>();

    for (const alert of alerts) {
      const existing = groupMap.get(alert.unitName);
      if (existing) {
        existing.alerts.push(alert);
        existing.totalVolume += Math.abs(alert.volumeChange);
        // Update latest alert if this one is newer
        const existingDate = parseTimestamp(existing.latestAlert.timestamp);
        const alertDate = parseTimestamp(alert.timestamp);
        if (alertDate && existingDate && alertDate > existingDate) {
          existing.latestAlert = alert;
        }
      } else {
        groupMap.set(alert.unitName, {
          unitName: alert.unitName,
          unitId: alert.unitId,
          alerts: [alert],
          totalVolume: Math.abs(alert.volumeChange),
          latestAlert: alert,
        });
      }
    }

    return Array.from(groupMap.values()).sort((a, b) =>
      b.totalVolume - a.totalVolume // Sort by total volume descending
    );
  }, [alerts]);

  // Filter alerts based on selected vehicle
  const filteredAlerts = useMemo(() => {
    if (selectedVehicle === 'all') return alerts;
    return alerts.filter(a => a.unitName === selectedVehicle);
  }, [alerts, selectedVehicle]);

  const hasMultipleVehicles = vehicleGroups.length > 1;

  // Open detail modal
  const openDetail = (alert: FuelEvent) => {
    setSelectedAlert(alert);
    setDetailModalOpen(true);
  };

  if (alerts.length === 0) {
    return null;
  }

  return (
    <>
      <div className="fleet-card border-destructive/40 py-2.5">
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            <h3 className="fuel-section-title">Fuel Sudden Drop Alert</h3>
            <span className="text-[10px] bg-destructive/15 text-destructive px-1.5 py-0.5 rounded-full shrink-0">
              {alerts.length}
            </span>
            {hasMultipleVehicles && (
              <span className="text-xs text-muted-foreground border-l border-border pl-2 ml-1">
                {vehicleGroups.length} assets affected
              </span>
            )}
          </div>

          {/* Asset filter */}
          {hasMultipleVehicles && (
            <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <Truck className="w-3.5 h-3.5 mr-1.5" />
                <SelectValue placeholder="Filter by asset" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All assets ({alerts.length})</SelectItem>
                {vehicleGroups.map((group) => (
                  <SelectItem key={group.unitName} value={group.unitName}>
                    <div className="flex items-center justify-between w-full gap-2">
                      <span>{group.unitName}</span>
                      <span className="text-destructive font-mono text-xs">
                        {group.alerts.length} alerts
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Alerts Table */}
        <div className="overflow-x-auto">
          <table className="w-full fuel-compact-table">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-1.5 px-2 text-[10px] font-medium text-muted-foreground uppercase">Date & Time</th>
                <th className="text-left py-1.5 px-2 text-[10px] font-medium text-muted-foreground uppercase">Asset</th>
                <th className="text-right py-1.5 px-2 text-[10px] font-medium text-muted-foreground uppercase">Volume</th>
                <th className="text-right py-1.5 px-2 text-[10px] font-medium text-muted-foreground uppercase">Before</th>
                <th className="text-right py-1.5 px-2 text-[10px] font-medium text-muted-foreground uppercase">After</th>
                <th className="text-center py-1.5 px-2 text-[10px] font-medium text-muted-foreground uppercase">Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredAlerts.slice(0, 5).map((alert, idx) => (
                <tr key={idx} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-2 px-3 text-sm">
                    <div className="flex flex-col">
                      {formatDateOnly(alert.timestamp) && (
                        <span className="font-medium">{formatDateOnly(alert.timestamp)}</span>
                      )}
                      <span className={formatDateOnly(alert.timestamp) ? "text-xs text-muted-foreground" : "font-medium"}>
                        {formatTimeOnly(alert.timestamp)}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-sm font-medium">{alert.unitName}</td>
                  <td className="py-2 px-3 text-sm font-mono text-right text-destructive">
                    -{Math.abs(alert.volumeChange).toFixed(1)} L
                  </td>
                  <td className="py-2 px-3 text-sm font-mono text-right">{alert.levelBefore.toFixed(0)} L</td>
                  <td className="py-2 px-3 text-sm font-mono text-right">{alert.levelAfter.toFixed(0)} L</td>
                  <td className="py-2 px-3 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => openDetail(alert)}
                    >
                      <Eye className="w-4 h-4 text-muted-foreground hover:text-primary" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Show more indicator */}
        {filteredAlerts.length > 5 && (
          <div className="mt-3 text-center">
            <span className="text-xs text-muted-foreground">
              +{filteredAlerts.length - 5} more alerts
            </span>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Fuel Sudden Drop Alert Details
            </DialogTitle>
            <DialogDescription>
              Potential fuel theft or abnormal drain detected
            </DialogDescription>
          </DialogHeader>

          {selectedAlert && (
            <div className="space-y-4 py-4">
              {/* Vehicle Info */}
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <Truck className="w-8 h-8 text-primary" />
                <div>
                  <p className="font-semibold">{selectedAlert.unitName}</p>
                  <p className="text-sm text-muted-foreground">Unit ID: {selectedAlert.unitId}</p>
                </div>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase font-medium">Date & Time</p>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      {formatDateOnly(selectedAlert.timestamp) && (
                        <p className="text-sm font-medium">{formatDateOnly(selectedAlert.timestamp)}</p>
                      )}
                      <p className={formatDateOnly(selectedAlert.timestamp) ? "text-xs text-muted-foreground" : "text-sm font-medium"}>
                        {formatTimeOnly(selectedAlert.timestamp)}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase font-medium">Time Ago</p>
                  <p className="text-sm">{formatRelativeTime(selectedAlert.timestamp)}</p>
                </div>
              </div>

              {/* Volume Details */}
              <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/30">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-muted-foreground">Volume Lost</span>
                  <span className="text-2xl font-mono font-bold text-destructive">
                    -{Math.abs(selectedAlert.volumeChange).toFixed(1)} L
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <span className="text-muted-foreground">Before: </span>
                    <span className="font-mono">{selectedAlert.levelBefore.toFixed(1)} L</span>
                  </div>
                  <TrendingDown className="w-4 h-4 text-destructive" />
                  <div>
                    <span className="text-muted-foreground">After: </span>
                    <span className="font-mono">{selectedAlert.levelAfter.toFixed(1)} L</span>
                  </div>
                </div>
              </div>

              {/* Location */}
              {selectedAlert.location && (selectedAlert.location.lat !== 0 || selectedAlert.location.lng !== 0) && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase font-medium">Location</p>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm">
                      {selectedAlert.location.lat.toFixed(6)}, {selectedAlert.location.lng.toFixed(6)}
                    </p>
                  </div>
                </div>
              )}

              {/* Additional Info */}
              {(selectedAlert.duration || selectedAlert.mileage) && (
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
                  {selectedAlert.duration && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground uppercase font-medium">Duration</p>
                      <p className="text-sm">{selectedAlert.duration}</p>
                    </div>
                  )}
                  {selectedAlert.mileage && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground uppercase font-medium">Mileage</p>
                      <p className="text-sm font-mono">{selectedAlert.mileage.toFixed(1)} km</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setDetailModalOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

