import { format } from 'date-fns';
import { Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FuelTransaction } from '@/types/entities';
import { getTransactionDisplayValues, formatTransactionTime } from './utils';
import { fuelTd, fuelStickyDateTd, fuelStickyUnitTd } from './fuelTableCells';
import { FuelTransactionMetricCells } from './fuelTransactionMetricCells';

interface FuelTransactionRowProps {
  transaction: FuelTransaction;
  onClick: () => void;
  isNested?: boolean;
  visibleColumns?: string[];
}

export function FuelTransactionRow({
  transaction: t,
  onClick,
  isNested = false,
  visibleColumns,
}: FuelTransactionRowProps) {
  const v = getTransactionDisplayValues(t);

  return (
    <tr
      className={cn(
        'border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer',
        isNested && 'bg-background',
      )}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <td className={fuelStickyDateTd}>
        <div className="fuel-cell-inline">
          <div>{format(new Date(t.timestamp * 1000), 'MMM dd')}</div>
          <div className="text-xs text-muted-foreground">{formatTransactionTime(t)}</div>
        </div>
      </td>
      <td className={fuelStickyUnitTd}>
        <div className="fuel-cell-inline inline-flex items-center justify-center gap-1 max-w-[140px]">
          <Truck className="w-3.5 h-3.5 text-primary shrink-0" />
          <div className="min-w-0 text-left">
            <div className="font-medium truncate" title={t.unitName}>{t.unitName}</div>
            {t.driverName && <div className="text-xs text-muted-foreground truncate">{t.driverName}</div>}
          </div>
        </div>
      </td>
      <td className={fuelTd}>
        <span className="fuel-cell-inline block max-w-[140px] text-xs text-muted-foreground line-clamp-2 mx-auto" title={t.location || undefined}>
          {t.location || '—'}
        </span>
      </td>
      <FuelTransactionMetricCells v={v} visibleColumns={visibleColumns} />
    </tr>
  );
}
