import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FuelSensorSlotValue, FuelAssetFlags, WialonFuelAssetRow } from '@/lib/fuelTypes';
import { formatDistanceToNow } from 'date-fns';
import { fmtLiters, fmtSlot, fuelTone } from '@/components/fuel/fuelFormat';

type Props = {
  assets: WialonFuelAssetRow[];
  isLoading?: boolean;
};

function AssetFlags({ flags }: { flags: FuelAssetFlags }) {
  const items: string[] = [];
  if (flags.missingFuelLevel) items.push('No fuel level sensor');
  if (flags.hasStaleReading) items.push('Stale reading');
  if (flags.isFilling) items.push('Filling');
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {items.map((label) => (
        <Badge
          key={label}
          variant="outline"
          className={cn(
            'text-[9px] px-1 py-0',
            label === 'Filling'
              ? 'border-status-moving text-status-moving'
              : 'border-amber-500/50 text-amber-700 dark:text-amber-400'
          )}
        >
          {label === 'No fuel level sensor' && <AlertTriangle className="h-2.5 w-2.5 mr-0.5 inline" />}
          {label}
        </Badge>
      ))}
    </div>
  );
}

export function FuelAssetOverviewTable({ assets, isLoading }: Props) {
  return (
    <div className="relative overflow-x-auto">
      {isLoading && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 text-xs text-muted-foreground bg-card/90 px-2 py-1 rounded-md border">
          <Loader2 className="h-3 w-3 animate-spin" />
          Reading Wialon sensors…
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow className="bg-gradient-to-r from-primary/10 to-transparent">
            <TableHead className="min-w-[180px]">Asset</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right min-w-[90px]">Fuel Level</TableHead>
            <TableHead className="text-right min-w-[80px]">FLS Battery</TableHead>
            <TableHead className="text-right min-w-[90px]">FLS Temperature</TableHead>
            <TableHead className="text-right">Total (L)</TableHead>
            <TableHead className="text-right">Tank %</TableHead>
            <TableHead className="text-right">Filling</TableHead>
            <TableHead className="text-right">Engine hrs</TableHead>
            <TableHead className="text-right">Updated</TableHead>
            <TableHead className="min-w-[100px]">Other sensors</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assets.map((a) => {
            const slots = a.sensorSlots ?? {
              fuelLevel: null,
              flsBattery: null,
              flsTemperature: null,
              other: [] as FuelSensorSlotValue[],
            };
            return (
              <TableRow key={a.unitId} className="even:bg-muted/10 hover:bg-muted/30">
                <TableCell className="max-w-[240px]">
                  <div className="font-medium text-sm leading-snug break-words">{a.name}</div>
                  {a.plate && <div className="text-xs text-muted-foreground font-mono">{a.plate}</div>}
                  {a.flags && <AssetFlags flags={a.flags} />}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {a.assetType}
                  </Badge>
                </TableCell>
                <TableCell>
                  <StatusBadge status={a.status as 'moving' | 'stopped' | 'idle' | 'offline'} size="sm" />
                </TableCell>
                <TableCell className="text-right tabular-nums text-xs">
                  <div className="font-medium">{fmtSlot(slots.fuelLevel)}</div>
                  {slots.fuelLevel && (
                    <div className="text-[10px] text-muted-foreground truncate max-w-[100px]" title={slots.fuelLevel.name}>
                      {slots.fuelLevel.name}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                  <div>{fmtSlot(slots.flsBattery)}</div>
                  {slots.flsBattery && (
                    <div className="text-[10px] truncate max-w-[80px]" title={slots.flsBattery.name}>
                      {slots.flsBattery.name}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                  <div>{fmtSlot(slots.flsTemperature)}</div>
                  {slots.flsTemperature && (
                    <div className="text-[10px] truncate max-w-[90px]" title={slots.flsTemperature.name}>
                      {slots.flsTemperature.name}
                    </div>
                  )}
                </TableCell>
                <TableCell className={cn('text-right tabular-nums font-medium', fuelTone(a.fuelPercent))}>
                  {fmtLiters(a.fuelLiters)}
                </TableCell>
              <TableCell className={cn('text-right tabular-nums', fuelTone(a.fuelPercent))}>
                {a.flags?.missingFuelLevel
                  ? '—'
                  : a.fuelPercent != null
                    ? `${a.fuelPercent}%`
                    : '—'}
              </TableCell>
                <TableCell className="text-right tabular-nums text-status-moving text-xs">
                  {a.fillingLiters != null && a.fillingLiters > 0 ? `+${a.fillingLiters} L` : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums text-xs">
                  {a.engineHours != null ? `${Math.round(a.engineHours)} h` : '—'}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                  {a.updatedAt ? formatDistanceToNow(new Date(a.updatedAt), { addSuffix: true }) : '—'}
                </TableCell>
                <TableCell className="text-[10px] text-muted-foreground max-w-[140px]">
                  {slots.other.length
                    ? slots.other.map((s) => `${s.name}: ${fmtSlot(s)}`).join(' · ')
                    : '—'}
                </TableCell>
              </TableRow>
            );
          })}
          {!assets.length && !isLoading && (
            <TableRow>
              <TableCell colSpan={12} className="text-center py-16 text-muted-foreground">
                No assets with Wialon fuel sensors found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
