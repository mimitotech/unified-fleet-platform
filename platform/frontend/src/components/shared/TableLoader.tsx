import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface TableLoaderProps {
  rows?: number;
  className?: string;
}

export function TableLoader({ rows = 5, className }: TableLoaderProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <Skeleton className="h-10 w-full rounded-lg" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" style={{ opacity: 1 - i * 0.08 }} />
      ))}
    </div>
  );
}

export function InlineLoader({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center py-12', className)}>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
        </span>
        Loading...
      </div>
    </div>
  );
}
