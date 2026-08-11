import { TenantLogo } from '@/components/shared/TenantLogo';
import { Skeleton } from '@/components/ui/skeleton';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { cn } from '@/lib/utils';

type Props = {
  label?: string;
  className?: string;
  /** When true, fill the viewport (auth/boot). Default is in-page content height. */
  fullScreen?: boolean;
};

/**
 * Branded loading state — uses the client logo when available, otherwise MAMS.
 * Safe to show while data queries continue in the background.
 */
export function BrandedPageLoader({
  label = 'Loading your dashboard...',
  className,
  fullScreen = false,
}: Props) {
  const branding = useTenantBranding();

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-6 p-8',
        fullScreen ? 'min-h-screen bg-background' : 'min-h-[50vh] w-full',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="animate-pulse">
        <TenantLogo
          logoUrl={branding.logoUrl}
          name={branding.name || 'MAMS'}
          size="lg"
          variant="on-light"
        />
      </div>
      <div className="w-full max-w-xs space-y-3">
        <p className="text-sm text-center text-muted-foreground animate-pulse">{label}</p>
        <Skeleton className="h-2 w-full rounded-full" />
        <Skeleton className="h-2 w-3/4 mx-auto rounded-full" />
      </div>
    </div>
  );
}
