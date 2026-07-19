import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { adminApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

export default function AdminMarketplacePage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['marketplace'], queryFn: () => adminApi.getMarketplace() });

  const toggle = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      adminApi.updateMarketplace(key, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['marketplace'] }),
  });

  const items = (data as Array<Record<string, unknown>>) || [];

  return (
    <AdminLayout title="Integration Marketplace" subtitle="Available platform integrations">
      {isLoading ? <p>Loading...</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <Card key={String(item.key)}>
              <CardHeader>
                <CardTitle className="flex justify-between items-center text-base">
                  {String(item.name)}
                  {item.is_builtin ? <Badge>Built-in</Badge> : <Badge variant="outline">Plugin</Badge>}
                </CardTitle>
                <CardDescription>{String(item.description)}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <Badge variant="secondary">{String(item.category)}</Badge>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={Boolean(item.is_enabled_globally)}
                    onCheckedChange={(v) => toggle.mutate({ key: String(item.key), enabled: v })}
                  />
                  <span className="text-xs text-muted-foreground">
                    {item.is_enabled_globally ? 'Enabled' : 'Available'}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
