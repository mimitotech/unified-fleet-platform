import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { adminApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ROLE_LABELS } from '@/lib/systemRoles';
import { notify } from '@/lib/notify';
import { TableLoader } from '@/components/shared/TableLoader';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ClientUserEditDialog, type ClientUserRow } from '@/components/admin/ClientUserEditDialog';
import { Pencil, RefreshCw } from 'lucide-react';

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [selected, setSelected] = useState<string[]>([]);
  const [editingUser, setEditingUser] = useState<ClientUserRow | null>(null);

  const { data: users, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['adminUsers', search, role, status],
    queryFn: () => adminApi.listUsers({ search, role, status }),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const bulkAction = useMutation({
    mutationFn: (action: string) => adminApi.bulkUsers(action, selected),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['adminUsers'] });
      setSelected([]);
      const d = data as { updated?: number; skipped?: number };
      notify.success(`Updated ${d.updated ?? selected.length} user(s)`);
    },
    onError: (e: Error) => notify.error('Bulk action failed', e.message),
  });

  const resetPassword = useMutation({
    mutationFn: (id: string) => adminApi.resetUserPassword(id),
    onSuccess: (data) => {
      const d = data as { temporaryPassword?: string };
      if (!d?.temporaryPassword) {
        notify.error('Reset incomplete', 'No temporary password returned. Try again.');
        return;
      }
      notify.info('Temporary password created', `Share securely: ${d.temporaryPassword}`);
    },
    onError: (e: Error) => notify.error('Reset failed', e.message),
  });

  const list = (users as Array<Record<string, unknown>>) || [];

  const openEdit = (u: Record<string, unknown>) => {
    setEditingUser({
      id: String(u.id),
      email: String(u.email),
      full_name: String(u.full_name || ''),
      role: String(u.role),
      is_active: Boolean(u.is_active),
      tenant_id: u.tenant_id ? String(u.tenant_id) : undefined,
      tenant_name: u.tenant_name ? String(u.tenant_name) : undefined,
      modules: Array.isArray(u.modules) ? (u.modules as string[]) : [],
    });
  };

  return (
    <AdminLayout
      title={`Client Users (${list.length})`}
      subtitle="Live list from the database — hard-deleted users no longer appear. Soft-deactivated users are under Inactive."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="tenant_admin">Client Admin</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="operator">Operator</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="all">All statuses</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {selected.length > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={() => bulkAction.mutate('activate')}>Activate</Button>
              <Button size="sm" variant="outline" onClick={() => bulkAction.mutate('deactivate')}>Deactivate</Button>
            </>
          )}
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? <div className="p-6"><TableLoader rows={8} /></div> : list.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                No users found for this filter. Hard-deleted accounts are gone; switch to Inactive or All if you deactivated them in-app.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>User</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead className="w-36">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((u) => (
                    <TableRow key={String(u.id)}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selected.includes(String(u.id))}
                          onChange={() => setSelected((p) => p.includes(String(u.id)) ? p.filter((x) => x !== String(u.id)) : [...p, String(u.id)])}
                        />
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{String(u.full_name)}</p>
                        <p className="text-xs text-muted-foreground">{String(u.email)}</p>
                      </TableCell>
                      <TableCell>
                        {u.tenant_id ? (
                          <Link to={`/admin/tenants/${String(u.tenant_id)}`} className="text-primary hover:underline text-sm">
                            {String(u.tenant_name || '—')}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell><Badge variant="outline">{ROLE_LABELS[String(u.role)] || String(u.role)}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={u.is_active ? 'default' : 'destructive'}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {u.last_login_at ? new Date(String(u.last_login_at)).toLocaleString() : 'Never'}
                      </TableCell>
                      <TableCell className="space-x-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(u)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" />
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => resetPassword.mutate(String(u.id))}>
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

      <ClientUserEditDialog
        user={editingUser}
        open={Boolean(editingUser)}
        onOpenChange={(open) => !open && setEditingUser(null)}
      />
    </AdminLayout>
  );
}
