/**
 * Stationary fleet fuel data (generators & machinery) — mirrors useFleetData for vehicles.
 */

import { useMemo } from 'react';
import type { Generator, Machinery } from '@/types';
import { useStationaryAssets, useStationaryFuelTransactions, type StationaryFuelType } from '@/components/fuel/useStationaryFuelHooks';
import { useLiveFuelLevels } from '@/services/fleet';
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

export function useStationaryFleetData(options?: StationaryFleetDataOptions): StationaryFleetDataResult {
  const { stationaryType = 'generator', startDate, endDate, enabled = true } = options ?? {};

  const unitsQuery = useStationaryAssets(stationaryType, enabled);
  const fuelQuery = useStationaryFuelTransactions(stationaryType, { startDate, endDate }, enabled);

  const units = unitsQuery.data ?? [];
  const fuelTransactions = fuelQuery.data?.transactions ?? [];
  const isFuelWarming = fuelQuery.data?.warming ?? false;
  const isFuelBackgroundRefreshing =
    Boolean(fuelQuery.data?.warming) ||
    (Boolean(fuelQuery.data?.needsRefresh) && fuelQuery.isFetching);

  // Same shared map the Dashboard and vehicle tab use — see useLiveFuelLevels.
  const { data: unitFuelMapByName } = useLiveFuelLevels({ enabled });

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
    isFuelLoading: fuelQuery.isLoading && !fuelQuery.data,
    isFuelWarming,
    isFuelBackgroundRefreshing,
    fuelError: fuelQuery.error ?? null,
    refetchFuel: () => {
      void fuelQuery.refetch();
    },
  };
}
