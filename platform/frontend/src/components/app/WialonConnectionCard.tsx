import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '@/lib/api';
import { useWialonContext } from '@/hooks/useWialon';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WialonHierarchyPanel } from '@/components/admin/WialonHierarchyPanel';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { RefreshCw, Satellite } from 'lucide-react';
import { notify } from '@/lib/notify';

const tierLabel: Record<string, string> = {
  mother: 'Top / mother account',
  dealer: 'Dealer account',
  admin: 'Client admin account',
  user: 'End user',
};

export function WialonConnectionCard() {
  const qc = useQueryClient();
  const { ctx, isLoading, refetch, isFetching } = useWialonContext();

  const sync = useMutation({
    mutationFn: () => clientApi.syncWialon(),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['wialon-context'] });
      qc.invalidateQueries({ queryKey: ['fleet-snapshot'] });
      qc.invalidateQueries({ queryKey: ['dashboardKpis'] });
      qc.invalidateQueries({ queryKey: ['drivers'] });
      qc.invalidateQueries({ queryKey: ['geofences'] });
      const userPart =
        result.usersCreated != null
          ? `, ${result.usersCreated} new users, ${result.usersUpdated ?? 0} updated`
          : '';
      notify.success(
        'Sync complete',
        `${result.vehicles} vehicles${userPart}, ${result.drivers} drivers, ${result.geofences} geofences`
      );
    },
    onError: (e: Error) => notify.error('Sync failed', e.message),
  });

  const meta = ctx?.sessionMeta;
  const accountTier = ctx?.accountTier || (meta?.accountTier as string | undefined);
  const counts = ctx?.counts || (meta?.counts as { units?: number; accounts?: number } | undefined);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">Loading connection…</CardContent>
      </Card>
    );
  }

  if (!ctx?.configured || !ctx?.connected) {
    const configuredButBroken = ctx?.configured && !ctx?.connected;
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Satellite className="h-4 w-4" />
            Fleet connection
          </CardTitle>
          <CardDescription>
            {configuredButBroken
              ? 'Your fleet connection is configured but the last check failed. Ask your platform administrator to re-verify credentials under Admin → Tenant → Integrations.'
              : 'Fleet telematics is not connected for this organization. Your platform administrator configures the connection under Admin → Tenant → Integrations.'}
          </CardDescription>
          {configuredButBroken && ctx?.lastError && (
            <p className="text-sm text-destructive pt-2">{ctx.lastError}</p>
          )}
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Satellite className="h-4 w-4" />
                Fleet connection
              </CardTitle>
              <CardDescription>
                Live fleet data follows your linked account scope and permissions.
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">Connected</Badge>
            {ctx.accountName && <Badge variant="outline">{ctx.accountName}</Badge>}
            {accountTier && <Badge variant="outline">{tierLabel[accountTier] || accountTier}</Badge>}
            {ctx.operateAs && <Badge variant="outline">operateAs user #{ctx.operateAs}</Badge>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-sm">
            <div className="rounded-lg border bg-muted/30 p-2">
              <p className="text-lg font-semibold">{ctx.previewAssetCount ?? counts?.units ?? '—'}</p>
              <p className="text-[10px] text-muted-foreground uppercase">Vehicles in scope</p>
            </div>
            {counts?.accounts != null && (
              <div className="rounded-lg border bg-muted/30 p-2">
                <p className="text-lg font-semibold">{counts.accounts}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Child accounts</p>
              </div>
            )}
            <div className="rounded-lg border bg-muted/30 p-2 col-span-2 sm:col-span-1">
              <p className="text-xs font-medium truncate">
                {ctx.lastSyncAt ? new Date(ctx.lastSyncAt).toLocaleString() : 'Never'}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase">Last sync</p>
            </div>
          </div>
          {ctx.lastError && (
            <p className="text-sm text-destructive">Last error: {ctx.lastError}</p>
          )}
          <LoadingButton
            loading={sync.isPending}
            onClick={() => sync.mutate()}
            className="w-full sm:w-auto"
          >
            Sync vehicles, drivers & geofences
          </LoadingButton>
        </CardContent>
      </Card>

      <WialonHierarchyPanel
        enabled
        scope="client"
        storedMeta={meta}
      />
    </div>
  );
}
