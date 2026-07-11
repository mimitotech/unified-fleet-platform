import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Fuel } from 'lucide-react';

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

/** Live fuel levels from Wialon sensors (`unit/calc_last` / fleet snapshot). */
export function FuelLiveStrip({ units, unitLabel, isLoading }: FuelLiveStripProps) {
  const withFuel = units.filter((u) => (u.fuelLiters ?? 0) > 0 || (u.fuelPercent ?? 0) > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Fuel className="h-4 w-4 text-primary" />
          Live fuel levels
          <span className="text-xs font-normal text-muted-foreground">(Wialon sensors)</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading live sensor data…</p>
        ) : withFuel.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fuel level sensors reporting for these {unitLabel}s.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
            {withFuel.map((u) => (
              <div
                key={u.id}
                className="rounded-md border bg-muted/30 px-3 py-2 min-w-0"
              >
                <p className="text-xs font-medium truncate" title={u.name}>
                  {u.name}
                </p>
                <p className="text-sm tabular-nums font-semibold">
                  {u.fuelLiters != null && u.fuelLiters > 0
                    ? `${Math.round(u.fuelLiters)} L`
                    : u.fuelPercent != null
                      ? `${Math.round(u.fuelPercent)}%`
                      : '—'}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
