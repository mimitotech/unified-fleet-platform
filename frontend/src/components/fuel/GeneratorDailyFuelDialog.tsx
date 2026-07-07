import { format as formatDate, isValid as isValidDate, parseISO } from 'date-fns';
import { MapPin } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { EnrichedGenerator } from '@/types';
import type { GeneratorDailyFuel } from '@/services/fleet/generatorDailyFuel';

/**
 * GeneratorDailyFuelDialog — modal showing the per-day fuel breakdown for a
 * single generator across the selected reporting window. Replaces the inline
 * accordion-style expansion on Generators by Site so the daily list stays
 * scrollable and doesn't push the surrounding table layout around.
 */

interface GeneratorDailyFuelDialogProps {
  generator: EnrichedGenerator | null;
  entries?: GeneratorDailyFuel[];
  fromDate?: string;
  toDate?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatDailyDate(iso: string): string {
  const parsed = parseISO(iso);
  return isValidDate(parsed) ? formatDate(parsed, 'EEE, dd MMM yyyy') : iso;
}

function formatRange(fromDate?: string, toDate?: string): string | null {
  if (!fromDate || !toDate) return null;
  const from = parseISO(fromDate);
  const to = parseISO(toDate);
  if (!isValidDate(from) || !isValidDate(to)) return null;
  return `${formatDate(from, 'dd MMM yyyy')} – ${formatDate(to, 'dd MMM yyyy')}`;
}

export function GeneratorDailyFuelDialog({
  generator,
  entries,
  fromDate,
  toDate,
  open,
  onOpenChange,
}: GeneratorDailyFuelDialogProps) {
  // Drained litres are folded into "Consumed" for users — for stationary
  // generators a sudden drop almost always reflects burn during operation
  // even when it falls outside the engine-on window we use for classification.
  const totals = (entries ?? []).reduce(
    (acc, e) => {
      acc.runtimeHours += e.runtimeHours;
      acc.consumed += e.consumed + e.drained;
      acc.filled += e.filled;
      return acc;
    },
    { runtimeHours: 0, consumed: 0, filled: 0 },
  );

  const rangeLabel = formatRange(fromDate, toDate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {generator?.name ?? 'Generator'}
            {generator?.assetId && (
              <span className="text-xs font-mono text-muted-foreground">
                {generator.assetId}
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {rangeLabel && <span>{rangeLabel}</span>}
            {generator?.locationName && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {generator.locationName}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {!entries || entries.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-6 text-center">
            No fuel activity recorded for this generator within the selected window.
          </p>
        ) : (
          <ScrollArea className="max-h-[60vh] rounded-md border border-border/40 bg-background/60">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-background/95 backdrop-blur">
                <tr className="text-left text-muted-foreground border-b border-border/40">
                  <th className="py-2 px-3 font-medium">Date</th>
                  <th className="py-2 px-3 font-medium text-right">Engine Hours</th>
                  <th className="py-2 px-3 font-medium text-right">Consumed (L)</th>
                  <th className="py-2 px-3 font-medium text-right">Filled (L)</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const consumedTotal = e.consumed + e.drained;
                  const isZero =
                    consumedTotal === 0 && e.filled === 0 && e.runtimeHours === 0;
                  return (
                    <tr
                      key={e.date}
                      className={cn(
                        'border-b border-border/20 last:border-0',
                        isZero && 'text-muted-foreground/70',
                      )}
                    >
                      <td className="py-1.5 px-3">{formatDailyDate(e.date)}</td>
                      <td className="py-1.5 px-3 text-right font-mono tabular-nums">
                        {e.runtimeHours > 0 ? `${e.runtimeHours.toFixed(1)} h` : '—'}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono tabular-nums">
                        {consumedTotal > 0 ? Math.round(consumedTotal).toLocaleString() : '—'}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono tabular-nums">
                        {e.filled > 0 ? Math.round(e.filled).toLocaleString() : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 bg-background/95 backdrop-blur">
                <tr className="border-t border-border/40 font-medium">
                  <td className="py-2 px-3">Total</td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums">
                    {totals.runtimeHours.toFixed(1)} h
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums">
                    {Math.round(totals.consumed).toLocaleString()}
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums">
                    {Math.round(totals.filled).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
