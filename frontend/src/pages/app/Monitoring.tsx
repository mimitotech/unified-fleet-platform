import { AppLayout } from '@/components/app/AppLayout';
import { UnifiedMap } from '@/components/app/UnifiedMap';
import { useAssets, useAssetStatuses } from '@/hooks/useAssets';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/shared/StatusBadge';
import type { VehicleStatus } from '@/components/shared/StatusBadge';

export default function Monitoring() {
  const { data: assets, isLoading: assetsLoading } = useAssets();
  const { data: statuses, isLoading: statusLoading } = useAssetStatuses();

  const loading = assetsLoading || statusLoading;

  return (
    <AppLayout title="Monitoring" subtitle="Live fleet map and status">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {loading ? <Skeleton className="h-[500px]" /> : (
            <UnifiedMap assets={assets as never[]} statuses={statuses as never[]} height="500px" />
          )}
        </div>
        <div className="fleet-card max-h-[500px] overflow-auto">
          <h3 className="font-semibold mb-4">Fleet List</h3>
          {loading ? (
            <Skeleton className="h-40" />
          ) : (
            <ul className="space-y-2">
              {(assets as Array<{ id: string; name: string; registrationPlate?: string; sources?: unknown[] }>)?.map((a) => {
                const st = (statuses as Array<{ asset?: { name: string }; status?: { status: string } }>)?.find(
                  (s) => s.asset?.name === a.name
                );
                return (
                  <li key={a.id} className="flex items-center justify-between py-2 border-b border-border text-sm">
                    <div>
                      <p className="font-medium">{a.name}</p>
                      <p className="text-muted-foreground text-xs">{a.registrationPlate || '—'}</p>
                    </div>
                    {st?.status?.status && (
                      <StatusBadge status={st.status.status as VehicleStatus} size="sm" />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
