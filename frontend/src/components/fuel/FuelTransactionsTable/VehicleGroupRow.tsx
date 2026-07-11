import React from 'react';
import { format } from 'date-fns';
import { AlertTriangle, Plus, Minus, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FuelTransaction } from '@/types/entities';
import type { VehicleGroup } from './types';
import { getTransactionDisplayValues, formatTransactionTime } from './utils';
import { fuelTd } from './fuelTableCells';
import {
  FuelTransactionMetricCells,
  vehicleGroupToDisplayValues,
} from './fuelTransactionMetricCells';

interface VehicleGroupRowProps {
  group: VehicleGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onTransactionClick: (t: FuelTransaction) => void;
  visibleColumns?: string[];
}

export function VehicleGroupRow({
  group,
  isExpanded,
  onToggle,
  onTransactionClick,
  visibleColumns,
}: VehicleGroupRowProps) {
  const groupMetrics = vehicleGroupToDisplayValues(group);

  return (
    <React.Fragment>
      <tr
        className={cn(
          'border-b border-border bg-muted/40 cursor-pointer hover:bg-muted/60 transition-colors',
          isExpanded && 'bg-primary/10',
          group.alertCount > 0 && 'border-l-2 border-l-destructive',
        )}
        onClick={onToggle}
      >
        <td className={fuelTd}>
          <div className="fuel-cell-inline inline-flex items-center justify-center gap-1">
            <div className="flex items-center justify-center w-4 h-4 rounded bg-muted shrink-0">
              {isExpanded ? (
                <Minus className="w-2.5 h-2.5 text-muted-foreground" />
              ) : (
                <Plus className="w-2.5 h-2.5 text-muted-foreground" />
              )}
            </div>
            <div className="text-xs text-muted-foreground">{group.transactions.length} txns</div>
            {group.alertCount > 0 && (
              <div className="inline-flex items-center gap-0.5 text-xs text-destructive">
                <AlertTriangle className="w-3 h-3" />
                {group.alertCount}
              </div>
            )}
          </div>
        </td>
        <td className={fuelTd}>
          <div className="fuel-cell-inline inline-flex items-center justify-center gap-1 max-w-[120px]">
            <Truck className="w-3.5 h-3.5 text-primary shrink-0" />
            <div className="min-w-0 text-left">
              <div className="font-semibold truncate">{group.unitName}</div>
              {group.driverName && (
                <div className="text-xs text-muted-foreground truncate">{group.driverName}</div>
              )}
            </div>
          </div>
        </td>
        <td className={fuelTd}>
          <span className="text-xs text-muted-foreground italic">Multiple locations</span>
        </td>
        <FuelTransactionMetricCells v={groupMetrics} visibleColumns={visibleColumns} variant="periodTotal" />
      </tr>

      {isExpanded &&
        group.transactions.map((t) => {
          const v = getTransactionDisplayValues(t);
          return (
            <tr
              key={t.id}
              className="border-b border-border/50 hover:bg-muted/20 transition-colors bg-background cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onTransactionClick(t);
              }}
            >
              <td className={fuelTd}>
                <div className="fuel-cell-inline">
                  <div>{format(new Date(t.timestamp * 1000), 'MMM dd')}</div>
                  <div className="text-xs text-muted-foreground">{formatTransactionTime(t)}</div>
                </div>
              </td>
              <td className={fuelTd}>
                <span className="text-xs text-muted-foreground capitalize">{t.tank || 'N/A'} tank</span>
              </td>
              <td className={fuelTd}>
                <span className="fuel-cell-inline block max-w-[100px] text-xs text-muted-foreground line-clamp-2">
                  {t.location || '—'}
                </span>
              </td>
              <FuelTransactionMetricCells v={v} visibleColumns={visibleColumns} />
            </tr>
          );
        })}
    </React.Fragment>
  );
}
