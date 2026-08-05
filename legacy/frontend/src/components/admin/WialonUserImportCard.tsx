import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { notify } from '@/lib/notify';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { UserAccessEditor } from '@/components/admin/UserAccessEditor';
import { defaultModulesForRole } from '@/lib/userAccess';
import type { TenantModule } from '@/lib/api';
import { UserPlus } from 'lucide-react';

type WialonUserOption = {
  id: number;
  name: string;
  email?: string;
  lastLogin?: number;
  provisioned: boolean;
  mamsUserId: string | null;
};

type Props = {
  tenantId: string;
  wialonConnected: boolean;
  tenantModules: TenantModule[];
};

export function WialonUserImportCard({ tenantId, wialonConnected, tenantModules }: Props) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>('');
  const [role, setRole] = useState('operator');
  const [modules, setModules] = useState<string[]>(defaultModulesForRole('operator'));

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['tenant-wialon-users', tenantId],
    queryFn: () => adminApi.listTenantWialonUsers(tenantId),
    enabled: wialonConnected,
  });

  const users = (data?.users || []) as WialonUserOption[];
  const available = useMemo(() => users.filter((u) => !u.provisioned), [users]);

  const selected = useMemo(
    () => users.find((u) => String(u.id) === selectedId) || null,
    [users, selectedId]
  );

  useEffect(() => {
    if (!selectedId && available.length) {
      setSelectedId(String(available[0].id));
    }
  }, [available, selectedId]);

  const importUser = useMutation({
    mutationFn: () =>
      adminApi.importTenantUserFromWialon(tenantId, {
        wialonUserId: Number(selectedId),
        role,
        modules: modules.length ? modules : undefined,
      }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['tenantUsers', tenantId] });
      qc.invalidateQueries({ queryKey: ['tenant-wialon-users', tenantId] });
      setSelectedId('');
      const temp = (result as { temporaryPassword?: string }).temporaryPassword;
      if (temp) {
        notify.success('User imported', `Temporary password: ${temp}`);
      } else {
        notify.success('User updated from Wialon');
      }
    },
    onError: (e: Error) => notify.error('Import failed', e.message),
  });

  if (!wialonConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import from Wialon</CardTitle>
          <CardDescription>Link a Wialon account on the Integrations tab to import existing users.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          Import from Wialon
        </CardTitle>
        <CardDescription>
          Pick a user from the linked Wialon account ({data?.accountName || 'account'}). Their Wialon login is saved so they can access MAMS with the same identity.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isError && (
          <p className="text-sm text-destructive">{(error as Error)?.message || 'Could not load Wialon users'}</p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Wialon user</Label>
            <Select value={selectedId} onValueChange={setSelectedId} disabled={isLoading || !available.length}>
              <SelectTrigger>
                <SelectValue placeholder={isLoading ? 'Loading…' : available.length ? 'Select user' : 'All users imported'} />
              </SelectTrigger>
              <SelectContent>
                {available.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name}
                    {u.email ? ` · ${u.email}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {users.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {users.length} in Wialon · {users.filter((u) => u.provisioned).length} already in MAMS
              </p>
            )}
          </div>
          {selected && (
            <div className="space-y-2">
              <div>
                <Label className="text-xs text-muted-foreground">Wialon login</Label>
                <Input value={selected.name} readOnly className="bg-muted/40" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Email (from Wialon or generated)</Label>
                <Input
                  value={selected.email || `${selected.name}@tenant.wialon.mams`}
                  readOnly
                  className="bg-muted/40"
                />
              </div>
              {selected.lastLogin ? (
                <Badge variant="outline" className="text-xs">
                  Last Wialon login: {new Date(selected.lastLogin * 1000).toLocaleString()}
                </Badge>
              ) : null}
            </div>
          )}
        </div>

        {selected && (
          <>
            <UserAccessEditor
              role={role}
              onRoleChange={(r) => {
                setRole(r);
                setModules(defaultModulesForRole(r));
              }}
              isActive
              onActiveChange={() => {}}
              modules={modules}
              onModulesChange={setModules}
              tenantModules={tenantModules}
              showActive={false}
            />
            <Button
              onClick={() => importUser.mutate()}
              disabled={!selectedId || importUser.isPending}
            >
              {importUser.isPending ? 'Saving…' : 'Confirm & save user'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
