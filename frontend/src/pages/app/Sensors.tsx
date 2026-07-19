import { AppLayout } from '@/components/app/AppLayout';
import { useAssetStatuses } from '@/hooks/useAssets';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Gauge, Thermometer, Battery, FileText } from 'lucide-react';
import { WialonSensorsPanel } from '@/components/app/WialonLivePanels';
import { WialonContextBanner } from '@/components/app/WialonContextBanner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GenericModuleReports } from '@/components/reports/moduleReportPanels';
import { CHART } from '@/lib/chartColors';

export default function Sensors() {
  const { data: statuses, isLoading } = useAssetStatuses();
  const list = (statuses as Array<{
    asset?: { id: string; name: string };
    status?: { status: string; fuelLevel?: number; speed?: number; engineOn?: boolean; location?: { speed?: number } };
  }>) ?? [];

  return (
    <AppLayout title="Sensors" subtitle="Vehicle sensor readings">
      <Tabs defaultValue="live" className="space-y-4">
        <TabsList className="branded-tabs">
          <TabsTrigger value="live">Live</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1"><FileText className="h-3.5 w-3.5" />Reports</TabsTrigger>
        </TabsList>
        <TabsContent value="live" className="mt-0 space-y-4">
      <WialonContextBanner />
      <WialonSensorsPanel />
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {list.map((s, i) => (
            <div key={s.asset?.id || i} className="fleet-card branded-panel">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-primary">{s.asset?.name || 'Unknown'}</h3>
                <Badge variant="outline">{s.status?.status || 'offline'}</Badge>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <Gauge className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-lg font-semibold branded-number">{s.status?.location?.speed ?? s.status?.speed ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">km/h</p>
                </div>
                <div>
                  <Thermometer className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-lg font-semibold branded-number">
                    {s.status?.fuelLevel != null ? `${s.status.fuelLevel}%` : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">Fuel</p>
                </div>
                <div>
                  <Battery className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-lg font-semibold branded-number">{s.status?.engineOn ? 'On' : 'Off'}</p>
                  <p className="text-xs text-muted-foreground">Engine</p>
                </div>
              </div>
            </div>
          ))}
          {!list.length && (
            <p className="text-muted-foreground col-span-full text-center py-12">
              No sensor data available. Connect a telematics source in Admin.
            </p>
          )}
        </div>
      )}
        </TabsContent>
        <TabsContent value="reports" className="mt-0">
          <GenericModuleReports
            moduleLabel="Sensors"
            title="Sensor executive"
            blurb="Live status, fuel %, and engine state by asset."
            kpis={[
              { label: 'Assets', value: list.length },
              { label: 'Engine on', value: list.filter((s) => s.status?.engineOn).length },
              {
                label: 'With fuel %',
                value: list.filter((s) => s.status?.fuelLevel != null).length,
              },
            ]}
            columns={[
              { key: 'name', label: 'Asset' },
              { key: 'status', label: 'Status' },
              { key: 'fuel', label: 'Fuel %', align: 'right' },
              { key: 'engine', label: 'Engine' },
            ]}
            rows={list.map((s) => ({
              name: s.asset?.name || '—',
              status: s.status?.status || 'offline',
              fuel: s.status?.fuelLevel ?? '—',
              fuelN: s.status?.fuelLevel ?? 0,
              engine: s.status?.engineOn ? 'On' : 'Off',
              engineOnN: s.status?.engineOn ? 1 : 0,
            }))}
            charts={{
              heading: 'Asset performance · sensor analytics',
              categoryKey: 'name',
              bar: {
                title: 'Fuel level by asset',
                subtitle: 'Standing bars — live fuel %',
                metrics: [{ key: 'fuelN', label: 'Fuel %', color: CHART.brand }],
                topN: 8,
              },
              secondary: {
                type: 'category',
                title: 'Engine state mix',
                subtitle: 'Assets with engine On vs Off',
                groupKey: 'engine',
                as: 'pie',
              },
            }}
          />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
