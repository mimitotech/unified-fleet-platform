import { LazyUnifiedMap } from '@/components/app/LazyUnifiedMap';
import { MapSkeleton } from '@/components/app/MapSkeleton';
import { MapBasemapBar } from '@/components/map/MapBasemapPicker';
import type { MapDetailPanelMode, MapStatusPoint } from '@/components/app/UnifiedMap';
import { safeArray } from '@/lib/safeArray';
import { cn } from '@/lib/utils';

type Props = {
  statuses?: MapStatusPoint[];
  height?: string;
  sessionKey?: string;
  selectedUnitId?: string | null;
  onUnitSelect?: (unitId: string | null) => void;
  detailPanel?: MapDetailPanelMode;
  isLoading?: boolean;
  className?: string;
};

/** Fleet map card — Google Maps (when configured) or OSM, with Fit Fleet control. */
export function FleetMapPanel({
  statuses,
  height = '65vh',
  sessionKey = 'default',
  selectedUnitId,
  onUnitSelect,
  detailPanel = 'overlay',
  isLoading,
  className,
}: Props) {
  const statusList = safeArray(statuses);

  return (
    <div className={cn('fleet-card p-0 overflow-hidden', className)}>
      <div className="relative" style={{ height }}>
        <MapBasemapBar />
        {isLoading && !statusList.length ? (
          <MapSkeleton height={height} />
        ) : (
          <LazyUnifiedMap
            statuses={statusList}
            height={height}
            sessionKey={sessionKey}
            selectedUnitId={selectedUnitId}
            onUnitSelect={onUnitSelect}
            detailPanel={detailPanel}
            showFitControl
          />
        )}
      </div>
    </div>
  );
}
