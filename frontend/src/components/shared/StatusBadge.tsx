import { cn } from '@/lib/utils';
import type {
  VehicleStatus,
  DriverStatus,
  RouteStatus,
  AlertSeverity,
} from '@/types/status';

// Re-export types for backward compatibility
export type { VehicleStatus, DriverStatus, RouteStatus, AlertSeverity };

type StatusType = VehicleStatus | DriverStatus | RouteStatus | AlertSeverity;

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  showDot?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const statusConfig: Record<StatusType, { label: string; classes: string; dotColor: string }> = {
  // Vehicle statuses (Wialon standard colors)
  moving: {
    label: 'Moving',
    classes: 'bg-status-moving/15 text-status-moving', // Green
    dotColor: 'bg-status-moving',
  },
  idle: {
    label: 'Idle',
    classes: 'bg-status-idle/15 text-status-idle', // Yellow/Orange
    dotColor: 'bg-status-idle',
  },
  stopped: {
    label: 'Stopped',
    classes: 'bg-status-stopped/15 text-status-stopped', // Red
    dotColor: 'bg-status-stopped',
  },
  offline: {
    label: 'Offline',
    classes: 'bg-status-offline/15 text-status-offline', // Grey
    dotColor: 'bg-status-offline',
  },
  // Driver statuses
  active: {
    label: 'Active',
    classes: 'bg-success/15 text-[hsl(var(--success))]',
    dotColor: 'bg-success',
  },
  'on-trip': {
    label: 'On Trip',
    classes: 'bg-info/15 text-[hsl(var(--info))]',
    dotColor: 'bg-info',
  },
  'off-duty': {
    label: 'Off Duty',
    classes: 'bg-muted text-muted-foreground',
    dotColor: 'bg-muted-foreground',
  },
  // Route statuses
  scheduled: {
    label: 'Scheduled',
    classes: 'bg-primary/15 text-primary',
    dotColor: 'bg-primary',
  },
  'in-progress': {
    label: 'In Progress',
    classes: 'bg-info/15 text-[hsl(var(--info))]',
    dotColor: 'bg-info',
  },
  completed: {
    label: 'Completed',
    classes: 'bg-success/15 text-[hsl(var(--success))]',
    dotColor: 'bg-success',
  },
  cancelled: {
    label: 'Cancelled',
    classes: 'bg-destructive/15 text-destructive',
    dotColor: 'bg-destructive',
  },
  // Alert severities
  critical: {
    label: 'Critical',
    classes: 'bg-destructive/15 text-destructive',
    dotColor: 'bg-destructive',
  },
  warning: {
    label: 'Warning',
    classes: 'bg-warning/15 text-[hsl(var(--warning))]',
    dotColor: 'bg-warning',
  },
  info: {
    label: 'Info',
    classes: 'bg-info/15 text-[hsl(var(--info))]',
    dotColor: 'bg-info',
  },
};

const sizeClasses = {
  sm: 'px-1.5 py-0.5 text-xs',
  md: 'px-2 py-0.5 text-xs',
  lg: 'px-2.5 py-1 text-sm',
};

const dotSizes = {
  sm: 'w-1 h-1',
  md: 'w-1.5 h-1.5',
  lg: 'w-2 h-2',
};

export function StatusBadge({ status, label, showDot = true, size = 'md', className }: StatusBadgeProps) {
  const config = statusConfig[status];

  if (!config) {
    return null;
  }

  const displayLabel = label?.trim() || config.label;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        config.classes,
        sizeClasses[size],
        className
      )}
    >
      {showDot && <span className={cn('rounded-full', config.dotColor, dotSizes[size])} />}
      {displayLabel}
    </span>
  );
}

export default StatusBadge;

