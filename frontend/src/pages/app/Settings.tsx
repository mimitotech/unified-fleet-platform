import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '@/components/app/AppLayout';
import { clientApi } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useTenant } from '@/hooks/useTenant';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { TenantLogo } from '@/components/shared/TenantLogo';
import { TENANT_BRAND_DEFAULTS } from '@/lib/tenantBranding';
import { ChangePasswordForm } from '@/components/shared/ChangePasswordForm';
import { ROLE_LABELS } from '@/lib/systemRoles';
import { notify } from '@/lib/notify';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { WialonConnectionCard } from '@/components/app/WialonConnectionCard';

export default function Settings() {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'account';
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'tenant_admin' || user?.role === 'platform_admin' || user?.role === 'super_admin';
  const { data: tenant } = useTenant();
  const branding = useTenantBranding();

  const { data: prefs } = useQuery({ queryKey: ['preferences'], queryFn: () => clientApi.getPreferences() });
  const { data: tenantUsers } = useQuery({
    queryKey: ['clientUsers'],
    queryFn: () => clientApi.getTenantUsers(),
    enabled: isAdmin,
  });

  const [form, setForm] = useState({
    language: 'en', timezone: 'UTC', dateFormat: 'YYYY-MM-DD',
    timeFormat: '24h', unitSystem: 'metric',
    emailNotifications: true, inAppNotifications: true, smsNotifications: false,
  });

  const p = prefs as Record<string, unknown> | undefined;

  useEffect(() => {
    if (!p) return;
    setForm({
      language: String(p.language || 'en'),
      timezone: String(p.timezone || 'UTC'),
      dateFormat: String(p.date_format || p.dateFormat || 'YYYY-MM-DD'),
      timeFormat: String(p.time_format || p.timeFormat || '24h'),
      unitSystem: String(p.unit_system || p.unitSystem || 'metric'),
      emailNotifications: Boolean(p.email_notifications ?? p.emailNotifications ?? true),
      inAppNotifications: Boolean(p.in_app_notifications ?? p.inAppNotifications ?? true),
      smsNotifications: Boolean(p.sms_notifications ?? p.smsNotifications ?? false),
    });
  }, [p]);

  const savePrefs = useMutation({
    mutationFn: () => clientApi.updatePreferences(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['preferences'] });
      notify.success('Preferences saved', 'Your settings have been updated');
    },
  });

  return (
    <AppLayout title="Settings" subtitle="Preferences and tenant configuration">
      <Tabs defaultValue={defaultTab} key={defaultTab}>
        <TabsList className="bg-muted/80 border border-primary/10">
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          {isAdmin && <TabsTrigger value="wialon">Wialon</TabsTrigger>}
          {isAdmin && <TabsTrigger value="branding">Branding</TabsTrigger>}
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

        <TabsContent value="preferences" className="mt-4">
          <Card>
            <CardHeader><CardTitle>General</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
              <div>
                <Label>Language</Label>
                <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Timezone</Label><Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} /></div>
              <div>
                <Label>Time Format</Label>
                <Select value={form.timeFormat} onValueChange={(v) => setForm({ ...form, timeFormat: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">24 hour</SelectItem>
                    <SelectItem value="12h">12 hour</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Units</Label>
                <Select value={form.unitSystem} onValueChange={(v) => setForm({ ...form, unitSystem: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="metric">Metric</SelectItem>
                    <SelectItem value="imperial">Imperial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <LoadingButton
                onClick={() => savePrefs.mutate()}
                loading={savePrefs.isPending}
                loadingText="Saving..."
                className="md:col-span-2 w-fit"
              >
                Save Preferences
              </LoadingButton>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Notification Settings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between"><Label>Email notifications</Label><Switch checked={form.emailNotifications} onCheckedChange={(v) => setForm({ ...form, emailNotifications: v })} /></div>
              <div className="flex items-center justify-between"><Label>In-app notifications</Label><Switch checked={form.inAppNotifications} onCheckedChange={(v) => setForm({ ...form, inAppNotifications: v })} /></div>
              <div className="flex items-center justify-between"><Label>SMS notifications</Label><Switch checked={form.smsNotifications} onCheckedChange={(v) => setForm({ ...form, smsNotifications: v })} /></div>
              <LoadingButton
                onClick={() => savePrefs.mutate()}
                loading={savePrefs.isPending}
                loadingText="Saving..."
              >
                Save notifications
              </LoadingButton>
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="wialon" className="mt-4">
            <WialonConnectionCard />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="branding" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Organization branding</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4 p-4 rounded-xl border border-primary/15 bg-muted/30">
                  <TenantLogo logoUrl={branding.logoUrl} name={branding.name} size="lg" variant="on-light" />
                  <div>
                    <p className="text-xl font-bold text-primary">{branding.name}</p>
                    <p className="text-sm text-muted-foreground">{tenant?.slug}</p>
                    {tenant?.contactEmail && (
                      <p className="text-sm text-muted-foreground mt-1">{tenant.contactEmail}</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 max-w-md">
                  <div className="rounded-lg border p-3 text-center">
                    <div className="h-8 rounded-md mb-2" style={{ backgroundColor: branding.primaryColor }} />
                    <p className="text-xs font-medium">Primary</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{branding.primaryColor}</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <div className="h-8 rounded-md mb-2" style={{ backgroundColor: branding.secondaryColor }} />
                    <p className="text-xs font-medium">Secondary</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{branding.secondaryColor}</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <div className="h-8 rounded-md mb-2" style={{ backgroundColor: branding.accentColor }} />
                    <p className="text-xs font-medium">Accent</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{branding.accentColor}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Colors and logo are configured in Platform Admin. Unset values use MAMS defaults
                  ({TENANT_BRAND_DEFAULTS.primaryColor} primary).
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="users" className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(tenantUsers as Array<Record<string, unknown>>)?.map((u) => (
                  <TableRow key={String(u.id)}>
                    <TableCell>{String(u.full_name)}</TableCell>
                    <TableCell>{String(u.email)}</TableCell>
                    <TableCell><Badge variant="outline">{String(u.role)}</Badge></TableCell>
                    <TableCell>{u.is_active ? 'Active' : 'Inactive'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-sm text-muted-foreground mt-4">Manage users from the Platform Admin tenant detail page.</p>
          </TabsContent>
        )}
      </Tabs>
    </AppLayout>
  );
}
