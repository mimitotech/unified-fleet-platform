import { useQuery } from '@tanstack/react-query';
import { adminApi, clientApi, type WialonProbeResult } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { RefreshCw, Network } from 'lucide-react';
import { notify } from '@/lib/notify';

export type WialonProbe = WialonProbeResult;

type Props = {
  tenantId?: string;
  enabled: boolean;
  storedMeta?: Record<string, unknown> | null;
  selectedAccountId?: string;
  onSelectAccount?: (accountId: string, accountName: string) => void;
  onLinkAccount?: (accountId: string, accountName: string) => void;
  linkingAccountId?: string;
  onSelectOperateAs?: (userId: string) => void;
  selectedOperateAs?: string;
  /** admin = platform tenant detail; client = tenant admin settings */
  scope?: 'admin' | 'client';
};

const tierLabel: Record<string, string> = {
  mother: 'Top / mother account',
  dealer: 'Dealer account',
  admin: 'Client admin account',
  user: 'End user',
};

export function WialonHierarchyPanel({
  tenantId,
  enabled,
  storedMeta,
  selectedAccountId,
  onSelectAccount,
  onLinkAccount,
  linkingAccountId,
  onSelectOperateAs,
  selectedOperateAs,
  scope = 'admin',
}: Props) {
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ['wialon-hierarchy', scope, tenantId],
    queryFn: () =>
      scope === 'client'
        ? clientApi.getWialonHierarchy()
        : adminApi.getWialonHierarchy(tenantId!) as Promise<WialonProbe>,
    enabled: enabled && (scope === 'client' || !!tenantId),
    staleTime: 60_000,
  });

  const probe = data;
  const metaCounts = storedMeta?.counts as WialonProbe['counts'] | undefined;

  const handleRefresh = async () => {
    try {
      await refetch();
      notify.success('Wialon hierarchy refreshed');
    } catch (e) {
      notify.error('Refresh failed', (e as Error).message);
    }
  };

  if (!enabled) {
    return (
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Network className="h-4 w-4" />
            Wialon account tree
          </CardTitle>
          <CardDescription>Save and verify a Wialon token to browse accounts and users under Mimito.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Network className="h-4 w-4" />
              Wialon account tree
            </CardTitle>
            <CardDescription>
              Select a client admin account to link this tenant — MAMS will create users, sync vehicles, drivers, and geofences for that account only.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={handleRefresh} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Loading Wialon hierarchy…</p>}
        {error && (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        )}
        {probe && (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">{tierLabel[probe.accountTier] || probe.accountTier}</Badge>
              <Badge variant="outline">Session: {probe.sessionUser.nm}</Badge>
              {probe.scopedAccountId && (
                <Badge className="bg-primary/10 text-primary border-primary/20">
                  Linked account {probe.scopedAccountId}
                </Badge>
              )}
              {probe.dealerRights && <Badge>Dealer rights</Badge>}
              {probe.currentAccount && (
                <Badge variant="outline">
                  Billing: {probe.currentAccount.name}
                  {probe.currentAccount.plan ? ` · ${probe.currentAccount.plan}` : ''}
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-center">
              {(
                [
                  ['Units', probe.counts.units],
                  ['Accounts', probe.counts.accounts],
                  ['Users', probe.counts.users],
                  ['Resources', probe.counts.resources],
                  ['Routes', probe.counts.routes],
                  ['Groups', probe.counts.unitGroups],
                ] as const
              ).map(([label, n]) => (
                <div key={label} className="rounded-lg border bg-muted/30 p-2">
                  <p className="text-lg font-semibold">{n}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                </div>
              ))}
            </div>
        {error && !probe && metaCounts && (
              <p className="text-xs text-muted-foreground">
                Last saved snapshot: {metaCounts.units} units, {metaCounts.accounts} accounts.
                {(error as Error).message ? ` (${(error as Error).message})` : ''}
              </p>
            )}
            {probe.accounts.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2">Client admin accounts ({probe.accounts.length})</p>
                <div className="max-h-48 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="h-8">ID</TableHead>
                        <TableHead className="h-8">Name</TableHead>
                        <TableHead className="h-8">Units</TableHead>
                        <TableHead className="h-8">Users</TableHead>
                        <TableHead className="h-8 w-28" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {probe.accounts.map((a) => (
                        <TableRow key={a.id} className={selectedAccountId === String(a.id) ? 'bg-primary/5' : ''}>
                          <TableCell className="py-1.5 font-mono text-xs">{a.id}</TableCell>
                          <TableCell className="py-1.5 text-sm">{a.name}</TableCell>
                          <TableCell className="py-1.5 text-xs text-muted-foreground">{a.unitCount ?? '—'}</TableCell>
                          <TableCell className="py-1.5 text-xs text-muted-foreground">{a.userCount ?? '—'}</TableCell>
                          <TableCell className="py-1.5">
                            {(onLinkAccount || onSelectAccount) && (
                              <Button
                                type="button"
                                size="sm"
                                variant={selectedAccountId === String(a.id) ? 'default' : 'ghost'}
                                className="h-7 text-xs"
                                disabled={linkingAccountId === String(a.id)}
                                onClick={() => {
                                  if (onLinkAccount) onLinkAccount(String(a.id), a.name);
                                  else onSelectAccount?.(String(a.id), a.name);
                                }}
                              >
                                {linkingAccountId === String(a.id)
                                  ? 'Linking…'
                                  : selectedAccountId === String(a.id)
                                    ? 'Linked'
                                    : 'Link account'}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
            {probe.users.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2">
                  {probe.scopedAccountId
                    ? `Users under linked account (${probe.users.length})`
                    : `Sub-users in hierarchy (${probe.users.length})`}
                </p>
                <div className="max-h-40 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="h-8">ID</TableHead>
                        <TableHead className="h-8">User</TableHead>
                        <TableHead className="h-8 w-24" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {probe.users.slice(0, 50).map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="py-1.5 font-mono text-xs">{u.id}</TableCell>
                          <TableCell className="py-1.5 text-sm">{u.name}</TableCell>
                          <TableCell className="py-1.5">
                            {onSelectOperateAs && (
                              <Button
                                type="button"
                                size="sm"
                                variant={selectedOperateAs === String(u.id) ? 'default' : 'ghost'}
                                className="h-7 text-xs"
                                onClick={() => onSelectOperateAs(String(u.id))}
                              >
                                operateAs
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {probe.users.length > 50 && (
                  <p className="text-[11px] text-muted-foreground mt-1">Showing first 50 users.</p>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
