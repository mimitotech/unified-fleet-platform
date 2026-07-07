import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/app/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Truck, Zap, Cog } from 'lucide-react';
import { VehiclesFuelTab, GeneratorsFuelTab, MachineryFuelTab } from '@/components/fuel';
import { WialonContextBanner } from '@/components/app/WialonContextBanner';
import { useWialonContext } from '@/hooks/useWialon';
import { useFuelFleetSummary } from '@/services/fleet';
import { clientApi } from '@/lib/api';
import { getDefaultDateRange } from '@/components/fuel/FuelTransactionsTable/utils';

type FuelTab = 'vehicles' | 'generators' | 'machinery';

const ALL_TABS: FuelTab[] = ['vehicles', 'generators', 'machinery'];

export default function Fuel() {
  const { connected } = useWialonContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: fleetSummary } = useFuelFleetSummary();

  const availableTabs = useMemo<FuelTab[]>(() => {
    if (!fleetSummary) return ALL_TABS;
    const tabs: FuelTab[] = [];
    if (fleetSummary.vehicles > 0) tabs.push('vehicles');
    if (fleetSummary.generators > 0) tabs.push('generators');
    if (fleetSummary.machinery > 0) tabs.push('machinery');
    return tabs.length > 0 ? tabs : ALL_TABS;
  }, [fleetSummary]);

  const activeTab = useMemo<FuelTab>(() => {
    const t = searchParams.get('tab');
    if ((ALL_TABS as string[]).includes(t ?? '') && availableTabs.includes(t as FuelTab)) {
      return t as FuelTab;
    }
    return availableTabs[0] ?? 'vehicles';
  }, [searchParams, availableTabs]);

  const handleTabChange = useCallback(
    (value: string) => {
      const next = availableTabs.includes(value as FuelTab) ? value : availableTabs[0] ?? 'vehicles';
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.set('tab', next);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams, availableTabs],
  );

  useEffect(() => {
    if (!connected) return;
    void clientApi.warmWialonFuelReports().catch(() => undefined);
  }, [connected]);

  useEffect(() => {
    if (!connected) return;
    if (activeTab === 'generators' || activeTab === 'machinery') {
      const { fromDate, toDate } = getDefaultDateRange();
      void clientApi.getWialonGeneratorEngineHours(fromDate, toDate).catch(() => undefined);
    }
  }, [connected, activeTab]);

  useEffect(() => {
    if (!availableTabs.includes(activeTab)) {
      handleTabChange(availableTabs[0] ?? 'vehicles');
    }
  }, [activeTab, availableTabs, handleTabChange]);

  if (!connected) {
    return (
      <AppLayout title="Fuel Management" subtitle="Track fuel consumption, efficiency, and costs">
        <WialonContextBanner />
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Fuel Management" subtitle="Track fuel consumption, efficiency, and costs">
      <div className="fuel-page space-y-4 min-w-0 max-w-full">
        <WialonContextBanner compact />
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-3">
          <TabsList className="h-8 inline-flex w-auto max-w-full flex-wrap gap-0.5 p-0.5">
            {availableTabs.includes('vehicles') && (
              <TabsTrigger value="vehicles" className="gap-1.5 px-2.5 py-1 h-7 text-xs">
                <Truck className="h-3.5 w-3.5" />
                Vehicles
                {fleetSummary && fleetSummary.vehicles > 0 && (
                  <span className="text-[10px] text-muted-foreground tabular-nums">({fleetSummary.vehicles})</span>
                )}
              </TabsTrigger>
            )}
            {availableTabs.includes('generators') && (
              <TabsTrigger value="generators" className="gap-1.5 px-2.5 py-1 h-7 text-xs">
                <Zap className="h-3.5 w-3.5" />
                Generators
                {fleetSummary && fleetSummary.generators > 0 && (
                  <span className="text-[10px] text-muted-foreground tabular-nums">({fleetSummary.generators})</span>
                )}
              </TabsTrigger>
            )}
            {availableTabs.includes('machinery') && (
              <TabsTrigger value="machinery" className="gap-1.5 px-2.5 py-1 h-7 text-xs">
                <Cog className="h-3.5 w-3.5" />
                Machinery
                {fleetSummary && fleetSummary.machinery > 0 && (
                  <span className="text-[10px] text-muted-foreground tabular-nums">({fleetSummary.machinery})</span>
                )}
              </TabsTrigger>
            )}
          </TabsList>

          {availableTabs.includes('vehicles') && (
            <TabsContent value="vehicles" className="mt-0 min-w-0 max-w-full focus-visible:outline-none">
              <VehiclesFuelTab />
            </TabsContent>
          )}
          {availableTabs.includes('generators') && (
            <TabsContent value="generators" className="mt-0 min-w-0 max-w-full focus-visible:outline-none">
              <GeneratorsFuelTab />
            </TabsContent>
          )}
          {availableTabs.includes('machinery') && (
            <TabsContent value="machinery" className="mt-0 min-w-0 max-w-full focus-visible:outline-none">
              <MachineryFuelTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </AppLayout>
  );
}
