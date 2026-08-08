import { ReactNode, useState } from 'react';
import { DynamicSidebar } from './DynamicSidebar';
import { Bell, LogOut, Menu, Settings, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/AuthProvider';
import { useSidebar } from '@/providers/SidebarContext';
import { useTenant } from '@/hooks/useTenant';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { TenantLogo } from '@/components/shared/TenantLogo';
import { LiveIndicator } from '@/components/shared/LiveIndicator';
import { RefreshButton } from '@/components/shared/RefreshButton';
import { AnimatedPage } from '@/components/shared/PageLoader';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clientApi, getTenantSlug } from '@/lib/api';
import { useAlerts, useAcknowledgeAlert, type ClientAlert } from '@/hooks/useAlerts';
import { useFleetSnapshot } from '@/hooks/useFleetSnapshot';
import { safeArray } from '@/lib/safeArray';
import { LIVE_POLL, pollWhenVisible } from '@/lib/liveRefresh';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { clientFacingText } from '@/lib/clientFacingText';
import { isNoiseAlertTitle } from '@/lib/alertNoise';

interface AppLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

function sourceLabel(sourceType?: string) {
  const s = (sourceType || '').toLowerCase();
  if (!s || s === 'wialon') return 'Fleet';
  if (s === 'tracksolid') return 'Device';
  if (s === 'loconav') return 'Video';
  return sourceType!.replace(/_/g, ' ');
}

export function AppLayout({ children, title, subtitle, actions }: AppLayoutProps) {
  const { user, signOut } = useAuth();
  const { width, isCompact, mobileOpen, toggle } = useSidebar();
  const { data: tenant } = useTenant();
  const branding = useTenantBranding();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: alerts } = useAlerts(300);
  const acknowledge = useAcknowledgeAlert();
  const alertList = safeArray<ClientAlert>(alerts);
  const unackList = alertList.filter((a) => {
    if (a.acknowledged) return false;
    if (isNoiseAlertTitle(a.title, a.description, a.type)) return false;
    // Bell only shows fresh open alerts from the last 24h. Future stamps
    // (period-end fuel summaries that landed as tomorrow morning in EAT) used
    // to pass Date.now()-t < 24h because the difference was negative.
    const t = new Date(a.timestamp).getTime();
    if (!Number.isFinite(t)) return false;
    const ageMs = Date.now() - t;
    return ageMs >= 0 && ageMs < 24 * 60 * 60 * 1000;
  });
  const unack = unackList.length;
  const { dataUpdatedAt, refetch: refetchFleet } = useFleetSnapshot();
  const [manualRefreshing, setManualRefreshing] = useState(false);

  const { data: integrations } = useQuery({
    queryKey: ['integrationStatus', getTenantSlug() || 'default'],
    queryFn: () => clientApi.getIntegrationStatus(),
    refetchInterval: pollWhenVisible(LIVE_POLL.integrations),
  });

  const integList = safeArray<{ sourceType: string; connected: boolean }>(integrations);
  const allConnected = integList.length > 0 && integList.every((i) => i.connected);
  const anyConnected = integList.some((i) => i.connected);

  const handleRefresh = async () => {
    setManualRefreshing(true);
    try {
      await Promise.all([
        refetchFleet(),
        qc.invalidateQueries({ queryKey: ['alerts'] }),
        qc.invalidateQueries({ queryKey: ['dashboardKpis'] }),
        qc.invalidateQueries({ queryKey: ['fleet-snapshot'] }),
        qc.invalidateQueries({ queryKey: ['integrationStatus'] }),
      ]);
    } finally {
      setManualRefreshing(false);
    }
  };

  return (
    <div className="h-screen h-[100dvh] overflow-hidden bg-background flex tenant-app">
      <DynamicSidebar />
      <div
        className="flex-1 flex flex-col h-full min-h-0 min-w-0 transition-[margin] duration-300"
        style={{ marginLeft: width }}
      >
        <header
          className="min-h-14 sm:min-h-[4.25rem] shrink-0 border-b flex items-center justify-between gap-2 px-3 sm:px-5 lg:px-6 bg-card/90 backdrop-blur-sm z-40 shadow-sm"
          style={{ borderBottomColor: branding.primaryColor, borderBottomWidth: 2 }}
        >
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 py-2 flex-1">
            {isCompact && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 h-9 w-9 p-0 border-primary/25"
                onClick={toggle}
                aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileOpen}
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            )}

            {/* Logo always visible — client identity */}
            <TenantLogo
              logoUrl={branding.logoUrl}
              name={branding.name}
              size="header"
              variant="on-light"
              className="flex-shrink-0"
            />

            <div className="min-w-0 border-l border-border pl-2.5 sm:pl-3">
              <p className="text-sm sm:text-base lg:text-lg font-bold text-primary leading-tight truncate">
                {branding.name}
              </p>
              <div className="text-[11px] sm:text-sm text-muted-foreground truncate">
                {title}
                {subtitle ? ` · ${subtitle}` : ''}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {integList.length > 0 && (
              <span
                className={cn(
                  'hidden md:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
                  allConnected
                    ? 'border-success/30 bg-success/10 text-success'
                    : anyConnected
                      ? 'border-primary/30 bg-primary/10 text-primary'
                      : 'border-border bg-muted text-muted-foreground',
                )}
              >
                <span
                  className={cn(
                    'inline-block h-1.5 w-1.5 rounded-full',
                    allConnected ? 'bg-success animate-pulse' : anyConnected ? 'bg-primary' : 'bg-muted-foreground',
                  )}
                />
                {allConnected ? 'Live' : anyConnected ? 'Partial' : 'Offline'}
              </span>
            )}
            <RefreshButton
              onRefresh={() => void handleRefresh()}
              isFetching={manualRefreshing}
              className="hidden sm:inline-flex"
            />
            <LiveIndicator dataUpdatedAt={dataUpdatedAt} className="hidden lg:inline-flex" />
            {actions}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="relative text-primary hover:text-primary hover:bg-primary/10 h-9 w-9 p-0 sm:w-auto sm:px-3">
                  <Bell className="w-4 h-4" />
                  {unack > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground text-[10px] font-semibold leading-none rounded-full min-w-[1.15rem] h-[1.15rem] px-1 flex items-center justify-center tabular-nums shadow-sm">
                      {unack}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[min(20rem,calc(100vw-1.5rem))] p-0">
                <div className="px-3 py-2 border-b flex items-center justify-between">
                  <p className="text-sm font-semibold">Alerts</p>
                  <Link to="/app/alerts" className="text-xs text-primary hover:underline">
                    View all
                  </Link>
                </div>
                <div className="max-h-80 overflow-auto overscroll-contain">
                  {unackList.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-3 py-6 text-center">
                      No new alerts. Live events appear here as they happen.
                    </p>
                  ) : (
                    unackList.slice(0, 8).map((alert) => (
                      <div key={alert.id} className="px-3 py-2.5 border-b border-border/60 last:border-0 hover:bg-muted/40">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{clientFacingText(alert.title)}</p>
                            {alert.description && (
                              <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                                {clientFacingText(alert.description)}
                              </p>
                            )}
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}
                              {alert.sourceType ? ` · ${sourceLabel(alert.sourceType)}` : ''}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[10px] shrink-0"
                            onClick={() => acknowledge.mutate(alert.id)}
                          >
                            Ack
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 border-primary/20 max-w-[120px] sm:max-w-[180px] h-9">
                  <span className="truncate text-sm font-medium">{user?.fullName || 'User'}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-2 border-b mb-1">
                  <p className="text-sm font-semibold truncate">{user?.fullName}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  <p className="text-xs text-primary font-medium truncate mt-1">{branding.name}</p>
                </div>
                <DropdownMenuItem onClick={() => navigate('/app/settings')}>
                  <Settings className="w-4 h-4 mr-2" />Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { signOut(); navigate('/auth/login'); }}>
                  <LogOut className="w-4 h-4 mr-2" />Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="app-page-scroll flex-1 min-h-0 p-3 sm:p-4 lg:p-6 overflow-y-auto overflow-x-hidden bg-muted/30 min-w-0">
          <div className="mx-auto w-full max-w-[1600px] space-y-4 lg:space-y-5">
            <AnimatedPage>{children}</AnimatedPage>
          </div>
        </main>

        {integList.length > 0 && (
          <footer className="shrink-0 border-t border-primary/10 px-6 py-2 text-xs text-muted-foreground hidden lg:flex items-center justify-between bg-card/50">
            <span>
              <span className="font-medium text-foreground">{branding.name}</span>
              {tenant?.contactEmail && <span className="ml-2">· {tenant.contactEmail}</span>}
            </span>
            <span className="flex items-center gap-2">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  allConnected ? 'bg-success animate-pulse' : 'bg-warning'
                }`}
              />
              {allConnected ? 'All systems connected' : 'Some connections need attention'}
            </span>
          </footer>
        )}
      </div>
    </div>
  );
}
