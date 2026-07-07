import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { FuelLedgerSummary } from '@/lib/fuelTypes';
import { ArrowRight, Minus, Plus, Scale } from 'lucide-react';

type Props = {
  ledger: FuelLedgerSummary;
  compact?: boolean;
};

const CONFIDENCE_STYLE = {
  high: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400',
  medium: 'border-amber-500/40 text-amber-700 dark:text-amber-400',
  low: 'border-muted-foreground/40 text-muted-foreground',
};

function LedgerCell({
  label,
  value,
  unit = 'L',
  accent,
}: {
  label: string;
  value: number;
  unit?: string;
  accent?: string;
}) {
  return (
    <div className={cn('rounded-lg border bg-muted/30 px-3 py-2 min-w-0', accent)}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{label}</div>
      <div className="text-lg font-semibold tabular-nums leading-tight">
        {value.toLocaleString()}
        <span className="text-xs font-normal text-muted-foreground ml-0.5">{unit}</span>
      </div>
    </div>
  );
}

export function FuelBalanceCard({ ledger, compact }: Props) {
  const remaining = ledger.liveRemaining ?? ledger.computedRemaining;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Scale className="h-3.5 w-3.5" />
        <span>
          {ledger.openingFuel} + {ledger.totalFilled} − {ledger.totalConsumed} − {ledger.totalLost} ={' '}
          <strong className="text-foreground">{remaining} L</strong>
        </span>
        <Badge variant="outline" className={cn('text-[10px]', CONFIDENCE_STYLE[ledger.confidence])}>
          {ledger.confidence} confidence
        </Badge>
      </div>
    );
  }

  return (
    <div className="fleet-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Scale className="h-4 w-4 text-primary" />
          Fuel balance
        </div>
        <Badge variant="outline" className={cn('text-[10px]', CONFIDENCE_STYLE[ledger.confidence])}>
          {ledger.confidence} confidence
          {!ledger.balanced && ledger.variance !== 0 ? ` · Δ ${ledger.variance} L` : ''}
        </Badge>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Opening + filled − used − lost = remaining (sensor-reconciled when live data is available)
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 items-stretch">
        <LedgerCell label="Opening" value={ledger.openingFuel} />
        <div className="hidden lg:flex items-center justify-center text-muted-foreground">
          <Plus className="h-4 w-4" />
        </div>
        <LedgerCell label="Filled" value={ledger.totalFilled} accent="border-primary/20" />
        <div className="hidden lg:flex items-center justify-center text-muted-foreground">
          <Minus className="h-4 w-4" />
        </div>
        <LedgerCell label="Used" value={ledger.totalConsumed} accent="border-destructive/20" />
        <div className="hidden lg:flex items-center justify-center text-muted-foreground">
          <Minus className="h-4 w-4" />
        </div>
        <LedgerCell label="Lost" value={ledger.totalLost} accent="border-amber-500/20" />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <ArrowRight className="h-4 w-4 text-primary shrink-0" />
        <LedgerCell
          label={ledger.liveRemaining != null ? 'Remaining (live)' : 'Remaining (computed)'}
          value={remaining}
          accent="border-primary/30 bg-primary/5 col-span-2 flex-1"
        />
      </div>
    </div>
  );
}
