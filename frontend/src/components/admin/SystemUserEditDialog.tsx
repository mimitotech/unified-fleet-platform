import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { notify } from '@/lib/notify';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { LoadingButton } from '@/components/shared/LoadingButton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ROLE_LABELS } from '@/lib/systemRoles';

export type SystemUserRow = {
  id: string;
  email: string;
  full_name?: string;
  role: string;
  is_active?: boolean;
  assigned_tenant_count?: number;
};

type Props = {
  user: SystemUserRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SystemUserEditDialog({ user, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('platform_admin');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open || !user) return;
    setFullName(String(user.full_name || ''));
    setRole(String(user.role || 'platform_admin'));
    setIsActive(user.is_active !== false);
  }, [open, user]);

  const save = useMutation({
    mutationFn: () =>
      adminApi.updateSystemUser(user!.id, { fullName: fullName.trim(), role, isActive }),
    onSuccess: () => {
      notify.success('System user updated');
      qc.invalidateQueries({ queryKey: ['systemUsers'] });
      onOpenChange(false);
    },
    onError: (e: Error) => notify.error('Update failed', e.message),
  });

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit system user</DialogTitle>
          <DialogDescription>Mimito staff — {user.email}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Full name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>System role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="platform_admin">Platform Admin</SelectItem>
                <SelectItem value="super_admin">Super Admin</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {role === 'super_admin'
                ? 'Full platform access — manages all tenants and system users.'
                : 'Manages only tenants assigned to them in tenant settings.'}
            </p>
            <Badge variant="outline" className="text-[10px]">
              {ROLE_LABELS[role]}
            </Badge>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Active</Label>
              <p className="text-xs text-muted-foreground">
                {user.assigned_tenant_count
                  ? `Assigned to ${user.assigned_tenant_count} tenant(s)`
                  : 'No tenants assigned'}
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <DialogFooter>
          <LoadingButton loading={save.isPending} onClick={() => save.mutate()}>
            Save changes
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
