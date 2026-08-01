import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { formatFuelDisplay, hasFuelSensors, type FleetUnit } from '@/lib/fleetUnits';
import { useWialonFleetFuelLive, type WialonFuelFleetUnit } from '@/hooks/useWialonFuel';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  units: FleetUnit[];
  onSelect?: (unitId: string) => void;
};

function fuelTone(pct?: number | null) {
  if (pct == null) return '';
  if (pct >= 50) return 'text-status-moving font-semibold';
  if (pct >= 25) return 'text-status-idle font-semibold';
  return 'text-status-stopped font-semibold';
}

function mergeRow(unit: FleetUnit, live?: WialonFuelFleetUnit) {
  const snapshotDisplay = formatFuelDisplay(unit);
  return {
    unit,
    live,
    fuelLive: live?.fuelLive || snapshotDisplay,
    fuelFiltered: live?.fuelFiltered || '',
    fuelPercent: live?.fuelPercent ?? unit.fuelLevel,
    filled: live?.filledLiters ?? live?.fuel?.filled,
    method: live?.method || (snapshotDisplay !== '—' ? 'Fuel sensor' : hasFuelSensors(unit) ? 'No reading' : '—'),
    tripState: live?.tripStateLabel || '',
  };
}

export function WialonFuelFleetTable({ units, onSelect }: Props) {
  const { data: liveFuel, isLoading } = useWialonFleetFuelLive(units.length > 0);

  const rows = useMemo(() => {
    return units.map((u) => {
      const wialonId = u.wialonId ?? (Number.isFinite(Number(u.id)) ? Number(u.id) : null);
      const live = wialonId != null ? liveFuel?.byUnitId.get(wialonId) : undefined;
      return mergeRow(u, live);
    });
  }, [units, liveFuel]);

  return (
    <div className="relative">
      {isLoading && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 text-xs text-muted-foreground bg-card/90 px-2 py-1 rounded-md border">
          <Loader2 className="h-3 w-3 animate-spin" />
          Syncing fuel data…
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow className="bg-gradient-to-r from-primary/10 to-transparent">
            <TableHead>Vehicle</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Trip</TableHead>
            <TableHead>Live fuel</TableHead>
            <TableHead>Filtered</TableHead>
            <TableHead>Filled</TableHead>
            <TableHead>Source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ unit, fuelLive, fuelFiltered, fuelPercent, filled, method, tripState }) => (
            <TableRow
              key={unit.id}
              className={cn('even:bg-muted/10', onSelect && 'cursor-pointer hover:bg-muted/40')}
              onClick={() => onSelect?.(unit.id)}
            >
              <TableCell>
                <div className="font-medium">{unit.name}</div>
                {unit.plate && <div className="text-xs text-muted-foreground font-mono">{unit.plate}</div>}
              </TableCell>
              <TableCell>
                <StatusBadge status={unit.status} size="sm" />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{tripState || '—'}</TableCell>
              <TableCell className={cn('tabular-nums', fuelTone(fuelPercent))}>{fuelLive}</TableCell>
              <TableCell className="text-sm text-muted-foreground tabular-nums">{fuelFiltered || '—'}</TableCell>
              <TableCell className="text-sm tabular-nums">
                {filled != null && filled > 0 ? (
                  <span className="text-status-moving font-semibold">+{filled} L</span>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell className="text-xs text-primary font-medium">{method}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
