import type { VideoStream } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from 'lucide-react';

type Props = {
  streams: VideoStream[];
  selectedUnitId?: number | null;
};

/** TrackSolid / other integrations with direct stream URLs. */
export function ExternalStreamsPanel({ streams, selectedUnitId }: Props) {
  const filtered = selectedUnitId
    ? streams.filter((s) => s.assetId === String(selectedUnitId))
    : streams;

  const external = filtered.filter((s) => s.sourceType !== 'wialon');
  if (!external.length) return null;

  return (
    <div className="fleet-card p-3 space-y-2">
      <h3 className="text-sm font-semibold">External camera streams</h3>
      <p className="text-[10px] text-muted-foreground">
        Direct feeds from integrated platforms (e.g. TrackSolid). Wialon MDVR units use the live player above.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {external.map((s) => (
          <div key={s.id} className="border rounded-lg overflow-hidden bg-black/90">
            {s.streamUrl ? (
              <video
                src={s.streamUrl}
                className="w-full aspect-video object-contain"
                controls
                muted
                playsInline
              />
            ) : (
              <div className="aspect-video flex items-center justify-center text-xs text-muted-foreground">
                Stream offline
              </div>
            )}
            <div className="px-2 py-1.5 flex items-center justify-between gap-2 bg-card border-t">
              <span className="text-xs font-medium truncate">{s.assetName}</span>
              <Badge variant="outline" className="text-[10px] capitalize shrink-0">
                {s.sourceType}
              </Badge>
              {s.streamUrl && (
                <a href={s.streamUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
