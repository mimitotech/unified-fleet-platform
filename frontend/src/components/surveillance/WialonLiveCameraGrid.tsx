import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Play, Square } from 'lucide-react';
import { WialonVideoPlayer } from '@/components/surveillance/WialonVideoPlayer';
import type { WialonLiveStreamSession, WialonVideoCamera, WialonVideoUnit } from '@/lib/api';

type Props = {
  unit: WialonVideoUnit;
  cameras: WialonVideoCamera[];
  enabled?: boolean;
  liveChannel: number | null;
  onLiveChannelChange: (channel: number | null) => void;
  liveSession?: WialonLiveStreamSession | null;
  liveLoading?: boolean;
  liveError?: string | null;
  onLiveRetry?: () => void;
  /** When true, the active channel plays in the main viewer above — hide duplicate player. */
  mainViewerActive?: boolean;
};

export function WialonLiveCameraGrid({
  unit,
  cameras,
  enabled = true,
  liveChannel,
  onLiveChannelChange,
  liveSession,
  liveLoading,
  liveError,
  onLiveRetry,
  mainViewerActive = false,
}: Props) {
  const cols =
    cameras.length <= 1
      ? 'grid-cols-1'
      : cameras.length === 2
        ? 'grid-cols-1 sm:grid-cols-2'
        : 'grid-cols-1 sm:grid-cols-2';

  if (!cameras.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No camera channels configured in Wialon for this unit.
      </p>
    );
  }

  return (
    <div className={`grid gap-3 ${cols}`}>
      {cameras.map((camera) => {
        const channel = camera.channel ?? camera.index + 1;
        const isPlaying = liveChannel === channel;
        const showInlinePlayer = isPlaying && !(mainViewerActive && isPlaying);

        return (
          <div
            key={camera.channel ?? camera.index}
            className="fleet-card overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30">
              <p className="text-sm font-medium truncate">{camera.name}</p>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge variant="outline" className="text-[10px]">
                  Ch {channel}
                </Badge>
                {camera.active ? (
                  <Badge className="text-[10px] bg-status-moving/15 text-status-moving border-0">On</Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">Off</Badge>
                )}
              </div>
            </div>
            <div className="p-2 space-y-2">
              <div className="flex gap-2">
                {!isPlaying ? (
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={!enabled || liveLoading}
                    onClick={() => onLiveChannelChange(channel)}
                  >
                    <Play className="h-3.5 w-3.5 mr-1" />
                    Go Live
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="h-8" onClick={() => onLiveChannelChange(null)}>
                    <Square className="h-3.5 w-3.5 mr-1" />
                    Stop
                  </Button>
                )}
              </div>
              {isPlaying && mainViewerActive && (
                <p className="text-xs text-muted-foreground">Playing in the viewer above.</p>
              )}
              {showInlinePlayer && (
                <WialonVideoPlayer
                  unit={unit}
                  camera={camera}
                  playbackUrl={liveSession?.playbackUrl}
                  streamType={liveSession?.streamType}
                  isLoading={liveLoading}
                  errorMessage={liveError}
                  onRetry={onLiveRetry}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
