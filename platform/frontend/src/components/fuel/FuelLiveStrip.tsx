import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Fuel } from 'lucide-react';
import { cn } from '@/lib/utils';

export type FuelLiveUnit = {
  id: string;
  name: string;
  fuelLiters?: number;
  fuelPercent?: number;
};

interface FuelLiveStripProps {
  units: FuelLiveUnit[];
  unitLabel: string;
  isLoading?: boolean;
}

function levelTone(percent?: number, liters?: number): {
  chip: string;
  bar: string;
  label: string;
} {
  const p =
    percent != null && percent > 0
      ? percent
      : liters != null && liters > 0
        ? undefined
        : 0;
  if (p == null) {
    if ((liters ?? 0) <= 0) {
      return { chip: 'border-muted bg-muted/40 text-muted-foreground', bar: 'bg-muted-foreground/40', label: 'No data' };
    }
    return { chip: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100', bar: 'bg-sky-500', label: 'Live' };
  }
  if (p < 15) {
    return { chip: 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100', bar: 'bg-red-500', label: 'Critical' };
  }
  if (p < 30) {
    return { chip: 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100', bar: 'bg-amber-500', label: 'Low' };
  }
  return { chip: 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100', bar: 'bg-emerald-500', label: 'OK' };
}

/** Compact single-row live FLS chips — color by fill % when available. */
export function FuelLiveStrip({ units, unitLabel, isLoading }: FuelLiveStripProps) {
  const withFuel = units.filter((u) => (u.fuelLiters ?? 0) > 0 || (u.fuelPercent ?? 0) > 0);

  return (
    <Card className="branded-panel overflow-hidden shadow-none">
      <CardHeader className="py-2.5 px-4">
        <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
          <Fuel className="h-4 w-4 text-primary shrink-0" />
          Live fuel levels
          <span className="text-xs font-normal text-muted-foreground">
            {withFuel.length} {unitLabel}
            {withFuel.length === 1 ? '' : 's'}
          </span>
          <span className="ml-auto flex items-center gap-2 text-[10px] font-normal text-muted-foreground">
            <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-500" /> OK</span>
            <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-amber-500" /> Low</span>
            <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-red-500" /> Critical</span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading live sensor data…</p>
        ) : withFuel.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fuel level sensors reporting for these {unitLabel}s.</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {withFuel.map((u) => {
              const tone = levelTone(u.fuelPercent, u.fuelLiters);
              const pct = u.fuelPercent != null && u.fuelPercent > 0 ? Math.min(100, Math.round(u.fuelPercent)) : null;
              return (
                <div
                  key={u.id}
                  className={cn(
                    'shrink-0 w-[132px] rounded-md border px-2.5 py-1.5 min-w-0 transition-colors',
                    tone.chip,
                  )}
                  title={`${u.name} · ${tone.label}`}
                >
                  <p className="text-[11px] font-medium truncate leading-tight">{u.name}</p>
                  <p className="text-sm tabular-nums font-semibold leading-tight mt-0.5">
                    {u.fuelLiters != null && u.fuelLiters > 0
                      ? `${Math.round(u.fuelLiters)} L`
                      : pct != null
                        ? `${pct}%`
                        : '—'}
                    {pct != null && (
                      <span className="text-[10px] font-normal opacity-80 ml-1">{pct}%</span>
                    )}
                  </p>
                  <div className="mt-1 h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', tone.bar)}
                      style={{
                        width: `${pct != null ? pct : 0}%`,
                        opacity: pct != null ? 1 : 0.35,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
