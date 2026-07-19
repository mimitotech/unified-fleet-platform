import { Crosshair } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MapBasemapPicker } from '@/components/map/MapBasemapPicker';
import { cn } from '@/lib/utils';

type Props = {
  onFitFleet?: () => void;
  fitDisabled?: boolean;
  className?: string;
  showFit?: boolean;
};

/** Toolbar rendered above the map (outside the Leaflet container). */
export function MapWorkspaceToolbar({
  onFitFleet,
  fitDisabled,
  className,
  showFit = true,
}: Props) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-border/60 bg-card/95',
        className
      )}
    >
      <MapBasemapPicker compact />
      {showFit && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5 shrink-0"
          onClick={onFitFleet}
          disabled={fitDisabled}
          title="Center map on all fleet units"
        >
          <Crosshair className="h-3.5 w-3.5 text-primary" />
          Fit Fleet
        </Button>
      )}
    </div>
  );
}
