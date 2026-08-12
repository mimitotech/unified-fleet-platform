import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { adminApi, type WialonMotherAccount } from '@/lib/api';
import { INTEGRATION_GUIDE } from '@/lib/integrations';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/shared/PasswordInput';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { notify } from '@/lib/notify';
import { Satellite, RefreshCw, Building2, Network, Settings2, Plus, Trash2 } from 'lucide-react';
import { WialonCenterLive } from '@/components/admin/WialonCenterLive';
import { WialonAccountTreePicker } from '@/components/admin/WialonAccountTreePicker';
import { WialonMotherAccountSelect } from '@/components/admin/WialonMotherAccountSelect';
import { Skeleton } from '@/components/ui/skeleton';

const tierLabel: Record<string, string> = {
  mother: 'Mother account',
  dealer: 'Dealer',
  admin: 'Client admin',
  user: 'End user',
};

export default function WialonCenter() {
  const qc = useQueryClient();
  const [activeMotherId, setActiveMotherId] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newToken, setNewToken] = useState('');
  const [newBaseUrl, setNewBaseUrl] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editToken, setEditToken] = useState('');
  const [editBaseUrl, setEditBaseUrl] = useState('');

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['wialon-center-status'],
    queryFn: () => adminApi.getWialonCenterStatus(),
    staleTime: 5 * 60_000,
  });

  const mothers = status?.motherAccounts || [];

  useEffect(() => {
    if (!activeMotherId && mothers.length) {
      setActiveMotherId(mothers[0].id);
    }
  }, [mothers, activeMotherId]);

  const { data: hierarchy, isLoading: hierarchyLoading, isFetching, refetch } = useQuery({
    queryKey: ['wialon-center-hierarchy', activeMotherId],
    queryFn: () => adminApi.getWialonCenterHierarchy(activeMotherId),
    enabled: Boolean(activeMotherId),
    staleTime: 5 * 60_000,
  });

  const { data: accountDetail, isLoading: accountLoading } = useQuery({
    queryKey: ['wialon-center-account', activeMotherId, selectedAccountId],
    queryFn: () => adminApi.getWialonCenterAccount(selectedAccountId!, activeMotherId),
    enabled: Boolean(selectedAccountId && activeMotherId),
    staleTime: 5 * 60_000,
  });

  const activeMother = mothers.find((m) => m.id === activeMotherId);

  const createMother = useMutation({
    mutationFn: () =>
      adminApi.createWialonMotherAccount({
        name: newName.trim() || 'Mother account',
        token: newToken.trim(),
        ...(newBaseUrl.trim() ? { baseUrl: newBaseUrl.trim() } : {}),
      }),
    onSuccess: (data) => {
      notify.success('Mother account saved', data.mother.name);
      setNewName('');
      setNewToken('');
      setNewBaseUrl('');
      setActiveMotherId(data.mother.id);
      qc.invalidateQueries({ queryKey: ['wialon-center-status'] });
      qc.invalidateQueries({ queryKey: ['wialon-mother-accounts'] });
      qc.invalidateQueries({ queryKey: ['wialon-center-hierarchy'] });
    },
    onError: (e: Error) => notify.error('Save failed', e.message),
  });

  const updateMother = useMutation({
    mutationFn: (motherId: string) =>
      adminApi.updateWialonMotherAccount(motherId, {
        name: editName.trim() || undefined,
        ...(editToken.trim() ? { token: editToken.trim() } : {}),
        ...(editBaseUrl.trim() ? { baseUrl: editBaseUrl.trim() } : {}),
      }),
    onSuccess: () => {
      notify.success('Mother account updated');
      setEditingId(null);
      setEditToken('');
      qc.invalidateQueries({ queryKey: ['wialon-center-status'] });
      qc.invalidateQueries({ queryKey: ['wialon-mother-accounts'] });
      qc.invalidateQueries({ queryKey: ['wialon-center-hierarchy'] });
    },
    onError: (e: Error) => notify.error('Update failed', e.message),
  });

  const deleteMother = useMutation({
    mutationFn: (motherId: string) => adminApi.deleteWialonMotherAccount(motherId),
    onSuccess: () => {
      notify.success('Mother account removed');
      setActiveMotherId('');
      setSelectedAccountId(null);
      qc.invalidateQueries({ queryKey: ['wialon-center-status'] });
      qc.invalidateQueries({ queryKey: ['wialon-mother-accounts'] });
    },
    onError: (e: Error) => notify.error('Delete failed', e.message),
  });

  const testMother = useMutation({
    mutationFn: (motherId: string) => adminApi.testWialonMotherAccount(motherId),
    onSuccess: (data) => {
      notify.success(
        'Connection OK',
        `${data.probe.counts.accounts} accounts · ${data.probe.counts.units} active units`
      );
      qc.invalidateQueries({ queryKey: ['wialon-center-status'] });
    },
    onError: (e: Error) => notify.error('Test failed', e.message),
  });

  const startEdit = (m: WialonMotherAccount) => {
    setEditingId(m.id);
    setEditName(m.name);
    setEditBaseUrl(m.baseUrl || '');
    setEditToken('');
  };

  const connectedCount = mothers.filter((m) => m.connected).length;

  return (
    <AdminLayout
      title="Wialon Center"
      subtitle="Manage mother account tokens — browse each account tree and link clients at any level"
      actions={
        activeMotherId ? (
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh tree
          </Button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Mother accounts</CardDescription>
            <CardTitle className="text-2xl">{statusLoading ? '—' : mothers.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Connected</CardDescription>
            <CardTitle className="text-lg">
              {statusLoading ? '—' : `${connectedCount}/${mothers.length || 0}`}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Accounts (selected mother)</CardDescription>
            <CardTitle className="text-2xl">{hierarchy?.accounts?.length ?? activeMother?.counts?.accounts ?? '—'}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Linked to clients</CardDescription>
            <CardTitle className="text-2xl">{status?.assignedAccountCount ?? '—'}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs defaultValue={mothers.length ? 'accounts' : 'config'}>
        <TabsList>
          <TabsTrigger value="config" className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />
            Mother accounts
          </TabsTrigger>
          <TabsTrigger value="accounts" disabled={!mothers.length} className="gap-1.5">
            <Network className="h-3.5 w-3.5" />
            Account tree
          </TabsTrigger>
          <TabsTrigger value="live" disabled={!mothers.length} className="gap-1.5">
            <Satellite className="h-3.5 w-3.5" />
            Live fleet
          </TabsTrigger>
          <TabsTrigger value="tenants" disabled={!mothers.length} className="gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            Client links
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-4 space-y-4">
          <Card className="max-w-3xl">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add mother account
              </CardTitle>
              <CardDescription>
                Each mother token is a separate Wialon top-level account. Clients pick which mother to use, then link any admin or sub-account in that tree.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label>Display name</Label>
                <Input placeholder="e.g. Mimito East Africa" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>API token</Label>
                <PasswordInput
                  placeholder="72-character Wialon access_token"
                  value={newToken}
                  onChange={(e) => setNewToken(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">{INTEGRATION_GUIDE.wialon.fields[0].hint}</p>
              </div>
              <div className="space-y-1">
                <Label>API host (optional)</Label>
                <Input
                  placeholder="https://hst-api.wialon.com/wialon/ajax.html"
                  value={newBaseUrl}
                  onChange={(e) => setNewBaseUrl(e.target.value)}
                />
              </div>
              <LoadingButton loading={createMother.isPending} disabled={!newToken.trim()} onClick={() => createMother.mutate()}>
                Save & connect
              </LoadingButton>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Saved mother accounts</CardTitle>
            </CardHeader>
            <CardContent>
              {!mothers.length ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No mother accounts yet. Add one above.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Clients</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead className="w-40" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mothers.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>
                          {editingId === m.id ? (
                            <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8" />
                          ) : (
                            <button
                              type="button"
                              className="font-medium text-left hover:text-primary"
                              onClick={() => {
                                setActiveMotherId(m.id);
                              }}
                            >
                              {m.name}
                            </button>
                          )}
                        </TableCell>
                        <TableCell>
                          {m.connected ? (
                            <Badge variant="outline" className="text-green-700">Connected</Badge>
                          ) : (
                            <Badge variant="outline" className="text-destructive">Error</Badge>
                          )}
                          {m.lastError && (
                            <p className="text-[10px] text-destructive mt-0.5 max-w-[12rem] truncate">{m.lastError}</p>
                          )}
                        </TableCell>
                        <TableCell>{m.linkedTenantCount}</TableCell>
                        <TableCell className="text-xs">{tierLabel[m.accountTier || ''] || m.accountTier || '—'}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            {editingId === m.id ? (
                              <>
                                <LoadingButton size="sm" loading={updateMother.isPending} onClick={() => updateMother.mutate(m.id)}>
                                  Save
                                </LoadingButton>
                                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                              </>
                            ) : (
                              <>
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => testMother.mutate(m.id)}>
                                  Test
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => startEdit(m)}>
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs text-destructive"
                                  disabled={m.linkedTenantCount > 0 || deleteMother.isPending}
                                  onClick={() => {
                                    if (confirm(`Remove "${m.name}"?`)) deleteMother.mutate(m.id);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                          {editingId === m.id && (
                            <div className="mt-2 space-y-2">
                              <PasswordInput
                                placeholder="New token (leave blank to keep)"
                                value={editToken}
                                onChange={(e) => setEditToken(e.target.value)}
                              />
                              <Input
                                placeholder="API host"
                                value={editBaseUrl}
                                onChange={(e) => setEditBaseUrl(e.target.value)}
                                className="h-8"
                              />
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="accounts" className="mt-4 space-y-4">
          <WialonMotherAccountSelect value={activeMotherId} onChange={setActiveMotherId} className="max-w-md" />

          {activeMother && (
            <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
              <Badge variant="secondary">{tierLabel[activeMother.accountTier || ''] || activeMother.accountTier}</Badge>
              {activeMother.counts && (
                <span>{activeMother.counts.units ?? '—'} active units · {activeMother.counts.accounts ?? '—'} accounts</span>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Account tree</CardTitle>
                <CardDescription>Drill into admin or sub-accounts — select any level to inspect or create a tenant.</CardDescription>
              </CardHeader>
              <CardContent>
                {hierarchyLoading ? (
                  <Skeleton className="h-64" />
                ) : (
                  <WialonAccountTreePicker
                    accounts={hierarchy?.accounts || []}
                    selectedAccountId={selectedAccountId || undefined}
                    onSelect={(id) => setSelectedAccountId(id)}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Account detail</CardTitle>
                <CardDescription>
                  {selectedAccountId ? `Account #${selectedAccountId}` : 'Select an account from the tree'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!selectedAccountId ? (
                  <p className="text-sm text-muted-foreground py-12 text-center">Select an account to preview.</p>
                ) : accountLoading ? (
                  <Skeleton className="h-48" />
                ) : accountDetail ? (
                  <div className="space-y-4">
                    <div>
                      <p className="font-semibold">{accountDetail.accountName}</p>
                      <p className="text-xs text-muted-foreground">
                        {accountDetail.unitCount} active units · {accountDetail.userCount} Wialon users
                      </p>
                      {accountDetail.assignedTenant && (
                        <p className="text-xs mt-2">
                          Linked to{' '}
                          <Link className="text-primary hover:underline" to={`/admin/tenants/${accountDetail.assignedTenant.tenantId}`}>
                            {accountDetail.assignedTenant.tenantName}
                          </Link>
                        </p>
                      )}
                    </div>
                    {accountDetail.sampleUnits?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium mb-1">Sample units</p>
                        <ul className="text-xs text-muted-foreground space-y-0.5">
                          {accountDetail.sampleUnits.map((n: string) => (
                            <li key={n}>• {n}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {!accountDetail.assignedTenant && activeMotherId && (
                      <Link
                        to={`/admin/tenants/new?wialonMotherAccountId=${activeMotherId}&wialonAccountId=${accountDetail.accountId}&wialonAccountName=${encodeURIComponent(accountDetail.accountName)}`}
                      >
                        <Button size="sm" className="w-full">Create client for this account</Button>
                      </Link>
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="live" className="mt-4 space-y-4">
          <WialonMotherAccountSelect value={activeMotherId} onChange={setActiveMotherId} className="max-w-md" />
          <WialonCenterLive accountId={selectedAccountId || undefined} motherId={activeMotherId} />
        </TabsContent>

        <TabsContent value="tenants" className="mt-4 space-y-4">
          <WialonMotherAccountSelect value={activeMotherId} onChange={setActiveMotherId} className="max-w-md" />
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Client ↔ Wialon account map</CardTitle>
              <CardDescription>Accounts linked under the selected mother token.</CardDescription>
            </CardHeader>
            <CardContent>
              {hierarchyLoading ? (
                <Skeleton className="h-48" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Wialon account</TableHead>
                      <TableHead>Active units</TableHead>
                      <TableHead>MAMS client</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(hierarchy?.accounts || []).map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.name}</TableCell>
                        <TableCell>{a.unitCount ?? '—'}</TableCell>
                        <TableCell>
                          {a.assignedTenant ? (
                            <Link to={`/admin/tenants/${a.assignedTenant.tenantId}`} className="text-primary hover:underline text-sm">
                              {a.assignedTenant.tenantName}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {!a.assignedTenant && activeMotherId && (
                            <Link
                              to={`/admin/tenants/new?wialonMotherAccountId=${activeMotherId}&wialonAccountId=${a.id}&wialonAccountName=${encodeURIComponent(a.name)}`}
                            >
                              <Button size="sm" variant="outline" className="h-7 text-xs">Create tenant</Button>
                            </Link>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
