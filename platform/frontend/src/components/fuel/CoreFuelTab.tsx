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
} from '@/components/fuel';
import { FuelLiveStrip } from './FuelLiveStrip';
import { FuelAssetCharts } from './FuelAssetCharts';
import { FuelLevelChart } from './FuelLevelChart';
import { FuelCostingPanel } from './FuelCostingPanel';
import { computePeriodFuelKpis } from '@/components/fuel/fuelColumnMetrics';
import { filterFuelTransactionsByDate, isWialonGroupSummary } from '@/components/fuel/fuelTransactionFilters';
import { isPlausibleFuelEvent } from '@/components/fuel/fuelEventPlausibility';
import { effectiveSuddenDropVolume, fuelTheftEventKey } from '@/components/fuel/fuelTheftVolume';
import type { FleetFuelLevel } from '@/components/fuel/FuelLevelAlerts';
import type { FuelEvent } from '@/types/entities';
import type { FuelAssetCategory } from '@/lib/fuelTypes';
import { clientFacingText } from '@/lib/clientFacingText';
import type { FuelTabDateRangeProps } from './fuelTabTypes';
import type { StationaryFuelType } from './useStationaryFuelHooks';
import type { FuelTableUnit } from './FuelTransactionsTable/types';

const LABELS: Record<FuelAssetCategory, { unit: string; plural: string }> = {
  vehicle: { unit: 'Vehicle', plural: 'vehicles' },
  generator: { unit: 'Generator', plural: 'generators' },
  machinery: { unit: 'Machine', plural: 'machinery' },
};

function fuelStatusFromPercent(percent: number): 'critical' | 'warning' | 'ok' {
  if (percent <= 15) return 'critical';
  if (percent <= 30) return 'warning';
  return 'ok';
}

export type CoreFuelTabProps = FuelTabDateRangeProps & {
  assetCategory: FuelAssetCategory;
};

/**
 * Unified fuel tab — same sensors, reports, drops, charts, and alerts for
 * vehicles, generators, machinery, bowsers, and any other FLS-tracked asset.
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

  const categoryFleet = useStationaryFleetData({
    stationaryType,
    startDate: fromDate,
    endDate: toDate,
    enabled: !isVehicle,
  });

  const refreshFuelMutation = useRefreshFuelTransactions();
  const { data: fuelModuleConfig } = useFuelModuleConfig();
  const visibleColumns = useMemo(
    () => getVisibleFuelColumns(fuelModuleConfig, assetCategory),
    [fuelModuleConfig, assetCategory],
  );

  const units = isVehicle ? fleet.vehicles : categoryFleet.tableUnits;
  const fuelTransactions = isVehicle ? fleet.fuelTransactions : categoryFleet.fuelTransactions;
  const unitFuelMapByName = isVehicle ? fleet.vehicleFuelMapByName : categoryFleet.unitFuelMapByName;
  const isUnitsLoading = isVehicle ? fleet.isVehiclesLoading : categoryFleet.isUnitsLoading;
  const isFuelLoading = isVehicle ? fleet.isFuelLoading : categoryFleet.isFuelLoading;
  const isFuelWarming = isVehicle ? fleet.isFuelWarming : categoryFleet.isFuelWarming;
  const isFuelBackgroundRefreshing = isVehicle
    ? fleet.isFuelBackgroundRefreshing
    : categoryFleet.isFuelBackgroundRefreshing;
  const fuelError = isVehicle ? fleet.fuelError : categoryFleet.fuelError;

  const reportKpis = useMemo(
    () => computePeriodFuelKpis(fuelTransactions, fromDate, toDate, unitFuelMapByName),
    [fuelTransactions, fromDate, toDate, unitFuelMapByName],
  );

  const filteredFuelTransactions = useMemo(
    () => filterFuelTransactionsByDate(fuelTransactions, fromDate, toDate),
    [fuelTransactions, fromDate, toDate],
  );

  const liveUnits = useMemo(() => {
    if (isVehicle) {
      return fleet.vehicles.map((u) => {
        const level = unitFuelMapByName.get(u.name) ?? 0;
        const vehicleFuel = fleet.vehicleFuelMap.get(u.id);
        return {
          id: u.id,
          name: u.name,
          fuelLiters: level > 0 ? level : undefined,
          fuelPercent: vehicleFuel?.percent,
        };
      });
    }

    return categoryFleet.units.map((u) => {
      const level = unitFuelMapByName.get(u.name) ?? 0;
      const pctFromInfo = u.fuelInfo?.percentage;
      const pctFromUnit =
        u.fuelUnit === 'percent' && typeof u.fuel === 'number' && u.fuel > 0 ? u.fuel : undefined;
      let fuelPercent = pctFromInfo ?? pctFromUnit;
      if (
        (fuelPercent == null || fuelPercent <= 0 || fuelPercent > 100) &&
        level > 0 &&
        u.fuelInfo?.tankCapacity &&
        u.fuelInfo.tankCapacity > 0
      ) {
        fuelPercent = Math.min(100, (level / u.fuelInfo.tankCapacity) * 100);
      }
      return {
        id: u.id,
        name: u.name,
        fuelLiters: level > 0 ? level : undefined,
        fuelPercent: fuelPercent != null && fuelPercent > 0 ? fuelPercent : undefined,
      };
    });
  }, [
    isVehicle,
    fleet.vehicles,
    fleet.vehicleFuelMap,
    unitFuelMapByName,
    categoryFleet.units,
  ]);

  const totalLiveFuelLiters = useMemo(
    () =>
      Math.round(
        liveUnits.reduce((sum, u) => sum + (typeof u.fuelLiters === 'number' ? u.fuelLiters : 0), 0) *
          10,
      ) / 10,
    [liveUnits],
  );

  const assetNames = useMemo(
    () => (isVehicle ? fleet.vehicles.map((v) => v.name) : categoryFleet.units.map((u) => u.name)),
    [isVehicle, fleet.vehicles, categoryFleet.units],
  );

  /** Same low-fuel alert model for every asset category (FLS %). */
  const fleetFuelLevels: FleetFuelLevel[] = useMemo(() => {
    if (isVehicle) {
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
    }

    return categoryFleet.units.map((u) => {
      const level = unitFuelMapByName.get(u.name) ?? 0;
      const pctFromInfo = u.fuelInfo?.percentage;
      const pctFromUnit =
        u.fuelUnit === 'percent' && typeof u.fuel === 'number' && u.fuel > 0 ? u.fuel : undefined;
      let fuelPercent = pctFromInfo ?? pctFromUnit ?? 0;
      if (
        (fuelPercent <= 0 || fuelPercent > 100) &&
        level > 0 &&
        u.fuelInfo?.tankCapacity &&
        u.fuelInfo.tankCapacity > 0
      ) {
        fuelPercent = Math.min(100, (level / u.fuelInfo.tankCapacity) * 100);
      }
      const status = fuelStatusFromPercent(fuelPercent);
      return {
        vehicleId: u.id,
        vehicle: u.name,
        fuelLevel: level,
        fuelPercent,
        status,
      };
    });
  }, [isVehicle, fleet.vehicles, fleet.vehicleFuelMap, categoryFleet.units, unitFuelMapByName]);

  /** Sudden drops from leaf Wialon theft events only — volume matches Before/After. */
  const drainAlerts = useMemo<FuelEvent[]>(() => {
    const seen = new Set<string>();
    const out: FuelEvent[] = [];
    for (const t of filteredFuelTransactions) {
      if (isWialonGroupSummary(t)) continue;
      if (t.section !== 'theft') continue;
      const volume = effectiveSuddenDropVolume(t);
      if (volume <= 0) continue;
      const live = unitFuelMapByName.get(t.unitName);
      if (!isPlausibleFuelEvent({ ...t, suddenFuelDrop: volume }, live)) continue;
      const key = fuelTheftEventKey({ ...t, suddenFuelDrop: volume });
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        type: 'theft',
        unitId: String(t.unitId),
        unitName: t.unitName,
        timestamp: new Date(t.timestamp * 1000).toISOString(),
        location: { lat: t.latitude ?? 0, lng: t.longitude ?? 0 },
        volumeChange: -Math.abs(volume),
        levelBefore: t.initialLevel ?? 0,
        levelAfter: t.finalLevel ?? 0,
        section: 'theft',
        suddenFuelDrop: volume,
        count: t.count,
      });
    }
    return out.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1));
  }, [filteredFuelTransactions, unitFuelMapByName]);

  return (
    <div className="space-y-4 min-w-0 max-w-full">
      {fuelError && !isFuelWarming && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Report data unavailable
          {clientFacingText(fuelError.message) ? `: ${clientFacingText(fuelError.message)}` : ''}.
          {' '}Live sensor levels below may still update.
        </div>
      )}

      {(isFuelWarming || isFuelLoading) && !fuelError && fuelTransactions.length === 0 && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">
          Loading fuel reports (fills, consumption, drops). Live tank levels are shown now; period totals appear when the report finishes — usually under a minute.
        </div>
      )}

      {isFuelWarming && fuelError && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">
          Syncing large fleet reports — this can take a few minutes. Live levels update below; period totals will fill in automatically.
        </div>
      )}

      <FuelLiveStrip
        units={liveUnits}
        unitLabel={labels.unit.toLowerCase()}
        isLoading={isUnitsLoading && liveUnits.length === 0}
      />

      <FuelKpiCards
        kpis={reportKpis}
        fuelTransactions={filteredFuelTransactions}
        isLoading={isFuelLoading}
        assetCategory={assetCategory}
        unitLabel={labels.unit}
        unitLabelPlural={labels.plural}
        totalLiveFuelLiters={totalLiveFuelLiters}
      />

      <FuelLevelAlerts
        criticalVehicles={fleetFuelLevels.filter((v) => v.status === 'critical')}
        warningVehicles={fleetFuelLevels.filter((v) => v.status === 'warning')}
      />

      {drainAlerts.length > 0 && <FuelDrainAlerts alerts={drainAlerts} />}

      <FuelTransactionsTable
        transactions={filteredFuelTransactions}
        vehicleFuelLevels={unitFuelMapByName}
        units={units as FuelTableUnit[]}
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

      <FuelLevelChart
        transactions={filteredFuelTransactions}
        vehicles={(units ?? []).map((u) => ({ name: u.name }))}
        vehicleFuelLevels={unitFuelMapByName}
        isLoading={isFuelLoading}
        error={fuelError}
        fromDate={fromDate}
        toDate={toDate}
        unitLabel={labels.unit}
      />

      <FuelAssetCharts
        transactions={fuelTransactions}
        fromDate={fromDate}
        toDate={toDate}
        todayStr={todayStr}
        liveLevels={unitFuelMapByName}
        assetNames={assetNames}
        unitLabel={labels.unit.toLowerCase()}
        assetCategory={assetCategory}
        isLoading={isFuelLoading}
      />

      <FuelCostingPanel
        transactions={fuelTransactions}
        fromDate={fromDate}
        toDate={toDate}
        todayStr={todayStr}
        liveLevels={unitFuelMapByName}
        assetNames={assetNames}
        unitLabel={labels.unit.toLowerCase()}
      />
    </div>
  );
}
