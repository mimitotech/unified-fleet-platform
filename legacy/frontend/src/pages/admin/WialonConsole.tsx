import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { adminApi } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Satellite, Building2, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const tierLabel: Record<string, string> = {
  mother: 'Mother',
  dealer: 'Dealer',
  admin: 'Client admin',
  user: 'End user',
};

export default function WialonConsole() {
  const { data, isLoading, isFetching, refetch, isError } = useQuery({
    queryKey: ['wialon-overview'],
    queryFn: () => adminApi.getWialonOverview(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const tenants = data?.tenants ?? [];
  const connected = tenants.filter((t) => t.connected);
  const motherAccounts = tenants.filter((t) => t.accountTier === 'mother' || t.accountTier === 'dealer');

  return (
    <AdminLayout
      title="Wialon control"
      subtitle="Cross-tenant view of Wialon tokens, hierarchy tier, and sync health"
      actions={
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      }
    >
      {isError && (
        <p className="text-sm text-destructive mb-4">Could not load Wialon overview.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Clients with Wialon</CardDescription>
            <CardTitle className="text-2xl">{isLoading ? '—' : data?.count ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Connected now</CardDescription>
            <CardTitle className="text-2xl text-primary">
              {isLoading ? '—' : connected.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Mother / dealer tokens</CardDescription>
            <CardTitle className="text-2xl">{isLoading ? '—' : motherAccounts.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Satellite className="h-4 w-4" />
            Client Wialon sessions
          </CardTitle>
          <CardDescription>
            Configure tokens per client under Clients → Integrations. Mother (Mimito) tokens expose full
            account trees; client tokens scope to a single admin account and its users.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-48" />
          ) : !tenants.length ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No clients have Wialon configured yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Wialon account</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Units</TableHead>
                  <TableHead>Accounts</TableHead>
                  <TableHead>Last sync</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((t) => (
                  <TableRow key={t.tenantId}>
                    <TableCell className="font-medium">{t.tenantName}</TableCell>
                    <TableCell>
                      <div className="text-sm">{t.accountName || '—'}</div>
                      {t.operateAs && (
                        <div className="text-xs text-muted-foreground">as {t.operateAs}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {t.accountTier ? (
                        <Badge variant="outline">{tierLabel[t.accountTier] || t.accountTier}</Badge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>{t.counts?.units ?? t.previewAssetCount ?? '—'}</TableCell>
                    <TableCell>{t.counts?.accounts ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {t.lastSyncAt
                        ? formatDistanceToNow(new Date(t.lastSyncAt), { addSuffix: true })
                        : 'Never'}
                    </TableCell>
                    <TableCell>
                      {t.connected ? (
                        <Badge>Connected</Badge>
                      ) : (
                        <Badge variant="destructive" title={t.lastError}>
                          Error
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/admin/tenants/${t.tenantId}`}>
                          <Building2 className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
