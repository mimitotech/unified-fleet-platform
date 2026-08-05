import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, type TenantModule } from '@/lib/api';
import { notify } from '@/lib/notify';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { UserAccessEditor } from '@/components/admin/UserAccessEditor';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { defaultModulesForRole } from '@/lib/userAccess';

export type ClientUserRow = {
  id: string;
  email: string;
  full_name?: string;
  fullName?: string;
  role: string;
  is_active?: boolean;
  isActive?: boolean;
  tenant_id?: string;
  tenant_name?: string;
  modules?: string[];
};

type Props = {
  user: ClientUserRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId?: string;
  onSaved?: () => void;
};

export function ClientUserEditDialog({ user, open, onOpenChange, tenantId, onSaved }: Props) {
  const qc = useQueryClient();
  const resolvedTenantId = tenantId || user?.tenant_id || '';

  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('viewer');
  const [isActive, setIsActive] = useState(true);
  const [modules, setModules] = useState<string[]>([]);

  const { data: tenantModules } = useQuery({
    queryKey: ['adminModules', resolvedTenantId],
    queryFn: () => adminApi.getModules(resolvedTenantId),
    enabled: Boolean(open && resolvedTenantId),
    staleTime: 60_000,
  });

  const { data: userDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ['tenantUser', resolvedTenantId, user?.id],
    queryFn: () => adminApi.getTenantUser(resolvedTenantId, user!.id),
    enabled: Boolean(open && user?.id && resolvedTenantId),
  });

  useEffect(() => {
    if (!open || !user) return;
    const detail = userDetail as ClientUserRow | undefined;
    setFullName(String(detail?.full_name || user.full_name || user.fullName || ''));
    setRole(String(detail?.role || user.role || 'viewer'));
    setIsActive(detail?.is_active ?? user.is_active ?? user.isActive ?? true);
    setModules(Array.isArray(detail?.modules) ? detail.modules : user.modules || []);
  }, [open, user, userDetail]);

  const save = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const payload = { fullName: fullName.trim(), role, isActive, modules };
      if (resolvedTenantId) {
        return adminApi.updateTenantUser(resolvedTenantId, user.id, payload);
      }
      return adminApi.updateUser(user.id, payload);
    },
    onSuccess: () => {
      notify.success('User updated');
      qc.invalidateQueries({ queryKey: ['adminUsers'] });
      qc.invalidateQueries({ queryKey: ['tenantUsers', resolvedTenantId] });
      onSaved?.();
      onOpenChange(false);
    },
    onError: (e: Error) => notify.error('Update failed', e.message),
  });

  const handleRoleChange = (nextRole: string) => {
    setRole(nextRole);
    if (!modules.length) {
      setModules(defaultModulesForRole(nextRole));
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit client user</DialogTitle>
          <DialogDescription>
            {user.email}
            {user.tenant_name ? ` · ${user.tenant_name}` : ''}
          </DialogDescription>
        </DialogHeader>

        {loadingDetail && !userDetail ? (
          <p className="text-sm text-muted-foreground py-4">Loading access settings…</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <UserAccessEditor
              role={role}
              onRoleChange={handleRoleChange}
              isActive={isActive}
              onActiveChange={setIsActive}
              modules={modules}
              onModulesChange={setModules}
              tenantModules={(tenantModules as TenantModule[]) || []}
            />
          </div>
        )}

        <DialogFooter className="gap-2">
          <LoadingButton loading={save.isPending} onClick={() => save.mutate()}>
            Save changes
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
