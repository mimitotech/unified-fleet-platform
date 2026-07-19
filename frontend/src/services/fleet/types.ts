/**
 * Fleet Service Interface Types
 *
 * Common types for the fleet service abstraction layer.
 * Both MockFleetService and WialonFleetService implement these interfaces.
 */

import type { Vehicle, Generator, FleetUnit, Driver, Route, Alert, FuelTransaction, FuelStation, GeneratorEngineHours } from '@/types';

// ============================================================================
// Query Parameters
// ============================================================================

export interface VehicleFilters {
  status?: Vehicle['status'];
  vehicleType?: Vehicle['vehicleType'];
  search?: string;
  driverId?: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DateRange {
  from: Date;
  to: Date;
}

// ============================================================================
// Fleet Statistics
// ============================================================================

export interface FleetStats {
  totalVehicles: number;
  moving: number;
  idle: number;
  stopped: number;
  offline: number;
  totalGenerators: number;
  generatorsRunning: number;
}

export interface FuelStats {
  unitId: string;
  unitName: string;
  currentLevel: number;
  consumption24h: number;
  consumption7d: number;
  lastFillDate?: string;
  lastFillVolume?: number;
  averageConsumption: number;
}

export interface FuelEvent {
  type: 'filling' | 'theft' | 'consumption';
  unitId: string;
  unitName: string;
  timestamp: string;
  location: { lat: number; lng: number };
  volumeChange: number;
  levelBefore: number;
  levelAfter: number;
}

export interface FuelReport {
  unitId: string;
  unitName: string;
  periodStart: string;
  periodEnd: string;
  startLevel: number;
  endLevel: number;
  totalFilled: number;
  totalConsumed: number;
  fillings: FuelEvent[];
  thefts: FuelEvent[];
}

// ============================================================================
// Position & Tracking
// ============================================================================

export interface VehiclePosition {
  vehicleId: string;
  lat: number;
  lng: number;
  speed: number;
  heading?: number;
  timestamp: string;
}

// ============================================================================
// Fuel Transaction Types
// ============================================================================

export interface FuelKpiData {
  totalFuelCost: number;
  totalLiters: number;
  avgCostPerLiter: number;
  avgEfficiency: number;
  monthlyBudget: number;
  budgetUsed: number;
  transactionsThisMonth: number;
  preferredStationUsage: number;
}

export interface FuelByVehicle {
  vehicle: string;
  liters: number;
  cost: number;
}

export interface MonthlyFuelTrend {
  month: string;
  liters: number;
  cost: number;
}

export interface FuelTransactionFilters {
  vehicleId?: string;
  driverId?: string;
  stationId?: string;
  fuelType?: 'diesel' | 'petrol';
  startDate?: string;
  endDate?: string;
  refresh?: boolean;
  includeGenerators?: boolean;
  includeMachinery?: boolean;
  assetCategory?: import('@/lib/fuelTypes').FuelAssetCategory;
}

export interface GeneratorEngineHoursFilters {
  unitId?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
  refresh?: boolean; // Force refresh from Wialon (bypass cache)
}

// ============================================================================
// Dashboard / Analytics Types
// ============================================================================

export interface DashboardKpiData {
  totalUnits: number;
  totalVehicles: number;
  totalGenerators: number;
  activeVehicles: number;
  activeGenerators: number;
  totalDrivers: number;
  activeDrivers: number;
  totalDistance: number;
  fuelEfficiency: number;
  avgSpeed: number;
  onTimeDelivery: number;
  safetyScore: number;
  totalRoutes: number;
  completedRoutes: number;
  inProgressRoutes: number;
  generatorUptime: number;
  avgGeneratorLoad: number;
  fleetUtilization?: number;
}

export interface FuelConsumptionData {
  day: string;
  consumption: number;
}

export interface TripsByHourData {
  hour: string;
  trips: number;
}

export interface VehicleUtilizationData {
  name: string;
  value: number;
  fill: string;
}

export interface DriverPerformanceData {
  name: string;
  score: number;
}

export interface ChartData {
  fuelConsumption: FuelConsumptionData[];
  tripsByHour: TripsByHourData[];
  vehicleUtilization: VehicleUtilizationData[];
  driverPerformance: DriverPerformanceData[];
}

// ============================================================================
// Service Interface
// ============================================================================

/**
 * Fleet Service Interface
 *
 * This interface defines all fleet operations.
 * Both Mock and Wialon implementations must follow this contract.
 */
export interface IFleetService {
  // --- Connection ---
  initialize(): Promise<boolean>;
  isConnected(): boolean;

  // --- Vehicles ---
  getVehicles(filters?: VehicleFilters): Promise<Vehicle[]>;
  getVehicleById(id: string): Promise<Vehicle | null>;
  getVehiclePositions(vehicleIds: string[]): Promise<VehiclePosition[]>;

  // --- Generators ---
  getGenerators(): Promise<Generator[]>;
  getGeneratorById(id: string): Promise<Generator | null>;
  getMachinery(): Promise<import('@/types').Machinery[]>;
  getGeneratorEngineHours(filters?: GeneratorEngineHoursFilters): Promise<GeneratorEngineHours[]>;
  getGeneratorFuelTransactions(filters?: FuelTransactionFilters): Promise<FuelTransaction[]>;
  getMachineryFuelTransactions(filters?: FuelTransactionFilters): Promise<FuelTransaction[]>;
  getFuelFleetSummary(): Promise<import('@/lib/fuelTypes').FuelFleetSummary>;

  // --- Fleet Stats ---
  getFleetStats(): Promise<FleetStats>;

  // --- Fuel ---
  getFuelLevels(): Promise<Map<string, number>>;
  getFuelStats(unitId: string, days?: number): Promise<FuelStats>;
  getFuelReport(unitId: string, dateRange: DateRange): Promise<FuelReport>;
  getFuelAlerts(hours?: number): Promise<FuelEvent[]>;

  // --- Drivers ---
  getDrivers(): Promise<Driver[]>;
  getDriverById(id: string): Promise<Driver | null>;

  // --- Routes ---
  getRoutes(): Promise<Route[]>;
  getRouteById(id: string): Promise<Route | null>;

  // --- Alerts ---
  getAlerts(): Promise<Alert[]>;
  acknowledgeAlert(alertId: string): Promise<boolean>;

  // --- Fuel Transactions ---
  getFuelTransactions(filters?: FuelTransactionFilters): Promise<FuelTransaction[]>;
  getFuelTransactionsMeta?(
    filters?: FuelTransactionFilters,
  ): Promise<{ transactions: FuelTransaction[]; warming: boolean; needsRefresh?: boolean }>;
  getFuelKpis(): Promise<FuelKpiData>;
  getFuelByVehicle(): Promise<FuelByVehicle[]>;
  getMonthlyFuelTrend(): Promise<MonthlyFuelTrend[]>;
  getFuelStations(): Promise<FuelStation[]>;

  // --- Dashboard / Analytics ---
  getDashboardKpis(): Promise<DashboardKpiData>;
  getChartData(): Promise<ChartData>;
}

// ============================================================================
// Service Configuration
// ============================================================================

export type FleetServiceType = 'mock' | 'backend' | 'wialon';

export interface FleetServiceConfig {
  /** Use mock data instead of real API */
  useMock: boolean;
  /** Service type: 'mock', 'backend' (Supabase Edge Functions), or 'wialon' (direct) */
  serviceType?: FleetServiceType;
  /** Wialon API URL (required for wialon service type) */
  wialonApiUrl?: string;
  /** Wialon API token (required for wialon service type) */
  wialonToken?: string;
  /** Simulated delay for mock data (ms) */
  mockDelay?: number;
}

