import { useEffect } from 'react';
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
  const { collapsed, width, isCompact, mobileOpen, setMobileOpen, setCollapsed } = useSidebar();
  const { user } = useAuth();
  const isAdmin = user?.role === 'tenant_admin' || user?.role === 'platform_admin' || user?.role === 'super_admin';

  const railWidth = isCompact ? Math.min(300, typeof window !== 'undefined' ? window.innerWidth * 0.86 : 300) : width;

  useEffect(() => {
    if (!isCompact) return;
    setMobileOpen(false);
  }, [location.pathname, isCompact, setMobileOpen]);

  return (
    <>
      {isCompact && mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-[45] bg-black/45 backdrop-blur-[1px]"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={cn(
          'fixed left-0 top-0 h-screen bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col z-50 shadow-lg',
          'transition-transform duration-300 ease-out',
          isCompact && !mobileOpen && '-translate-x-full pointer-events-none',
          isCompact && mobileOpen && 'translate-x-0',
          !isCompact && 'translate-x-0',
        )}
        style={{ width: railWidth }}
        aria-hidden={isCompact && !mobileOpen}
      >
        <div
          className={cn(
            'border-b border-sidebar-border px-3 py-3',
            collapsed && !isCompact ? 'flex flex-col items-center gap-2' : 'space-y-2',
          )}
        >
          <div
            className={cn(
              'flex items-center gap-2 min-w-0 w-full',
              collapsed && !isCompact && 'justify-center',
            )}
          >
            <TenantLogo
              logoUrl={branding.logoUrl}
              name={branding.name}
              size="sidebar"
              variant="on-dark"
              className={collapsed && !isCompact ? 'justify-center' : undefined}
            />
            {(!collapsed || isCompact) && (
              <button
                type="button"
                onClick={() => (isCompact ? setMobileOpen(false) : setCollapsed(true))}
                className="ml-auto p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground/80"
                aria-label={isCompact ? 'Close menu' : 'Collapse sidebar'}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
          </div>
          {(!collapsed || isCompact) && (
            <div className="px-1 min-w-0">
              <p className="font-bold text-base leading-tight truncate text-white">{branding.name}</p>
              {branding.slug && (
                <p className="text-[11px] text-sidebar-foreground/70 truncate mt-0.5">{branding.slug}</p>
              )}
            </div>
          )}
        </div>

        {collapsed && !isCompact && (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="absolute -right-3 top-24 w-6 h-6 bg-sidebar border border-sidebar-border rounded-full flex items-center justify-center shadow-md z-10 text-sidebar-foreground"
            aria-label="Expand sidebar"
          >
            <ChevronRight className="w-3 h-3" />
          </button>
        )}

        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto overscroll-contain scrollbar-thin">
          {isLoading && (
            <div className="space-y-2 px-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-9 w-full bg-white/10 rounded-lg" />
              ))}
            </div>
          )}

          {!isLoading && modules.length === 0 && (!collapsed || isCompact) && (
            <p className="text-xs text-sidebar-foreground/60 px-3 py-2">No modules enabled</p>
          )}

          {modules.map((mod) => {
            const path = `/app/${mod.moduleKey}`;
            const Icon = ICON_MAP[mod.icon || 'LayoutDashboard'] || LayoutDashboard;
            const active = location.pathname === path || location.pathname.startsWith(`${path}/`);
            const dataHidden = mod.isVisible === false && !isAdmin;
            const iconOnly = collapsed && !isCompact;

            return (
              <Link
                key={mod.moduleKey}
                to={path}
                title={iconOnly ? `${mod.label}${dataHidden ? ' (data hidden)' : ''}` : undefined}
                className={cn(
                  'flex items-center rounded-lg transition-all duration-200',
                  active
                    ? 'bg-white/15 text-white font-semibold shadow-sm ring-1 ring-white/10'
                    : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-white',
                  dataHidden && !active && 'opacity-80',
                  iconOnly ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
                )}
              >
                <Icon className={cn('w-5 h-5 flex-shrink-0', active && 'text-white')} />
                {!iconOnly && (
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

          <Link
            to="/app/settings"
            title={collapsed && !isCompact ? 'Settings' : undefined}
            className={cn(
              'flex items-center rounded-lg transition-all duration-200 mt-2 border-t border-sidebar-border/60 pt-2',
              location.pathname === '/app/settings'
                ? 'bg-white/15 text-white font-semibold ring-1 ring-white/10'
                : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-white',
              collapsed && !isCompact ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
            )}
          >
            <Settings className="w-5 h-5 flex-shrink-0" />
            {(!collapsed || isCompact) && <span className="text-sm truncate">Settings</span>}
          </Link>
        </nav>

        {(!collapsed || isCompact) && branding.usesMamsLogo && (
          <div className="px-3 py-3 border-t border-sidebar-border/60 text-[10px] text-sidebar-foreground/60">
            {BRAND.fullName}
          </div>
        )}
        {(!collapsed || isCompact) && !branding.usesMamsLogo && (
          <div className="px-3 py-2 border-t border-sidebar-border/60 flex items-center gap-1.5 text-[10px] text-sidebar-foreground/50">
            <img src={BRAND.logo} alt="" className="h-3.5 w-auto opacity-70" />
            <span>Powered by {BRAND.name}</span>
          </div>
        )}
      </aside>
    </>
  );
}
