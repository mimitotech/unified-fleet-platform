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
import { useVehicles, useFuelTransactions } from '@/services/fleet';
import type { Vehicle, FuelTransaction } from '@/types';

// ============================================================================
// Types
// ============================================================================

export interface VehicleFuelInfo {
  level: number;
  percent: number;
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
  const fuelTransactionsQuery = useFuelTransactions({
    startDate,
    endDate,
  });

  const vehicles = vehiclesQuery.data ?? [];
  const fuelTransactions = fuelTransactionsQuery.data ?? [];
  
  // -------------------------------------------------------------------------
  // Computed: Vehicle fuel level map (by ID)
  // Used by Drivers page for showing current fuel levels
  // -------------------------------------------------------------------------
  const vehicleFuelMap = useMemo(() => {
    const map = new Map<string, VehicleFuelInfo>();
    
    for (const v of vehicles) {
      const tankCapacity = v.fuelInfo?.tankCapacity ?? 100;
      let level: number;
      let percent: number;
      
      if (v.fuelInfo) {
        // Best case: fuelInfo from Wialon with calibrated sensor
        level = v.fuelInfo.level;
        percent = v.fuelInfo.percentage ?? 0;
      } else if (v.fuelUnit === 'liters') {
        // Fuel is already in liters
        level = v.fuel;
        percent = tankCapacity > 0 ? (v.fuel / tankCapacity) * 100 : 0;
      } else {
        // Fuel is in percentage
        percent = v.fuel;
        level = (percent / 100) * tankCapacity;
      }
      
      // Determine status thresholds
      const status: 'critical' | 'warning' | 'ok' = 
        percent <= 15 ? 'critical' : 
        percent <= 30 ? 'warning' : 
        'ok';
      
      map.set(v.id, {
        level: Math.round(level),
        percent: Math.round(percent * 10) / 10,
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
  const vehicleFuelMapByName = useMemo(() => {
    const map = new Map<string, number>();
    
    for (const vehicle of vehicles) {
      const info = vehicleFuelMap.get(vehicle.id);
      if (info) {
        map.set(vehicle.name, info.level);
        // Also map by normalized plate for sheet matching
        if (vehicle.plate) {
          const normalizedPlate = vehicle.plate.toUpperCase().replace(/\s+/g, '');
          map.set(normalizedPlate, info.level);
        }
      }
    }
    
    return map;
  }, [vehicles, vehicleFuelMap]);
  
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
  const isFuelLoading = fuelTransactionsQuery.isLoading;
  const isLoading = isVehiclesLoading || isFuelLoading;

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
    isReady,

    // Error states
    vehiclesError: vehiclesQuery.error,
    fuelError: fuelTransactionsQuery.error,

    // Refetch functions
    refetchVehicles: vehiclesQuery.refetch,
    refetchFuel: fuelTransactionsQuery.refetch,
  };
}

