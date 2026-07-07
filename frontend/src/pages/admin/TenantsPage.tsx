import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { adminApi } from '@/lib/api';
import { BRAND } from '@/lib/branding';
import { notify } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/providers/AuthProvider';
import { isSuperAdmin } from '@/lib/systemRoles';
import { Plus } from 'lucide-react';
import { slugify } from '@/lib/slugify';

const STATUS_COLORS: Record<string, string> = {
  active: 'default',
  draft: 'secondary',
  warning: 'secondary',
  inactive: 'outline',
  suspended: 'destructive',
};

export default function AdminTenantsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const superView = isSuperAdmin(user?.role);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('name');
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const generatedSlug = slugify(name);

  const { data, isLoading } = useQuery({
    queryKey: ['adminTenants', search, status, sort],
    queryFn: () => adminApi.listTenants({ search, status, sort }),
  });

  const result = data as {
    tenants: Array<Record<string, unknown>>;
    total: number;
    byManager?: Array<{ managerId: string | null; managerName: string; tenants: Array<Record<string, unknown>> }>;
  } | undefined;
  const tenants = result?.tenants || [];
  const byManager = superView ? result?.byManager : undefined;

  const create = useMutation({
    mutationFn: () => adminApi.createTenant({ name: name.trim(), slug: generatedSlug, primaryColor: BRAND.primary }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['adminTenants'] });
      setName('');
      const tenant = data as { id?: string };
      if (tenant?.id) {
        notify.success('Tenant created', 'Configure integrations on the next screen');
        navigate(`/admin/tenants/${tenant.id}`);
      } else {
        notify.error('Create failed', 'Server did not return a tenant id');
      }
    },
    onError: (err) => notify.error('Create failed', (err as Error).message),
  });

  const bulkAction = useMutation({
    mutationFn: (action: string) => adminApi.bulkTenants(action, selected),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminTenants'] });
      setSelected([]);
    },
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  return (
    <AdminLayout
      title={`Tenants (${result?.total ?? 0})`}
      subtitle="Multi-tenant control"
      actions={
        <Link to="/admin/tenants/new">
          <Button size="sm"><Plus className="w-4 h-4 mr-1" />New Tenant</Button>
        </Link>
      }
    >
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Create Tenant</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
            <div className="max-w-xs flex-1">
              <Input placeholder="Tenant name" value={name} onChange={(e) => setName(e.target.value)} />
              {name.trim() && (
                <p className="text-xs text-muted-foreground mt-1">
                  Slug: <code>{generatedSlug}</code>
                </p>
              )}
            </div>
            <Button onClick={() => create.mutate()} disabled={!name.trim() || !generatedSlug}>Create</Button>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2 items-center">
          <Input placeholder="Search tenants..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Sort" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="vehicles">Vehicles</SelectItem>
              <SelectItem value="users">Users</SelectItem>
              <SelectItem value="created">Created</SelectItem>
            </SelectContent>
          </Select>
          {selected.length > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={() => bulkAction.mutate('activate')}>Activate</Button>
              <Button size="sm" variant="outline" onClick={() => bulkAction.mutate('deactivate')}>Deactivate</Button>
            </>
          )}
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="p-6">Loading...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Tenant</TableHead>
                    {superView && <TableHead>Manager</TableHead>}
                    <TableHead>Vehicles</TableHead>
                    <TableHead>Users</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Modules</TableHead>
                    <TableHead>Integrations</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.map((t) => {
                    const st = String(t.status || (t.is_active ? 'active' : 'inactive'));
                    return (
                      <TableRow key={String(t.id)}>
                        <TableCell>
                          <input type="checkbox" checked={selected.includes(String(t.id))} onChange={() => toggleSelect(String(t.id))} />
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{String(t.name)}</p>
                          <p className="text-xs text-muted-foreground">{String(t.slug)}</p>
                        </TableCell>
                        {superView && (
                          <TableCell className="text-sm">
                            {String(t.assigned_manager_name || 'Unassigned')}
                          </TableCell>
                        )}
                        <TableCell>{String(t.vehicle_count ?? 0)}</TableCell>
                        <TableCell>{String(t.user_count ?? 0)}</TableCell>
                        <TableCell>
                          <Badge variant={(STATUS_COLORS[st] || 'outline') as 'default'}>{st}</Badge>
                        </TableCell>
                        <TableCell>{String(t.enabled_modules ?? 0)}/{String(t.total_modules ?? 14)}</TableCell>
                        <TableCell>
                          <span className="font-mono text-xs">{String(t.integration_codes || '—')}</span>
                        </TableCell>
                        <TableCell>
                          <Link to={`/admin/tenants/${t.id}`}>
                            <Button size="sm" variant="outline">Manage</Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
