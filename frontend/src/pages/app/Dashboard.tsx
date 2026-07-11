import { AppLayout } from '@/components/app/AppLayout';
import { MetricCard } from '@/components/app/MetricCard';
import { FleetMapPanel } from '@/components/map/FleetMapPanel';
import { useMapSessionKey } from '@/hooks/useMapSessionKey';
import { AnimatedPage, PageLoader } from '@/components/shared/PageLoader';
import { QueryErrorBanner } from '@/components/shared/QueryErrorBanner';
import { useFleetAssetProfile } from '@/hooks/useFleetAssetProfile';
import { useDashboardKpis } from '@/hooks/useAssets';
import { useFleetUnits } from '@/hooks/useFleetUnits';
import { useAlerts } from '@/hooks/useAlerts';
import { UnitTypeIcon } from '@/components/fleet/UnitTypeIcon';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Activity, Truck, MapPin, AlertTriangle, Users, Route, Fuel, Wrench,
  Video, BarChart3, Zap,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { WialonContextBanner } from '@/components/app/WialonContextBanner';
import { MapErrorBoundary } from '@/components/shared/MapErrorBoundary';
import { LIVE_POLL, livePollLabel } from '@/lib/liveRefresh';
import { safeArray } from '@/lib/safeArray';

export default function Dashboard() {
  const mapSessionKey = useMapSessionKey();
  const assetProfile = useFleetAssetProfile();
  const { data: kpis, isLoading: kpisLoading, isError, refetch } = useDashboardKpis();
  const { units, live, statuses, isLoading: fleetLoading } = useFleetUnits();
  const { data: alerts } = useAlerts(8);
  const alertList = safeArray<{ title?: string; severity?: string }>(alerts);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const showLoader = fleetLoading && !(units?.length) && kpisLoading && !kpis;

  if (showLoader) {
    return (
      <AppLayout title="Dashboard" subtitle={assetProfile.subtitle}>
        <PageLoader />
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Dashboard" subtitle={assetProfile.subtitle}>
      {isError && (
        <QueryErrorBanner message="Could not load dashboard data." onRetry={() => refetch()} className="mb-4" />
      )}
      <AnimatedPage className="space-y-4">
        <WialonContextBanner />
        {(kpis as { liveFromWialon?: boolean } | undefined)?.liveFromWialon && (
          <p className="text-xs text-muted-foreground -mt-2">
            Fleet data refreshes from Wialon {livePollLabel(LIVE_POLL.fleet)}.
          </p>
        )}
        <div className="stat-strip">
          <MetricCard
            title={assetProfile.primaryLabel}
            value={assetProfile.total}
            icon={assetProfile.isGeneratorOnly ? Zap : Truck}
            variant="primary"
            size="xxs"
          />
          <MetricCard title="Active" value={kpis?.activeVehicles ?? 0} icon={Activity} variant="success" size="xxs" />
          {!assetProfile.isGeneratorOnly && (
            <MetricCard title="Moving" value={kpis?.moving ?? 0} icon={MapPin} variant="info" size="xxs" />
          )}
          {assetProfile.isGeneratorOnly && assetProfile.generators > 0 && (
            <MetricCard title="Onsite" value={assetProfile.generators} icon={Zap} variant="info" size="xxs" />
          )}
          <MetricCard title="Alerts" value={kpis?.criticalAlerts ?? 0} icon={AlertTriangle} variant="destructive" size="xxs" />
          {!assetProfile.isGeneratorOnly && (
            <>
              <MetricCard title="Drivers" value={kpis?.activeDrivers ?? 0} icon={Users} variant="default" size="xxs" />
              <MetricCard title="Routes" value={kpis?.activeRoutes ?? 0} icon={Route} variant="warning" size="xxs" />
            </>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 min-h-[65vh]">
          <div className="xl:col-span-3">
            <MapErrorBoundary fallbackHeight="65vh">
              <FleetMapPanel
                statuses={statuses ?? []}
                height="65vh"
                sessionKey={mapSessionKey}
                selectedUnitId={selectedId}
                onUnitSelect={setSelectedId}
                isLoading={fleetLoading}
              />
            </MapErrorBoundary>
          </div>
          <div className="space-y-4 flex flex-col min-h-0">
            <div className="fleet-card flex-1 overflow-auto max-h-[32vh] xl:max-h-none">
              <div className="flex items-center justify-between mb-3 sticky top-0 bg-card/95 backdrop-blur py-1 z-10">
                <h3 className="font-semibold text-sm">
                  {assetProfile.primaryLabel} ({units?.length ?? 0})
                  {live && <span className="ml-1.5 text-status-moving text-xs font-normal">● Live</span>}
                </h3>
                <Link to="/app/monitoring?view=list" className="text-xs text-primary hover:underline">Full list</Link>
              </div>
              <ul className="space-y-1">
                {(units ?? []).slice(0, 12).map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(u.id)}
                      className="w-full flex items-center gap-2 py-1.5 px-1.5 rounded-lg hover:bg-muted/50 text-left text-sm"
                    >
                      <UnitTypeIcon
                        size="sm"
                        wialonId={u.wialonId}
                        iconUgi={u.iconUgi}
                        title={u.name}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{u.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.plate || u.id}</p>
                      </div>
                      <StatusBadge status={u.status} size="sm" showDot={false} />
                    </button>
                  </li>
                ))}
                {!(units?.length) && <p className="text-muted-foreground text-sm">No units synced</p>}
              </ul>
            </div>
            <div className="fleet-card flex-1 overflow-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Recent Alerts</h3>
                <Link to="/app/alerts" className="text-xs text-primary hover:underline">View all</Link>
              </div>
              <div className="space-y-2">
                {alertList.slice(0, 6).map((a, i) => (
                  <div key={i} className="text-sm border-b border-border/60 pb-2 last:border-0 animate-slide-in" style={{ animationDelay: `${i * 50}ms` }}>
                    <span className="font-medium line-clamp-1">{a.title}</span>
                    <span className="text-muted-foreground ml-2 text-xs capitalize">{a.severity}</span>
                  </div>
                ))}
                {!alertList.length && <p className="text-muted-foreground text-sm">No alerts</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <MetricCard title="Fuel (mo)" value={`${kpis?.fuelConsumedMonth ?? 0}L`} icon={Fuel} size="xxs" variant="info" />
              <MetricCard title="Maint." value={kpis?.pendingMaintenance ?? 0} icon={Wrench} size="xxs" variant="warning" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
          <Link to="/app/monitoring"><Button variant="outline" className="w-full h-10 flex-col gap-0.5 rounded-lg text-[10px] bg-secondary border-primary/20 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all"><MapPin className="w-3.5 h-3.5 text-primary group-hover:text-primary-foreground" /><span>Live Map</span></Button></Link>
          <Link to="/app/surveillance"><Button variant="outline" className="w-full h-10 flex-col gap-0.5 rounded-lg text-[10px] bg-secondary border-accent/25 hover:bg-accent hover:text-accent-foreground hover:border-accent transition-all"><Video className="w-3.5 h-3.5 text-accent" /><span>Surveillance</span></Button></Link>
          <Link to="/app/reports"><Button variant="outline" className="w-full h-10 flex-col gap-0.5 rounded-lg text-[10px] bg-slate-50 border-slate-200 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all"><BarChart3 className="w-3.5 h-3.5 text-slate-600" /><span>Reports</span></Button></Link>
          <Link to="/app/routes"><Button variant="outline" className="w-full h-10 flex-col gap-0.5 rounded-lg text-[10px] bg-amber-50 border-amber-200/80 hover:bg-amber-500 hover:text-white hover:border-amber-500 transition-all"><Route className="w-3.5 h-3.5 text-amber-600" /><span>Routes</span></Button></Link>
        </div>
      </AnimatedPage>
    </AppLayout>
  );
}
