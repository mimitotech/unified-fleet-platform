import React from 'react';
import { format } from 'date-fns';
import { X, MapPin, TrendingUp, TrendingDown, Droplets, GaugeCircle, AlertTriangle, Fuel, Truck, Clock, Calendar } from 'lucide-react';
import { FuelTransaction } from '@/types/entities';
import { cn } from '@/lib/utils';
import { formatTransactionTime } from './FuelTransactionsTable/utils';
import { effectiveSuddenDropVolume } from './fuelTheftVolume';

interface TransactionDetailModalProps {
  transaction: FuelTransaction | null;
  isOpen: boolean;
  onClose: () => void;
}

export function TransactionDetailModal({ transaction, isOpen, onClose }: TransactionDetailModalProps) {
  if (!isOpen || !transaction) return null;

  const t = transaction;
  const isMainTank = t.tank === 'main';
  const isReserveTank = t.tank === 'reserve';
  const dropVol = effectiveSuddenDropVolume(t);

  const filledMain = isMainTank && t.filled > 0 ? t.filled : 0;
  const filledReserve = isReserveTank && t.filled > 0 ? t.filled : 0;
  const usedMain = isMainTank && t.fuelUsed > 0 ? t.fuelUsed : 0;
  const usedReserve = isReserveTank && t.fuelUsed > 0 ? t.fuelUsed : 0;

  const levelMain = t.mainTankLevel ?? (isMainTank && t.finalLevel > 0 ? t.finalLevel : 0);
  const levelReserve = t.reserveTankLevel ?? (isReserveTank && t.finalLevel > 0 ? t.finalLevel : 0);

  const dropMain = isMainTank && dropVol > 0 ? dropVol : 0;
  const dropReserve = isReserveTank && dropVol > 0 ? dropVol : 0;

  const fuelType = t.fuelType || '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-background">
          <div className="flex items-center gap-2">
            <Fuel className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-lg">Transaction Details</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-md transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-start gap-2">
              <Truck className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <div className="text-xs text-muted-foreground">Vehicle</div>
                <div className="font-medium">{t.unitName}</div>
                {t.driverName && <div className="text-sm text-muted-foreground">{t.driverName}</div>}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <div className="text-xs text-muted-foreground">Date & Time</div>
                <div className="font-medium">{format(new Date(t.timestamp * 1000), 'MMM dd, yyyy')}</div>
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {formatTransactionTime(t)}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
            <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-xs text-muted-foreground">Location</div>
              <div className="text-sm">{t.location || 'Unknown location'}</div>
            </div>
          </div>

          <div className="p-3 bg-muted/30 rounded-lg">
            <div className="text-xs text-muted-foreground mb-2">
              Tank: <span className="font-medium text-foreground capitalize">{t.tank || 'Unknown'}</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">Fuel Filled</div>
            <div className="grid grid-cols-2 gap-2">
              <DetailCard label="Main Tank" value={filledMain > 0 ? `+${filledMain.toFixed(1)} L` : '—'} icon={TrendingUp} color="text-success" />
              <DetailCard label="Reserve Tank" value={filledReserve > 0 ? `+${filledReserve.toFixed(1)} L` : '—'} icon={TrendingUp} color="text-emerald-500" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">Fuel Used</div>
            <div className="grid grid-cols-3 gap-2">
              <DetailCard label="Main Tank" value={usedMain > 0 ? `${usedMain.toFixed(1)} L` : '—'} icon={Droplets} color="text-orange-500" />
              <DetailCard label="Reserve Tank" value={usedReserve > 0 ? `${usedReserve.toFixed(1)} L` : '—'} icon={Droplets} color="text-amber-500" />
              <DetailCard label="Total Used" value={usedMain + usedReserve > 0 ? `${(usedMain + usedReserve).toFixed(1)} L` : '—'} icon={Droplets} color="text-orange-600" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">Fuel Levels</div>
            <div className="grid grid-cols-3 gap-2">
              <DetailCard label="Main Tank" value={levelMain > 0 ? `${levelMain.toFixed(0)} L` : '—'} icon={GaugeCircle} color="text-cyan-500" />
              <DetailCard label="Reserve Tank" value={levelReserve > 0 ? `${levelReserve.toFixed(0)} L` : '—'} icon={GaugeCircle} color="text-teal-500" />
              <DetailCard label="Total Level" value={levelMain + levelReserve > 0 ? `${(levelMain + levelReserve).toFixed(0)} L` : '—'} icon={GaugeCircle} color="text-cyan-600" />
            </div>
          </div>

          {(dropMain > 0 || dropReserve > 0) && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-destructive flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" /> Fuel Drop Detected
              </div>
              <div className="grid grid-cols-3 gap-2">
                <DetailCard label="Main Tank" value={dropMain > 0 ? `-${dropMain.toFixed(1)} L` : '—'} icon={TrendingDown} color="text-destructive" />
                <DetailCard label="Reserve Tank" value={dropReserve > 0 ? `-${dropReserve.toFixed(1)} L` : '—'} icon={TrendingDown} color="text-red-400" />
                <DetailCard label="Total Drop" value={dropMain + dropReserve > 0 ? `-${(dropMain + dropReserve).toFixed(1)} L` : '—'} icon={TrendingDown} color="text-destructive" />
              </div>
            </div>
          )}

          {fuelType && (
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="text-sm font-medium text-muted-foreground">Fuel Type</div>
              <div className="p-2 bg-muted/30 rounded">
                <div
                  className={cn(
                    'text-sm font-medium',
                    fuelType.toUpperCase().includes('DIESEL')
                      ? 'text-amber-600'
                      : fuelType.toUpperCase().includes('PETROL')
                        ? 'text-blue-600'
                        : '',
                  )}
                >
                  {fuelType}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface DetailCardProps {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
}

function DetailCard({ label, value, icon: Icon, color }: DetailCardProps) {
  return (
    <div className="p-2 bg-muted/30 rounded">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('text-sm font-medium font-mono flex items-center gap-1', value !== '—' ? color : 'text-muted-foreground')}>
        <Icon className="w-3 h-3" />
        {value}
      </div>
    </div>
  );
}
