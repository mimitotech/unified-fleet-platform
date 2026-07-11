import { useMemo } from 'react';
import { useFleetData } from '@/hooks/useFleetData';
import { useStationaryFleetData } from '@/hooks/useStationaryFleetData';
import { useRefreshFuelTransactions } from '@/services/fleet';
import { useFuelModuleConfig, getVisibleFuelColumns } from '@/hooks/useFuelModuleConfig';
import {
  FuelKpiCards,
  FuelLevelAlerts,
  FuelTransactionsTable,
  FuelDrainAlerts,
  FuelTrendChart,
} from '@/components/fuel';
import { FuelLiveStrip } from './FuelLiveStrip';
import { computePeriodFuelKpis } from '@/components/fuel/fuelColumnMetrics';
import { filterFuelTransactionsByDate } from '@/components/fuel/fuelTransactionFilters';
import type { FleetFuelLevel } from '@/components/fuel/FuelLevelAlerts';
import type { FuelEvent } from '@/types/entities';
import type { FuelAssetCategory } from '@/lib/fuelTypes';
import type { FuelTabDateRangeProps } from './VehiclesFuelTab';
import { GeneratorFuelAlerts } from './GeneratorFuelAlerts';
import type { StationaryFuelType } from './useStationaryFuelHooks';

const LABELS: Record<FuelAssetCategory, { unit: string; plural: string }> = {
  vehicle: { unit: 'Vehicle', plural: 'vehicles' },
  generator: { unit: 'Generator', plural: 'generators' },
  machinery: { unit: 'Machine', plural: 'machinery' },
};

export type CoreFuelTabProps = FuelTabDateRangeProps & {
  assetCategory: FuelAssetCategory;
};

/**
 * Unified fuel tab — same layout for vehicles, generators, and machinery.
 * Live data: Wialon fuel level sensors. History: Wialon report tables (fillings / consumption / drains).
 */
export function CoreFuelTab({
  assetCategory,
  fromDate,
  toDate,
  todayStr,
  onFromDateChange,
  onToDateChange,
}: CoreFuelTabProps) {
  const labels = LABELS[assetCategory];
  const isVehicle = assetCategory === 'vehicle';

  const fleet = useFleetData({
    startDate: fromDate,
    endDate: toDate,
    enabled: isVehicle,
  });

  const stationaryType: StationaryFuelType =
    assetCategory === 'generator' ? 'generator' : 'machinery';

  const stationary = useStationaryFleetData({
    stationaryType,
    startDate: fromDate,
    endDate: toDate,
    enabled: !isVehicle,
  });

  const refreshFuelMutation = useRefreshFuelTransactions();
  const { data: fuelModuleConfig } = useFuelModuleConfig();
  const visibleColumns = useMemo(
    () => getVisibleFuelColumns(fuelModuleConfig),
    [fuelModuleConfig],
  );

  const units = isVehicle ? fleet.vehicles : stationary.tableUnits;
  const fuelTransactions = isVehicle ? fleet.fuelTransactions : stationary.fuelTransactions;
  const unitFuelMapByName = isVehicle ? fleet.vehicleFuelMapByName : stationary.unitFuelMapByName;
  const isFuelLoading = isVehicle ? fleet.isFuelLoading : stationary.isFuelLoading;
  const isFuelBackgroundRefreshing = isVehicle
    ? fleet.isFuelBackgroundRefreshing
    : stationary.isFuelBackgroundRefreshing;
  const fuelError = isVehicle ? fleet.fuelError : stationary.fuelError;

  const reportKpis = useMemo(
    () => computePeriodFuelKpis(fuelTransactions, fromDate, toDate, unitFuelMapByName),
    [fuelTransactions, fromDate, toDate, unitFuelMapByName],
  );

  const filteredFuelTransactions = useMemo(
    () => filterFuelTransactionsByDate(fuelTransactions, fromDate, toDate),
    [fuelTransactions, fromDate, toDate],
  );

  const liveUnits = useMemo(() => {
    return units.map((u) => {
      const level = unitFuelMapByName.get(u.name) ?? 0;
      const vehicleFuel = isVehicle ? fleet.vehicleFuelMap.get(u.id) : undefined;
      return {
        id: u.id,
        name: u.name,
        fuelLiters: level > 0 ? level : undefined,
        fuelPercent: vehicleFuel?.percent,
      };
    });
  }, [units, unitFuelMapByName, isVehicle, fleet.vehicleFuelMap]);

  const fleetFuelLevels: FleetFuelLevel[] = useMemo(() => {
    if (!isVehicle) return [];
    return fleet.vehicles.map((vehicle) => {
      const fuelInfo = fleet.vehicleFuelMap.get(vehicle.id);
      return {
        vehicleId: vehicle.id,
        vehicle: vehicle.name,
        fuelLevel: fuelInfo?.level ?? 0,
        fuelPercent: fuelInfo?.percent ?? 0,
        status: fuelInfo?.status ?? 'ok',
      };
    });
  }, [isVehicle, fleet.vehicles, fleet.vehicleFuelMap]);

  const drainAlerts = useMemo<FuelEvent[]>(() => {
    return filteredFuelTransactions
      .filter((t) => t.section === 'theft' && (t.suddenFuelDrop ?? 0) > 0)
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
      <p className="text-xs text-muted-foreground">
        Live tank levels from Wialon sensors. Collapsed table rows show period totals for{' '}
        {fromDate} → {toDate}; expand a row to see individual events.
      </p>

      {fuelError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Report data unavailable: {fuelError.message}. Live sensor levels below may still update.
        </div>
      )}

      <FuelLiveStrip
        units={liveUnits}
        unitLabel={labels.unit.toLowerCase()}
        isLoading={isFuelLoading}
      />

      <FuelKpiCards
        kpis={reportKpis}
        fuelTransactions={filteredFuelTransactions}
        isLoading={isFuelLoading}
      />

      {isVehicle ? (
        <FuelLevelAlerts
          criticalVehicles={fleetFuelLevels.filter((v) => v.status === 'critical')}
          warningVehicles={fleetFuelLevels.filter((v) => v.status === 'warning')}
        />
      ) : (
        <GeneratorFuelAlerts stationaryType={stationaryType} />
      )}

      {isVehicle && drainAlerts.length > 0 && <FuelDrainAlerts alerts={drainAlerts} />}

      <FuelTransactionsTable
        transactions={filteredFuelTransactions}
        vehicleFuelLevels={unitFuelMapByName}
        units={units}
        unitLabel={labels.unit}
        unitLabelPlural={labels.plural}
        showFuelPerTrip={isVehicle}
        isLoading={isFuelLoading}
        onRefresh={() =>
          refreshFuelMutation.mutate({
            startDate: fromDate,
            endDate: toDate,
            assetCategory,
          })
        }
        isRefreshing={refreshFuelMutation.isPending}
        isBackgroundRefreshing={isFuelBackgroundRefreshing}
        fromDate={fromDate}
        toDate={toDate}
        todayStr={todayStr}
        onFromDateChange={onFromDateChange}
        onToDateChange={onToDateChange}
        visibleColumns={visibleColumns}
      />

      <FuelTrendChart
        transactions={filteredFuelTransactions}
        isLoading={isFuelLoading}
      />
    </div>
  );
}
