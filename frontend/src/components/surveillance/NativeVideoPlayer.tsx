import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const API_URL = import.meta.env.VITE_API_URL || '';

type Props = {
  playbackUrl?: string | null;
  streamType?: 'hls' | 'progressive';
  label?: string;
  className?: string;
  autoPlay?: boolean;
  onRetry?: () => void;
  isLoading?: boolean;
  errorMessage?: string | null;
};

function absolutePlaybackUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${API_URL}${path}`;
}

export function NativeVideoPlayer({
  playbackUrl,
  streamType = 'hls',
  label,
  className,
  autoPlay = true,
  onRetry,
  isLoading = false,
  errorMessage,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playbackUrl) {
      setStatus('idle');
      return;
    }

    const src = absolutePlaybackUrl(playbackUrl);
    setStatus('loading');
    setLocalError(null);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const useHls = streamType === 'hls' || /\.m3u8/i.test(playbackUrl);

    if (useHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStatus('playing');
        if (autoPlay) video.play().catch(() => undefined);
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          setStatus('error');
          setLocalError('Live stream failed to load. Try Go Live again.');
        }
      });
    } else if (useHls && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.addEventListener('loadedmetadata', () => {
        setStatus('playing');
        if (autoPlay) video.play().catch(() => undefined);
      }, { once: true });
      video.addEventListener('error', () => {
        setStatus('error');
        setLocalError('Live stream failed to load.');
      }, { once: true });
    } else {
      video.src = src;
      video.addEventListener('canplay', () => {
        setStatus('playing');
        if (autoPlay) video.play().catch(() => undefined);
      }, { once: true });
      video.addEventListener('error', () => {
        setStatus('error');
        setLocalError('Live stream failed to load.');
      }, { once: true });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.removeAttribute('src');
      video.load();
    };
  }, [playbackUrl, streamType, autoPlay]);

  if (isLoading) {
    return <Skeleton className={`min-h-[200px] w-full rounded-lg ${className || ''}`} />;
  }

  if (!playbackUrl) {
    return (
      <div className={`flex items-center justify-center bg-muted rounded-lg min-h-[200px] ${className || ''}`}>
        <p className="text-sm text-muted-foreground text-center px-4">
          {label || 'Select a camera and click Go Live to start playback here.'}
        </p>
      </div>
    );
  }

  const err = errorMessage || localError;

  return (
    <div className={className}>
      <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-border/60">
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          controls
          playsInline
          muted
          autoPlay={autoPlay}
        />
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-sm">
            Connecting to camera…
          </div>
        )}
        {status === 'error' && err && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-white p-4 gap-2 text-center">
            <p className="text-sm">{err}</p>
            {onRetry && (
              <Button size="sm" variant="secondary" onClick={onRetry}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Retry
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
