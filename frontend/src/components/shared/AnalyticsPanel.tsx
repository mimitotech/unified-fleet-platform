import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PanelTone = 'brand' | 'fleet' | 'alert' | 'sync' | 'neutral';

/** All brand tones use Mimito green (#004225) family from theme tokens */
const TONE = {
  brand: {
    bar: 'bg-primary',
    bg: 'bg-secondary',
    border: 'border-primary/15 hover:border-primary/30',
    icon: 'bg-primary text-primary-foreground',
  },
  fleet: {
    bar: 'bg-accent',
    bg: 'bg-secondary',
    border: 'border-primary/20 hover:border-primary/35',
    icon: 'bg-primary text-primary-foreground',
  },
  alert: {
    bar: 'bg-destructive',
    bg: 'bg-red-50/60',
    border: 'border-red-200/60 hover:border-red-300/80',
    icon: 'bg-destructive text-destructive-foreground',
  },
  sync: {
    bar: 'bg-accent',
    bg: 'bg-secondary',
    border: 'border-accent/20 hover:border-accent/35',
    icon: 'bg-accent text-accent-foreground',
  },
  neutral: {
    bar: 'bg-slate-400',
    bg: 'bg-slate-50/80',
    border: 'border-slate-200/80 hover:border-slate-300',
    icon: 'bg-slate-500 text-white',
  },
} as const;

interface AnalyticsPanelProps {
  title: string;
  description?: string;
  tone?: PanelTone;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
  interactive?: boolean;
}

export function AnalyticsPanel({
  title,
  description,
  tone = 'brand',
  icon: Icon,
  action,
  className,
  children,
  interactive = true,
}: AnalyticsPanelProps) {
  const t = TONE[tone];

  return (
    <div
      className={cn(
        'rounded-xl border overflow-hidden shadow-sm transition-all duration-200',
        t.bg,
        t.border,
        interactive && 'hover:shadow-md hover:-translate-y-0.5',
        className
      )}
    >
      <div className={cn('h-1 w-full', t.bar)} />
      <div className="px-3 pt-2.5 pb-1 flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          {Icon && (
            <div className={cn('rounded-lg p-1.5 shrink-0 shadow-sm', t.icon)}>
              <Icon className="w-3.5 h-3.5" strokeWidth={2.25} />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground leading-tight">{title}</h3>
            {description && <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="px-3 pb-3 pt-1">{children}</div>
    </div>
  );
}
