import { Satellite } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useWialonContext } from '@/hooks/useWialon';
import { useFleetAssetProfile } from '@/hooks/useFleetAssetProfile';
import { clientFacingText } from '@/lib/clientFacingText';
import { cn } from '@/lib/utils';

type Props = {
  className?: string;
  compact?: boolean;
  /** Render only the disconnected/error state; hide the connected info block. */
  errorOnly?: boolean;
};

export function WialonContextBanner({ className, compact, errorOnly }: Props) {
  const { connected, configured, tierName, counts, ctx, isLoading } = useWialonContext();
  const assetProfile = useFleetAssetProfile();

  if (isLoading || !configured) return null;

  const lastError = clientFacingText(ctx?.lastError);

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
            Telematics is configured but not connected
            {lastError ? `: ${lastError}` : '.'}
            {' '}Contact your account manager to restore the connection.
          </span>
        </div>
      </div>
    );
  }

  // Connected info is surfaced elsewhere (e.g. Dashboard summary strip); skip it here.
  if (errorOnly) return null;

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
          {ctx?.accountName || 'Connected account'}
        </span>
        {tierName && (
          <Badge variant="secondary" className="text-xs">
            {tierName}
          </Badge>
        )}
        {!compact && lastError && (
          <span className="text-xs text-amber-700 dark:text-amber-400 truncate max-w-md" title={lastError}>
            Sync note: {lastError}
          </span>
        )}
        {!compact && (
          <>
            {unitCount != null && (
              <span className="text-xs text-muted-foreground">
                {unitCount} {assetProfile.unitLabelPlural} on this account
              </span>
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
    </div>
  );
}
