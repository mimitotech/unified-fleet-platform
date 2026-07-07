import { Map } from 'lucide-react';
import { cn } from '@/lib/utils';

export function MapSkeleton({ height = '400px', className }: { height?: string; className?: string }) {
  return (
    <div
      className={cn(
        'map-container rounded-lg overflow-hidden border relative bg-muted/40',
        className
      )}
      style={{ height }}
      aria-busy="true"
      aria-label="Loading map"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-muted/30 to-primary/10 animate-pulse" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <div className="rounded-full bg-primary/10 p-4 ring-1 ring-primary/20">
          <Map className="h-8 w-8 text-primary animate-pulse" />
        </div>
        <p className="text-sm font-medium">Loading live map…</p>
      </div>
    </div>
  );
}
