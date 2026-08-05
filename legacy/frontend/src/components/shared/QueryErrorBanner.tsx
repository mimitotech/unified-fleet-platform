import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface QueryErrorBannerProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function QueryErrorBanner({
  message = 'Could not load data. Check your connection and try again.',
  onRetry,
  className,
}: QueryErrorBannerProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 rounded-lg border border-destructive/30',
        'bg-destructive/5 px-4 py-3 text-sm',
        className
      )}
      role="alert"
    >
      <div className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <span>{message}</span>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="flex-shrink-0 gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      )}
    </div>
  );
}
