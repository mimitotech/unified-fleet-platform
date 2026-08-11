import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { adminApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/shared/PasswordInput';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { ROLE_LABELS } from '@/lib/systemRoles';
import { notify } from '@/lib/notify';
import { SystemUserEditDialog, type SystemUserRow } from '@/components/admin/SystemUserEditDialog';
import { Pencil } from 'lucide-react';
import { isStrongPassword } from '@/lib/passwordPolicy';
import { PasswordStrengthIndicator } from '@/components/shared/PasswordStrengthIndicator';

export default function SystemUsersPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'platform_admin',
  });
  const [editingUser, setEditingUser] = useState<SystemUserRow | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ['systemUsers'],
    queryFn: () => adminApi.listSystemUsers(),
  });

  const createUser = useMutation({
    mutationFn: () => adminApi.createSystemUser(form),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['systemUsers'] });
      setForm({ email: '', password: '', fullName: '', role: 'platform_admin' });
      const temp = (data as { temporaryPassword?: string })?.temporaryPassword;
      if (temp) {
        notify.success('System user created', `Temporary password: ${temp}`);
      } else {
        notify.success('System user created');
      }
    },
    onError: (e) => notify.error('Create failed', (e as Error).message),
  });

  const resetPassword = useMutation({
    mutationFn: (id: string) => adminApi.resetSystemUserPassword(id),
    onSuccess: (data) => {
      const d = data as { temporaryPassword: string };
      notify.success('Password reset', `Temporary password: ${d.temporaryPassword}`);
    },
  });

  const list = (users as Array<Record<string, unknown>>) || [];

  const openEdit = (u: Record<string, unknown>) => {
    setEditingUser({
      id: String(u.id),
      email: String(u.email),
      full_name: String(u.full_name || ''),
      role: String(u.role),
      is_active: Boolean(u.is_active),
      assigned_tenant_count: Number(u.assigned_tenant_count || 0),
    });
  };

  return (
    <AdminLayout
      title="System Users"
      subtitle="Mimito staff — edit roles and access for platform administrators"
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Add Mimito staff</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Full name</Label>
              <Input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="Jane Admin"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="staff@mimito.ug"
              />
            </div>
            <div>
              <Label>Password</Label>
              <PasswordInput
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Strong password"
                minLength={8}
              />
              <div className="mt-2">
                <PasswordStrengthIndicator password={form.password} />
              </div>
            </div>
            <div>
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="platform_admin">Platform Admin</SelectItem>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={() => createUser.mutate()}
              disabled={
                !form.email ||
                !form.password ||
                !isStrongPassword(form.password) ||
                createUser.isPending
              }
            >
              Create system user
            </Button>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardContent className="p-0">
            {isLoading ? (
              <p className="p-6 text-muted-foreground">Loading...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Clients</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((u) => (
                    <TableRow key={String(u.id)}>
                      <TableCell>
                        <p className="font-medium">{String(u.full_name)}</p>
                        <p className="text-xs text-muted-foreground">{String(u.email)}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.role === 'super_admin' ? 'default' : 'secondary'}>
                          {ROLE_LABELS[String(u.role)] || String(u.role)}
                        </Badge>
                      </TableCell>
                      <TableCell>{String(u.assigned_tenant_count ?? 0)}</TableCell>
                      <TableCell>
                        <Badge variant={u.is_active ? 'default' : 'destructive'}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="space-x-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(u)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => resetPassword.mutate(String(u.id))}
                        >
                          Reset PW
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <SystemUserEditDialog
        user={editingUser}
        open={Boolean(editingUser)}
        onOpenChange={(open) => !open && setEditingUser(null)}
      />
    </AdminLayout>
  );
}
