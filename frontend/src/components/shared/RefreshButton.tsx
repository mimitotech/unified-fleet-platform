import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RefreshButtonProps {
  onRefresh: () => void;
  isFetching?: boolean;
  label?: string;
  className?: string;
}

export function RefreshButton({
  onRefresh,
  isFetching,
  label = 'Refresh',
  className,
}: RefreshButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onRefresh}
      disabled={isFetching}
      className={cn('gap-1.5 border-primary/20', className)}
    >
      <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
      {label}
    </Button>
  );
}
