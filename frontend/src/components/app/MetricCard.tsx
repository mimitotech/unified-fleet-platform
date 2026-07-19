import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MetricVariant = 'default' | 'primary' | 'success' | 'warning' | 'destructive' | 'info';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: { value: number; isPositive: boolean };
  variant?: MetricVariant;
  size?: 'xxs' | 'xs' | 'sm' | 'md' | 'lg';
  compact?: boolean;
  active?: boolean;
  className?: string;
  onClick?: () => void;
}

/** Brand green (#004225) via theme tokens — success/info use same Mimito green family */
const variantStyles: Record<
  MetricVariant,
  { bg: string; border: string; iconFill: string; value: string; ring: string }
> = {
  default: {
    bg: 'bg-slate-50',
    border: 'border-slate-200/80',
    iconFill: 'bg-slate-500 text-white',
    value: 'text-slate-800',
    ring: 'ring-slate-400/40',
  },
  primary: {
    bg: 'bg-secondary',
    border: 'border-primary/15',
    iconFill: 'bg-primary text-primary-foreground',
    value: 'text-primary',
    ring: 'ring-primary/40',
  },
  success: {
    bg: 'bg-secondary',
    border: 'border-primary/15',
    iconFill: 'bg-primary text-primary-foreground',
    value: 'text-primary',
    ring: 'ring-primary/40',
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200/80',
    iconFill: 'bg-amber-500 text-white',
    value: 'text-amber-700',
    ring: 'ring-amber-500/40',
  },
  destructive: {
    bg: 'bg-red-50',
    border: 'border-red-200/80',
    iconFill: 'bg-destructive text-destructive-foreground',
    value: 'text-red-700',
    ring: 'ring-red-500/40',
  },
  info: {
    bg: 'bg-secondary',
    border: 'border-accent/25',
    iconFill: 'bg-accent text-accent-foreground',
    value: 'text-accent',
    ring: 'ring-accent/40',
  },
};

const sizeStyles = {
  xxs: { card: 'p-2 rounded-lg', icon: 'p-1.5', iconSize: 'w-3 h-3', title: 'text-[9px]', value: 'text-sm leading-none', subtitle: 'text-[9px]' },
  xs: { card: 'p-2.5 rounded-lg', icon: 'p-1.5', iconSize: 'w-3.5 h-3.5', title: 'text-[10px]', value: 'text-base leading-tight', subtitle: 'text-[10px]' },
  sm: { card: 'p-3 rounded-xl', icon: 'p-2', iconSize: 'w-4 h-4', title: 'text-[10px]', value: 'text-lg leading-tight', subtitle: 'text-[10px]' },
  md: { card: 'p-4 rounded-xl', icon: 'p-2', iconSize: 'w-4 h-4', title: 'text-xs', value: 'text-2xl', subtitle: 'text-xs' },
  lg: { card: 'p-5 rounded-xl', icon: 'p-2.5', iconSize: 'w-5 h-5', title: 'text-sm', value: 'text-3xl', subtitle: 'text-sm' },
};

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = 'default',
  size = 'xs',
  compact,
  active,
  className,
  onClick,
}: MetricCardProps) {
  const styles = variantStyles[variant];
  const sizes = sizeStyles[size];
  const isCompact = compact !== undefined ? compact : size === 'xxs' || size === 'xs';

  return (
    <div
      className={cn(
        'group relative overflow-hidden border shadow-sm',
        'transition-all duration-200 hover:shadow-md hover:-translate-y-px',
        styles.bg,
        styles.border,
        active && cn('ring-2 shadow-md', styles.ring),
        onClick && 'cursor-pointer active:scale-[0.98]',
        sizes.card,
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      {isCompact ? (
        <div className="flex items-center gap-2 min-w-0">
          {Icon && (
            <div className={cn('rounded-md shrink-0 shadow-sm transition-transform group-hover:scale-105', styles.iconFill, sizes.icon)}>
              <Icon className={sizes.iconSize} strokeWidth={2.25} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className={cn('font-semibold uppercase tracking-wide text-muted-foreground truncate', sizes.title)}>{title}</p>
            <div className="flex items-baseline gap-1.5">
              <p className={cn('font-bold font-mono tracking-tight', sizes.value, styles.value)}>{value}</p>
              {trend && (
                <span className={cn('text-[9px] font-semibold px-1 rounded', trend.isPositive ? 'bg-primary/10 text-primary' : 'bg-red-100 text-red-700')}>
                  {trend.isPositive ? '+' : ''}{trend.value}%
                </span>
              )}
            </div>
            {subtitle && <p className={cn('text-muted-foreground truncate', sizes.subtitle)}>{subtitle}</p>}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between">
            {Icon && (
              <div className={cn('rounded-lg shadow-sm transition-transform group-hover:scale-105', styles.iconFill, sizes.icon)}>
                <Icon className={sizes.iconSize} strokeWidth={2.25} />
              </div>
            )}
            {trend && (
              <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', trend.isPositive ? 'bg-primary/10 text-primary' : 'bg-red-100 text-red-700')}>
                {trend.isPositive ? '+' : ''}{trend.value}%
              </span>
            )}
          </div>
          <div className="mt-3">
            <p className={cn('font-semibold uppercase tracking-wider text-muted-foreground', sizes.title)}>{title}</p>
            <p className={cn('font-bold font-mono tracking-tight mt-0.5', sizes.value, styles.value)}>{value}</p>
            {subtitle && <p className={cn('text-muted-foreground mt-1', sizes.subtitle)}>{subtitle}</p>}
          </div>
        </>
      )}
    </div>
  );
}

export default MetricCard;
