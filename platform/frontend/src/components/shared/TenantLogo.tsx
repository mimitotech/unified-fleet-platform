import { useEffect, useState } from 'react';
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
  sidebar: { shell: 'h-12 min-w-[52px] max-w-[160px]', img: 'max-h-10 max-w-[140px]', name: 'text-sm', initial: 'text-lg' },
  header: { shell: 'h-12 min-w-[48px] max-w-[140px]', img: 'max-h-9 max-w-[120px]', name: 'text-base', initial: 'text-base' },
  lg: { shell: 'h-14 min-w-[56px] max-w-[180px]', img: 'max-h-12 max-w-[160px]', name: 'text-base', initial: 'text-xl' },
} as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'F';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

/** Tenant logo with high-contrast container; MAMS only when tenant has no logo. */
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
  const hasCustom = Boolean(resolved);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [resolved]);

  const showImage = hasCustom ? !failed : true;
  const imgSrc = hasCustom ? resolved! : BRAND.logo;

  return (
    <div className={cn('flex items-center gap-3 min-w-0', className)}>
      <div
        className={cn(
          'flex items-center justify-center rounded-lg px-2 py-1 flex-shrink-0 shadow-sm',
          s.shell,
          onDark ? 'bg-white/95 ring-1 ring-white/20' : 'bg-white ring-1 ring-border'
        )}
      >
        {showImage ? (
          <img
            key={imgSrc}
            src={imgSrc}
            alt={`${name} logo`}
            className={cn(s.img, 'w-auto object-contain object-center')}
            onError={(e) => {
              const img = e.currentTarget;
              if (hasCustom) {
                setFailed(true);
                return;
              }
              if (!img.dataset.fallback) {
                img.dataset.fallback = '1';
                img.src = BRAND.logoFallback;
              }
            }}
          />
        ) : (
          <span
            className={cn(
              'font-bold tracking-tight text-primary',
              s.initial
            )}
            aria-hidden
          >
            {initials(name)}
          </span>
        )}
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
