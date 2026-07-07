import { AppLayout } from '@/components/app/AppLayout';
import { useAssetStatuses } from '@/hooks/useAssets';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Gauge, Thermometer, Battery } from 'lucide-react';
import { WialonSensorsPanel } from '@/components/app/WialonLivePanels';
import { WialonContextBanner } from '@/components/app/WialonContextBanner';

export default function Sensors() {
  const { data: statuses, isLoading } = useAssetStatuses();

  return (
    <AppLayout title="Sensors" subtitle="Vehicle sensor readings">
      <WialonContextBanner />
      <WialonSensorsPanel />
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(statuses as Array<{
            asset?: { id: string; name: string };
            status?: { status: string; fuelLevel?: number; speed?: number; engineOn?: boolean };
          }>)?.map((s, i) => (
            <div key={s.asset?.id || i} className="fleet-card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">{s.asset?.name || 'Unknown'}</h3>
                <Badge variant="outline">{s.status?.status || 'offline'}</Badge>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <Gauge className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-lg font-semibold">{s.status?.location?.speed ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">km/h</p>
                </div>
                <div>
                  <Thermometer className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-lg font-semibold">
                    {s.status?.fuelLevel != null ? `${s.status.fuelLevel}%` : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">Fuel</p>
                </div>
                <div>
                  <Battery className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-lg font-semibold">{s.status?.engineOn ? 'On' : 'Off'}</p>
                  <p className="text-xs text-muted-foreground">Engine</p>
                </div>
              </div>
            </div>
          ))}
          {!statuses?.length && (
            <p className="text-muted-foreground col-span-full text-center py-12">
              No sensor data available. Connect a telematics source in Admin.
            </p>
          )}
        </div>
      )}
    </AppLayout>
  );
}
