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
}

export interface StationaryFleetDataResult {
  units: Generator[] | Machinery[];
  tableUnits: FuelTableUnit[];
  fuelTransactions: import('@/types').FuelTransaction[];
  unitFuelMapByName: Map<string, number>;
  isLoading: boolean;
  isUnitsLoading: boolean;
  isFuelLoading: boolean;
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
  const { stationaryType = 'generator', startDate, endDate } = options ?? {};

  const unitsQuery = useStationaryAssets(stationaryType);
  const fuelQuery = useStationaryFuelTransactions(stationaryType, { startDate, endDate });

  const units = unitsQuery.data ?? [];
  const fuelTransactions = fuelQuery.data ?? [];

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
    isLoading: unitsQuery.isLoading || fuelQuery.isLoading,
    isUnitsLoading: unitsQuery.isLoading,
    isFuelLoading: fuelQuery.isLoading,
    fuelError: fuelQuery.error ?? null,
    refetchFuel: () => {
      void fuelQuery.refetch();
    },
  };
}
