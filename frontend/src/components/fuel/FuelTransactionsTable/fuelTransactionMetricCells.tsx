import { CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fuelTd } from './fuelTableCells';
import { formatCurrency } from './utils';
import type { TransactionDisplayValues } from './types';

function NumCell({
  value,
  formatted,
  className,
  weightClass = 'font-medium',
}: {
  value: number;
  formatted: string;
  className?: string;
  weightClass?: string;
}) {
  return (
    <td className={fuelTd}>
      {value > 0 ? (
        <span className={cn('font-mono', weightClass, className)}>{formatted}</span>
      ) : (
        <span className="font-mono text-muted-foreground">—</span>
      )}
    </td>
  );
}

function SignedCell({
  value,
  positivePrefix = '+',
  className,
  weightClass = 'font-medium',
}: {
  value: number;
  positivePrefix?: string;
  className?: string;
  weightClass?: string;
}) {
  return (
    <td className={fuelTd}>
      {value > 0 ? (
        <span className={cn('font-mono', weightClass, className)}>
          {positivePrefix}
          {value.toFixed(1)}
        </span>
      ) : value < 0 ? (
        <span className={cn('font-mono', weightClass, className)}>{value.toFixed(1)}</span>
      ) : (
        <span className="font-mono text-muted-foreground">—</span>
      )}
    </td>
  );
}

/** Shared metric columns — Filled(Station) through Card No */
export function FuelTransactionMetricCells({
  v,
  visibleColumns,
  variant = 'event',
}: {
  v: TransactionDisplayValues;
  visibleColumns?: string[];
  /** periodTotal = collapsed unit row; event = single transaction line */
  variant?: 'event' | 'periodTotal';
}) {
  const show = (key: string) => !visibleColumns?.length || visibleColumns.includes(key);
  const totalClass = variant === 'periodTotal' ? 'font-semibold' : 'font-medium';
  return (
    <>
      {show('filledMain') && (
        <NumCell
          value={v.filledMain}
          formatted={`+${v.filledMain.toFixed(1)}`}
          className="text-success"
          weightClass={totalClass}
        />
      )}
      {show('filledReserve') && (
        <NumCell
          value={v.filledReserve}
          formatted={`+${v.filledReserve.toFixed(1)}`}
          className="text-emerald-500"
          weightClass={totalClass}
        />
      )}
      {show('filledStation') && (
        <NumCell
          value={v.filledStation}
          formatted={`+${v.filledStation.toFixed(1)}`}
          className="text-blue-600"
          weightClass={totalClass}
        />
      )}
      {show('variance') && (
        <SignedCell
        value={v.variance}
        positivePrefix={v.variance > 0 ? '+' : ''}
        className={
          v.variance > 0 ? 'text-warning' : v.variance < 0 ? 'text-destructive' : 'text-muted-foreground'
        }
        weightClass={totalClass}
      />
      )}
      {show('usedMain') && (
        <NumCell value={v.usedMain} formatted={v.usedMain.toFixed(1)} className="text-orange-600" weightClass={totalClass} />
      )}
      {show('usedReserve') && (
        <NumCell value={v.usedReserve} formatted={v.usedReserve.toFixed(1)} className="text-amber-500" weightClass={totalClass} />
      )}
      {show('levelMain') && (
        <NumCell value={v.levelMain} formatted={`${v.levelMain.toFixed(0)} L`} weightClass={totalClass} />
      )}
      {show('levelReserve') && (
        <NumCell value={v.levelReserve} formatted={`${v.levelReserve.toFixed(0)} L`} className="text-teal-600" weightClass={totalClass} />
      )}
      {show('totalLevel') && (
        <td className={cn(fuelTd, variant === 'periodTotal' && 'bg-muted/20')}>
        {v.totalLevel > 0 ? (
          <span className={cn('font-mono text-cyan-600', totalClass)}>{v.totalLevel.toFixed(0)} L</span>
        ) : (
          <span className="font-mono text-muted-foreground">—</span>
        )}
      </td>
      )}
      {show('dropMain') && (
        <NumCell value={v.dropMain} formatted={`-${v.dropMain.toFixed(1)}`} className="text-destructive" weightClass={totalClass} />
      )}
      {show('dropReserve') && (
        <NumCell value={v.dropReserve} formatted={`-${v.dropReserve.toFixed(1)}`} className="text-red-400" weightClass={totalClass} />
      )}
      {show('totalDrop') && (
        <td className={cn(fuelTd, 'bg-muted/20')}>
        {v.totalDrop > 0 ? (
          <span className={cn('font-mono text-destructive', totalClass)}>-{v.totalDrop.toFixed(1)}</span>
        ) : (
          <span className="font-mono text-muted-foreground">—</span>
        )}
      </td>
      )}
      {show('totalUsed') && (
        <td className={cn(fuelTd, 'bg-muted/20')}>
        {v.totalUsed > 0 ? (
          <span className={cn('font-mono text-orange-600', totalClass)}>{v.totalUsed.toFixed(1)}</span>
        ) : (
          <span className="font-mono text-muted-foreground">—</span>
        )}
      </td>
      )}
      {show('fuelType') && <td className={fuelTd}>
        {v.totalFilledFls > 0 && v.fuelType ? (
          <span
            className={cn(
              'text-xs px-1.5 py-0.5 rounded whitespace-nowrap inline-block',
              v.fuelType.toUpperCase().includes('DIESEL')
                ? 'bg-amber-500/15 text-amber-600'
                : v.fuelType.toUpperCase().includes('PETROL')
                  ? 'bg-blue-500/15 text-blue-600'
                  : 'bg-muted text-foreground',
            )}
          >
            {v.fuelType}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>}
      {show('cost') && <td className={fuelTd}>
        {v.totalCost > 0 ? (
          <span className="font-mono text-xs">{formatCurrency(v.totalCost)}</span>
        ) : (
          <span className="font-mono text-muted-foreground">—</span>
        )}
      </td>}
      {show('cardNo') && <td className={fuelTd}>
        {v.cardNumber ? (
          <span className="inline-flex items-center justify-center gap-1 text-xs text-muted-foreground max-w-[88px] mx-auto">
            <CreditCard className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{v.cardNumber}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>}
    </>
  );
}

export function vehicleGroupToDisplayValues(group: {
  filledMain: number;
  filledReserve: number;
  filledStation: number;
  variance: number;
  usedMain: number;
  usedReserve: number;
  levelMain: number;
  levelReserve: number;
  dropMain: number;
  dropReserve: number;
  totalCost: number;
  liveLevel?: number;
  fuelType?: string;
  cardNumber?: string;
}): TransactionDisplayValues {
  const totalLevel =
    group.liveLevel && group.liveLevel > 0
      ? group.liveLevel
      : group.levelMain + group.levelReserve;
  return {
    filledMain: group.filledMain,
    filledReserve: group.filledReserve,
    filledStation: group.filledStation,
    variance: group.variance,
    usedMain: group.usedMain,
    usedReserve: group.usedReserve,
    levelMain: group.levelMain,
    levelReserve: group.levelReserve,
    dropMain: group.dropMain,
    dropReserve: group.dropReserve,
    totalLevel,
    totalDrop: group.dropMain + group.dropReserve,
    totalUsed: group.usedMain + group.usedReserve,
    totalFilledFls: group.filledMain + group.filledReserve,
    fuelType: group.fuelType ?? '',
    totalCost: group.totalCost,
    cardNumber: group.cardNumber ?? '',
  };
}
