import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/app/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Truck, Zap, Cog, FileText, ArrowLeftRight } from 'lucide-react';
import { VehiclesFuelTab, GeneratorsFuelTab, MachineryFuelTab } from '@/components/fuel';
import { FuelReportsTab } from '@/components/fuel/FuelReportsTab';
import { FuelVarianceTab } from '@/components/fuel/FuelVarianceTab';
import { WialonContextBanner } from '@/components/app/WialonContextBanner';
import { useWialonContext } from '@/hooks/useWialon';
import { useFuelFleetSummary } from '@/services/fleet';
import { getDefaultDateRange } from '@/components/fuel/FuelTransactionsTable/utils';
import { useFuelModuleConfig, isFuelVarianceEnabled } from '@/hooks/useFuelModuleConfig';

type FuelTab = 'vehicles' | 'generators' | 'machinery' | 'reports' | 'variance';

const ASSET_TABS: Array<Exclude<FuelTab, 'reports' | 'variance'>> = ['vehicles', 'generators', 'machinery'];

export default function Fuel() {
  const { connected } = useWialonContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: fleetSummary } = useFuelFleetSummary();
  const { data: fuelModuleConfig } = useFuelModuleConfig();
  const varianceEnabled = isFuelVarianceEnabled(fuelModuleConfig);
  const { fromDate: defaultFromDate, toDate: defaultToDate, todayStr } = getDefaultDateRange();
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);

  const fuelRangeProps = useMemo(
    () => ({
      fromDate,
      toDate,
      todayStr,
      onFromDateChange: setFromDate,
      onToDateChange: setToDate,
    }),
    [fromDate, toDate, todayStr],
  );

  const availableTabs = useMemo<FuelTab[]>(() => {
    const tabs: FuelTab[] = [];
    if (!fleetSummary) {
      tabs.push(...ASSET_TABS);
    } else {
      if (fleetSummary.vehicles > 0) tabs.push('vehicles');
      if (fleetSummary.generators > 0) tabs.push('generators');
      if (fleetSummary.machinery > 0) tabs.push('machinery');
      if (tabs.length === 0) tabs.push(...ASSET_TABS);
    }
    tabs.push('reports');
    if (varianceEnabled) tabs.push('variance');
    return tabs;
  }, [fleetSummary, varianceEnabled]);

  const activeTab = useMemo<FuelTab>(() => {
    const t = searchParams.get('tab');
    if (t && availableTabs.includes(t as FuelTab)) return t as FuelTab;
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
    if (!availableTabs.includes(activeTab)) {
      handleTabChange(availableTabs[0] ?? 'vehicles');
    }
  }, [activeTab, availableTabs, handleTabChange]);

  if (!connected) {
    return (
      <AppLayout title="Fuel" subtitle="Live sensors and fuel reports">
        <WialonContextBanner />
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Fuel" subtitle="Live sensors and fuel reports">
      <div className="fuel-page space-y-4 min-w-0 max-w-full">
        <WialonContextBanner compact />
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-3">
          <TabsList className="branded-tabs h-8 inline-flex w-auto max-w-full flex-wrap gap-0.5 p-0.5">
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
            <TabsTrigger value="reports" className="gap-1.5 px-2.5 py-1 h-7 text-xs">
              <FileText className="h-3.5 w-3.5" />
              Reports
            </TabsTrigger>
            {availableTabs.includes('variance') && (
              <TabsTrigger value="variance" className="gap-1.5 px-2.5 py-1 h-7 text-xs">
                <ArrowLeftRight className="h-3.5 w-3.5" />
                Variance
              </TabsTrigger>
            )}
          </TabsList>

          {availableTabs.includes('vehicles') && (
            <TabsContent value="vehicles" className="mt-0 min-w-0 max-w-full focus-visible:outline-none">
              <VehiclesFuelTab {...fuelRangeProps} />
            </TabsContent>
          )}
          {availableTabs.includes('generators') && (
            <TabsContent value="generators" className="mt-0 min-w-0 max-w-full focus-visible:outline-none">
              <GeneratorsFuelTab {...fuelRangeProps} />
            </TabsContent>
          )}
          {availableTabs.includes('machinery') && (
            <TabsContent value="machinery" className="mt-0 min-w-0 max-w-full focus-visible:outline-none">
              <MachineryFuelTab {...fuelRangeProps} />
            </TabsContent>
          )}
          <TabsContent value="reports" className="mt-0 min-w-0 max-w-full focus-visible:outline-none">
            <FuelReportsTab {...fuelRangeProps} fleetSummary={fleetSummary} />
          </TabsContent>
          {availableTabs.includes('variance') && (
            <TabsContent value="variance" className="mt-0 min-w-0 max-w-full focus-visible:outline-none">
              <FuelVarianceTab {...fuelRangeProps} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </AppLayout>
  );
}
