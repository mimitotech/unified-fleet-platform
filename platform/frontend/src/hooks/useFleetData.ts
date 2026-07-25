/**
 * Shared Fleet Data Hook
 * 
 * Provides centralized data fetching for vehicles and fuel transactions
 * with computed derived values. Uses React Query's built-in cache sharing
 * so multiple pages/components calling this hook share the same data.
 * 
 * Features:
 * - Lazy loading: Only fetches when fleet service is ready
 * - Computed maps: vehicleFuelMap, fuelByVehicle calculated once and shared
 * - Pagination-ready: Designed to scale to 500+ vehicles
 * - Stable references: useMemo ensures consistent object identity
 * 
 * Usage:
 *   const { vehicles, vehicleFuelMap, isReady } = useFleetData();
 */

import { useMemo } from 'react';
import { useVehicles, useFuelTransactions, useLiveFuelLevels } from '@/services/fleet';
import { tankPercentFromLiters, usablePercent } from '@/lib/fuelLevel';
import type { Vehicle, FuelTransaction } from '@/types';

// ============================================================================
// Types
// ============================================================================

export interface VehicleFuelInfo {
  level: number;
  /** Null when the tank capacity is unknown or the reading is not a real level. */
  percent: number | null;
  tankCapacity: number;
  status: 'critical' | 'warning' | 'ok';
}

export interface VehicleFuelAggregation {
  fillings: number;     // Total liters filled (from filling section)
  consumption: number;  // Total liters consumed (from consumption section fuelUsed)
  mileage: number;      // Total km traveled (from consumption section mileage)
}

export interface FleetDataOptions {
  enabled?: boolean;
  startDate?: string; // ISO date string for fuel transactions filter
  endDate?: string;   // ISO date string for fuel transactions filter
}

export interface FleetDataResult {
  // Raw data from queries
  vehicles: Vehicle[];
  fuelTransactions: FuelTransaction[];

  // Computed lookup maps
  vehicleFuelMap: Map<string, VehicleFuelInfo>;
  vehicleFuelMapByName: Map<string, number>;
  fuelByVehicle: Map<string, VehicleFuelAggregation>;

  // Loading states
  isLoading: boolean;
  isVehiclesLoading: boolean;
  isFuelLoading: boolean;
  isFuelWarming: boolean;
  isFuelBackgroundRefreshing?: boolean;
  isReady: boolean;

  // Error states
  vehiclesError: Error | null;
  fuelError: Error | null;

  // Refetch functions
  refetchVehicles: () => void;
  refetchFuel: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Shared hook for fetching fleet data used across multiple pages.
 * Leverages React Query's cache to ensure data is fetched only once
 * and shared between Fuel, Drivers, and other pages.
 *
 * @param options.enabled - Whether to enable data fetching (default: true)
 * @param options.startDate - Start date for fuel transactions filter (ISO string)
 * @param options.endDate - End date for fuel transactions filter (ISO string)
 */
export function useFleetData(options?: FleetDataOptions): FleetDataResult {
  const { enabled = true, startDate, endDate } = options ?? {};

  // Core data queries - React Query shares cache automatically
  const vehiclesQuery = useVehicles(undefined, { enabled });
  const fuelTransactionsQuery = useFuelTransactions(
    {
      startDate,
      endDate,
      assetCategory: 'vehicle',
    },
    { enabled },
  );

  const vehicles = vehiclesQuery.data ?? [];
  const fuelTransactions = fuelTransactionsQuery.data?.transactions ?? [];
  const isFuelWarming = fuelTransactionsQuery.data?.warming ?? false;
  const isFuelBackgroundRefreshing =
    Boolean(fuelTransactionsQuery.data?.warming) ||
    (Boolean(fuelTransactionsQuery.data?.needsRefresh) && fuelTransactionsQuery.isFetching);
  
  // -------------------------------------------------------------------------
  // Computed: Vehicle fuel level map (by ID)
  // Used by Drivers page for showing current fuel levels
  // -------------------------------------------------------------------------
  const vehicleFuelMap = useMemo(() => {
    const map = new Map<string, VehicleFuelInfo>();

    for (const v of vehicles) {
      const tankCapacity =
        v.fuelInfo?.tankCapacity && v.fuelInfo.tankCapacity > 0 ? v.fuelInfo.tankCapacity : 0;
      let level = 0;
      let reported: number | null = null;

      if (v.fuelInfo) {
        level = Number(v.fuelInfo.level) || 0;
        reported = usablePercent(Number(v.fuelInfo.percentage));
      } else if (v.fuelUnit === 'liters') {
        level = Number(v.fuel) || 0;
      } else {
        reported = usablePercent(Number(v.fuel));
        if (tankCapacity > 0 && reported != null) level = (reported / 100) * tankCapacity;
      }

      // Litres against the declared capacity, or nothing — an asset without fuel
      // monitoring must not be given a percent it never reported.
      const percent = reported ?? tankPercentFromLiters(level, tankCapacity);

      const status: 'critical' | 'warning' | 'ok' =
        percent == null ? 'ok' : percent <= 15 ? 'critical' : percent <= 30 ? 'warning' : 'ok';

      // Percent stays at full precision — rounding here and again at render can
      // push a reading across a whole point versus the same figure elsewhere.
      map.set(v.id, {
        level: Math.round(level * 10) / 10,
        percent,
        tankCapacity,
        status,
      });
    }

    return map;
  }, [vehicles]);
  
  // -------------------------------------------------------------------------
  // Computed: Vehicle fuel level map (by name/plate)
  // Used by Fuel page for matching with sheet transactions
  // -------------------------------------------------------------------------
  // Shared with the Dashboard and every other Fuel tab so period KPIs are seeded
  // from one set of levels rather than per-screen copies that drift apart.
  const { data: vehicleFuelMapByName } = useLiveFuelLevels({ enabled });
  
  // -------------------------------------------------------------------------
  // Computed: Fuel aggregation by vehicle
  // Used by Drivers page for total fuel filled/consumed/mileage per driver's vehicle
  // Uses section-specific fields from Wialon fuel report:
  // - 'filling' section -> filled (liters)
  // - 'consumption' section -> fuelUsed (liters), mileage (km)
  // -------------------------------------------------------------------------
  const fuelByVehicle = useMemo(() => {
    const map = new Map<string, VehicleFuelAggregation>();

    for (const tx of fuelTransactions) {
      const vehicleId = tx.unitId;
      const current = map.get(vehicleId) || { fillings: 0, consumption: 0, mileage: 0 };

      // Filling section: sum positive filled values
      if (tx.section === 'filling' && tx.filled > 0) {
        current.fillings += tx.filled;
      }

      // Consumption section: sum fuelUsed and mileage
      if (tx.section === 'consumption') {
        current.consumption += tx.fuelUsed || 0;
        current.mileage += tx.mileage || 0;
      }

      map.set(vehicleId, current);
    }

    return map;
  }, [fuelTransactions]);

  // -------------------------------------------------------------------------
  // Loading and ready states
  // -------------------------------------------------------------------------
  const isVehiclesLoading = vehiclesQuery.isLoading;
  const isFuelLoading = fuelTransactionsQuery.isLoading && !fuelTransactionsQuery.data;
  const isLoading = isVehiclesLoading || (fuelTransactionsQuery.isLoading && !fuelTransactionsQuery.data);

  // Ready when both queries have completed (even with empty data for 1 vehicle)
  const isReady = !isLoading && vehiclesQuery.isFetched && fuelTransactionsQuery.isFetched;

  return {
    // Raw data
    vehicles,
    fuelTransactions,

    // Computed maps
    vehicleFuelMap,
    vehicleFuelMapByName,
    fuelByVehicle,

    // Loading states
    isLoading,
    isVehiclesLoading,
    isFuelLoading,
    isFuelWarming,
    isFuelBackgroundRefreshing,
    isReady,

    // Error states
    vehiclesError: vehiclesQuery.error,
    fuelError: fuelTransactionsQuery.error,

    // Refetch functions
    refetchVehicles: vehiclesQuery.refetch,
    refetchFuel: fuelTransactionsQuery.refetch,
  };
}

