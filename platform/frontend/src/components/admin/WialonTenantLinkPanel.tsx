import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { WialonMotherAccountSelect } from '@/components/admin/WialonMotherAccountSelect';
import { WialonAccountTreePicker } from '@/components/admin/WialonAccountTreePicker';
import { Network, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

const WIALON_POLL_MS = 5 * 60_000; // cache hierarchy; do not hammer mother accounts every minute

type Props = {
  selectedMotherAccountId?: string;
  onMotherAccountChange?: (motherId: string) => void;
  selectedAccountId?: string;
  selectedAccountName?: string;
  selectedUserIds: number[];
  onSelectAccount: (accountId: string, accountName: string) => void;
  onToggleUser: (userId: number) => void;
  onSelectAllUsers: (userIds: number[]) => void;
  onTestAccount?: () => void;
  testing?: boolean;
  testResult?: { unitCount: number; userCount: number } | null;
  exceptTenantId?: string;
};

export function WialonTenantLinkPanel({
  selectedMotherAccountId,
  onMotherAccountChange,
  selectedAccountId,
  selectedAccountName,
  selectedUserIds,
  onSelectAccount,
  onToggleUser,
  onSelectAllUsers,
  onTestAccount,
  testing,
  testResult,
  exceptTenantId,
}: Props) {
  const [motherId, setMotherId] = useState(selectedMotherAccountId || '');
  const autoSelectedUsersFor = useRef<string | null>(null);

  useEffect(() => {
    if (selectedMotherAccountId) setMotherId(selectedMotherAccountId);
  }, [selectedMotherAccountId]);

  const { data: centerStatus } = useQuery({
    queryKey: ['wialon-center-status'],
    queryFn: () => adminApi.getWialonCenterStatus(),
    staleTime: WIALON_POLL_MS,
  });

  const { data: hierarchy, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['wialon-center-hierarchy', motherId],
    queryFn: () => adminApi.getWialonCenterHierarchy(motherId),
    enabled: Boolean(motherId),
    staleTime: WIALON_POLL_MS,
  });

  const { data: accountDetail, isLoading: accountLoading } = useQuery({
    queryKey: ['wialon-center-account', motherId, selectedAccountId],
    queryFn: () => adminApi.getWialonCenterAccount(selectedAccountId!, motherId),
    enabled: Boolean(selectedAccountId && motherId),
    staleTime: WIALON_POLL_MS,
  });

  const availableAccounts = useMemo(
    () =>
      (hierarchy?.accounts || []).filter(
        (a) => !a.assignedTenant || a.assignedTenant.tenantId === exceptTenantId
      ),
    [hierarchy?.accounts, exceptTenantId]
  );

  const selectedFromTree = useMemo(
    () => availableAccounts.find((a) => String(a.id) === selectedAccountId),
    [availableAccounts, selectedAccountId]
  );

  const unitCount =
    testResult?.unitCount ??
    accountDetail?.unitCount ??
    selectedFromTree?.unitCount;
  const userCount =
    testResult?.userCount ??
    accountDetail?.userCount ??
    selectedFromTree?.userCount ??
    accountDetail?.users?.length;

  useEffect(() => {
    autoSelectedUsersFor.current = null;
  }, [motherId]);

  useEffect(() => {
    if (!selectedAccountId || !accountDetail?.users?.length) return;
    const key = `${motherId}:${selectedAccountId}`;
    if (autoSelectedUsersFor.current === key) return;
    autoSelectedUsersFor.current = key;
    onSelectAllUsers(accountDetail.users.map((u: { id: number }) => u.id));
  }, [selectedAccountId, motherId, accountDetail?.users, onSelectAllUsers]);

  const handleMotherChange = (id: string) => {
    setMotherId(id);
    onMotherAccountChange?.(id);
  };

  if (!centerStatus?.configured && !(centerStatus?.motherAccountCount || 0)) {
    return (
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Wialon account</CardTitle>
          <CardDescription>
            Add mother accounts in{' '}
            <Link to="/admin/wialon" className="text-primary hover:underline">Wialon Center</Link>, then pick
            which mother token to use and which billing account to link.
          </CardDescription>
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
              Link Wialon account
            </CardTitle>
            <CardDescription>
              1) Choose mother account · 2) Pick account (units/users shown in tree) · 3) Select Wialon users
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching || !motherId}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <WialonMotherAccountSelect value={motherId} onChange={handleMotherChange} />

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading account tree…</p>
        ) : (
          <>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Account tree</Label>
              <WialonAccountTreePicker
                accounts={availableAccounts}
                selectedAccountId={selectedAccountId}
                onSelect={onSelectAccount}
              />
            </div>

            {selectedAccountId && (
              <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {selectedAccountName || accountDetail?.accountName || selectedAccountId}
                    </p>
                    {(unitCount != null || userCount != null) && (
                      <p className="text-xs text-primary font-medium mt-0.5">
                        {unitCount ?? '—'} active units · {userCount ?? '—'} Wialon users
                      </p>
                    )}
                  </div>
                  {onTestAccount && (
                    <LoadingButton size="sm" variant="outline" loading={testing} onClick={onTestAccount}>
                      Re-test
                    </LoadingButton>
                  )}
                </div>
                {accountLoading ? (
                  <p className="text-xs text-muted-foreground">Loading users…</p>
                ) : accountDetail?.users?.length ? (
                  <div className="space-y-2 max-h-36 overflow-auto">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="all-users"
                        checked={selectedUserIds.length === accountDetail.users.length}
                        onCheckedChange={(c) =>
                          onSelectAllUsers(c ? accountDetail.users.map((u) => u.id) : [])
                        }
                      />
                      <Label htmlFor="all-users" className="text-xs">
                        All Wialon users ({accountDetail.users.length})
                      </Label>
                    </div>
                    {accountDetail.users.map((u) => (
                      <div key={u.id} className="flex items-center gap-2 pl-1">
                        <Checkbox
                          id={`wu-${u.id}`}
                          checked={selectedUserIds.includes(u.id)}
                          onCheckedChange={() => onToggleUser(u.id)}
                        />
                        <Label htmlFor={`wu-${u.id}`} className="text-xs font-normal truncate">
                          {u.name}
                          {u.email ? <span className="text-muted-foreground"> · {u.email}</span> : null}
                        </Label>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No users on this account.</p>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
