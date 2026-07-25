import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { adminApi } from '@/lib/api';
import { INTEGRATION_GUIDE } from '@/lib/integrations';
import { Building2, Navigation, RefreshCw } from 'lucide-react';

export default function LocoNavCenter() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['loconav-center'],
    queryFn: () => adminApi.getLocoNavCenterStatus(),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const guide = INTEGRATION_GUIDE.loconav;

  return (
    <AdminLayout
      title="LocoNav Center"
      subtitle="Client connections, fleet coverage, and webhook health"
      actions={
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Badge variant={data?.connected ? 'default' : 'secondary'}>
            {data?.connected ? `${data.connectedTenants} connected` : 'No active clients'}
          </Badge>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {isLoading ? (
            [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)
          ) : (
            <>
              <Card className="shadow-none">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">Clients linked</p>
                  <p className="text-2xl font-semibold tabular-nums">{data?.tenantCount ?? 0}</p>
                </CardContent>
              </Card>
              <Card className="shadow-none">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">Verified</p>
                  <p className="text-2xl font-semibold tabular-nums">{data?.connectedTenants ?? 0}</p>
                </CardContent>
              </Card>
              <Card className="shadow-none">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">Mapped assets</p>
                  <p className="text-2xl font-semibold tabular-nums">{data?.totalAssets ?? 0}</p>
                </CardContent>
              </Card>
              <Card className="shadow-none">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">Alerts (24h)</p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {(data?.tenants ?? []).reduce((s, t) => s + t.alerts24h, 0)}
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Navigation className="h-4 w-4 text-primary" />
              LocoNav integration
            </CardTitle>
            <CardDescription>{data?.webhookNote ?? guide.steps.join(' · ')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Link each client under Clients → Integrations with a LocoNav User-Authentication token.
              GPS and video-capable units sync on the fleet scheduler; camera and safety events arrive via webhook.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/admin/tenants">
                  <Building2 className="h-3.5 w-3.5 mr-1" />
                  Manage clients
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/admin/marketplace">Integrations marketplace</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Client connections</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <Skeleton className="h-40 m-4" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Assets</TableHead>
                    <TableHead className="text-right">Alerts 24h</TableHead>
                    <TableHead>Last sync</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.tenants ?? []).map((t) => (
                    <TableRow key={t.tenantId}>
                      <TableCell>
                        <Link
                          to={`/admin/tenants/${t.tenantId}`}
                          className="font-medium hover:text-primary"
                        >
                          {t.tenantName}
                        </Link>
                        <p className="text-[10px] text-muted-foreground">{t.tenantSlug}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant={t.isActive ? 'default' : 'secondary'}>
                          {t.isActive ? 'Connected' : 'Pending'}
                        </Badge>
                        {t.lastError && (
                          <p className="text-[10px] text-destructive mt-1 truncate max-w-[200px]" title={t.lastError}>
                            {t.lastError}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{t.assetCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.alerts24h}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {t.lastSyncAt ? new Date(t.lastSyncAt).toLocaleString() : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!data?.tenants?.length && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-10 text-sm">
                        No LocoNav integrations configured yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
