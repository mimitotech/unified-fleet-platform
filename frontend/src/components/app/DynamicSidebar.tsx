import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Map, Video, Users, Route, Fuel, Wrench, BarChart3,
  Bell, Leaf, Truck, Gauge, MapPin, Terminal, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useModules } from '@/hooks/useModules';
import { useTenant } from '@/hooks/useTenant';
import { useState } from 'react';

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, Map, Video, Users, Route, Fuel, Wrench, BarChart3,
  Bell, Leaf, Truck, Gauge, MapPin, Terminal,
};

export function DynamicSidebar() {
  const location = useLocation();
  const { modules } = useModules();
  const { data: tenant } = useTenant();
  const [collapsed, setCollapsed] = useState(false);
  const width = collapsed ? 60 : 180;

  return (
    <aside
      className="fixed left-0 top-0 h-screen bg-sidebar border-r border-sidebar-border flex flex-col z-50 transition-all duration-300"
      style={{ width }}
    >
      <div className={cn('h-16 flex items-center border-b border-sidebar-border px-3', collapsed && 'justify-center')}>
        <div className="flex items-center gap-2 min-w-0">
          {tenant?.logoUrl ? (
            <img src={tenant.logoUrl} alt="" className="w-8 h-8 object-contain tenant-logo flex-shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
              <span className="text-primary font-bold text-sm">{tenant?.name?.[0] || 'F'}</span>
            </div>
          )}
          {!collapsed && <span className="font-semibold truncate">{tenant?.name || 'Fleet'}</span>}
        </div>
        {!collapsed && (
          <button type="button" onClick={() => setCollapsed(true)} className="ml-auto p-1 rounded hover:bg-secondary">
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>
      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="absolute -right-3 top-20 w-6 h-6 bg-sidebar border rounded-full flex items-center justify-center shadow-md z-10"
        >
          <ChevronRight className="w-3 h-3" />
        </button>
      )}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto scrollbar-thin">
        {modules.filter((m) => m.isEnabled).map((mod) => {
          const path = `/app/${mod.moduleKey}`;
          const Icon = ICON_MAP[mod.icon || 'LayoutDashboard'] || LayoutDashboard;
          const active = location.pathname === path || location.pathname.startsWith(`${path}/`);
          return (
            <Link
              key={mod.moduleKey}
              to={path}
              title={collapsed ? mod.label : undefined}
              className={cn(
                'flex items-center rounded-lg transition-all duration-200',
                active ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span className="text-sm truncate">{mod.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
