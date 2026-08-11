import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '@/components/app/AppLayout';
import { clientApi } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useTenant } from '@/hooks/useTenant';
import { ChangePasswordForm } from '@/components/shared/ChangePasswordForm';
import { ROLE_LABELS, TENANT_ROLES } from '@/lib/systemRoles';
import { notify } from '@/lib/notify';
import { LoadingButton } from '@/components/shared/LoadingButton';
import {
  UserAlertTypesPicker,
  roleBypassesAlertAcl,
  type AlertTypeSelection,
} from '@/components/app/UserAlertTypesPicker';
import { formatDistanceToNow } from 'date-fns';
import { Copy, KeyRound, MoreHorizontal, Pencil, UserPlus, UserX, UserCheck } from 'lucide-react';

interface TenantUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  allowed_alert_types: AlertTypeSelection[] | null;
}

const EMPTY_CREATE = {
  fullName: '',
  email: '',
  role: 'viewer',
  password: '',
  allowedAlertTypes: [] as AlertTypeSelection[],
};

export default function Settings() {
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'tenant_admin' || user?.role === 'platform_admin' || user?.role === 'super_admin';
  const defaultTab = rawTab === 'users' && isAdmin ? 'users' : 'account';
  const { data: tenant } = useTenant();

  const { data: tenantUsers } = useQuery({
    queryKey: ['clientUsers'],
    queryFn: () => clientApi.getTenantUsers(),
    enabled: isAdmin,
  });
  const users = (tenantUsers as TenantUser[] | undefined) || [];

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [editUser, setEditUser] = useState<TenantUser | null>(null);
  const [editForm, setEditForm] = useState({
    fullName: '',
    role: 'viewer',
    allowedAlertTypes: [] as AlertTypeSelection[],
  });
  const [removeUser, setRemoveUser] = useState<TenantUser | null>(null);
  const [resetUser, setResetUser] = useState<TenantUser | null>(null);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['clientUsers'] });

  const createMutation = useMutation({
    mutationFn: () =>
      clientApi.createTenantUser({
        email: createForm.email.trim(),
        fullName: createForm.fullName.trim() || undefined,
        role: createForm.role,
        password: createForm.password || undefined,
        allowedAlertTypes: roleBypassesAlertAcl(createForm.role)
          ? null
          : createForm.allowedAlertTypes.length
            ? createForm.allowedAlertTypes
            : null,
      }),
    onSuccess: (created) => {
      refresh();
      setCreateOpen(false);
      const res = created as { temporaryPassword?: string };
      if (res?.temporaryPassword) {
        setTempPassword({ email: createForm.email.trim(), password: res.temporaryPassword });
      } else {
        notify.success('User created', `${createForm.email.trim()} can now sign in`);
      }
      setCreateForm(EMPTY_CREATE);
    },
    onError: (e) => notify.error('Could not create user', (e as Error).message),
  });

  const updateMutation = useMutation({
    mutationFn: (args: {
      userId: string;
      data: {
        fullName?: string;
        role?: string;
        isActive?: boolean;
        allowedAlertTypes?: AlertTypeSelection[] | null;
      };
    }) => clientApi.updateTenantUser(args.userId, args.data),
    onSuccess: () => {
      refresh();
      setEditUser(null);
      notify.success('User updated');
    },
    onError: (e) => notify.error('Could not update user', (e as Error).message),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => clientApi.removeTenantUser(userId),
    onSuccess: () => {
      refresh();
      setRemoveUser(null);
      notify.success('Access removed', 'The user can no longer sign in');
    },
    onError: (e) => notify.error('Could not remove user', (e as Error).message),
  });

  const resetMutation = useMutation({
    mutationFn: (u: TenantUser) => clientApi.resetTenantUserPassword(u.id),
    onSuccess: (res, u) => {
      setResetUser(null);
      const r = res as { temporaryPassword: string };
      setTempPassword({ email: u.email, password: r.temporaryPassword });
    },
    onError: (e) => notify.error('Could not reset password', (e as Error).message),
  });

  const copyTempPassword = async () => {
    if (!tempPassword) return;
    await navigator.clipboard.writeText(tempPassword.password);
    notify.success('Copied', 'Temporary password copied to clipboard');
  };

  const openEdit = (u: TenantUser) => {
    setEditUser(u);
    setEditForm({
      fullName: u.full_name || '',
      role: u.role,
      allowedAlertTypes: u.allowed_alert_types ?? [],
    });
  };

  const alertAccessLabel = (u: TenantUser) => {
    if (roleBypassesAlertAcl(u.role)) return 'All types';
    if (!u.allowed_alert_types?.length) return 'None';
    return `${u.allowed_alert_types.length} type${u.allowed_alert_types.length === 1 ? '' : 's'}`;
  };

  return (
    <AppLayout title="Settings" subtitle="Account and user management">
      <Tabs defaultValue={defaultTab} key={defaultTab}>
        <TabsList className="branded-tabs">
          <TabsTrigger value="account">Account</TabsTrigger>
          {isAdmin && <TabsTrigger value="users">Users</TabsTrigger>}
        </TabsList>

        <TabsContent value="account" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Your profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm max-w-md">
              <p><span className="text-muted-foreground">Name:</span> {user?.fullName}</p>
              <p><span className="text-muted-foreground">Email:</span> {user?.email}</p>
              <p className="flex items-center gap-2 flex-wrap">
                <span className="text-muted-foreground">Role:</span>
                <Badge variant="outline">{ROLE_LABELS[user?.role || ''] || user?.role}</Badge>
              </p>
              {tenant?.name && (
                <p><span className="text-muted-foreground">Organization:</span> {tenant.name}</p>
              )}
            </CardContent>
          </Card>
          <ChangePasswordForm />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="users" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                <div>
                  <CardTitle>Team members</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Create accounts, assign roles, choose which alert types each user can see, and reset passwords.
                  </p>
                </div>
                <Button
                  onClick={() => {
                    setCreateForm(EMPTY_CREATE);
                    setCreateOpen(true);
                  }}
                  className="shrink-0"
                >
                  <UserPlus className="w-4 h-4 mr-2" /> Add user
                </Button>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Alert access</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden md:table-cell">Last sign-in</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => {
                      const isSelf = u.id === user?.id;
                      return (
                        <TableRow key={u.id} className={!u.is_active ? 'opacity-60' : undefined}>
                          <TableCell className="font-medium">
                            {u.full_name}
                            {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                          </TableCell>
                          <TableCell>{u.email}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{ROLE_LABELS[u.role] || u.role}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {alertAccessLabel(u)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={u.is_active ? 'default' : 'secondary'}>
                              {u.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                            {u.last_login_at
                              ? formatDistanceToNow(new Date(u.last_login_at), { addSuffix: true })
                              : 'Never'}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="User actions">
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEdit(u)}>
                                  <Pencil className="w-4 h-4 mr-2" /> Edit
                                </DropdownMenuItem>
                                {!isSelf && (
                                  <>
                                    <DropdownMenuItem onClick={() => setResetUser(u)}>
                                      <KeyRound className="w-4 h-4 mr-2" /> Reset password
                                    </DropdownMenuItem>
                                    {u.is_active ? (
                                      <DropdownMenuItem
                                        className="text-destructive focus:text-destructive"
                                        onClick={() => setRemoveUser(u)}
                                      >
                                        <UserX className="w-4 h-4 mr-2" /> Remove access
                                      </DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem
                                        onClick={() =>
                                          updateMutation.mutate({ userId: u.id, data: { isActive: true } })
                                        }
                                      >
                                        <UserCheck className="w-4 h-4 mr-2" /> Reactivate
                                      </DropdownMenuItem>
                                    )}
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {users.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No users yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>
              New users are asked to change their password on first sign-in. Choose which alert types they may see.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Full name</Label>
              <Input
                value={createForm.fullName}
                onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
                placeholder="Jane Doe"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                placeholder="jane@company.com"
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={createForm.role} onValueChange={(v) => setCreateForm({ ...createForm, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TENANT_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r] || r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>
                Password{' '}
                <span className="text-muted-foreground font-normal">(optional — leave blank to auto-generate)</span>
              </Label>
              <Input
                type="text"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                placeholder="Auto-generate"
                autoComplete="off"
              />
            </div>
            <UserAlertTypesPicker
              role={createForm.role}
              selected={createForm.allowedAlertTypes}
              onChange={(allowedAlertTypes) => setCreateForm({ ...createForm, allowedAlertTypes })}
              disabled={createMutation.isPending}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <LoadingButton
              onClick={() => createMutation.mutate()}
              loading={createMutation.isPending}
              loadingText="Creating..."
              disabled={!createForm.email.trim()}
            >
              Create user
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>{editUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Full name</Label>
              <Input
                value={editForm.fullName}
                onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select
                value={editForm.role}
                onValueChange={(v) => setEditForm({ ...editForm, role: v })}
                disabled={editUser?.id === user?.id}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TENANT_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r] || r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editUser?.id === user?.id && (
                <p className="text-xs text-muted-foreground mt-1">You cannot change your own role.</p>
              )}
            </div>
            <UserAlertTypesPicker
              role={editForm.role}
              selected={editForm.allowedAlertTypes}
              onChange={(allowedAlertTypes) => setEditForm({ ...editForm, allowedAlertTypes })}
              disabled={updateMutation.isPending}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            <LoadingButton
              onClick={() =>
                editUser &&
                updateMutation.mutate({
                  userId: editUser.id,
                  data: {
                    fullName: editForm.fullName.trim() || undefined,
                    role: editUser.id === user?.id ? undefined : editForm.role,
                    allowedAlertTypes: roleBypassesAlertAcl(editForm.role)
                      ? null
                      : editForm.allowedAlertTypes.length
                        ? editForm.allowedAlertTypes
                        : null,
                  },
                })
              }
              loading={updateMutation.isPending}
              loadingText="Saving..."
            >
              Save changes
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removeUser} onOpenChange={(o) => !o && setRemoveUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove access</DialogTitle>
            <DialogDescription>
              {removeUser?.full_name} ({removeUser?.email}) will no longer be able to sign in.
              You can reactivate them later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveUser(null)}>Cancel</Button>
            <LoadingButton
              variant="destructive"
              onClick={() => removeUser && removeMutation.mutate(removeUser.id)}
              loading={removeMutation.isPending}
              loadingText="Removing..."
            >
              Remove access
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetUser} onOpenChange={(o) => !o && setResetUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Generate a new temporary password for {resetUser?.full_name} ({resetUser?.email}).
              They will be asked to change it on next sign-in.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetUser(null)}>Cancel</Button>
            <LoadingButton
              onClick={() => resetUser && resetMutation.mutate(resetUser)}
              loading={resetMutation.isPending}
              loadingText="Resetting..."
            >
              Reset password
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!tempPassword} onOpenChange={(o) => !o && setTempPassword(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Temporary password</DialogTitle>
            <DialogDescription>
              Share this with {tempPassword?.email}. It is shown only once — they must change it on first sign-in.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-sm select-all">
              {tempPassword?.password}
            </code>
            <Button variant="outline" size="sm" onClick={() => void copyTempPassword()} aria-label="Copy password">
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setTempPassword(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
