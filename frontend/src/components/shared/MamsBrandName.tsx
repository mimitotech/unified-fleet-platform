import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/branding';

interface MamsBrandNameProps {
  className?: string;
  /** Display size preset */
  size?: 'sm' | 'md' | 'lg' | 'hero';
  as?: 'span' | 'p' | 'h1' | 'h2';
}

const SIZE_CLASS = {
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-4xl',
  hero: 'text-5xl sm:text-6xl lg:text-7xl',
};

/** Bold, high-visibility MAMS wordmark in Mimito brand green (#004225) */
export function MamsBrandName({ className, size = 'md', as: Tag = 'span' }: MamsBrandNameProps) {
  return (
    <Tag
      className={cn(
        'font-black tracking-tight leading-none text-primary',
        SIZE_CLASS[size],
        className
      )}
    >
      {BRAND.name}
    </Tag>
  );
}
