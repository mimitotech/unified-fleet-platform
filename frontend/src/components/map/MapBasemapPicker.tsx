import { useMapStyle } from '@/hooks/useMapStyle';
import {
  DEFAULT_MAP_PROVIDER,
  DEFAULT_MAP_VIEW,
  getAllMapProviders,
  isProviderConfigured,
  type MapProviderId,
  type MapViewId,
} from '@/lib/mapConfig';
import { Label } from '@/components/ui/label';
import { Map } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  className?: string;
  compact?: boolean;
  /** Extra-small inline toolbar — for centered map overlay */
  mini?: boolean;
};

const selectClass = cn(
  'rounded-md border border-input bg-background',
  'focus:outline-none focus:ring-1 focus:ring-ring'
);

/** Native selects — avoids Radix Select crashes when stored values drift from options. */
export function MapBasemapPicker({ className, compact, mini }: Props) {
  const { provider, view, setProvider, setView } = useMapStyle();
  const allProviders = getAllMapProviders();
  const safeProvider = allProviders.some((p) => p.id === provider) ? provider : DEFAULT_MAP_PROVIDER;
  const views = allProviders.find((p) => p.id === safeProvider)?.views ?? [
    { id: DEFAULT_MAP_VIEW, label: 'Streets' },
  ];
  const safeView = views.some((v) => v.id === view) ? view : views[0]?.id ?? DEFAULT_MAP_VIEW;

  const providerWidth = mini ? 'min-w-[7.5rem] w-auto max-w-[9rem]' : compact ? 'w-[7.5rem]' : 'min-w-[10rem]';
  const viewWidth = mini ? 'w-[4.75rem]' : compact ? 'w-[5.75rem]' : 'min-w-[8rem]';
  const height = mini ? 'h-6 text-[10px] px-1' : compact ? 'h-7 text-[11px] px-1.5' : 'h-9 text-sm px-2';

  return (
    <div className={className}>
      {!compact && !mini && (
        <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
          <Map className="h-3.5 w-3.5" />
          Map
        </Label>
      )}
      <div
        className={cn(
          mini ? 'flex gap-0.5 items-center' : compact ? 'flex gap-1 items-center' : 'flex flex-col sm:flex-row gap-2'
        )}
      >
        <select
          className={cn(selectClass, providerWidth, height)}
          value={safeProvider}
          onChange={(e) => setProvider(e.target.value as MapProviderId)}
          aria-label="Map provider"
        >
          {allProviders.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
              {p.envKey && !isProviderConfigured(p) ? (mini ? ' (key)' : ' (add API key)') : ''}
            </option>
          ))}
        </select>
        <select
          className={cn(selectClass, viewWidth, height)}
          value={safeView}
          onChange={(e) => setView(e.target.value as MapViewId)}
          aria-label="Map view"
        >
          {views.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** Centered top map style bar — clear of zoom (+/−) and Fit Fleet controls. */
export function MapBasemapBar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute top-2 left-1/2 z-[480] -translate-x-1/2',
        className
      )}
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border/70 bg-card/88 backdrop-blur-sm px-1.5 py-0.5 shadow-sm">
        <Map className="h-3 w-3 text-muted-foreground shrink-0 ml-0.5" aria-hidden />
        <MapBasemapPicker mini />
      </div>
    </div>
  );
}
