import { ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, Building2, Users, Settings, Plug, LifeBuoy, Satellite,
  ChevronLeft, ChevronRight, LogOut, Shield, UserCircle, Navigation, Radio,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/AuthProvider';
import { MamsLogo, MamsLogoMark } from '@/components/shared/MamsLogo';
import { AnimatedPage } from '@/components/shared/PageLoader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { isSuperAdmin, ROLE_LABELS } from '@/lib/systemRoles';
import { adminApi } from '@/lib/api';

const BASE_NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/admin/dashboard' },
  { key: 'tenants', label: 'Clients', icon: Building2, path: '/admin/tenants' },
  { key: 'client-users', label: 'Client Users', icon: Users, path: '/admin/users' },
  { key: 'system', label: 'System', icon: Settings, path: '/admin/system' },
  { key: 'marketplace', label: 'Integrations', icon: Plug, path: '/admin/marketplace' },
  { key: 'wialon', label: 'Wialon Center', icon: Satellite, path: '/admin/wialon' },
  { key: 'loconav', label: 'LocoNav Center', icon: Navigation, path: '/admin/loconav' },
  { key: 'tracksolid', label: 'TrackSolid Center', icon: Radio, path: '/admin/tracksolid' },
  { key: 'support', label: 'Support', icon: LifeBuoy, path: '/admin/support' },
];

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function AdminLayout({ children, title, subtitle, actions }: AdminLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [search, setSearch] = useState('');

  const { data: health } = useQuery({
    queryKey: ['systemHealth'],
    queryFn: () => adminApi.getSystemHealth(),
    refetchInterval: 60_000,
    retry: 1,
  });

  const overall = (health as { overall?: string })?.overall;
  const isHealthy = overall === 'operational';

  const [collapsed, setCollapsed] = useState(false);
  const width = collapsed ? 60 : 220;

  const nav = [
    ...BASE_NAV.slice(0, 3),
    ...(isSuperAdmin(user?.role)
      ? [{ key: 'system-users', label: 'System Users', icon: Shield, path: '/admin/system-users' }]
      : []),
    ...BASE_NAV.slice(3),
    { key: 'account', label: 'My Account', icon: UserCircle, path: '/admin/account' },
  ];

  const filteredNav = search.trim()
    ? nav.filter((item) => item.label.toLowerCase().includes(search.toLowerCase()))
    : nav;

  return (
    <div className="h-screen h-[100dvh] overflow-hidden bg-background flex">
      <aside
        className="fixed left-0 top-0 h-screen bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col z-50 transition-all duration-300 shadow-lg"
        style={{ width }}
      >
        <div className={cn('h-16 flex items-center border-b border-white/10 px-3', collapsed && 'justify-center')}>
          {collapsed ? (
            <MamsLogoMark size="sm" className="brightness-0 invert" />
          ) : (
            <MamsLogo variant="dark" size="sm" className="[&_img]:brightness-0 [&_img]:invert" />
          )}
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto scrollbar-thin">
          {filteredNav.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
            return (
              <Link
                key={item.key}
                to={item.path}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'flex items-center rounded-lg transition-all',
                  active ? 'bg-white/15 text-white font-medium' : 'text-white/75 hover:bg-white/10 hover:text-white',
                  collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span className="text-sm">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="p-2 border-t border-white/10">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center p-2 rounded hover:bg-white/10 text-white/70"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-full min-h-0 transition-all" style={{ marginLeft: width }}>
        <header className="h-16 shrink-0 border-b border-primary/15 flex items-center justify-between px-6 bg-card/80 backdrop-blur-sm z-40 shadow-sm">
          <div>
            <h1 className="text-xl font-semibold text-primary">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-4">
            <Input
              placeholder="Filter navigation..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-52 hidden md:block border-primary/15"
            />
            {actions}
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-medium">{user?.fullName}</span>
              <Badge variant="outline" className="text-[10px] h-5">
                {ROLE_LABELS[user?.role || ''] || user?.role}
              </Badge>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { signOut(); navigate('/auth/login'); }}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </header>
        <main className="app-page-scroll flex-1 min-h-0 p-6 overflow-y-auto overflow-x-hidden bg-muted/30">
          <AnimatedPage>{children}</AnimatedPage>
        </main>
        <footer className="shrink-0 border-t border-primary/10 px-6 py-2 text-xs text-muted-foreground flex justify-between bg-card/50">
          <span className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${isHealthy ? 'bg-success animate-pulse' : 'bg-warning'}`} />
            System status: {isHealthy ? 'All systems operational' : 'Needs attention'}
          </span>
          <span>MAMS Platform Admin</span>
        </footer>
      </div>
    </div>
  );
}
