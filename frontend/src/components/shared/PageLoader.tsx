import { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function PageLoader({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-4 animate-fade-in', className)}>
      <div className="grid grid-cols-6 gap-2">
        {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
      <Skeleton className="h-[60vh] rounded-xl" />
    </div>
  );
}

export function AnimatedPage({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('animate-fade-in space-y-4', className)}>{children}</div>;
}
