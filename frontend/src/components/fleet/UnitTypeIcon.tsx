import { cn } from '@/lib/utils';
import { useFleetUnitIcon } from '@/hooks/useFleetUnitIcon';

type Props = {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  wialonId?: number;
  iconUgi?: number;
  title?: string;
};

const imgPx = { sm: 28, md: 36, lg: 48 };

/** Fleet unit icon — Wialon-assigned PNG only, neutral (no tenant branding tint). */
export function UnitTypeIcon({
  className,
  size = 'md',
  wialonId,
  iconUgi = 1,
  title,
}: Props) {
  const dim = imgPx[size];
  const wialonSrc = useFleetUnitIcon(wialonId, iconUgi);

  if (wialonSrc) {
    return (
      <div
        className={cn('shrink-0 flex items-center justify-center', className)}
        style={{ width: dim, height: dim }}
        title={title}
      >
        <img
          src={wialonSrc}
          alt=""
          width={dim}
          height={dim}
          className="object-contain"
          style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.2))' }}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'shrink-0 rounded-md bg-muted flex items-center justify-center text-muted-foreground text-[10px] font-medium',
        size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-10 h-10' : 'w-8 h-8',
        className
      )}
      title={title || 'Unit'}
    >
      ?
    </div>
  );
}
