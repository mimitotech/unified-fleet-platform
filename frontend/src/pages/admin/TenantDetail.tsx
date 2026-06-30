import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

export default function TenantDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: tenant } = useQuery({
    queryKey: ['tenant', id],
    queryFn: () => adminApi.getTenant(id!),
    enabled: !!id,
  });

  const { data: integrations } = useQuery({
    queryKey: ['integrations', id],
    queryFn: () => adminApi.getIntegrations(id!),
    enabled: !!id,
  });

  const { data: modules } = useQuery({
    queryKey: ['adminModules', id],
    queryFn: () => adminApi.getModules(id!),
    enabled: !!id,
  });

  const [wialonToken, setWialonToken] = useState('');
  const [loconavToken, setLoconavToken] = useState('');
  const [tracksolidKey, setTracksolidKey] = useState('');
  const [tracksolidSecret, setTracksolidSecret] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#006f45');
  const [logoUrl, setLogoUrl] = useState('');

  const saveWialon = useMutation({
    mutationFn: () => adminApi.saveIntegration(id!, 'wialon', { token: wialonToken }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations', id] }),
  });

  const saveLoconav = useMutation({
    mutationFn: () => adminApi.saveIntegration(id!, 'loconav', { userAuthentication: loconavToken }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations', id] }),
  });

  const saveTrackSolid = useMutation({
    mutationFn: () => adminApi.saveIntegration(id!, 'tracksolid', { apiKey: tracksolidKey, secretKey: tracksolidSecret }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations', id] }),
  });

  const saveBranding = useMutation({
    mutationFn: () => adminApi.updateTenant(id!, { primaryColor, logoUrl }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant', id] }),
  });

  const toggleModule = (key: string, isEnabled: boolean) => {
    const updated = (modules || [])
      .map((m: { key?: string; moduleKey?: string; is_enabled?: boolean; isEnabled?: boolean }) => ({
        key: (m.key || m.moduleKey || '') as string,
        isEnabled: (m.key || m.moduleKey) === key ? isEnabled : Boolean(m.is_enabled ?? m.isEnabled),
      }))
      .filter((m) => m.key);
    adminApi.updateModules(id!, updated).then(() => qc.invalidateQueries({ queryKey: ['adminModules', id] }));
  };

  const t = tenant as Record<string, unknown> | undefined;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link to="/admin" className="text-sm text-primary">← Tenants</Link>
        <h1 className="text-2xl font-bold">{(t?.name as string) || 'Tenant'}</h1>

        <Tabs defaultValue="integrations">
          <TabsList>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="modules">Modules</TabsTrigger>
            <TabsTrigger value="branding">Branding</TabsTrigger>
          </TabsList>

          <TabsContent value="integrations" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex justify-between">
                  Wialon
                  <Badge variant={(integrations as Array<{ source_type: string; is_active: boolean }>)?.find((i) => i.source_type === 'wialon')?.is_active ? 'default' : 'secondary'}>
                    {(integrations as Array<{ source_type: string; is_active: boolean }>)?.find((i) => i.source_type === 'wialon')?.is_active ? 'Connected' : 'Not configured'}
                  </Badge>
                </CardTitle>
                <CardDescription>GPS, fuel, trips</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Input type="password" placeholder="Wialon token" value={wialonToken} onChange={(e) => setWialonToken(e.target.value)} />
                <Button onClick={() => saveWialon.mutate()}>Save Wialon</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex justify-between">
                  LocoNav
                  <Badge variant="secondary">Video</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Input type="password" placeholder="User-Authentication token" value={loconavToken} onChange={(e) => setLoconavToken(e.target.value)} />
                <Button onClick={() => saveLoconav.mutate()}>Save LocoNav</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>TrackSolid Pro</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Input placeholder="API Key" value={tracksolidKey} onChange={(e) => setTracksolidKey(e.target.value)} />
                <Input type="password" placeholder="Secret Key" value={tracksolidSecret} onChange={(e) => setTracksolidSecret(e.target.value)} />
                <Button onClick={() => saveTrackSolid.mutate()}>Save TrackSolid</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="modules" className="mt-4 space-y-2">
            {(modules as Array<{ key?: string; moduleKey?: string; label: string; is_enabled?: boolean; isEnabled?: boolean }>)?.map((m) => {
              const key = m.key || m.moduleKey || '';
              const enabled = m.is_enabled ?? m.isEnabled ?? false;
              return (
                <div key={key} className="flex items-center justify-between fleet-card py-3">
                  <Label>{m.label}</Label>
                  <Switch checked={enabled} onCheckedChange={(v) => toggleModule(key, v)} />
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="branding" className="mt-4 space-y-4">
            <div>
              <Label>Primary color</Label>
              <Input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-10 w-24" />
            </div>
            <div>
              <Label>Logo URL</Label>
              <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
            </div>
            <Button onClick={() => saveBranding.mutate()}>Save branding</Button>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
