/**
 * Stationary fleet fuel data (generators & machinery) — mirrors useFleetData for vehicles.
 */

import { useMemo } from 'react';
import type { Generator, Machinery } from '@/types';
import { useStationaryAssets, useStationaryFuelTransactions, type StationaryFuelType } from '@/components/fuel/useStationaryFuelHooks';
import type { FuelTableUnit } from '@/components/fuel/FuelTransactionsTable/types';

export interface StationaryFleetDataOptions {
  stationaryType?: StationaryFuelType;
  startDate?: string;
  endDate?: string;
  enabled?: boolean;
}

export interface StationaryFleetDataResult {
  units: Generator[] | Machinery[];
  tableUnits: FuelTableUnit[];
  fuelTransactions: import('@/types').FuelTransaction[];
  unitFuelMapByName: Map<string, number>;
  isLoading: boolean;
  isUnitsLoading: boolean;
  isFuelLoading: boolean;
  isFuelWarming: boolean;
  isFuelBackgroundRefreshing?: boolean;
  fuelError: Error | null;
  refetchFuel: () => void;
}

function buildFuelLevelByName(units: Array<Generator | Machinery>): Map<string, number> {
  const map = new Map<string, number>();
  for (const unit of units) {
    const tankCapacity = unit.fuelInfo?.tankCapacity ?? 100;
    let level: number;
    if (unit.fuelInfo) {
      level = unit.fuelInfo.level;
    } else if (unit.fuelUnit === 'liters') {
      level = unit.fuel;
    } else {
      const percent = unit.fuel;
      level = (percent / 100) * tankCapacity;
    }
    if (level > 0) {
      map.set(unit.name, Math.round(level));
    }
  }
  return map;
}

export function useStationaryFleetData(options?: StationaryFleetDataOptions): StationaryFleetDataResult {
  const { stationaryType = 'generator', startDate, endDate, enabled = true } = options ?? {};

  const unitsQuery = useStationaryAssets(stationaryType, enabled);
  const fuelQuery = useStationaryFuelTransactions(stationaryType, { startDate, endDate }, enabled);

  const units = unitsQuery.data ?? [];
  const fuelTransactions = fuelQuery.data?.transactions ?? [];
  const isFuelWarming = fuelQuery.data?.warming ?? false;
  const isFuelBackgroundRefreshing = Boolean(fuelQuery.data?.needsRefresh) || fuelQuery.isFetching;

  const unitFuelMapByName = useMemo(() => buildFuelLevelByName(units), [units]);

  const tableUnits = useMemo<FuelTableUnit[]>(
    () =>
      units.map((u) => ({
        id: u.id,
        name: u.name,
        driver: u.siteName || undefined,
      })),
    [units],
  );

  return {
    units,
    tableUnits,
    fuelTransactions,
    unitFuelMapByName,
    isLoading: unitsQuery.isLoading || fuelQuery.isLoading || fuelQuery.isFetching,
    isUnitsLoading: unitsQuery.isLoading,
    isFuelLoading: fuelQuery.isFetching || fuelQuery.isLoading,
    isFuelWarming,
    isFuelBackgroundRefreshing,
    fuelError: fuelQuery.error ?? null,
    refetchFuel: () => {
      void fuelQuery.refetch();
    },
  };
}
