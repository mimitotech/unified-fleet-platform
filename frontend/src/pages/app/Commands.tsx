import { useQuery } from '@tanstack/react-query';
import { AppLayout } from '@/components/app/AppLayout';
import { useFleetUnits } from '@/hooks/useFleetUnits';
import { clientApi } from '@/lib/api';
import { WialonContextBanner } from '@/components/app/WialonContextBanner';
import { AnimatedPage, PageLoader } from '@/components/shared/PageLoader';
import { WialonCommandButton } from '@/components/fleet/WialonCommandButton';
import { UnitTypeIcon } from '@/components/fleet/UnitTypeIcon';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useWialonUnitCommands } from '@/hooks/useWialonLive';
import { History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { FleetUnit } from '@/lib/fleetUnits';
import { safeArray } from '@/lib/safeArray';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

function UnitCommandsCard({ unit }: { unit: FleetUnit }) {
  const wialonId = unit.wialonId;
  const { data, isLoading } = useWialonUnitCommands(wialonId ?? null, wialonId != null);
  const commands = data?.commands || [];

  return (
    <div className="fleet-card-hover">
      <div className="flex items-start gap-3 mb-3">
        <UnitTypeIcon wialonId={unit.wialonId} iconUgi={unit.iconUgi} size="md" title={unit.name} />
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{unit.name}</p>
          <p className="text-sm text-muted-foreground truncate">{unit.plate || unit.id}</p>
          <StatusBadge status={unit.status} size="sm" className="mt-1" />
        </div>
      </div>
      {!wialonId ? (
        <p className="text-xs text-muted-foreground">No Wialon link for this unit.</p>
      ) : isLoading ? (
        <Skeleton className="h-9 w-full" />
      ) : commands.length ? (
        <div className="flex flex-wrap gap-2">
          {commands.map((c) => (
            <WialonCommandButton
              key={c.name}
              unitId={wialonId}
              commandName={c.name}
              label={c.label || c.name}
              variant="outline"
              size="sm"
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No commands configured for this unit in Wialon. Add commands in Wialon → unit → Commands.
        </p>
      )}
    </div>
  );
}

export default function Commands() {
  const { units, isLoading } = useFleetUnits();
  const { data: history } = useQuery({
    queryKey: ['commandHistory'],
    queryFn: () => clientApi.getCommandHistory(),
  });

  const commandable = units.filter((u) => u.wialonId != null);

  if (isLoading && !units.length) {
    return (
      <AppLayout title="Commands" subtitle="Remote vehicle commands">
        <PageLoader />
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Commands" subtitle="Remote commands configured per device in Wialon">
      <AnimatedPage className="space-y-6">
        <WialonContextBanner />
        <p className="text-sm text-muted-foreground">
          Each unit shows only the commands defined for it in Wialon (lock, locate, camera on, etc.).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {commandable.map((u) => (
            <UnitCommandsCard key={u.id} unit={u} />
          ))}
          {!commandable.length && (
            <p className="text-muted-foreground text-center py-12 col-span-full">
              No Wialon units — link your account and sync fleet data first.
            </p>
          )}
        </div>

        <div className="fleet-card">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <History className="w-4 h-4" /> Command History
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Command</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {safeArray(history as Array<Record<string, unknown>>).slice(0, 20).map((h) => (
                <TableRow key={String(h.id)}>
                  <TableCell className="text-xs">
                    {new Date(String(h.createdAt || h.created_at)).toLocaleString()}
                  </TableCell>
                  <TableCell>{String(h.assetName || h.asset_name || '—')}</TableCell>
                  <TableCell className="font-mono text-xs">{String(h.command)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        h.status === 'success' ? 'default' : h.status === 'failed' ? 'destructive' : 'secondary'
                      }
                    >
                      {String(h.status)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </AnimatedPage>
    </AppLayout>
  );
}
