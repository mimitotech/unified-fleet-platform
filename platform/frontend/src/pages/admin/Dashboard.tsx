import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { adminApi } from '@/lib/api';
import { MetricCard } from '@/components/app/MetricCard';
import { AnalyticsPanel } from '@/components/shared/AnalyticsPanel';
import { RefreshButton } from '@/components/shared/RefreshButton';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  CHART,
  FLEET_STATUS,
  ALERT_SEVERITY,
  SOURCE_CHART_COLORS,
} from '@/lib/chartColors';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import {
  Building2,
  Truck,
  Users,
  Activity,
  AlertTriangle,
  Radio,
  LogIn,
  RefreshCw,
  Bell,
  TrendingUp,
  ClipboardList,
  Zap,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';

const POLL_MS = 60_000;

const SOURCE_LABELS: Record<string, string> = {
  wialon: 'Wialon',
  loconav: 'LocoNav',
  tracksolid: 'TrackSolid',
};

function formatHour(iso: string) {
  try {
    return format(parseISO(iso), 'HH:mm');
  } catch {
    return iso;
  }
}

function formatDay(day: string) {
  try {
    return format(parseISO(day), 'MMM d');
  } catch {
    return day;
  }
}

export default function AdminDashboard() {
  const [kpiFocus, setKpiFocus] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['adminDashboard'],
    queryFn: () => adminApi.getDashboard(),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
  });

  const stats = data as Record<string, unknown> | undefined;

  const assetStatus = useMemo(
    () =>
      ((stats?.assetStatusBreakdown as Array<{ status: string; count: number }>) || []).map((r) => ({
        status: r.status.charAt(0).toUpperCase() + r.status.slice(1),
        count: r.count,
        fill: FLEET_STATUS[r.status as keyof typeof FLEET_STATUS] || CHART.neutral,
      })),
    [stats?.assetStatusBreakdown]
  );

  const alertsTimeline = useMemo(
    () =>
      ((stats?.alertsTimeline as Array<{ hour: string; critical: number; warning: number; info: number }>) || []).map(
        (r) => ({ ...r, label: formatHour(r.hour) })
      ),
    [stats?.alertsTimeline]
  );

  const alertsSeverity = useMemo(
    () =>
      ((stats?.alertsBySeverity as Array<{ severity: string; count: number }>) || []).map((r) => ({
        severity: r.severity.charAt(0).toUpperCase() + r.severity.slice(1),
        count: r.count,
        fill: ALERT_SEVERITY[r.severity as keyof typeof ALERT_SEVERITY] || CHART.neutral,
      })),
    [stats?.alertsBySeverity]
  );

  const syncTimeline = useMemo(
    () =>
      ((stats?.syncTimeline as Array<{ day: string; success: number; failed: number }>) || []).map((r) => ({
        ...r,
        label: formatDay(r.day),
      })),
    [stats?.syncTimeline]
  );

  const integrations = useMemo(
    () =>
      ((stats?.integrationsBySource as Array<{ source_type: string; total: number; active: number }>) || []).map(
        (r) => ({
          source: SOURCE_LABELS[r.source_type] || r.source_type,
          active: r.active,
          inactive: r.total - r.active,
          fill: SOURCE_CHART_COLORS[r.source_type] || CHART.brand,
        })
      ),
    [stats?.integrationsBySource]
  );

  const healthHistory = (stats?.healthHistory as Array<{ day: string; score: number }>) || [];
  const growthHistory = (stats?.growthHistory as Array<{ day: string; count: number }>) || [];
  const recentActivity =
    (stats?.recentActivity as Array<{ title: string; tenant_name: string; created_at: string }>) || [];
  const topTenants =
    (stats?.topTenants as Array<{ name: string; vehicle_count: number; id: string }>) || [];
  const topTenantsChart = topTenants.map((t) => ({ name: t.name.length > 14 ? `${t.name.slice(0, 14)}…` : t.name, count: t.vehicle_count, id: t.id }));
  const recentSyncs =
    (stats?.recentSyncs as Array<{ source_type: string; status: string; vehicles_synced: number; started_at: string; tenant_name: string }>) || [];
  const recentIncidents =
    (stats?.recentIncidents as Array<{ message?: string; started_at: string; tenant_name: string }>) || [];

  const syncRate24h =
    Number(stats?.syncs24h) > 0
      ? Math.round((Number(stats?.syncSuccess24h) / Number(stats?.syncs24h)) * 100)
      : 100;

  if (isLoading) {
    return (
      <AdminLayout title="Dashboard" subtitle="Platform analytics">
        <div className="stat-strip">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Dashboard"
      subtitle="Real-time platform analytics"
      actions={
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] gap-1.5 py-0.5 border-primary/25 text-primary bg-secondary">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
            </span>
            Live {format(dataUpdatedAt, 'HH:mm:ss')}
          </Badge>
          <RefreshButton onRefresh={() => refetch()} isFetching={isFetching} label="Refresh" />
        </div>
      }
    >
      <div className="space-y-4">
        <div className="stat-strip">
          {[
            { id: 'tenants', title: 'Clients', value: stats?.totalTenants ?? 0, sub: `${stats?.activeTenants ?? 0} active`, icon: Building2, variant: 'primary' as const },
            { id: 'fleet', title: 'Synced assets', value: stats?.totalVehicles ?? 0, sub: `${stats?.activeVehiclesPct ?? 0}% online`, icon: Truck, variant: 'info' as const },
            { id: 'users', title: 'Users', value: stats?.totalUsers ?? 0, sub: `${stats?.logins24h ?? 0} logins`, icon: Users, variant: 'success' as const },
            { id: 'alerts', title: 'Alerts', value: stats?.pendingAlerts ?? 0, sub: 'pending', icon: AlertTriangle, variant: 'destructive' as const },
            { id: 'sync', title: 'Sync', value: `${syncRate24h}%`, sub: `${stats?.syncs24h ?? 0} today`, icon: RefreshCw, variant: 'warning' as const },
            { id: 'integrations', title: 'Integrations', value: `${stats?.integrationHealth ?? 0}%`, sub: `${stats?.webhooks24h ?? 0} webhooks`, icon: Radio, variant: 'primary' as const },
          ].map((k) => (
            <MetricCard
              key={k.id}
              title={k.title}
              value={String(k.value)}
              subtitle={k.sub}
              icon={k.icon}
              variant={k.variant}
              size="xxs"
              active={kpiFocus === k.id}
              onClick={() => setKpiFocus(kpiFocus === k.id ? null : k.id)}
            />
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <AnalyticsPanel className="lg:col-span-4" title="Fleet status" description="Moving · idle · stopped · offline" tone="fleet" icon={Truck}>
            <div className="h-[200px]">
              {assetStatus.length > 0 ? (
                <ChartContainer
                  config={Object.fromEntries(assetStatus.map((s) => [s.status, { label: s.status, color: s.fill }]))}
                  className="h-full w-full"
                >
                  <BarChart data={assetStatus} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 9 }} />
                    <YAxis type="category" dataKey="status" width={58} tick={{ fontSize: 9 }} />
                    <ChartTooltip content={<ChartTooltipContent />} cursor={{ fill: CHART.brandLight, opacity: 0.5 }} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={18}>
                      {assetStatus.map((entry) => (
                        <Cell key={entry.status} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              ) : (
                <p className="text-xs text-muted-foreground py-16 text-center">No fleet data — sync integrations first.</p>
              )}
            </div>
          </AnalyticsPanel>

          <AnalyticsPanel className="lg:col-span-5" title="Alerts — 24 hours" description="Trend by severity" tone="alert" icon={AlertTriangle}>
            <div className="h-[200px]">
              {alertsTimeline.length > 0 ? (
                <ChartContainer
                  config={{
                    critical: { label: 'Critical', color: ALERT_SEVERITY.critical },
                    warning: { label: 'Warning', color: ALERT_SEVERITY.warning },
                    info: { label: 'Info', color: ALERT_SEVERITY.info },
                  }}
                  className="h-full w-full"
                >
                  <LineChart data={alertsTimeline} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Line type="monotone" dataKey="critical" stroke={ALERT_SEVERITY.critical} strokeWidth={2} dot={{ r: 2, fill: ALERT_SEVERITY.critical }} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="warning" stroke={ALERT_SEVERITY.warning} strokeWidth={2} dot={{ r: 2, fill: ALERT_SEVERITY.warning }} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="info" stroke={ALERT_SEVERITY.info} strokeWidth={2} dot={{ r: 2, fill: ALERT_SEVERITY.info }} activeDot={{ r: 4 }} />
                  </LineChart>
                </ChartContainer>
              ) : (
                <p className="text-xs text-muted-foreground py-16 text-center">No alerts in the last 24 hours.</p>
              )}
            </div>
          </AnalyticsPanel>

          <AnalyticsPanel className="lg:col-span-3" title="Alert volume" description="Last 7 days by severity" tone="alert" icon={Bell}>
            <div className="h-[200px]">
              {alertsSeverity.length > 0 ? (
                <ChartContainer
                  config={Object.fromEntries(alertsSeverity.map((s) => [s.severity, { label: s.severity, color: s.fill }]))}
                  className="h-full w-full"
                >
                  <BarChart data={alertsSeverity} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="severity" tick={{ fontSize: 8 }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} cursor={{ fill: '#fef2f2', opacity: 0.6 }} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={22}>
                      {alertsSeverity.map((entry) => (
                        <Cell key={entry.severity} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              ) : (
                <p className="text-xs text-muted-foreground py-16 text-center">No alert data.</p>
              )}
            </div>
          </AnalyticsPanel>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <AnalyticsPanel title="Integration syncs" description="Success vs failed · 7 days" tone="sync" icon={RefreshCw}>
            <div className="h-[180px]">
              {syncTimeline.length > 0 ? (
                <ChartContainer
                  config={{
                    success: { label: 'Success', color: CHART.success },
                    failed: { label: 'Failed', color: CHART.failed },
                  }}
                  className="h-full w-full"
                >
                  <BarChart data={syncTimeline} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent cursor={{ fill: CHART.brandLight, opacity: 0.4 }} />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="success" stackId="sync" fill={CHART.success} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="failed" stackId="sync" fill={CHART.failed} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <p className="text-xs text-muted-foreground py-12 text-center">No sync history yet.</p>
              )}
            </div>
          </AnalyticsPanel>

          <AnalyticsPanel title="Telematics sources" description="Active vs inactive connections" tone="brand" icon={Radio}>
            <div className="h-[180px]">
              {integrations.length > 0 ? (
                <ChartContainer
                  config={{
                    active: { label: 'Active', color: CHART.brandAccent },
                    inactive: { label: 'Inactive', color: CHART.neutralLight },
                  }}
                  className="h-full w-full"
                >
                  <BarChart data={integrations} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 9 }} />
                    <YAxis type="category" dataKey="source" width={72} tick={{ fontSize: 9 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="active" stackId="src" radius={[0, 0, 0, 0]}>
                      {integrations.map((row) => (
                        <Cell key={row.source} fill={row.fill} />
                      ))}
                    </Bar>
                    <Bar dataKey="inactive" stackId="src" fill={CHART.neutralLight} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <p className="text-xs text-muted-foreground py-12 text-center">No integrations configured.</p>
              )}
            </div>
          </AnalyticsPanel>

          <AnalyticsPanel title="Integration health" description="Sync success rate · 7 days" tone="brand" icon={Activity}>
            <div className="h-[180px]">
              {healthHistory.length > 0 ? (
                <ChartContainer config={{ score: { label: 'Health %', color: CHART.brand } }} className="h-full w-full">
                  <LineChart data={healthHistory.map((d) => ({ ...d, label: formatDay(d.day) }))} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke={CHART.brand}
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: CHART.brandAccent, stroke: '#fff', strokeWidth: 1 }}
                      activeDot={{ r: 5, fill: CHART.brand }}
                    />
                  </LineChart>
                </ChartContainer>
              ) : (
                <p className="text-xs text-muted-foreground py-12 text-center">Run client syncs to build history.</p>
              )}
            </div>
          </AnalyticsPanel>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <AnalyticsPanel
            className="lg:col-span-2"
            title="Live sync feed"
            description="Latest integration syncs"
            tone="sync"
            icon={Zap}
            action={<Badge variant="outline" className="text-[9px] border-accent/30 text-accent bg-white">{POLL_MS / 1000}s</Badge>}
          >
            <div className="space-y-1 max-h-[180px] overflow-y-auto">
              {recentSyncs.length ? (
                recentSyncs.map((s, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs py-1.5 px-2 rounded-lg bg-white/70 border border-accent/10 hover:border-accent/25 transition-colors">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{s.tenant_name} · {SOURCE_LABELS[s.source_type] || s.source_type}</p>
                      <p className="text-[10px] text-muted-foreground">{s.vehicles_synced ?? 0} assets · {new Date(s.started_at).toLocaleTimeString()}</p>
                    </div>
                    <Badge
                      className="text-[9px] shrink-0"
                      variant={s.status === 'success' ? 'default' : s.status === 'failed' ? 'destructive' : 'secondary'}
                    >
                      {s.status}
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No sync activity.</p>
              )}
            </div>
          </AnalyticsPanel>

          <AnalyticsPanel title="Top clients" description="Synced fleet size ranking" tone="brand" icon={Building2}>
            <div className="h-[180px]">
              {topTenantsChart.length > 0 ? (
                <ChartContainer config={{ count: { label: 'Assets', color: CHART.brand } }} className="h-full w-full">
                  <BarChart data={topTenantsChart} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 9 }} />
                    <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 8 }} />
                    <ChartTooltip content={<ChartTooltipContent />} cursor={{ fill: CHART.brandLight, opacity: 0.5 }} />
                    <Bar dataKey="count" fill={CHART.brand} radius={[0, 4, 4, 0]} barSize={14} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <p className="text-xs text-muted-foreground py-12 text-center">No clients yet.</p>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {topTenants.slice(0, 3).map((t) => (
                <Link key={t.id} to={`/admin/tenants/${t.id}`} className="text-[10px] text-primary hover:underline">
                  {t.name}
                </Link>
              ))}
            </div>
          </AnalyticsPanel>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <AnalyticsPanel title="Platform activity" tone="neutral" icon={ClipboardList}>
            <div className="space-y-1 max-h-[150px] overflow-y-auto">
              {recentActivity.length ? (
                recentActivity.map((a, i) => (
                  <div key={i} className="text-xs py-1.5 px-2 rounded-lg bg-white/60 border border-slate-200/60 last:border-0">
                    <p className="font-medium">{a.title}</p>
                    <p className="text-[10px] text-muted-foreground">{a.tenant_name ? `${a.tenant_name} · ` : ''}{new Date(a.created_at).toLocaleString()}</p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No activity.</p>
              )}
            </div>
          </AnalyticsPanel>

          <AnalyticsPanel title="Client growth" description="New clients · 30 days" tone="brand" icon={TrendingUp}>
            <div className="h-[150px]">
              <ChartContainer config={{ count: { label: 'Clients', color: CHART.brandAccent } }} className="h-full w-full">
                <BarChart
                  data={growthHistory.length ? growthHistory.map((d) => ({ ...d, label: formatDay(d.day) })) : [{ label: 'Now', count: Number(stats?.totalTenants ?? 0) }]}
                  margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent cursor={{ fill: CHART.brandLight, opacity: 0.5 }} />} />
                  <Bar dataKey="count" fill={CHART.brandAccent} radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
              </ChartContainer>
            </div>
          </AnalyticsPanel>
        </div>

        {recentIncidents.length > 0 && (
          <AnalyticsPanel title="Sync failures" tone="alert" icon={AlertTriangle} interactive={false}>
            <div className="space-y-1">
              {recentIncidents.map((inc, i) => (
                <p key={i} className="text-xs text-red-700 px-2 py-1 rounded bg-white/70 border border-red-100">
                  <span className="font-semibold">{inc.tenant_name}</span> — {inc.message || 'Failed'} · {new Date(inc.started_at).toLocaleString()}
                </p>
              ))}
            </div>
          </AnalyticsPanel>
        )}

        <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground pt-1">
          <span className="flex items-center gap-1"><LogIn className="w-3 h-3 text-primary" />{stats?.logins24h ?? 0} logins · {stats?.activeUsers7d ?? 0} active (7d)</span>
          {stats?.lastSync && <span>Last sync: {new Date(String(stats.lastSync)).toLocaleString()}</span>}
        </div>
      </div>
    </AdminLayout>
  );
}
