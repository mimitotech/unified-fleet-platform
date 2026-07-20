/**
 * Fleet Service React Hooks
 *
 * Universal hooks that work with both Mock and Wialon implementations.
 * Uses React Query for caching and automatic refetching.
 *
 * This is the SINGLE source of truth for all fleet-related hooks including fuel.
 */

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseQueryOptions } from '@tanstack/react-query';
import { getFleetService, isFleetServiceConnected } from './index';
import { useFleetReady } from '@/contexts/FleetContext';
import { notify } from '@/lib/notify';
import {
  buildGeneratorEngineIntervalsByUnit,
  getGeneratorFuelActivity,
} from './generatorFuelClassification';
import { aggregateUnitFuelColumns } from '@/components/fuel/fuelColumnMetrics';
import { isWialonGroupSummary } from '@/components/fuel/fuelTransactionFilters';
import { isPlausibleFuelEvent } from '@/components/fuel/fuelEventPlausibility';
import type {
  VehicleFilters,
  FleetStats,
  FuelStats,
  FuelReport,
  FuelEvent,
  VehiclePosition,
  DateRange,
  FuelTransactionFilters,
  GeneratorEngineHoursFilters,
  FuelKpiData,
  FuelByVehicle,
  MonthlyFuelTrend,
} from './types';
import type { Vehicle, Generator, Machinery, Driver, Route, Alert, FuelTransaction, FuelStation, GeneratorEngineHours, EnrichedGenerator, EnrichedMachinery } from '@/types';
import type { FuelFleetSummary, WialonFuelAssetsResponse } from '@/lib/fuelTypes';
import { clientApi } from '@/lib/api';
import {
  fuelAssetToGenerator,
  fuelAssetToMachinery,
  fuelAssetToVehicle,
} from '../transformers/wialonFuelAssetTransformer';

// ============================================================================
// Query Keys
// ============================================================================

export const fleetQueryKeys = {
  all: ['fleet'] as const,

  // Vehicles
  vehicles: () => [...fleetQueryKeys.all, 'vehicles'] as const,
  vehicleList: (filters?: VehicleFilters) => [...fleetQueryKeys.vehicles(), { filters }] as const,
  vehicleDetail: (id: string) => [...fleetQueryKeys.vehicles(), 'detail', id] as const,
  vehiclePositions: (ids: string[]) => [...fleetQueryKeys.vehicles(), 'positions', ids] as const,

  // Generators
  generators: () => [...fleetQueryKeys.all, 'generators'] as const,
  generatorDetail: (id: string) => [...fleetQueryKeys.generators(), 'detail', id] as const,
  generatorEngineHours: () => [...fleetQueryKeys.generators(), 'engineHours'] as const,
  generatorEngineHoursList: (filters?: GeneratorEngineHoursFilters) =>
    [...fleetQueryKeys.generatorEngineHours(), { filters }] as const,
  generatorFuelTransactions: () => [...fleetQueryKeys.generators(), 'fuelTransactions'] as const,
  generatorFuelTransactionsList: (filters?: FuelTransactionFilters) =>
    [...fleetQueryKeys.generatorFuelTransactions(), { filters }] as const,

  // Machinery
  machinery: () => [...fleetQueryKeys.all, 'machinery'] as const,
  machineryDetail: (id: string) => [...fleetQueryKeys.machinery(), 'detail', id] as const,
  machineryFuelTransactions: () => [...fleetQueryKeys.machinery(), 'fuelTransactions'] as const,
  machineryFuelTransactionsList: (filters?: FuelTransactionFilters) =>
    [...fleetQueryKeys.machineryFuelTransactions(), { filters }] as const,

  fuelFleetSummary: () => [...fleetQueryKeys.all, 'fuelFleetSummary'] as const,
  fuelAssets: () => [...fleetQueryKeys.all, 'fuelAssets'] as const,

  // Stats
  fleetStats: () => [...fleetQueryKeys.all, 'stats'] as const,

  // Fuel (consolidated - single source of truth)
  fuel: () => [...fleetQueryKeys.all, 'fuel'] as const,
  fuelLevels: () => [...fleetQueryKeys.fuel(), 'levels'] as const,
  fuelStats: (unitId: string) => [...fleetQueryKeys.fuel(), 'stats', unitId] as const,
  fuelReport: (unitId: string, from: string, to: string) =>
    [...fleetQueryKeys.fuel(), 'report', unitId, from, to] as const,
  fuelAlerts: () => [...fleetQueryKeys.fuel(), 'alerts'] as const,
  fuelTransactions: () => [...fleetQueryKeys.fuel(), 'transactions'] as const,
  fuelTransactionsList: (filters?: FuelTransactionFilters) =>
    [...fleetQueryKeys.fuelTransactions(), { filters }] as const,
  fuelKpis: () => [...fleetQueryKeys.fuel(), 'kpis'] as const,
  fuelByVehicle: () => [...fleetQueryKeys.fuel(), 'byVehicle'] as const,
  fuelMonthlyTrend: () => [...fleetQueryKeys.fuel(), 'monthlyTrend'] as const,
  fuelStations: () => [...fleetQueryKeys.fuel(), 'stations'] as const,
  fuelPreferredStations: () => [...fleetQueryKeys.fuel(), 'preferredStations'] as const,

  // Drivers
  drivers: () => [...fleetQueryKeys.all, 'drivers'] as const,
  driverDetail: (id: string) => [...fleetQueryKeys.drivers(), 'detail', id] as const,

  // Routes
  routes: () => [...fleetQueryKeys.all, 'routes'] as const,
  routeDetail: (id: string) => [...fleetQueryKeys.routes(), 'detail', id] as const,

  // Alerts
  alerts: () => [...fleetQueryKeys.all, 'alerts'] as const,
};

// ============================================================================
// Fuel assets (single fetch — vehicles / generators / machinery derived)
// ============================================================================

export function useFuelAssetsBundle(
  options?: Partial<UseQueryOptions<WialonFuelAssetsResponse>>,
) {
  const isReady = useFleetReady();
  return useQuery({
    queryKey: fleetQueryKeys.fuelAssets(),
    queryFn: () => clientApi.getWialonFuelAssets(),
    enabled: isReady && (options?.enabled !== false),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchInterval: 60_000,
    ...options,
  });
}

// ============================================================================
// Vehicle Hooks
// ============================================================================

/**
 * Fetch all vehicles with optional filters
 */
export function useVehicles(filters?: VehicleFilters, options?: Partial<UseQueryOptions<Vehicle[]>>) {
  const query = useFuelAssetsBundle({ enabled: options?.enabled });
  const data = useMemo(
    () => (query.data?.assets ?? []).filter((a) => a.assetType === 'vehicle').map(fuelAssetToVehicle),
    [query.data],
  );
  return { ...query, data };
}

/**
 * Fetch single vehicle by ID
 */
export function useVehicle(id: string, options?: Partial<UseQueryOptions<Vehicle | null>>) {
  const isReady = useFleetReady();
  return useQuery({
    queryKey: fleetQueryKeys.vehicleDetail(id),
    queryFn: () => getFleetService().getVehicleById(id),
    enabled: isReady && !!id && (options?.enabled !== false),
    staleTime: 5_000,
    ...options,
  });
}

/**
 * Fetch real-time positions for vehicles
 */
export function useVehiclePositions(vehicleIds: string[]) {
  const isReady = useFleetReady();
  return useQuery({
    queryKey: fleetQueryKeys.vehiclePositions(vehicleIds),
    queryFn: () => getFleetService().getVehiclePositions(vehicleIds),
    enabled: isReady && vehicleIds.length > 0,
    staleTime: 5_000,
    refetchInterval: 10_000, // Real-time updates
  });
}

// ============================================================================
// Generator Hooks
// ============================================================================

/**
 * Fetch all generators
 */
export function useGenerators(options?: Partial<UseQueryOptions<Generator[]>>) {
  const query = useFuelAssetsBundle({ enabled: options?.enabled });
  const data = useMemo(
    () => (query.data?.assets ?? []).filter((a) => a.assetType === 'generator').map(fuelAssetToGenerator),
    [query.data],
  );
  return { ...query, data };
}

/**
 * Fetch single generator by ID
 */
export function useGenerator(id: string, options?: Partial<UseQueryOptions<Generator | null>>) {
  const isReady = useFleetReady();
  return useQuery({
    queryKey: fleetQueryKeys.generatorDetail(id),
    queryFn: () => getFleetService().getGeneratorById(id),
    enabled: isReady && !!id && (options?.enabled !== false),
    staleTime: 5_000,
    ...options,
  });
}

/**
 * Fetch engine-hours intervals for generators from the
 * /generator-engine-hours edge function (cache-first).
 */
export function useGeneratorEngineHours(
  filters?: GeneratorEngineHoursFilters,
  options?: Partial<UseQueryOptions<GeneratorEngineHours[]>>,
) {
  const isReady = useFleetReady();
  return useQuery({
    queryKey: fleetQueryKeys.generatorEngineHoursList(filters),
    queryFn: () => getFleetService().getGeneratorEngineHours(filters),
    enabled: isReady && (options?.enabled !== false),
    staleTime: 60_000,
    ...options,
  });
}

/**
 * Mutation hook to force refresh of generator engine-hours from Wialon.
 * Bypasses the cache, runs the report, upserts and returns fresh rows.
 */
export function useRefreshGeneratorEngineHours() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (range?: { startDate?: string; endDate?: string; days?: number; unitId?: string }) => {
      return getFleetService().getGeneratorEngineHours({
        refresh: true,
        startDate: range?.startDate,
        endDate: range?.endDate,
        days: range?.days,
        unitId: range?.unitId,
      });
    },
    onSuccess: (data, variables) => {
      const filters: GeneratorEngineHoursFilters | undefined = variables
        ? {
            startDate: variables.startDate,
            endDate: variables.endDate,
            days: variables.days,
            unitId: variables.unitId,
          }
        : undefined;
      queryClient.setQueryData(fleetQueryKeys.generatorEngineHoursList(filters), data);
      queryClient.invalidateQueries({ queryKey: fleetQueryKeys.generatorEngineHours() });
    },
  });
}

/**
 * Fetch fuel transactions filtered to generator-classified units.
 * Reuses the shared fuel report cache and applies a client-side filter
 * via the generator unit-id list.
 */
export function useGeneratorFuelTransactions(
  filters?: FuelTransactionFilters,
  options?: Partial<UseQueryOptions<FuelTransactionsQueryData>>,
) {
  const isReady = useFleetReady();
  return useQuery(
    fuelTransactionsQueryOptions(
      fleetQueryKeys.generatorFuelTransactionsList(filters),
      { ...filters, assetCategory: 'generator' },
      isReady && options?.enabled !== false,
      options,
    ),
  );
}

/**
 * Composed hook: returns the generator list enriched with period-aggregated
 * runtime hours and fuel metrics for the supplied date range. Combines
 * `useGenerators`, `useGeneratorEngineHours`, and `useGeneratorFuelTransactions`
 * and reduces their results into a single `EnrichedGenerator[]`.
 *
 * Loading/error are surfaced as the union across the three sub-queries so
 * consumers can render a single shell while any source is in flight.
 */
export function useGeneratorsWithReports(range?: {
  startDate?: string;
  endDate?: string;
  days?: number;
}) {
  const generatorsQuery = useGenerators();
  const engineHoursQuery = useGeneratorEngineHours({
    startDate: range?.startDate,
    endDate: range?.endDate,
    days: range?.days,
  });
  const fuelQuery = useGeneratorFuelTransactions({
    startDate: range?.startDate,
    endDate: range?.endDate,
  });

  const data = useMemo<EnrichedGenerator[]>(() => {
    const generators = generatorsQuery.data ?? [];
    if (generators.length === 0) return [];

    // Aggregate engine-hours rows by unit id and capture the on/off intervals.
    // The interval list is reused below to distinguish real fuel drains (engine
    // off) from Wialon's "Sudden Fuel Drop" rows that fire during high-rate
    // consumption while the generator is running.
    //
    // Runtime is computed from the wall-clock interval (`end - beginning`) in
    // seconds rather than the row's `engineHours` field. This matches the
    // semantics of the Wialon "Engine hours" column (interval duration) and is
    // robust against historical cache rows whose `engineHours` got corrupted by
    // an old text-strip parser (e.g. "5:18:32" → 51832 instead of 19112).
    const engineByUnit = new Map<string, { hours: number; lastEnd: number }>();
    const engineRows = engineHoursQuery.data ?? [];
    const engineIntervalsByUnit = buildGeneratorEngineIntervalsByUnit(engineRows);
    for (const row of engineRows) {
      const key = String(row.unitId);
      const current = engineByUnit.get(key) ?? { hours: 0, lastEnd: 0 };
      const durationSec = row.end > row.beginning ? row.end - row.beginning : 0;
      current.hours += durationSec / 3600;
      if (row.end > current.lastEnd) current.lastEnd = row.end;
      engineByUnit.set(key, current);
    }

    // Aggregate fuel rows by unit id, split by section. Also tally location
    // strings from fill/drain events so we can back-fill `siteName` for units
    // that don't have the `site_name` custom field configured in Wialon —
    // generators are stationed and fuelled at their site, so the most frequent
    // refuel/drain location is a reliable proxy.
    const fuelByUnit = new Map<
      string,
      { consumed: number; filled: number; drained: number }
    >();
    const locationCountsByUnit = new Map<string, Map<string, number>>();
    // Earliest fuel-transaction location per unit. Generators are stationary, so
    // the first known refuel/drain address acts as the unit's "current location"
    // for display in Generators by Site.
    const initialLocationByUnit = new Map<string, { ts: number; location: string }>();
    const txs = fuelQuery.data?.transactions ?? [];
    const byUnitName = new Map<string, typeof txs>();
    for (const tx of txs) {
      const list = byUnitName.get(tx.unitName) ?? [];
      list.push(tx);
      byUnitName.set(tx.unitName, list);
    }
    for (const [unitName, unitTxs] of byUnitName) {
      const sample = unitTxs[0];
      const key = String(sample?.unitId ?? unitName);
      const cols = aggregateUnitFuelColumns(unitTxs, {
        fromDate: range?.startDate,
        toDate: range?.endDate,
      });
      fuelByUnit.set(key, {
        consumed: cols.totalUsed,
        filled: cols.filledMain + cols.filledReserve,
        drained: cols.totalDrop,
      });
    }
    for (const tx of txs) {
      const key = String(tx.unitId);
      if (isWialonGroupSummary(tx) || !isPlausibleFuelEvent(tx)) continue;

      // Site inference uses anchor events (fill/drain), not consumption rows
      // which represent driving/idle intervals rather than a physical place.
      if (tx.section === 'filling' || tx.section === 'theft') {
        const loc = (tx.location ?? '').trim();
        if (loc) {
          const counts = locationCountsByUnit.get(key) ?? new Map<string, number>();
          counts.set(loc, (counts.get(loc) ?? 0) + 1);
          locationCountsByUnit.set(key, counts);

          const existing = initialLocationByUnit.get(key);
          if (!existing || tx.timestamp < existing.ts) {
            initialLocationByUnit.set(key, { ts: tx.timestamp, location: loc });
          }
        }
      }
    }

    const pickTopLocation = (counts: Map<string, number> | undefined): string | undefined => {
      if (!counts || counts.size === 0) return undefined;
      let topLoc: string | undefined;
      let topCount = 0;
      for (const [loc, n] of counts) {
        if (n > topCount) {
          topCount = n;
          topLoc = loc;
        }
      }
      return topLoc;
    };

    return generators.map<EnrichedGenerator>((g) => {
      const engine = engineByUnit.get(g.id);
      const fuel = fuelByUnit.get(g.id);
      const inferredSite = pickTopLocation(locationCountsByUnit.get(g.id));

      // Override siteName when:
      //  - it's empty (custom field unset and no fallback fired), or
      //  - it equals the unit name (the unitService fallback case — i.e. the
      //    `site_name` custom field is missing and the transformer copied the
      //    unit name in to keep the field non-empty).
      const siteIsFallback = !g.siteName || g.siteName.trim() === '' || g.siteName === g.name;
      const resolvedSiteName = siteIsFallback && inferredSite ? inferredSite : g.siteName;

      return {
        ...g,
        siteName: resolvedSiteName,
        runtimeHoursPeriod: engine?.hours,
        lastReportAt: engine?.lastEnd,
        fuelConsumedPeriod: fuel?.consumed,
        fuelFilledPeriod: fuel?.filled,
        fuelDrainsPeriod: fuel?.drained,
        locationName: initialLocationByUnit.get(g.id)?.location,
      };
    });
  }, [generatorsQuery.data, engineHoursQuery.data, fuelQuery.data]);

  return {
    data,
    isLoading: generatorsQuery.isLoading,
    isReportsLoading: engineHoursQuery.isLoading || fuelQuery.isLoading,
    isFetching: generatorsQuery.isFetching || engineHoursQuery.isFetching || fuelQuery.isFetching,
    error: generatorsQuery.error || engineHoursQuery.error || fuelQuery.error,
    refetch: () => {
      generatorsQuery.refetch();
      engineHoursQuery.refetch();
      fuelQuery.refetch();
    },
    // Expose sub-queries for advanced callers that need partial states
    generatorsQuery,
    engineHoursQuery,
    fuelQuery,
  };
}

// ============================================================================
// Machinery Hooks
// ============================================================================

export function useMachinery(options?: Partial<UseQueryOptions<Machinery[]>>) {
  const query = useFuelAssetsBundle({ enabled: options?.enabled });
  const data = useMemo(
    () => (query.data?.assets ?? []).filter((a) => a.assetType === 'machinery').map(fuelAssetToMachinery),
    [query.data],
  );
  return { ...query, data };
}

export function useMachineryFuelTransactions(
  filters?: FuelTransactionFilters,
  options?: Partial<UseQueryOptions<FuelTransactionsQueryData>>,
) {
  const isReady = useFleetReady();
  return useQuery(
    fuelTransactionsQueryOptions(
      fleetQueryKeys.machineryFuelTransactionsList(filters),
      { ...filters, assetCategory: 'machinery' },
      isReady && options?.enabled !== false,
      options,
    ),
  );
}

export function useMachineryWithReports(range?: {
  startDate?: string;
  endDate?: string;
  days?: number;
}) {
  const machineryQuery = useMachinery();
  const engineHoursQuery = useGeneratorEngineHours({
    startDate: range?.startDate,
    endDate: range?.endDate,
    days: range?.days,
  });
  const fuelQuery = useMachineryFuelTransactions({
    startDate: range?.startDate,
    endDate: range?.endDate,
  });

  const data = useMemo<EnrichedMachinery[]>(() => {
    const items = machineryQuery.data ?? [];
    if (items.length === 0) return [];

    const engineByUnit = buildGeneratorEngineIntervalsByUnit(engineHoursQuery.data ?? []);
    const fuelByUnit = new Map<string, { consumed: number; filled: number; drained: number }>();
    const txs = fuelQuery.data?.transactions ?? [];
    const byUnit = new Map<string, typeof txs>();
    for (const tx of txs) {
      const uid = String(tx.unitId);
      const list = byUnit.get(uid) ?? [];
      list.push(tx);
      byUnit.set(uid, list);
    }
    for (const [uid, unitTxs] of byUnit) {
      const cols = aggregateUnitFuelColumns(unitTxs, {
        fromDate: range?.startDate,
        toDate: range?.endDate,
      });
      fuelByUnit.set(uid, {
        consumed: cols.totalUsed,
        filled: cols.filledMain + cols.filledReserve,
        drained: cols.totalDrop,
      });
    }

    return items.map<EnrichedMachinery>((m) => {
      const engine = engineByUnit.get(m.id);
      const fuel = fuelByUnit.get(m.id);
      return {
        ...m,
        runtimeHoursPeriod: engine?.hours,
        lastReportAt: engine?.lastEnd,
        fuelConsumedPeriod: fuel?.consumed,
        fuelFilledPeriod: fuel?.filled,
        fuelDrainsPeriod: fuel?.drained,
      };
    });
  }, [machineryQuery.data, engineHoursQuery.data, fuelQuery.data]);

  return {
    data,
    isLoading: machineryQuery.isLoading,
    isReportsLoading: engineHoursQuery.isLoading || fuelQuery.isLoading,
    isFetching: machineryQuery.isFetching || engineHoursQuery.isFetching || fuelQuery.isFetching,
    error: machineryQuery.error || engineHoursQuery.error || fuelQuery.error,
    refetch: () => {
      machineryQuery.refetch();
      engineHoursQuery.refetch();
      fuelQuery.refetch();
    },
  };
}

export function useFuelFleetSummary() {
  const query = useFuelAssetsBundle();
  const data = query.data?.summary as FuelFleetSummary | undefined;
  return { ...query, data };
}

// ============================================================================
// Fleet Stats Hook
// ============================================================================

/**
 * Fetch fleet statistics
 */
export function useFleetStats() {
  const isReady = useFleetReady();
  return useQuery({
    queryKey: fleetQueryKeys.fleetStats(),
    queryFn: () => getFleetService().getFleetStats(),
    enabled: isReady,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// ============================================================================
// Fuel Hooks
// ============================================================================

/**
 * Fetch current fuel levels for all units
 */
export function useFuelLevels() {
  const isReady = useFleetReady();
  return useQuery({
    queryKey: fleetQueryKeys.fuelLevels(),
    queryFn: () => getFleetService().getFuelLevels(),
    enabled: isReady,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/**
 * Fetch fuel statistics for a unit
 */
export function useFuelStats(unitId: string, days: number = 7) {
  const isReady = useFleetReady();
  return useQuery({
    queryKey: fleetQueryKeys.fuelStats(unitId),
    queryFn: () => getFleetService().getFuelStats(unitId, days),
    enabled: isReady && !!unitId,
    staleTime: 60_000,
  });
}

/**
 * Fetch fuel report for a date range
 */
export function useFuelReport(unitId: string, dateRange: DateRange) {
  const isReady = useFleetReady();
  return useQuery({
    queryKey: fleetQueryKeys.fuelReport(
      unitId,
      dateRange.from.toISOString(),
      dateRange.to.toISOString()
    ),
    queryFn: () => getFleetService().getFuelReport(unitId, dateRange),
    enabled: isReady && !!unitId,
    staleTime: 5 * 60_000,
  });
}

/**
 * Fetch fuel alerts
 */
export function useFuelAlerts(hours: number = 24) {
  const isReady = useFleetReady();
  return useQuery({
    queryKey: fleetQueryKeys.fuelAlerts(),
    queryFn: () => getFleetService().getFuelAlerts(hours),
    enabled: isReady,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

/**
 * Fetch fuel transactions with optional filtering
 */
export type FuelTransactionsQueryData = {
  transactions: FuelTransaction[];
  warming: boolean;
  needsRefresh?: boolean;
};

async function fetchFuelTransactionsMeta(
  filters?: FuelTransactionFilters,
): Promise<FuelTransactionsQueryData> {
  const svc = getFleetService();
  if (svc.getFuelTransactionsMeta) {
    return svc.getFuelTransactionsMeta(filters);
  }
  const transactions = await svc.getFuelTransactions(filters);
  return { transactions, warming: false, needsRefresh: false };
}

function fuelTransactionsQueryOptions(
  queryKey: readonly unknown[],
  filters: FuelTransactionFilters | undefined,
  enabled: boolean,
  extra?: Partial<UseQueryOptions<FuelTransactionsQueryData>>,
) {
  return {
    queryKey,
    queryFn: () => fetchFuelTransactionsMeta(filters),
    enabled,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchInterval: (query: { state: { data?: FuelTransactionsQueryData; status: string } }) => {
      const d = query.state.data;
      if (query.state.status === 'error') return false;
      // Only poll fast while a first-time background sync is in progress
      if (d?.warming) return 8_000;
      // Soft stale refresh: slower poll until needsRefresh clears
      if (d?.needsRefresh) return 30_000;
      return 60_000;
    },
    ...extra,
  };
}

export function useFuelTransactions(filters?: FuelTransactionFilters) {
  const isReady = useFleetReady();
  return useQuery(
    fuelTransactionsQueryOptions(fleetQueryKeys.fuelTransactionsList(filters), filters, isReady),
  );
}

/**
 * Mutation hook to force refresh fuel transactions from Wialon
 * Bypasses the cache and fetches fresh data
 */
export function useRefreshFuelTransactions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (range?: {
      startDate?: string;
      endDate?: string;
      assetCategory?: import('@/lib/fuelTypes').FuelAssetCategory;
    }) => {
      return fetchFuelTransactionsMeta({
        refresh: true,
        startDate: range?.startDate,
        endDate: range?.endDate,
        assetCategory: range?.assetCategory,
      });
    },
    onSuccess: (data, variables) => {
      const filters = variables
        ? {
            startDate: variables.startDate,
            endDate: variables.endDate,
            assetCategory: variables.assetCategory,
          }
        : undefined;
      queryClient.setQueryData(fleetQueryKeys.fuelTransactionsList(filters), data);
      queryClient.invalidateQueries({ queryKey: fleetQueryKeys.fuel() });
      queryClient.invalidateQueries({ queryKey: fleetQueryKeys.generatorFuelTransactions() });
      queryClient.invalidateQueries({ queryKey: fleetQueryKeys.machineryFuelTransactions() });
      if (data?.warming || data?.needsRefresh) {
        notify.info('Fuel sync started', 'Large fleets sync in the background. Totals update automatically.');
      }
    },
  });
}

/**
 * Fetch fuel KPIs (total cost, consumption, efficiency)
 */
export function useFuelKpis() {
  const isReady = useFleetReady();
  return useQuery({
    queryKey: fleetQueryKeys.fuelKpis(),
    queryFn: () => getFleetService().getFuelKpis(),
    enabled: isReady,
    staleTime: 5 * 60_000,
  });
}

/**
 * Fetch fuel consumption by vehicle
 */
export function useFuelByVehicle() {
  const isReady = useFleetReady();
  return useQuery({
    queryKey: fleetQueryKeys.fuelByVehicle(),
    queryFn: () => getFleetService().getFuelByVehicle(),
    enabled: isReady,
    staleTime: 5 * 60_000,
  });
}

/**
 * Fetch monthly fuel trend
 */
export function useMonthlyFuelTrend() {
  const isReady = useFleetReady();
  return useQuery({
    queryKey: fleetQueryKeys.fuelMonthlyTrend(),
    queryFn: () => getFleetService().getMonthlyFuelTrend(),
    enabled: isReady,
    staleTime: 5 * 60_000,
  });
}

/**
 * Fetch all fuel stations
 */
export function useFuelStations() {
  const isReady = useFleetReady();
  return useQuery({
    queryKey: fleetQueryKeys.fuelStations(),
    queryFn: () => getFleetService().getFuelStations(),
    enabled: isReady,
    staleTime: 10 * 60_000, // Stations don't change often
  });
}

/**
 * Fetch preferred fuel stations
 */
export function usePreferredStations() {
  const isReady = useFleetReady();
  return useQuery({
    queryKey: fleetQueryKeys.fuelPreferredStations(),
    queryFn: async () => {
      const stations = await getFleetService().getFuelStations();
      return stations.filter((s) => s.isPreferred);
    },
    enabled: isReady,
    staleTime: 10 * 60_000,
  });
}

/**
 * Fetch fuel efficiency stats
 */
export function useFuelEfficiencyStats() {
  const isReady = useFleetReady();
  return useQuery({
    queryKey: [...fleetQueryKeys.fuel(), 'efficiency'] as const,
    queryFn: async () => {
      const kpis = await getFleetService().getFuelKpis();
      return {
        avgEfficiency: kpis.avgEfficiency,
        bestVehicle: { name: 'Delivery Van 02', efficiency: 10.2 },
        worstVehicle: { name: 'Kampala Truck 01', efficiency: 6.8 },
        totalLiters: kpis.totalLiters,
        totalCost: kpis.totalFuelCost,
      };
    },
    enabled: isReady,
    staleTime: 5 * 60_000,
  });
}

// ============================================================================
// Driver Hooks
// ============================================================================

/**
 * Fetch all drivers
 */
export function useDrivers(options?: Partial<UseQueryOptions<Driver[]>>) {
  const isReady = useFleetReady();
  return useQuery({
    queryKey: fleetQueryKeys.drivers(),
    queryFn: () => getFleetService().getDrivers(),
    enabled: isReady && (options?.enabled !== false),
    staleTime: 60_000,
    ...options,
  });
}

/**
 * Fetch single driver by ID
 */
export function useDriver(id: string, options?: Partial<UseQueryOptions<Driver | null>>) {
  const isReady = useFleetReady();
  return useQuery({
    queryKey: fleetQueryKeys.driverDetail(id),
    queryFn: () => getFleetService().getDriverById(id),
    enabled: isReady && !!id && (options?.enabled !== false),
    staleTime: 30_000,
    ...options,
  });
}

// ============================================================================
// Route Hooks
// ============================================================================

/**
 * Fetch all routes
 */
export function useRoutes(options?: Partial<UseQueryOptions<Route[]>>) {
  const isReady = useFleetReady();
  return useQuery({
    queryKey: fleetQueryKeys.routes(),
    queryFn: () => getFleetService().getRoutes(),
    enabled: isReady && (options?.enabled !== false),
    staleTime: 60_000,
    ...options,
  });
}

/**
 * Fetch single route by ID
 */
export function useRoute(id: string, options?: Partial<UseQueryOptions<Route | null>>) {
  const isReady = useFleetReady();
  return useQuery({
    queryKey: fleetQueryKeys.routeDetail(id),
    queryFn: () => getFleetService().getRouteById(id),
    enabled: isReady && !!id && (options?.enabled !== false),
    staleTime: 30_000,
    ...options,
  });
}

// ============================================================================
// Alert Hooks
// ============================================================================

/**
 * Fetch all alerts
 */
export function useAlerts() {
  const isReady = useFleetReady();
  return useQuery({
    queryKey: fleetQueryKeys.alerts(),
    queryFn: () => getFleetService().getAlerts(),
    enabled: isReady,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/**
 * Acknowledge an alert
 */
export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (alertId: string) => getFleetService().acknowledgeAlert(alertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fleetQueryKeys.alerts() });
    },
  });
}

// ============================================================================
// Google Sheets Integration Hooks
// ============================================================================

import {
  fetchFuelTransactions as fetchSheetTransactions,
  getFuelCostAnalysis,
  type SheetFuelTransaction,
  type FuelCostAnalysis,
} from '@/services/googleSheetsService';

/**
 * Fetch fuel transactions from Google Sheets (fuel station data)
 */
export function useSheetFuelTransactions(startDate?: Date, endDate?: Date) {
  const isReady = useFleetReady();
  return useQuery({
    queryKey: [...fleetQueryKeys.fuel(), 'sheet', 'transactions', startDate?.toISOString(), endDate?.toISOString()] as const,
    queryFn: () => fetchSheetTransactions(startDate, endDate),
    enabled: isReady,
    staleTime: 5 * 60_000, // 5 minutes
  });
}

/**
 * Fetch fuel cost analysis comparing Wialon vs Non-Wialon vehicles.
 * Accepts the already-computed wialonPlates array from the caller so that
 * the hook does not need its own useVehicles() subscription (eliminates
 * the duplicate plate computation that previously lived in this hook).
 */
export function useFuelCostAnalysis(wialonPlates: string[], startDate?: Date, endDate?: Date) {
  const isReady = useFleetReady();

  return useQuery({
    queryKey: [...fleetQueryKeys.fuel(), 'sheet', 'costAnalysis', wialonPlates.length, startDate?.toISOString(), endDate?.toISOString()] as const,
    queryFn: () => getFuelCostAnalysis(wialonPlates, startDate, endDate),
    enabled: isReady,
    staleTime: 5 * 60_000,
  });
}

// ============================================================================
// Trip summaries (derived from Wialon fuel consumption rows)
// ============================================================================

export interface TripSummaryFilters {
  unitId?: string;
  from?: string;
  to?: string;
  includeRoute?: boolean;
}

export type ApiTripSummary = {
  departureTime: string;
  arrivalTime: string;
  mileage: number;
  fuelUsed: number;
  duration: number;
  avgSpeed: number;
  maxSpeed: number;
  departureFrom?: { address?: string };
  arrivedAt?: { address?: string };
};

export function useTripSummaries(
  filters?: TripSummaryFilters,
  options?: Partial<UseQueryOptions<ApiTripSummary[]>>,
) {
  const isReady = useFleetReady();

  return useQuery({
    queryKey: [...fleetQueryKeys.fuel(), 'tripSummaries', filters] as const,
    queryFn: async () => {
      const from = filters?.from?.slice(0, 10);
      const to = filters?.to?.slice(0, 10);
      const txs = await getFleetService().getFuelTransactions({
        startDate: from,
        endDate: to,
        vehicleId: filters?.unitId,
      });
      return txs
        .filter((t) => t.section === 'consumption')
        .map((t) => {
          const durationSec = t.durationSeconds || 0;
          const hours = durationSec > 0 ? durationSec / 3600 : 0;
          return {
            departureTime: new Date(t.timestamp * 1000).toISOString(),
            arrivalTime: new Date((t.timestamp + durationSec) * 1000).toISOString(),
            mileage: t.mileage,
            fuelUsed: t.fuelUsed,
            duration: durationSec,
            avgSpeed: hours > 0 ? t.mileage / hours : 0,
            maxSpeed: 0,
            departureFrom: { address: t.location },
            arrivedAt: { address: t.location },
          };
        });
    },
    enabled: isReady && !!filters?.unitId && (options?.enabled !== false),
    staleTime: 60_000,
    ...options,
  });
}

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Invalidate fleet data (force refresh)
 */
export function useInvalidateFleet() {
  const queryClient = useQueryClient();

  return {
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: fleetQueryKeys.all }),
    invalidateVehicles: () => queryClient.invalidateQueries({ queryKey: fleetQueryKeys.vehicles() }),
    invalidateFuel: () => queryClient.invalidateQueries({ queryKey: fleetQueryKeys.fuel() }),
    invalidateStats: () => queryClient.invalidateQueries({ queryKey: fleetQueryKeys.fleetStats() }),
  };
}

