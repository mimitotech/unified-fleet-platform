import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { adminApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { MetricCard } from '@/components/app/MetricCard';
import { LoginSlidesAdminPanel } from '@/components/admin/LoginSlidesAdminPanel';
import { LoginTrustLogosAdminPanel } from '@/components/admin/LoginTrustLogosAdminPanel';
import { Database, Server, Zap, Radio } from 'lucide-react';

export default function AdminSystemPage() {
  const qc = useQueryClient();
  const { data: health } = useQuery({ queryKey: ['systemHealth'], queryFn: () => adminApi.getSystemHealth() });
  const { data: settings } = useQuery({ queryKey: ['systemSettings'], queryFn: () => adminApi.getSystemSettings() });

  const [general, setGeneral] = useState<{ platformName?: string; defaultLanguage?: string; defaultTimezone?: string }>({});
  const [email, setEmail] = useState<{
    smtpHost?: string;
    smtpPort?: number;
    smtpSecure?: boolean;
    smtpUser?: string;
    smtpPassword?: string;
    fromEmail?: string;
    fromName?: string;
  }>({});
  const [security, setSecurity] = useState<{ minPasswordLength?: number; sessionTimeoutMinutes?: number }>({});
  const [driverCompliance, setDriverCompliance] = useState<{ alertDays?: string; expiredAction?: 'warn' | 'off_duty' }>({});

  const saveSettings = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => adminApi.updateSystemSettings(key, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['systemSettings'] }),
  });

  const h = health as Record<string, unknown> | undefined;
  const s = settings as Record<string, Record<string, unknown>> | undefined;
  const redis = h?.redis as { status?: string; message?: string } | undefined;
  const redisStatus = redis?.status ?? 'error';
  const redisLabel = redisStatus === 'ok' ? 'OK' : redisStatus === 'disabled' ? 'Off' : 'Error';
  const redisVariant = redisStatus === 'ok' ? 'success' : redisStatus === 'disabled' ? 'default' : 'destructive';
  const redisSubtitle =
    redisStatus === 'error' ? (redis?.message || 'Start Redis: docker compose up -d redis') : undefined;

  const initGeneral = () => {
    if (s?.general && !general.platformName) setGeneral(s.general as typeof general);
  };
  initGeneral();

  return (
    <AdminLayout title="System" subtitle="Platform configuration and health">
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Badge variant={h?.overall === 'operational' ? 'default' : 'destructive'}>
            {h?.overall === 'operational' ? 'All Systems Operational' : 'Degraded'}
          </Badge>
        </div>

        <div className="stat-strip-4">
          <MetricCard title="API" value={`${(h?.api as { latencyMs?: number })?.latencyMs ?? '—'}ms`} subtitle="DB ping latency" icon={Zap} variant="success" size="xxs" />
          <MetricCard title="Database" value={(h?.database as { status?: string })?.status === 'ok' ? 'OK' : 'Error'} icon={Database} variant="primary" size="xxs" />
          <MetricCard title="Redis" value={redisLabel} subtitle={redisSubtitle} icon={Server} variant={redisVariant} size="xxs" />
          <MetricCard title="Webhooks (24h)" value={String((h?.webhooks as { events24h?: number })?.events24h ?? 0)} icon={Radio} variant="info" size="xxs" />
        </div>

        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="login">Login media</TabsTrigger>
            <TabsTrigger value="email">Email</TabsTrigger>
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
            <TabsTrigger value="backup">Backup</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4">
            <Card>
              <CardHeader><CardTitle>General Settings</CardTitle></CardHeader>
              <CardContent className="space-y-4 max-w-lg">
                <div>
                  <Label>Platform Name</Label>
                  <Input
                    defaultValue={String(s?.general?.platformName || 'MAMS — Mimito Asset Management System')}
                    onChange={(e) => setGeneral({ ...general, platformName: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Default Language</Label>
                  <Input defaultValue={String(s?.general?.defaultLanguage || 'en')} onChange={(e) => setGeneral({ ...general, defaultLanguage: e.target.value })} />
                </div>
                <div>
                  <Label>Default Timezone</Label>
                  <Input defaultValue={String(s?.general?.defaultTimezone || 'UTC')} onChange={(e) => setGeneral({ ...general, defaultTimezone: e.target.value })} />
                </div>
                <Button onClick={() => saveSettings.mutate({ key: 'general', value: { ...s?.general, ...general } })}>Save</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="login" className="mt-4 space-y-6">
            <LoginSlidesAdminPanel />
            <LoginTrustLogosAdminPanel />
          </TabsContent>

          <TabsContent value="email" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Email Settings</CardTitle>
                <CardDescription>
                  Outbound SMTP for password resets and account emails. Prefer Hostinger env vars
                  (SMTP_*); values below sync from env on boot.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 max-w-lg">
                <div>
                  <Label>SMTP Host</Label>
                  <Input
                    defaultValue={String(s?.email?.smtpHost || '')}
                    onChange={(e) => setEmail({ ...email, smtpHost: e.target.value })}
                  />
                </div>
                <div>
                  <Label>SMTP Port</Label>
                  <Input
                    type="number"
                    defaultValue={String(s?.email?.smtpPort || 465)}
                    onChange={(e) => setEmail({ ...email, smtpPort: parseInt(e.target.value, 10) })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={Boolean(email.smtpSecure ?? s?.email?.smtpSecure ?? true)}
                    onCheckedChange={(v) => setEmail({ ...email, smtpSecure: v })}
                  />
                  <Label>TLS/SSL (port 465)</Label>
                </div>
                <div>
                  <Label>SMTP Username</Label>
                  <Input
                    defaultValue={String(s?.email?.smtpUser || s?.email?.fromEmail || '')}
                    onChange={(e) => setEmail({ ...email, smtpUser: e.target.value })}
                  />
                </div>
                <div>
                  <Label>SMTP Password</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    onChange={(e) => setEmail({ ...email, smtpPassword: e.target.value })}
                  />
                </div>
                <div>
                  <Label>From Email</Label>
                  <Input
                    defaultValue={String(s?.email?.fromEmail || '')}
                    onChange={(e) => setEmail({ ...email, fromEmail: e.target.value })}
                  />
                </div>
                <div>
                  <Label>From Name</Label>
                  <Input
                    defaultValue={String(s?.email?.fromName || '')}
                    onChange={(e) => setEmail({ ...email, fromName: e.target.value })}
                  />
                </div>
                <Button
                  onClick={() =>
                    saveSettings.mutate({
                      key: 'email',
                      value: {
                        ...s?.email,
                        ...email,
                        smtpPassword: email.smtpPassword || s?.email?.smtpPassword,
                      },
                    })
                  }
                >
                  Save Email Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="webhooks" className="mt-4">
            <Card>
              <CardHeader><CardTitle>Webhook Settings</CardTitle></CardHeader>
              <CardContent className="space-y-4 max-w-lg">
                <p className="text-sm text-muted-foreground">
                  LocoNav: POST /api/webhooks/loconav/:tenantSlug<br />
                  TrackSolid: POST /api/webhooks/tracksolid/:tenantSlug
                </p>
                <div className="flex items-center gap-2">
                  <Switch defaultChecked />
                  <Label>Alerts events</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch defaultChecked />
                  <Label>Status updates</Label>
                </div>
                <Button onClick={() => saveSettings.mutate({ key: 'webhooks', value: s?.webhooks || {} })}>Save</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="backup" className="mt-4">
            <Card>
              <CardHeader><CardTitle>Backup Settings</CardTitle></CardHeader>
              <CardContent className="space-y-4 max-w-lg">
                <div className="flex items-center gap-2">
                  <Switch defaultChecked={Boolean(s?.backup?.autoBackup)} />
                  <Label>Auto Backup Enabled</Label>
                </div>
                <div><Label>Frequency</Label><Input defaultValue={String(s?.backup?.frequency || 'daily')} /></div>
                <div><Label>Retention (days)</Label><Input type="number" defaultValue={String(s?.backup?.retentionDays || 30)} /></div>
                <Button onClick={() => saveSettings.mutate({ key: 'backup', value: s?.backup || {} })}>Save</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="mt-4">
            <Card>
              <CardHeader><CardTitle>Security Settings</CardTitle></CardHeader>
              <CardContent className="space-y-4 max-w-lg">
                <div><Label>Min Password Length</Label><Input type="number" defaultValue={String(s?.security?.minPasswordLength || 8)} onChange={(e) => setSecurity({ minPasswordLength: parseInt(e.target.value, 10) })} /></div>
                <div><Label>Session Timeout (minutes)</Label><Input type="number" defaultValue={String(s?.security?.sessionTimeoutMinutes || 30)} onChange={(e) => setSecurity({ sessionTimeoutMinutes: parseInt(e.target.value, 10) })} /></div>
                <div className="flex items-center gap-2"><Switch defaultChecked={Boolean(s?.security?.requireSpecialChar)} /><Label>Require special characters</Label></div>
                <Button onClick={() => saveSettings.mutate({ key: 'security', value: { ...s?.security, ...security } })}>Save Security Settings</Button>
              </CardContent>
            </Card>
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Driver License Compliance</CardTitle>
                <CardDescription>
                  Alert windows and action for expired licenses. Leave alert windows as comma-separated days (e.g. 30,14,7).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 max-w-lg">
                <div>
                  <Label>Alert windows (days)</Label>
                  <Input
                    defaultValue={String(
                      (s?.driver_license_policy?.alertDays as number[] | undefined)?.join(',') || '30,14,7'
                    )}
                    onChange={(e) => setDriverCompliance((v) => ({ ...v, alertDays: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>When license is expired</Label>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    defaultValue={String(s?.driver_license_policy?.expiredAction || 'warn')}
                    onChange={(e) =>
                      setDriverCompliance((v) => ({
                        ...v,
                        expiredAction: e.target.value === 'off_duty' ? 'off_duty' : 'warn',
                      }))
                    }
                  >
                    <option value="warn">Warn only</option>
                    <option value="off_duty">Auto set driver to Off duty</option>
                  </select>
                </div>
                <Button
                  onClick={() => {
                    const parsedDays = String(driverCompliance.alertDays || '')
                      .split(',')
                      .map((s2) => parseInt(s2.trim(), 10))
                      .filter((n) => Number.isFinite(n) && n > 0 && n <= 365)
                      .sort((a, b) => b - a);
                    saveSettings.mutate({
                      key: 'driver_license_policy',
                      value: {
                        alertDays: parsedDays.length
                          ? [...new Set(parsedDays)]
                          : ((s?.driver_license_policy?.alertDays as number[] | undefined) || [30, 14, 7]),
                        expiredAction: driverCompliance.expiredAction || s?.driver_license_policy?.expiredAction || 'warn',
                      },
                    });
                  }}
                >
                  Save Driver Compliance Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {(h?.recentIncidents as Array<Record<string, unknown>>)?.length ? (
          <Card>
            <CardHeader><CardTitle>Recent Incidents</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(h.recentIncidents as Array<Record<string, unknown>>).map((inc, i) => (
                <p key={i} className="text-sm text-destructive">
                  {String(inc.message)} — {new Date(String(inc.started_at)).toLocaleString()}
                </p>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </AdminLayout>
  );
}
