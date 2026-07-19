import React from 'react';
import { format } from 'date-fns';
import { MapPin, TrendingUp, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SheetFuelTransaction } from '@/services/googleSheetsService';
import { formatCurrency } from './utils';

interface SheetOnlyTransactionRowProps {
  tx: SheetFuelTransaction;
}

export function SheetOnlyTransactionRow({ tx }: SheetOnlyTransactionRowProps) {
  const fuelType = tx.product || '';

  return (
    <tr className="border-b border-border/50 hover:bg-muted/20 transition-colors bg-background">
      {/* Date/Time */}
      <td className="py-2.5 px-3 pl-10">
        <div className="text-sm">{format(tx.date, 'MMM dd')}</div>
        <div className="text-xs text-muted-foreground">{tx.hour}</div>
      </td>

      {/* Vehicle */}
      <td className="py-2.5 px-3">
        <span className="text-xs text-amber-600 italic">Station record</span>
      </td>

      {/* Location */}
      <td className="py-2.5 px-3">
        <div className="flex items-start gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
          <span className="text-sm text-muted-foreground line-clamp-2 max-w-[150px]">{tx.place || '—'}</span>
        </div>
      </td>

      {/* Filled (Main) - no FLS data */}
      <td className="py-2.5 px-3 text-right">
        <span className="text-sm font-mono text-muted-foreground">—</span>
      </td>

      {/* Filled (Reserve) - no FLS data */}
      <td className="py-2.5 px-3 text-right">
        <span className="text-sm font-mono text-muted-foreground">—</span>
      </td>

      {/* Filled (Station) */}
      <td className="py-2.5 px-3 text-right">
        {tx.quantity > 0 ? (
          <div className="flex items-center justify-end gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-sm font-mono font-medium text-blue-600">+{tx.quantity.toFixed(1)}</span>
          </div>
        ) : <span className="text-sm font-mono text-muted-foreground">—</span>}
      </td>

      {/* Variance - no FLS data */}
      <td className="py-2.5 px-3 text-right">
        <span className="text-sm font-mono text-muted-foreground">—</span>
      </td>

      {/* Used (Main) - no FLS data */}
      <td className="py-2.5 px-3 text-right">
        <span className="text-sm font-mono text-muted-foreground">—</span>
      </td>

      {/* Used (Reserve) - no FLS data */}
      <td className="py-2.5 px-3 text-right">
        <span className="text-sm font-mono text-muted-foreground">—</span>
      </td>

      {/* Level (Main) */}
      <td className="py-2.5 px-3 text-right">
        <span className="text-sm font-mono text-muted-foreground">—</span>
      </td>

      {/* Level (Reserve) */}
      <td className="py-2.5 px-3 text-right">
        <span className="text-sm font-mono text-muted-foreground">—</span>
      </td>

      {/* Total Level */}
      <td className="py-2.5 px-3 text-right bg-muted/20">
        <span className="text-sm font-mono text-muted-foreground">—</span>
      </td>

      {/* Drop (Main) */}
      <td className="py-2.5 px-3 text-right">
        <span className="text-sm font-mono text-muted-foreground">—</span>
      </td>

      {/* Drop (Reserve) */}
      <td className="py-2.5 px-3 text-right">
        <span className="text-sm font-mono text-muted-foreground">—</span>
      </td>

      {/* Total Drop */}
      <td className="py-2.5 px-3 text-right bg-muted/20">
        <span className="text-sm font-mono text-muted-foreground">—</span>
      </td>

      {/* Total Used */}
      <td className="py-2.5 px-3 text-right bg-muted/20">
        <span className="text-sm font-mono text-muted-foreground">—</span>
      </td>

      {/* Type */}
      <td className="py-2.5 px-3">
        {fuelType ? (
          <span className={cn(
            "text-xs px-2 py-0.5 rounded whitespace-nowrap",
            fuelType.toUpperCase().includes('DIESEL') ? "bg-amber-500/15 text-amber-600" :
            fuelType.toUpperCase().includes('PETROL') ? "bg-blue-500/15 text-blue-600" :
            "bg-muted text-foreground"
          )}>
            {fuelType}
          </span>
        ) : <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">—</span>}
      </td>

      {/* Cost */}
      <td className="py-2.5 px-3 text-sm font-mono text-right">
        {tx.amount > 0 ? formatCurrency(tx.amount) : '—'}
      </td>

      {/* Card No */}
      <td className="py-2.5 px-3">
        {tx.cardNumber ? (
          <div className="flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{tx.cardNumber}</span>
          </div>
        ) : <span className="text-sm text-muted-foreground">—</span>}
      </td>
    </tr>
  );
}

