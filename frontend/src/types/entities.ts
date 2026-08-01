/**
 * Entity Type Definitions
 *
 * Core business entity interfaces used throughout the MAMS application.
 * These represent the frontend data models transformed from API responses.
 */

import type {
  VehicleStatus,
  GeneratorStatus,
  DriverStatus,
  RouteStatus,
  AlertType,
  AlertSeverity,
  GpsStatus,
  VehicleType,
  UnitType,
  LicenseClass,
  RouteColor,
  FuelType,
} from './status';

// ============================================================================
// Fleet Units (Vehicles & Generators)
// ============================================================================

/**
 * Fuel information for a unit
 */
export interface FuelInfo {
  /** Current fuel level from sensor (liters or raw value) */
  level: number;
  /** Unit of fuel level measurement */
  unit: 'liters' | 'percent';
  /** Tank capacity in liters (if known) */
  tankCapacity?: number;
  /** Calculated percentage (0-100) based on level and capacity */
  percentage?: number;
  /** Source of tank capacity data */
  capacitySource?: 'sensor' | 'custom_field' | 'profile' | 'default';
  /** Per-sensor tank breakdown (main, reserve, etc.). Empty/omitted when only
   * a single fuel sensor exists. `level` is in the same unit as `FuelInfo.unit`. */
  tanks?: Array<{ name: string; level: number }>;
}

/**
 * Base Unit interface - all fleet assets (vehicles, generators, etc.) are "units" in Wialon
 * This mirrors the Wialon avl_unit type
 */
export interface BaseUnit {
  id: string;
  name: string;
  unitType: UnitType;
  status: VehicleStatus | GeneratorStatus;
  location: { lat: number; lng: number };
  lastUpdate: string;
  /** @deprecated Use fuelInfo instead. Kept for backward compatibility */
  fuel: number;
  /** @deprecated Use fuelInfo instead */
  fuelUnit?: 'liters' | 'percent';
  /** Extended fuel information with tank capacity and percentage */
  fuelInfo?: FuelInfo;
}

/**
 * Vehicle - mobile fleet asset (truck, van, car, boda)
 */
export interface Vehicle extends BaseUnit {
  unitType: 'vehicle';
  plate: string;
  vehicleType: VehicleType;
  status: VehicleStatus;
  driver: string | null;
  driverId: string | null;
  speed: number; // km/h (from GPS)
  mileage: number; // km (from counter/sensor)
  engineHours: number; // hours (from counter)
  // Generator-specific fields (optional for vehicles)
  siteName?: string;
  runningTimeToday?: number;
  power?: number;
  loadPercentage?: number;
}

/**
 * Generator - stationary fleet asset (diesel gensets, etc.)
 */
export interface Generator extends BaseUnit {
  unitType: 'generator';
  assetId: string;
  status: GeneratorStatus;
  runningTimeToday: number;
  totalRunningHours: number;
  siteName: string;
  power: number;
  loadPercentage?: number;
}

/** Union type for all fleet units */
export type FleetUnit = Vehicle | Generator | Machinery;

/**
 * Machinery — stationary plant / equipment with fuel sensors (excavators, cranes, compressors, etc.)
 */
export interface Machinery extends BaseUnit {
  unitType: 'machinery';
  assetId: string;
  status: GeneratorStatus;
  runningTimeToday: number;
  totalRunningHours: number;
  siteName: string;
  engineHours: number;
}

/**
 * Engine-hours interval for a generator, sourced from the Wialon
 * "Engine Hours Report (Group)" run against the [GENSETS] group.
 * One row per leaf interval emitted by the report (rollup parents discarded).
 */
export interface GeneratorEngineHours {
  id: string;                  // Deterministic hash(unitId|beginning|end)
  unitId: string;
  unitName: string;
  grouping: string;            // Verbatim from the report row, e.g. "[GENSETS]"
  beginning: number;           // Unix seconds
  end: number;                 // Unix seconds
  initialEngineHours: number;
  engineHours: number;         // Delta over [beginning, end]
  finalEngineHours: number;
}

/**
 * Generator enriched with aggregated period metrics derived from the
 * Engine Hours Report (Group) and the Fuel Report (Group). Period fields
 * are optional so callers without a date range still receive a valid
 * Generator-shaped record.
 */
export interface EnrichedGenerator extends Generator {
  runtimeHoursPeriod?: number;
  fuelConsumedPeriod?: number;
  fuelFilledPeriod?: number;
  fuelDrainsPeriod?: number;
  lastReportAt?: number;
  locationName?: string;
}

export interface EnrichedMachinery extends Machinery {
  runtimeHoursPeriod?: number;
  fuelConsumedPeriod?: number;
  fuelFilledPeriod?: number;
  fuelDrainsPeriod?: number;
  lastReportAt?: number;
  locationName?: string;
}

// ============================================================================
// Driver
// ============================================================================

export interface Driver {
  id: string;
  name: string;
  email: string;
  phone: string;
  license: string;
  licenseClass: LicenseClass;
  licenseExpiry: string;
  status: DriverStatus;
  vehicleId: string | null;
  vehicleName: string | null;
  totalTrips: number;
  safetyScore: number;
  avatar: string;
  videoViolations: number;
  gpsViolations: number;
  gpsStatus: GpsStatus;
  routeId: string | null;
  routeName: string | null;
  // Enhanced fields from Supabase
  hireDate?: string;
  notes?: string;
  employmentStatus?: 'active' | 'inactive' | 'suspended';
  // Vehicle inspection details
  vehiclePlate?: string;
  vehicleType?: string;
  vehicleStatus?: string;
  vehicleInspectionDate?: string;
  vehicleInspectionScore?: number;
  // Driver statistics from trip summaries and fuel data
  totalKmDriven?: number;
  totalFuelFilled?: number;
  totalFuelDrained?: number;
  totalFuelUsed?: number; // Alias for totalFuelDrained for clarity
  avgFuelPerKm?: number;
  maintenanceLogCount?: number;
  maintenanceCost?: number;
  violationsPerThousandKm?: number;
  // Utilization metrics (last 30 days)
  last30DaysKm?: number;
  last30DaysTrips?: number;
  // Performance score from driver_performance_snapshots
  latestPerformanceScore?: number | null;
  latestSnapshotDate?: string | null;
}

// ============================================================================
// Routes & Waypoints
// ============================================================================

/** Waypoint with geofence support */
export interface Waypoint {
  name: string;
  lat: number;
  lng: number;
  order: number;
  geofenceRadius?: number;
  estimatedArrival?: string;
  startTime?: string; // ISO timestamp for when vehicle should arrive at this waypoint
  endTime?: string; // ISO timestamp for when vehicle should leave this waypoint
  timeAllowance?: number; // +/- minutes allowance for arrival/departure
  distance?: number; // Distance from previous waypoint in kilometers (auto-calculated)
}

/** Waypoint with runtime tracking state */
export interface TrackedWaypoint extends Waypoint {
  completed: boolean;
  completedAt?: string;
  distanceFromVehicle?: number;
}

export interface Route {
  id: string;
  name: string;
  status: RouteStatus;
  vehicleId: string | null;
  vehicleName: string | null;
  vehiclePlate: string | null; // Vehicle registration/number plate
  driverId: string | null;
  driverName: string | null;
  startTime: string; // Scheduled start time
  endTime: string | null; // Actual end time (set on completion)
  actualStartTime?: string | null; // When route was actually started (vs scheduled)
  distance: number;
  waypoints: Waypoint[];
  eta: string;
  color: RouteColor;
  estimatedDuration: number;
  actualDuration?: number;
  fuelUsage?: number; // Fuel consumed in liters
  notes?: string;
  createdAt: string;
  createdBy?: string;
}

/** Route with real-time tracking state */
export interface TrackedRoute extends Omit<Route, 'waypoints'> {
  waypoints: TrackedWaypoint[];
  completedWaypointCount: number;
  progressPercent: number;
  lastVehiclePosition?: { lat: number; lng: number; speed?: number; timestamp: string };
  trackingActive: boolean;
}

// ============================================================================
// Alerts
// ============================================================================

/** Alert source - where the alert originated from */
export type AlertSource = 'gps' | 'video' | 'system';

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  vehicleId: string;
  vehicleName: string;
  timestamp: string;
  acknowledged: boolean;
  source?: AlertSource; // Optional for backward compatibility
}

// ============================================================================
// Fuel Management
// ============================================================================

export interface FuelStation {
  id: string;
  name: string;
  location: string;
  coordinates: { lat: number; lng: number };
  fuelTypes: FuelType[];
  pricePerLiter: { diesel: number; petrol: number; lpg?: number };
  isPreferred: boolean;
}

/** Section types for fuel report tables */
export type FuelSection = 'consumption' | 'filling' | 'theft' | 'dispensed';

/**
 * Fuel transaction from Wialon report template
 * Data comes from FLS (Fuel Level Sensor) readings for all 3 report sections:
 * - Fuel Consumption
 * - Fuel Fillings
 * - Sudden Fuel Drop (theft)
 */
export interface FuelTransaction {
  id: string;
  unitId: string;
  unitName: string;
  section: FuelSection; // Which report section this row came from
  tank: 'main' | 'reserve' | 'unknown'; // Which fuel tank this data is for
  timestamp: number; // Unix timestamp
  time: string; // Formatted time string
  location: string;

  // Common fuel level fields
  initialLevel: number;
  finalLevel: number;
  sensor: string;

  // Fuel Fillings section fields
  filled: number; // Liters filled (from FLS sensor)

  // Fuel Consumption section fields
  fuelUsed: number; // Liters consumed
  mileage: number; // Distance traveled (km)
  duration: string; // Duration string (e.g., "2h 30m")
  durationSeconds: number; // Duration in seconds
  avgConsumption: number; // L/100km or similar

  // Sudden Fuel Drop (theft) section fields
  suddenFuelDrop: number; // Liters dropped suddenly
  count: number; // Number of drop events

  // Location coordinates
  latitude?: number;
  longitude?: number;

  /** Exact Wialon report interval for group period totals (unix seconds). */
  periodFromTs?: number;
  periodToTs?: number;

  // Fields enriched from Google Sheets (matched by plate + timestamp)
  filledStation?: number; // Liters filled (from fuel station/Google Sheets)
  totalCost?: number;
  pricePerLiter?: number;
  cardNumber?: string;
  driverName?: string;
  odometer?: number;
  fuelType?: 'PETROL' | 'DIESEL' | string;

  // Current fuel level from Wialon sensor (for display in table)
  currentLevel?: number;

  // Enriched tank levels (combined from all tanks at this timestamp)
  // These fields show the current level of BOTH tanks at the time of this event
  mainTankLevel?: number; // Current level in main tank (liters)
  reserveTankLevel?: number; // Current level in reserve tank (liters)
}

/**
 * Fuel event (filling, theft, consumption) from Wialon
 */
export interface FuelEvent {
  type: 'filling' | 'theft' | 'consumption';
  unitId: string;
  unitName: string;
  timestamp: string; // ISO date string or time string
  location: { lat: number; lng: number };
  volumeChange: number; // Liters (positive for fill, negative for drain)
  levelBefore: number; // Fuel level before event
  levelAfter: number; // Fuel level after event
  // Additional fields from edge function
  section?: 'consumption' | 'filling' | 'theft';
  fuelUsed?: number;
  mileage?: number;
  duration?: string;
  durationSeconds?: number;
  avgConsumption?: number;
  suddenFuelDrop?: number;
  count?: number;
}

/**
 * Fleet fuel level for monitoring
 * Compares Wialon sensor reading with manual sheet entries
 */
export interface FleetFuelLevel {
  vehicleId: string;
  vehicle: string;
  fuelLevel: number; // From Wialon sensor (Ltrs in tank)
  sheetFuelLevel: number; // From Google Sheet (Ltrs recorded)
  tankCapacity: number;
  status: 'ok' | 'warning' | 'critical';
  lastRefuel: string;
  lastSheetUpdate: string;
}

// ============================================================================
// Geofences
// ============================================================================

/** Geofence type */
export type GeofenceType = 'line' | 'polygon' | 'circle';

/** Point in a geofence boundary */
export interface GeofencePoint {
  lat: number;
  lng: number;
  radius?: number; // For circle center points
}

/**
 * Geofence - geographic zone for monitoring vehicle entry/exit
 * Used for alerts, route boundaries, and location tracking
 */
export interface Geofence {
  id: string;
  resourceId: string; // Wialon resource containing this geofence
  name: string;
  description: string;
  type: GeofenceType;
  color: string; // Hex color for display
  points: GeofencePoint[]; // Boundary points (or center for circle)
  center?: { lat: number; lng: number }; // Calculated center
  area?: number; // Square meters
  perimeter?: number; // Meters
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Geofence with resource context
 * Used when fetching geofences from multiple resources
 */
export interface GeofenceWithResource extends Geofence {
  resourceName: string;
}

/**
 * Vehicle geofence status - which geofences a vehicle is currently inside
 */
export interface VehicleGeofenceStatus {
  vehicleId: string;
  vehicleName: string;
  insideGeofences: Geofence[];
  lastChecked: string;
}

