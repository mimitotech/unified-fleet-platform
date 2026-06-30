import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MetricVariant = 'default' | 'primary' | 'success' | 'warning' | 'destructive' | 'info';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: MetricVariant;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
}

const variantStyles: Record<MetricVariant, { icon: string; accent: string }> = {
  default: {
    icon: 'bg-muted text-muted-foreground',
    accent: 'group-hover:border-muted-foreground/50',
  },
  primary: {
    icon: 'bg-primary/15 text-primary',
    accent: 'group-hover:border-primary/50',
  },
  success: {
    icon: 'bg-success/15 text-success',
    accent: 'group-hover:border-success/50',
  },
  warning: {
    icon: 'bg-warning/15 text-warning',
    accent: 'group-hover:border-warning/50',
  },
  destructive: {
    icon: 'bg-destructive/15 text-destructive',
    accent: 'group-hover:border-destructive/50',
  },
  info: {
    icon: 'bg-info/15 text-[hsl(var(--info))]',
    accent: 'group-hover:border-info/50',
  },
};

const sizeStyles = {
  sm: {
    card: 'p-3',
    icon: 'p-1.5',
    iconSize: 'w-4 h-4',
    title: 'text-xs',
    value: 'text-xl',
    subtitle: 'text-xs',
  },
  md: {
    card: 'p-4',
    icon: 'p-2.5',
    iconSize: 'w-5 h-5',
    title: 'text-xs',
    value: 'text-3xl',
    subtitle: 'text-sm',
  },
  lg: {
    card: 'p-5',
    icon: 'p-3',
    iconSize: 'w-6 h-6',
    title: 'text-sm',
    value: 'text-4xl',
    subtitle: 'text-base',
  },
};

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = 'default',
  size = 'md',
  className,
  onClick,
}: MetricCardProps) {
  const styles = variantStyles[variant];
  const sizes = sizeStyles[size];

  return (
    <div
      className={cn(
        'fleet-card group transition-all duration-300',
        styles.accent,
        onClick && 'cursor-pointer hover:shadow-lg',
        sizes.card,
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      <div className="flex items-start justify-between">
        {Icon && (
          <div
            className={cn(
              'rounded-lg transition-transform group-hover:scale-105',
              styles.icon,
              sizes.icon
            )}
          >
            <Icon className={sizes.iconSize} />
          </div>
        )}
        {trend && (
          <span
            className={cn(
              'text-xs font-medium px-2 py-0.5 rounded-full',
              trend.isPositive
                ? 'bg-success/15 text-success'
                : 'bg-destructive/15 text-destructive'
            )}
          >
            {trend.isPositive ? '+' : ''}
            {trend.value}%
          </span>
        )}
      </div>
      <div className="mt-4">
        <p className={cn('font-medium uppercase tracking-wider text-muted-foreground', sizes.title)}>
          {title}
        </p>
        <p className={cn('font-semibold font-mono tracking-tight mt-1', sizes.value)}>{value}</p>
        {subtitle && (
          <p className={cn('text-muted-foreground mt-1', sizes.subtitle)}>{subtitle}</p>
        )}
      </div>
    </div>
  );
}

export default MetricCard;

