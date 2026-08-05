import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Fuel,
  Gauge,
  Leaf,
  Map,
  MapPin,
  Route,
  Terminal,
  Truck,
  Users,
  Video,
  Wrench,
} from 'lucide-react';

export type DashboardModuleKey =
  | 'monitoring'
  | 'alerts'
  | 'fuel'
  | 'workshop'
  | 'drivers'
  | 'routes'
  | 'emissions'
  | 'geofencing'
  | 'surveillance'
  | 'sensors'
  | 'commands'
  | 'trailers';

export type QuickAccessTone = 'primary' | 'accent' | 'amber' | 'rose' | 'sky' | 'teal' | 'violet' | 'slate';

export type DashboardQuickLink = {
  moduleKey: DashboardModuleKey;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  tone: QuickAccessTone;
};

/** Operational modules shown as quick-access tiles (excludes dashboard itself). */
export const DASHBOARD_QUICK_LINKS: DashboardQuickLink[] = [
  {
    moduleKey: 'monitoring',
    label: 'Monitoring',
    description: 'Live map & tracks',
    href: '/app/monitoring',
    icon: Map,
    tone: 'primary',
  },
  {
    moduleKey: 'alerts',
    label: 'Alerts',
    description: 'Inbox & severity',
    href: '/app/alerts',
    icon: AlertTriangle,
    tone: 'rose',
  },
  {
    moduleKey: 'fuel',
    label: 'Fuel',
    description: 'Use, fills & drains',
    href: '/app/fuel',
    icon: Fuel,
    tone: 'teal',
  },
  {
    moduleKey: 'workshop',
    label: 'Workshop',
    description: 'Jobs & costs',
    href: '/app/workshop',
    icon: Wrench,
    tone: 'amber',
  },
  {
    moduleKey: 'drivers',
    label: 'Drivers',
    description: 'Roster & duty',
    href: '/app/drivers',
    icon: Users,
    tone: 'sky',
  },
  {
    moduleKey: 'routes',
    label: 'Routes',
    description: 'Plans & trips',
    href: '/app/routes',
    icon: Route,
    tone: 'violet',
  },
  {
    moduleKey: 'emissions',
    label: 'Emissions',
    description: 'CO₂ & eco',
    href: '/app/emissions',
    icon: Leaf,
    tone: 'teal',
  },
  {
    moduleKey: 'surveillance',
    label: 'Surveillance',
    description: 'Cameras & video',
    href: '/app/surveillance',
    icon: Video,
    tone: 'accent',
  },
  {
    moduleKey: 'geofencing',
    label: 'Geofencing',
    description: 'Zones & radius',
    href: '/app/geofencing',
    icon: MapPin,
    tone: 'sky',
  },
  {
    moduleKey: 'sensors',
    label: 'Sensors',
    description: 'Fuel % & engine',
    href: '/app/sensors',
    icon: Gauge,
    tone: 'primary',
  },
  {
    moduleKey: 'commands',
    label: 'Commands',
    description: 'Remote control',
    href: '/app/commands',
    icon: Terminal,
    tone: 'slate',
  },
  {
    moduleKey: 'trailers',
    label: 'Trailers',
    description: 'Trailer roster',
    href: '/app/trailers',
    icon: Truck,
    tone: 'amber',
  },
];

export const QUICK_TONE_CLASS: Record<
  QuickAccessTone,
  { tile: string; icon: string; ring: string }
> = {
  primary: {
    tile: 'bg-secondary border-primary/20 hover:bg-primary hover:text-primary-foreground hover:border-primary',
    icon: 'text-primary group-hover:text-primary-foreground',
    ring: 'ring-primary/30',
  },
  accent: {
    tile: 'bg-secondary border-accent/25 hover:bg-accent hover:text-accent-foreground hover:border-accent',
    icon: 'text-accent group-hover:text-accent-foreground',
    ring: 'ring-accent/30',
  },
  amber: {
    tile: 'bg-amber-50 border-amber-200/80 hover:bg-amber-500 hover:text-white hover:border-amber-500',
    icon: 'text-amber-600 group-hover:text-white',
    ring: 'ring-amber-400/40',
  },
  rose: {
    tile: 'bg-red-50 border-red-200/80 hover:bg-red-600 hover:text-white hover:border-red-600',
    icon: 'text-red-600 group-hover:text-white',
    ring: 'ring-red-400/40',
  },
  sky: {
    tile: 'bg-sky-50 border-sky-200/80 hover:bg-sky-600 hover:text-white hover:border-sky-600',
    icon: 'text-sky-600 group-hover:text-white',
    ring: 'ring-sky-400/40',
  },
  teal: {
    tile: 'bg-teal-50 border-teal-200/80 hover:bg-teal-600 hover:text-white hover:border-teal-600',
    icon: 'text-teal-700 group-hover:text-white',
    ring: 'ring-teal-400/40',
  },
  violet: {
    tile: 'bg-violet-50 border-violet-200/80 hover:bg-violet-600 hover:text-white hover:border-violet-600',
    icon: 'text-violet-600 group-hover:text-white',
    ring: 'ring-violet-400/40',
  },
  slate: {
    tile: 'bg-slate-50 border-slate-200 hover:bg-slate-700 hover:text-white hover:border-slate-700',
    icon: 'text-slate-600 group-hover:text-white',
    ring: 'ring-slate-400/40',
  },
};
