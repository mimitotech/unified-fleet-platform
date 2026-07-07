import { ReactNode, useState } from 'react';
import { DynamicSidebar } from './DynamicSidebar';
import { Bell, LogOut, Settings } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/providers/AuthProvider';
import { useSidebar } from '@/providers/SidebarContext';
import { useTenant } from '@/hooks/useTenant';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { TenantLogo } from '@/components/shared/TenantLogo';
import { LiveIndicator } from '@/components/shared/LiveIndicator';
import { RefreshButton } from '@/components/shared/RefreshButton';
import { AnimatedPage } from '@/components/shared/PageLoader';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '@/lib/api';
import { useAlerts } from '@/hooks/useAlerts';
import { useFleetSnapshot } from '@/hooks/useFleetSnapshot';
import { safeArray } from '@/lib/safeArray';
import { LIVE_POLL, pollWhenVisible } from '@/lib/liveRefresh';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface AppLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function AppLayout({ children, title, subtitle, actions }: AppLayoutProps) {
  const { user, signOut } = useAuth();
  const { width } = useSidebar();
  const { data: tenant } = useTenant();
  const branding = useTenantBranding();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: alerts } = useAlerts(50);
  const alertList = safeArray<{ acknowledged?: boolean }>(alerts);
  const unack = alertList.filter((a) => !a.acknowledged).length;
  const { dataUpdatedAt, refetch: refetchFleet } = useFleetSnapshot();
  const [manualRefreshing, setManualRefreshing] = useState(false);

  const { data: integrations } = useQuery({
    queryKey: ['integrationStatus'],
    queryFn: () => clientApi.getIntegrationStatus(),
    refetchInterval: pollWhenVisible(LIVE_POLL.integrations),
  });

  const integList = safeArray<{ sourceType: string; connected: boolean }>(integrations);

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
    <div className="min-h-screen bg-background flex tenant-app">
      <DynamicSidebar />
      <div
        className="flex-1 flex flex-col min-h-screen min-w-0 transition-all duration-300"
        style={{ marginLeft: width }}
      >
        <header
          className="min-h-[4.5rem] border-b flex items-center justify-between px-6 bg-card/80 backdrop-blur-sm sticky top-0 z-40 shadow-sm"
          style={{ borderBottomColor: branding.primaryColor, borderBottomWidth: 2 }}
        >
          <div className="flex items-center gap-4 min-w-0 py-2">
            <TenantLogo
              logoUrl={branding.logoUrl}
              name={branding.name}
              size="header"
              variant="on-light"
              className="hidden md:flex flex-shrink-0"
            />
            <div className="min-w-0 border-l border-border pl-4 hidden md:block">
              <p className="text-lg font-bold text-primary leading-tight truncate">{branding.name}</p>
              <div className="text-sm text-muted-foreground truncate">
                {title}
                {subtitle ? ` · ${subtitle}` : ''}
              </div>
            </div>
            <div className="min-w-0 md:hidden">
              <p className="text-base font-bold text-primary truncate">{branding.name}</p>
              <h1 className="text-sm font-medium truncate">{title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <div className="hidden lg:flex gap-1">
              {integList.map((i) => (
                <Badge
                  key={i.sourceType}
                  variant={i.connected ? 'default' : 'secondary'}
                  className={`text-xs capitalize ${i.connected ? 'bg-primary/90' : 'bg-muted text-muted-foreground'}`}
                >
                  {i.sourceType} {i.connected ? '✓' : '✗'}
                </Badge>
              ))}
            </div>
            <RefreshButton
              onRefresh={() => void handleRefresh()}
              isFetching={manualRefreshing}
              className="hidden sm:inline-flex"
            />
            <LiveIndicator dataUpdatedAt={dataUpdatedAt} className="hidden sm:inline-flex" />
            {actions}
            <Link to="/app/alerts" className="relative">
              <Button variant="ghost" size="sm" className="text-primary hover:text-primary hover:bg-primary/10">
                <Bell className="w-4 h-4" />
                {unack > 0 && (
                  <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full min-w-5 h-5 px-1 flex items-center justify-center animate-scale-in">
                    {unack > 9 ? '9+' : unack}
                  </span>
                )}
              </Button>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 border-primary/20 max-w-[180px]">
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
        <main className="flex-1 p-6 overflow-auto bg-muted/30 min-w-0">
          <AnimatedPage>{children}</AnimatedPage>
        </main>
        {integList.length > 0 && (
          <footer className="border-t border-primary/10 px-6 py-2 text-xs text-muted-foreground hidden md:flex items-center justify-between bg-card/50">
            <span>
              <span className="font-medium text-foreground">{branding.name}</span>
              {tenant?.contactEmail && (
                <span className="ml-2">· {tenant.contactEmail}</span>
              )}
            </span>
            <span className="flex items-center gap-2">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  integList.every((i) => i.connected) ? 'bg-success animate-pulse' : 'bg-warning'
                }`}
              />
              {integList.every((i) => i.connected)
                ? 'All integrations connected'
                : 'Some integrations need attention'}
            </span>
          </footer>
        )}
      </div>
    </div>
  );
}
