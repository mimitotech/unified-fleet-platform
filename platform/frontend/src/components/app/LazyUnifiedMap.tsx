import { lazy, Suspense } from 'react';
import { MapSkeleton } from '@/components/app/MapSkeleton';
import { MapErrorBoundary } from '@/components/shared/MapErrorBoundary';
import type { MapStatusPoint } from '@/components/app/UnifiedMap';

const UnifiedMapLazy = lazy(() =>
  import('@/components/app/UnifiedMap').then((m) => ({ default: m.UnifiedMap }))
);

interface LazyUnifiedMapProps {
  statuses?: MapStatusPoint[];
  height?: string;
  sessionKey?: string;
  selectedUnitId?: string | null;
  onUnitSelect?: (unitId: string | null) => void;
  detailPanel?: 'overlay' | 'none';
  fitSignal?: number;
  showFitControl?: boolean;
  showGeofences?: boolean;
}

export function LazyUnifiedMap({
  statuses,
  height,
  sessionKey,
  selectedUnitId,
  onUnitSelect,
  detailPanel,
  fitSignal,
  showFitControl,
  showGeofences,
}: LazyUnifiedMapProps) {
  return (
    <MapErrorBoundary>
      <Suspense fallback={<MapSkeleton height={height} />}>
        <UnifiedMapLazy
          statuses={statuses}
          height={height}
          sessionKey={sessionKey}
          selectedUnitId={selectedUnitId}
          onUnitSelect={onUnitSelect}
          detailPanel={detailPanel}
          fitSignal={fitSignal}
          showFitControl={showFitControl}
          showGeofences={showGeofences}
        />
      </Suspense>
    </MapErrorBoundary>
  );
}
