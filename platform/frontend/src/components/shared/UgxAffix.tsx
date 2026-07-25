import { cn } from '@/lib/utils';

/** Inline UGX / USh affix for money inputs — never use a USD $ glyph. */
export function UgxPrefix({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold tabular-nums text-muted-foreground pointer-events-none select-none',
        className,
      )}
      aria-hidden
    >
      USh
    </span>
  );
}

export function UgxLabelIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn('text-[11px] font-semibold tabular-nums text-muted-foreground', className)}
      aria-hidden
    >
      USh
    </span>
  );
}
