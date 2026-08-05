import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  DASHBOARD_QUICK_LINKS,
  QUICK_TONE_CLASS,
  type DashboardModuleKey,
} from '@/lib/dashboardNav';
import { DashboardSectionLabel } from '@/components/dashboard/DashboardWidget';

type Props = {
  enabledKeys: Set<string>;
};

export function DashboardQuickAccess({ enabledKeys }: Props) {
  const links = DASHBOARD_QUICK_LINKS.filter((link) => enabledKeys.has(link.moduleKey));
  if (!links.length) return null;

  return (
    <div className="space-y-2.5" data-no-print>
      <DashboardSectionLabel>Quick access · your modules</DashboardSectionLabel>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2.5">
        {links.map((link, i) => {
          const tone = QUICK_TONE_CLASS[link.tone];
          const Icon = link.icon;
          return (
            <Link
              key={link.moduleKey}
              to={link.href}
              className={cn(
                'group border rounded-xl p-3 flex flex-col gap-1.5',
                'transition-all duration-200 hover:-translate-y-1 hover:shadow-md',
                'animate-slide-in focus-visible:outline-none focus-visible:ring-2',
                tone.tile,
                tone.ring,
              )}
              style={{ animationDelay: `${i * 35}ms` }}
            >
              <Icon className={cn('h-4 w-4 transition-transform duration-200 group-hover:scale-110', tone.icon)} />
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">{link.label}</p>
                <p className="text-[10px] opacity-80 truncate group-hover:opacity-100">{link.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function moduleEnabledSet(
  modules: Array<{ moduleKey: string; isEnabled?: boolean; isVisible?: boolean }>,
  isAdmin: boolean,
): Set<DashboardModuleKey | string> {
  const set = new Set<string>();
  for (const m of modules) {
    if (!m.isEnabled) continue;
    if (m.isVisible === false && !isAdmin) continue;
    set.add(m.moduleKey);
  }
  return set;
}
