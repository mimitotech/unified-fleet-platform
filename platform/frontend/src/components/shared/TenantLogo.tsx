import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/branding';
import { resolveAssetUrl } from '@/lib/assets';

interface TenantLogoProps {
  logoUrl?: string | null;
  name: string;
  size?: 'sidebar' | 'header' | 'lg';
  showName?: boolean;
  variant?: 'on-dark' | 'on-light';
  className?: string;
}

const SIZE = {
  sidebar: { shell: 'h-12 min-w-[52px] max-w-[160px]', img: 'max-h-10 max-w-[140px]', name: 'text-sm' },
  header: { shell: 'h-12 min-w-[48px] max-w-[140px]', img: 'max-h-9 max-w-[120px]', name: 'text-base' },
  lg: { shell: 'h-14 min-w-[56px] max-w-[180px]', img: 'max-h-12 max-w-[160px]', name: 'text-base' },
} as const;

/** Tenant logo with high-contrast container; falls back to MAMS logo */
export function TenantLogo({
  logoUrl,
  name,
  size = 'header',
  showName = false,
  variant = 'on-dark',
  className,
}: TenantLogoProps) {
  const s = SIZE[size];
  const resolved = resolveAssetUrl(logoUrl);
  const onDark = variant === 'on-dark';

  return (
    <div className={cn('flex items-center gap-3 min-w-0', className)}>
      <div
        className={cn(
          'flex items-center justify-center rounded-lg px-2 py-1 flex-shrink-0 shadow-sm',
          s.shell,
          onDark ? 'bg-white/95 ring-1 ring-white/20' : 'bg-white ring-1 ring-border'
        )}
      >
        <img
          src={resolved || BRAND.logo}
          alt={`${name} logo`}
          className={cn(s.img, 'w-auto object-contain object-center')}
          onError={(e) => {
            const img = e.currentTarget;
            if (!img.dataset.fallback) {
              img.dataset.fallback = '1';
              img.src = BRAND.logoFallback;
            }
          }}
        />
      </div>
      {showName && (
        <div className="min-w-0">
          <p
            className={cn(
              'font-bold leading-tight truncate',
              s.name,
              onDark ? 'text-sidebar-foreground' : 'text-foreground'
            )}
          >
            {name}
          </p>
        </div>
      )}
    </div>
  );
}
