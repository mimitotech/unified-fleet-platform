import { AppLayout } from '@/components/app/AppLayout';
import { QueryErrorBanner } from '@/components/shared/QueryErrorBanner';
import { WialonContextBanner } from '@/components/app/WialonContextBanner';
import { ModuleIntegrationBanner } from '@/components/shared/ModuleIntegrationBanner';
import { MonitoringViewHeader } from '@/components/fleet/MonitoringViewHeader';
import { FleetMapWorkspace, FleetListWorkspace } from '@/components/fleet/FleetMapWorkspace';
import { FleetTrackWorkspace } from '@/components/fleet/FleetTrackWorkspace';
import { MonitoringEventsView } from '@/components/monitoring/MonitoringEventsView';
import { useMonitoringUrlState } from '@/hooks/useMonitoringUrlState';
import { useFleetUnits } from '@/hooks/useFleetUnits';
import { useMapSessionKey } from '@/hooks/useMapSessionKey';
import type { FleetUnit } from '@/lib/fleetUnits';

export default function Monitoring() {
  const mapSessionKey = useMapSessionKey();
  const { units, counts, live, statuses, isLoading, isError, refetch } = useFleetUnits();
  const { view, unitId, setView, selectUnit } = useMonitoringUrlState();

  const goMapWithUnit = (id: string) => {
    selectUnit(id, { view: 'map' });
  };

  const openTrack = (unit: FleetUnit) => {
    selectUnit(unit.id, { view: 'tracks' });
  };

  return (
    <AppLayout title="Monitoring" subtitle="Live fleet map, list, trips and events">
      {isError && (
        <QueryErrorBanner message="Could not load live fleet." onRetry={() => refetch()} className="mb-4" />
      )}
      <div className="space-y-3">
        <WialonContextBanner compact />
        <ModuleIntegrationBanner moduleKey="monitoring" />
        <MonitoringViewHeader
          mode={view}
          onChange={setView}
          fleetCount={counts.total}
          live={live}
          counts={counts.byStatus}
        />

        {view === 'map' && (
          <FleetMapWorkspace
            units={units}
            statuses={statuses}
            isLoading={isLoading}
            mapSessionKey={mapSessionKey}
            selectedId={unitId}
            onSelectId={(id) => selectUnit(id, { view: 'map' })}
            onOpenTrack={openTrack}
          />
        )}
        {view === 'list' && (
          <FleetListWorkspace
            units={units}
            selectedId={unitId}
            onSelectId={(id) => selectUnit(id, { view: 'list' })}
            onViewOnMap={(u) => goMapWithUnit(u.id)}
            onOpenTrack={openTrack}
          />
        )}
        {view === 'tracks' && (
          <FleetTrackWorkspace
            units={units}
            selectedId={unitId}
            onSelectId={(id) => selectUnit(id, { view: 'tracks' })}
          />
        )}
        {view === 'violations' && (
          <MonitoringEventsView
            units={units}
            unitId={unitId}
            onViewUnitOnMap={goMapWithUnit}
          />
        )}
      </div>
    </AppLayout>
  );
}
