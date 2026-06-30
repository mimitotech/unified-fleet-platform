import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { adminApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function AdminTenants() {
  const qc = useQueryClient();
  const { data: tenants, isLoading } = useQuery({ queryKey: ['adminTenants'], queryFn: () => adminApi.listTenants() });
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');

  const create = useMutation({
    mutationFn: () => adminApi.createTenant({ name, slug, primaryColor: '#006f45' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminTenants'] });
      setName('');
      setSlug('');
    },
  });

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Admin — Tenants</h1>
          <Link to="/auth/login"><Button variant="outline">Sign out</Button></Link>
        </div>

        <Card>
          <CardHeader><CardTitle>Create tenant</CardTitle></CardHeader>
          <CardContent className="flex gap-2 flex-wrap">
            <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
            <Button onClick={() => create.mutate()} disabled={!name || !slug}>Create</Button>
          </CardContent>
        </Card>

        {isLoading ? (
          <p>Loading...</p>
        ) : (
          <div className="grid gap-4">
            {(tenants as Array<{ id: string; name: string; slug: string; is_active: boolean }>)?.map((t) => (
              <Card key={t.id}>
                <CardContent className="pt-6 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-sm text-muted-foreground">{t.slug}</p>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Badge>{t.is_active ? 'Active' : 'Inactive'}</Badge>
                    <Link to={`/admin/tenants/${t.id}`}>
                      <Button size="sm">Manage</Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
