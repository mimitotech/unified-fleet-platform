import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/branding';
import { MamsBrandName } from '@/components/shared/MamsBrandName';

interface MamsLogoProps {
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'light' | 'dark';
  logoOnly?: boolean;
}

const SIZES = {
  sm: { img: 'h-8', text: 'text-sm', sub: 'text-[10px]' },
  md: { img: 'h-10', text: 'text-base', sub: 'text-xs' },
  lg: { img: 'h-14', text: 'text-xl', sub: 'text-sm' },
  xl: { img: 'h-20', text: 'text-2xl', sub: 'text-sm' },
};

export function MamsLogo({
  className,
  showText = true,
  size = 'md',
  variant = 'light',
  logoOnly = false,
}: MamsLogoProps) {
  const s = SIZES[size];
  const subColor = variant === 'dark' ? 'text-white/70' : 'text-muted-foreground';

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <img
        src={BRAND.logo}
        alt={BRAND.name}
        className={cn(s.img, 'w-auto object-contain')}
        onError={(e) => {
          const img = e.currentTarget;
          if (!img.dataset.fallback) {
            img.dataset.fallback = '1';
            img.src = BRAND.logoFallback;
          }
        }}
      />
      {showText && !logoOnly && (
        <div className="min-w-0">
          <MamsBrandName
            size={size === 'xl' ? 'lg' : size === 'lg' ? 'md' : 'sm'}
            as="p"
            className={variant === 'dark' ? '!text-white' : undefined}
          />
          <p className={cn('leading-tight truncate mt-0.5', s.sub, subColor)}>{BRAND.fullName}</p>
        </div>
      )}
    </div>
  );
}

export function MamsLogoMark({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const h = { sm: 'h-8', md: 'h-10', lg: 'h-12' }[size];
  return (
    <img
      src={BRAND.logo}
      alt={BRAND.name}
      className={cn(h, 'w-auto object-contain', className)}
      onError={(e) => {
        const img = e.currentTarget;
        if (!img.dataset.fallback) {
          img.dataset.fallback = '1';
          img.src = BRAND.logoFallback;
        }
      }}
    />
  );
}
