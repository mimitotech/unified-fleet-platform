import { format } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { FuelDailySummary, FuelLedgerEntry } from '@/lib/fuelTypes';

type Props = {
  dailySummaries?: FuelDailySummary[];
  ledgerPreview?: FuelLedgerEntry[];
  unitName?: string | null;
};

const EVENT_STYLE: Record<string, string> = {
  refill: 'bg-primary/10 text-primary',
  consumption: 'bg-destructive/10 text-destructive',
  theft: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  opening: 'bg-muted text-muted-foreground',
  balance: 'bg-muted text-muted-foreground',
};

export function FuelLedgerPanel({ dailySummaries = [], ledgerPreview = [], unitName }: Props) {
  const days = unitName
    ? dailySummaries.filter((d) => d.unitName === unitName)
    : dailySummaries;

  const events = ledgerPreview.slice().reverse().slice(0, 40);

  if (!days.length && !events.length) return null;

  return (
    <div className="space-y-3">
      {days.length > 0 && (
        <div className="fleet-card overflow-x-auto">
          <h3 className="text-sm font-semibold px-3 pt-3 pb-2">Daily fuel summary</h3>
          <Table>
            <TableHeader>
              <TableRow>
                {!unitName && <TableHead className="text-xs">Asset</TableHead>}
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-right text-xs">Opening</TableHead>
                <TableHead className="text-right text-xs">Filled</TableHead>
                <TableHead className="text-right text-xs">Used</TableHead>
                <TableHead className="text-right text-xs">Lost</TableHead>
                <TableHead className="text-right text-xs">Remaining</TableHead>
                <TableHead className="text-right text-xs">Distance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {days.slice(-31).map((d) => (
                <TableRow key={`${d.unitId}-${d.date}`} className="h-8">
                  {!unitName && <TableCell className="text-xs py-1">{d.unitName}</TableCell>}
                  <TableCell className="text-xs py-1 tabular-nums">{d.date}</TableCell>
                  <TableCell className="text-right text-xs py-1 tabular-nums">{d.openingFuel} L</TableCell>
                  <TableCell className="text-right text-xs py-1 tabular-nums text-primary">{d.filled} L</TableCell>
                  <TableCell className="text-right text-xs py-1 tabular-nums text-destructive">{d.consumed} L</TableCell>
                  <TableCell className="text-right text-xs py-1 tabular-nums text-amber-600">{d.lost} L</TableCell>
                  <TableCell className="text-right text-xs py-1 tabular-nums font-medium">{d.closingFuel} L</TableCell>
                  <TableCell className="text-right text-xs py-1 tabular-nums">{d.mileage ? `${d.mileage} km` : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {events.length > 0 && (
        <div className="fleet-card overflow-x-auto">
          <h3 className="text-sm font-semibold px-3 pt-3 pb-2">Fuel event ledger</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Time</TableHead>
                {!unitName && <TableHead className="text-xs">Asset</TableHead>}
                <TableHead className="text-xs">Event</TableHead>
                <TableHead className="text-right text-xs">In (+)</TableHead>
                <TableHead className="text-right text-xs">Out (−)</TableHead>
                <TableHead className="text-right text-xs">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => (
                <TableRow key={e.id} className="h-8">
                  <TableCell className="text-xs py-1 whitespace-nowrap">
                    {e.timestamp ? format(new Date(e.timestamp * 1000), 'MMM d HH:mm') : e.date}
                  </TableCell>
                  {!unitName && <TableCell className="text-xs py-1">{e.unitName}</TableCell>}
                  <TableCell className="text-xs py-1">
                    <Badge variant="outline" className={`text-[10px] font-normal ${EVENT_STYLE[e.eventType] ?? ''}`}>
                      {e.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-xs py-1 tabular-nums text-primary">
                    {e.amountIn > 0 ? `${e.amountIn} L` : '—'}
                  </TableCell>
                  <TableCell className="text-right text-xs py-1 tabular-nums text-destructive">
                    {e.amountOut > 0 ? `${e.amountOut} L` : '—'}
                  </TableCell>
                  <TableCell className="text-right text-xs py-1 tabular-nums">
                    {e.balanceAfter != null ? `${e.balanceAfter} L` : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
