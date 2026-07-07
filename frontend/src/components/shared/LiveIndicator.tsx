import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Radio } from 'lucide-react';

interface LiveIndicatorProps {
  dataUpdatedAt?: number;
  className?: string;
}

export function LiveIndicator({ dataUpdatedAt, className }: LiveIndicatorProps) {
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    const tick = () => {
      if (!dataUpdatedAt) return setSecondsAgo(0);
      setSecondsAgo(Math.max(0, Math.floor((Date.now() - dataUpdatedAt) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [dataUpdatedAt]);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1',
        'bg-primary/10 text-primary border border-primary/20',
        className
      )}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-40 animate-pulse" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
      </span>
      <Radio className="w-3 h-3 opacity-70" />
      Live{dataUpdatedAt ? ` · ${secondsAgo}s ago` : ''}
    </span>
  );
}
