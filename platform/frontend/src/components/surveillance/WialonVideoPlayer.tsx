import { NativeVideoPlayer } from '@/components/surveillance/NativeVideoPlayer';
import type { WialonVideoCamera, WialonVideoUnit } from '@/lib/api';

type Props = {
  unit: WialonVideoUnit | null;
  camera?: WialonVideoCamera | null;
  playbackUrl?: string | null;
  streamType?: 'hls' | 'progressive';
  isLoading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  className?: string;
};

export function WialonVideoPlayer({
  unit,
  camera,
  playbackUrl,
  streamType,
  isLoading,
  errorMessage,
  onRetry,
  className,
}: Props) {
  if (!unit) {
    return (
      <div className={`flex items-center justify-center bg-muted rounded-lg min-h-[200px] ${className || ''}`}>
        <p className="text-sm text-muted-foreground">Select a video unit</p>
      </div>
    );
  }

  const camLabel = camera?.name ?? `Camera ${camera?.channel ?? 1}`;

  return (
    <NativeVideoPlayer
      playbackUrl={playbackUrl}
      streamType={streamType}
      isLoading={isLoading}
      errorMessage={errorMessage}
      onRetry={onRetry}
      className={className}
      label={`Select ${camLabel} and click Go Live.`}
    />
  );
}
