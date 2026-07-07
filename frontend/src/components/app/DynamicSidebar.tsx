import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Map, Video, Users, Route, Fuel, Wrench, BarChart3,
  Bell, Leaf, Truck, Gauge, MapPin, Terminal, ChevronLeft, ChevronRight, Settings, EyeOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useModules } from '@/hooks/useModules';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { TenantLogo } from '@/components/shared/TenantLogo';
import { BRAND } from '@/lib/branding';
import { useAuth } from '@/providers/AuthProvider';
import { useSidebar } from '@/providers/SidebarContext';
import { Skeleton } from '@/components/ui/skeleton';

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, Map, Video, Users, Route, Fuel, Wrench, BarChart3,
  Bell, Leaf, Truck, Gauge, MapPin, Terminal, Settings,
};

export function DynamicSidebar() {
  const location = useLocation();
  const { modules, isLoading } = useModules();
  const branding = useTenantBranding();
  const { collapsed, width, setCollapsed } = useSidebar();
  const { user } = useAuth();
  const showSettings = true;
  const isAdmin = user?.role === 'tenant_admin' || user?.role === 'platform_admin' || user?.role === 'super_admin';

  return (
    <aside
      className="fixed left-0 top-0 h-screen bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col z-50 transition-all duration-300 shadow-lg"
      style={{ width }}
    >
      <div
        className={cn(
          'border-b border-sidebar-border px-3 py-3',
          collapsed ? 'flex flex-col items-center gap-2' : 'space-y-2'
        )}
      >
        <div className={cn('flex items-center gap-2 min-w-0 w-full', collapsed && 'justify-center')}>
          <TenantLogo
            logoUrl={branding.logoUrl}
            name={branding.name}
            size="sidebar"
            variant="on-dark"
            className={collapsed ? 'justify-center' : undefined}
          />
          {!collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="ml-auto p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground/80"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>
        {!collapsed && (
          <div className="px-1 min-w-0">
            <p className="font-bold text-base leading-tight truncate text-white">{branding.name}</p>
            {branding.slug && (
              <p className="text-[11px] text-sidebar-foreground/70 truncate mt-0.5">{branding.slug}</p>
            )}
          </div>
        )}
      </div>

      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="absolute -right-3 top-24 w-6 h-6 bg-sidebar border border-sidebar-border rounded-full flex items-center justify-center shadow-md z-10 text-sidebar-foreground"
          aria-label="Expand sidebar"
        >
          <ChevronRight className="w-3 h-3" />
        </button>
      )}

      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto scrollbar-thin">
        {isLoading && (
          <div className="space-y-2 px-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-9 w-full bg-white/10 rounded-lg" />
            ))}
          </div>
        )}

        {!isLoading && modules.length === 0 && !collapsed && (
          <p className="text-xs text-sidebar-foreground/60 px-3 py-2">No modules enabled</p>
        )}

        {modules.map((mod) => {
          const path = `/app/${mod.moduleKey}`;
          const Icon = ICON_MAP[mod.icon || 'LayoutDashboard'] || LayoutDashboard;
          const active = location.pathname === path || location.pathname.startsWith(`${path}/`);
          const dataHidden = mod.isVisible === false && !isAdmin;

          return (
            <Link
              key={mod.moduleKey}
              to={path}
              title={
                collapsed
                  ? `${mod.label}${dataHidden ? ' (data hidden)' : ''}`
                  : undefined
              }
              className={cn(
                'flex items-center rounded-lg transition-all duration-200',
                active
                  ? 'bg-white/15 text-white font-semibold shadow-sm ring-1 ring-white/10'
                  : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-white',
                dataHidden && !active && 'opacity-80',
                collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'
              )}
            >
              <Icon className={cn('w-5 h-5 flex-shrink-0', active && 'text-white')} />
              {!collapsed && (
                <>
                  <span className="text-sm truncate flex-1">{mod.label}</span>
                  {dataHidden && (
                    <EyeOff className="w-3.5 h-3.5 flex-shrink-0 opacity-70" aria-label="Data hidden" />
                  )}
                </>
              )}
            </Link>
          );
        })}

        {showSettings && (
          <Link
            to="/app/settings"
            title={collapsed ? 'Settings' : undefined}
            className={cn(
              'flex items-center rounded-lg transition-all duration-200 mt-2 border-t border-sidebar-border/60 pt-2',
              location.pathname === '/app/settings'
                ? 'bg-white/15 text-white font-semibold ring-1 ring-white/10'
                : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-white',
              collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'
            )}
          >
            <Settings className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span className="text-sm truncate">Settings</span>}
          </Link>
        )}
      </nav>

      {!collapsed && branding.usesMamsLogo && (
        <div className="px-3 py-3 border-t border-sidebar-border/60 text-[10px] text-sidebar-foreground/60">
          {BRAND.fullName}
        </div>
      )}
      {!collapsed && !branding.usesMamsLogo && (
        <div className="px-3 py-2 border-t border-sidebar-border/60 flex items-center gap-1.5 text-[10px] text-sidebar-foreground/50">
          <img src={BRAND.logo} alt="" className="h-3.5 w-auto opacity-70" />
          <span>Powered by {BRAND.name}</span>
        </div>
      )}
    </aside>
  );
}
