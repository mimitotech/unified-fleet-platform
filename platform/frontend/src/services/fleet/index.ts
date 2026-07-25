/**
 * Fleet Service — UFP implementation wired to Wialon fuel APIs.
 */

export type {
  IFleetService,
  VehicleFilters,
  PaginationParams,
  PaginatedResult,
  DateRange,
  FleetStats,
  FuelStats,
  FuelEvent,
  FuelReport,
  VehiclePosition,
  FleetServiceConfig,
  FuelTransactionFilters,
  GeneratorEngineHoursFilters,
  FuelKpiData,
  FuelByVehicle,
  MonthlyFuelTrend,
  DashboardKpiData,
  ChartData,
  FuelConsumptionData,
  TripsByHourData,
  VehicleUtilizationData,
  DriverPerformanceData,
} from './types';

export { UfpFleetService } from './UfpFleetService';

import type { FleetServiceConfig, IFleetService } from './types';
import { UfpFleetService } from './UfpFleetService';

let fleetServiceInstance: IFleetService | null = null;

export function getFleetService(_config?: Partial<FleetServiceConfig>): IFleetService {
  if (!fleetServiceInstance) {
    fleetServiceInstance = new UfpFleetService();
  }
  return fleetServiceInstance;
}

export function resetFleetService(): void {
  fleetServiceInstance = null;
}

export async function initializeFleetService(): Promise<boolean> {
  return getFleetService().initialize();
}

export function isFleetServiceConnected(): boolean {
  if (!fleetServiceInstance) return false;
  return fleetServiceInstance.isConnected();
}

export {
  fleetQueryKeys,
  useVehicles,
  useVehicle,
  useVehiclePositions,
  useGenerators,
  useGenerator,
  useMachinery,
  useMachineryFuelTransactions,
  useMachineryWithReports,
  useFuelFleetSummary,
  useLiveFuelLevels,
  useLiveFuelReadings,
  useGeneratorEngineHours,
  useRefreshGeneratorEngineHours,
  useGeneratorFuelTransactions,
  useGeneratorsWithReports,
  useFleetStats,
  useFuelLevels,
  useFuelStats,
  useFuelReport,
  useFuelAlerts,
  useFuelTransactions,
  useRefreshFuelTransactions,
  useFuelKpis,
  useFuelByVehicle,
  useMonthlyFuelTrend,
  useFuelStations,
  usePreferredStations,
  useFuelEfficiencyStats,
  useSheetFuelTransactions,
  useFuelCostAnalysis,
  useTripSummaries,
} from './hooks';
