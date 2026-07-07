import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, Play, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSurveillanceViolations } from '@/hooks/useDomain';
import { safeArray } from '@/lib/safeArray';

type Props = {
  unitId?: number;
};

export function SurveillanceEventsTab({ unitId }: Props) {
  const { data, isLoading } = useSurveillanceViolations(true);
  const events = safeArray<Record<string, unknown>>(data).filter((v) => {
    if (unitId == null) return true;
    const name = String(v.unitName || '');
    return String(v.unitId || '') === String(unitId) || name.length > 0;
  });

  if (isLoading) return <Skeleton className="h-48" />;

  return (
    <div className="space-y-3">
      {events.map((v, i) => {
        const videoUrl = v.videoUrl ? String(v.videoUrl) : '';
        return (
          <div key={String(v.id || i)} className="flex items-start gap-3 border-b border-border pb-3 last:border-0">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">
                {String(v.violationType || v.title || v.type || 'Event')}
              </p>
              <p className="text-xs text-muted-foreground">
                {[v.unitName, v.driverName].filter(Boolean).join(' · ')}
              </p>
              {v.occurredAt && (
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(String(v.occurredAt)), { addSuffix: true })}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Badge variant="outline" className="capitalize">
                {String(v.category || v.severity || 'event')}
              </Badge>
              {videoUrl && (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" asChild>
                  <a href={videoUrl} target="_blank" rel="noopener noreferrer">
                    <Play className="h-3 w-3" />
                    Clip
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </a>
                </Button>
              )}
            </div>
          </div>
        );
      })}
      {!events.length && (
        <p className="text-muted-foreground text-center py-8 text-sm">No video-related events in the last period</p>
      )}
    </div>
  );
}
