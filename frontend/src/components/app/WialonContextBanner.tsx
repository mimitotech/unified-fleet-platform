import { Link } from 'react-router-dom';
import { Satellite, Settings, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useWialonContext } from '@/hooks/useWialon';
import { cn } from '@/lib/utils';

type Props = {
  className?: string;
  compact?: boolean;
};

export function WialonContextBanner({ className, compact }: Props) {
  const { connected, configured, tierName, counts, ctx, isLoading } = useWialonContext();

  if (isLoading || !configured) return null;

  if (!connected) {
    return (
      <div
        className={cn(
          'rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 flex flex-wrap items-center justify-between gap-3',
          className
        )}
      >
        <div className="flex items-center gap-2 text-sm">
          <Satellite className="h-4 w-4 text-destructive shrink-0" />
          <span>
            Wialon is configured but not connected
            {ctx?.lastError ? `: ${ctx.lastError}` : '.'}
          </span>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/app/settings?tab=wialon">
            <Settings className="h-3.5 w-3.5 mr-1.5" />
            Check connection
          </Link>
        </Button>
      </div>
    );
  }

  const scoped = (ctx?.sessionMeta as { scopedAccountId?: number } | undefined)?.scopedAccountId;
  const unitCount = scoped
    ? (ctx?.previewAssetCount ?? counts?.units)
    : (counts?.units ?? ctx?.previewAssetCount);
  const accountCount = counts?.accounts;

  return (
    <div
      className={cn(
        'rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 flex flex-wrap items-center justify-between gap-3',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <Satellite className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-medium truncate">
          {ctx?.accountName || 'Wialon'}
        </span>
        {tierName && (
          <Badge variant="secondary" className="text-xs">
            {tierName}
          </Badge>
        )}
        {!compact && ctx?.lastError && (
          <span className="text-xs text-amber-700 dark:text-amber-400 truncate max-w-md" title={ctx.lastError}>
            Sync note: {ctx.lastError}
          </span>
        )}
        {!compact && (
          <>
            {unitCount != null && (
              <span className="text-xs text-muted-foreground">{unitCount} units on this account</span>
            )}
            {!((ctx?.sessionMeta as { scopedAccountId?: number } | undefined)?.scopedAccountId) &&
              accountCount != null &&
              accountCount > 1 && (
              <span className="text-xs text-muted-foreground">{accountCount} accounts</span>
            )}
            {ctx?.operateAs && (
              <span className="text-xs text-muted-foreground">as user {ctx.operateAs}</span>
            )}
          </>
        )}
      </div>
      <Button variant="ghost" size="sm" className="shrink-0 h-8" asChild>
        <Link to="/app/settings?tab=wialon">
          Wialon
          <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
        </Link>
      </Button>
    </div>
  );
}
