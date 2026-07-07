import { useMemo, useState } from 'react';
import { useFleetData } from '@/hooks/useFleetData';
import { getDefaultDateRange } from '@/components/fuel/FuelTransactionsTable/utils';
import { useRefreshFuelTransactions } from '@/services/fleet';
import { useFuelPrice } from '@/hooks/useFuelAnalytics';
import {
  FuelKpiCards,
  FuelLevelAlerts,
  FuelTransactionsTable,
  FuelDrainAlerts,
  FuelTrendChart,
  FuelLevelChart,
} from '@/components/fuel';
import { FuelFleetSummarySection } from '@/components/fuel/FuelFleetSummarySection';
import { FuelReportMonetaryPanel } from '@/components/fuel/FuelReportMonetaryPanel';
import { computeFuelReportKpis, computeVehicleFuelRows } from '@/components/fuel/fuelReportStats';
import type { FleetFuelLevel } from '@/components/fuel/FuelLevelAlerts';
import type { FuelEvent } from '@/types/entities';

export function VehiclesFuelTab() {
  const { fromDate: defaultFromDate, toDate: defaultToDate, todayStr } = getDefaultDateRange();
  const [fromDate, setFromDate] = useState<string>(defaultFromDate);
  const [toDate, setToDate] = useState<string>(defaultToDate);

  const fuelPriceStore = useFuelPrice();
  const [fuelPrice, setFuelPrice] = useState(() => {
    const saved = fuelPriceStore.get();
    return saved > 0 ? String(saved) : '';
  });

  const handleFuelPriceChange = (value: string) => {
    setFuelPrice(value);
    const n = Number(value);
    if (n > 0) fuelPriceStore.set(n);
  };

  const {
    vehicles,
    fuelTransactions,
    vehicleFuelMap,
    vehicleFuelMapByName,
    isVehiclesLoading,
    isFuelLoading,
    fuelError,
    refetchFuel,
  } = useFleetData({ startDate: fromDate, endDate: toDate });

  const refreshFuelMutation = useRefreshFuelTransactions();

  const fleetFuelLevels: FleetFuelLevel[] = useMemo(() => {
    return vehicles.map((vehicle) => {
      const fuelInfo = vehicleFuelMap.get(vehicle.id);
      return {
        vehicleId: vehicle.id,
        vehicle: vehicle.name,
        fuelLevel: fuelInfo?.level ?? 0,
        fuelPercent: fuelInfo?.percent ?? 0,
        status: fuelInfo?.status ?? 'ok',
      };
    });
  }, [vehicles, vehicleFuelMap]);

  const criticalVehicles = fleetFuelLevels.filter((v) => v.status === 'critical');
  const warningVehicles = fleetFuelLevels.filter((v) => v.status === 'warning');

  const filteredFuelTransactions = useMemo(() => {
    return fuelTransactions.filter((t) => {
      const txDateStr = new Date(t.timestamp * 1000).toISOString().split('T')[0];
      if (fromDate && txDateStr < fromDate) return false;
      if (toDate && txDateStr > toDate) return false;
      return true;
    });
  }, [fuelTransactions, fromDate, toDate]);

  const reportKpis = useMemo(
    () => computeFuelReportKpis(filteredFuelTransactions),
    [filteredFuelTransactions],
  );

  const vehicleReportRows = useMemo(
    () => computeVehicleFuelRows(filteredFuelTransactions),
    [filteredFuelTransactions],
  );

  const vehicleFuelAlerts = useMemo<FuelEvent[]>(() => {
    return filteredFuelTransactions
      .filter((t) => (t.suddenFuelDrop ?? 0) > 0)
      .map<FuelEvent>((t) => ({
        type: 'theft',
        unitId: String(t.unitId),
        unitName: t.unitName,
        timestamp: new Date(t.timestamp * 1000).toISOString(),
        location: { lat: t.latitude ?? 0, lng: t.longitude ?? 0 },
        volumeChange: -Math.abs(t.suddenFuelDrop || 0),
        levelBefore: t.initialLevel ?? 0,
        levelAfter: t.finalLevel ?? 0,
        section: 'theft',
        suddenFuelDrop: t.suddenFuelDrop,
        count: t.count,
      }))
      .sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1));
  }, [filteredFuelTransactions]);

  return (
    <div className="space-y-4 min-w-0 max-w-full">
      {fuelError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Failed to load Wialon fuel report data: {fuelError.message}. The first load can take a few minutes
          while Wialon reports run — use Sync in the transactions table to retry, or narrow the date range.
        </div>
      )}

      {!fuelError && isFuelLoading && filteredFuelTransactions.length === 0 && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading Wialon fuel reports for {fromDate} to {toDate}… Cached data appears first when available.
        </div>
      )}

      <FuelKpiCards
        kpis={reportKpis}
        fuelTransactions={filteredFuelTransactions}
        isLoading={isFuelLoading && filteredFuelTransactions.length === 0}
      />

      <FuelLevelAlerts criticalVehicles={criticalVehicles} warningVehicles={warningVehicles} />

      <FuelDrainAlerts alerts={vehicleFuelAlerts} />

      <FuelTransactionsTable
        transactions={filteredFuelTransactions}
        vehicleFuelLevels={vehicleFuelMapByName}
        vehicles={vehicles}
        isLoading={isFuelLoading}
        onRefresh={() => refreshFuelMutation.mutate({ startDate: fromDate, endDate: toDate })}
        isRefreshing={refreshFuelMutation.isPending}
        fromDate={fromDate}
        toDate={toDate}
        todayStr={todayStr}
        onFromDateChange={setFromDate}
        onToDateChange={setToDate}
      />

      <FuelLevelChart
        transactions={filteredFuelTransactions}
        vehicles={vehicles}
        vehicleFuelLevels={vehicleFuelMapByName}
        isLoading={isFuelLoading}
        error={fuelError}
        onRetry={refetchFuel}
        fromDate={fromDate}
        toDate={toDate}
      />

      <FuelFleetSummarySection rows={vehicleReportRows} isLoading={isFuelLoading} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <FuelReportMonetaryPanel
          kpis={reportKpis}
          fuelPrice={fuelPrice}
          onFuelPriceChange={handleFuelPriceChange}
        />
        <FuelTrendChart transactions={filteredFuelTransactions} isLoading={isFuelLoading} />
      </div>
    </div>
  );
}
