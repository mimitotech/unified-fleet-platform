import { MamsLogo } from '@/components/shared/MamsLogo';
import { Skeleton } from '@/components/ui/skeleton';

export function AppBootLoader({ label = 'Loading your workspace...' }: { label?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-8 p-8">
      <MamsLogo size="lg" />
      <div className="w-full max-w-xs space-y-3">
        <p className="text-sm text-center text-muted-foreground animate-pulse">{label}</p>
        <Skeleton className="h-2 w-full rounded-full" />
        <Skeleton className="h-2 w-3/4 mx-auto rounded-full" />
      </div>
    </div>
  );
}
