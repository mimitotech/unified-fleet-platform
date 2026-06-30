/**
 * Centralized Status Type Definitions
 *
 * Single source of truth for all status enums across the MAMS codebase.
 * Both frontend and backend types are defined here with clear mappings.
 */

// ============================================================================
// Vehicle Status
// ============================================================================

/**
 * Vehicle status - consistent across frontend and backend
 * Based on Wialon standard statuses:
 * - moving: Vehicle is in motion (green)
 * - idle: Vehicle is stationary with engine running (yellow/orange)
 * - stopped: Vehicle is parked with engine off (red)
 * - offline: No GPS signal or device offline (grey)
 */
export type VehicleStatus = 'moving' | 'idle' | 'stopped' | 'offline';

export const VEHICLE_STATUS = {
  MOVING: 'moving' as const,
  IDLE: 'idle' as const,
  STOPPED: 'stopped' as const,
  OFFLINE: 'offline' as const,
};

export const VEHICLE_STATUS_VALUES: VehicleStatus[] = ['moving', 'idle', 'stopped', 'offline'];

// ============================================================================
// Generator Status
// ============================================================================

/** Frontend generator status */
export type GeneratorStatus = 'running' | 'stopped' | 'offline';

/** Backend API generator status */
export type ApiGeneratorStatus = 'running' | 'idle' | 'offline';

export const GENERATOR_STATUS = {
  RUNNING: 'running' as const,
  STOPPED: 'stopped' as const,
  OFFLINE: 'offline' as const,
};

export const API_GENERATOR_STATUS = {
  RUNNING: 'running' as const,
  IDLE: 'idle' as const,
  OFFLINE: 'offline' as const,
};

/** Map backend generator status to frontend */
export const GENERATOR_STATUS_FROM_API: Record<ApiGeneratorStatus, GeneratorStatus> = {
  running: 'running',
  idle: 'stopped',
  offline: 'offline',
};

/** Map frontend generator status to backend */
export const GENERATOR_STATUS_TO_API: Record<GeneratorStatus, ApiGeneratorStatus> = {
  running: 'running',
  stopped: 'idle',
  offline: 'offline',
};

// ============================================================================
// Driver Status
// ============================================================================

/** Frontend driver status */
export type DriverStatus = 'active' | 'on-trip' | 'off-duty';

/** Backend API driver status */
export type ApiDriverStatus = 'available' | 'driving' | 'off-duty';

export const DRIVER_STATUS = {
  ACTIVE: 'active' as const,
  ON_TRIP: 'on-trip' as const,
  OFF_DUTY: 'off-duty' as const,
};

export const API_DRIVER_STATUS = {
  AVAILABLE: 'available' as const,
  DRIVING: 'driving' as const,
  OFF_DUTY: 'off-duty' as const,
};

/** Map backend driver status to frontend */
export const DRIVER_STATUS_FROM_API: Record<ApiDriverStatus, DriverStatus> = {
  available: 'active',
  driving: 'on-trip',
  'off-duty': 'off-duty',
};

/** Map frontend driver status to backend */
export const DRIVER_STATUS_TO_API: Record<DriverStatus, ApiDriverStatus> = {
  active: 'available',
  'on-trip': 'driving',
  'off-duty': 'off-duty',
};

// ============================================================================
// Route Status
// ============================================================================

/** Frontend route status - more granular */
export type RouteStatus = 'scheduled' | 'in-progress' | 'completed' | 'cancelled';

/** Backend API route status - simplified */
export type ApiRouteStatus = 'active' | 'inactive';

export const ROUTE_STATUS = {
  SCHEDULED: 'scheduled' as const,
  IN_PROGRESS: 'in-progress' as const,
  COMPLETED: 'completed' as const,
  CANCELLED: 'cancelled' as const,
};

export const API_ROUTE_STATUS = {
  ACTIVE: 'active' as const,
  INACTIVE: 'inactive' as const,
};

/** Map backend route status to frontend */
export const ROUTE_STATUS_FROM_API: Record<ApiRouteStatus, RouteStatus> = {
  active: 'in-progress',
  inactive: 'scheduled',
};

/** Map frontend route status to backend */
export const ROUTE_STATUS_TO_API: Record<RouteStatus, ApiRouteStatus> = {
  scheduled: 'inactive',
  'in-progress': 'active',
  completed: 'inactive',
  cancelled: 'inactive',
};

// ============================================================================
// Alert Types
// ============================================================================

/** Frontend alert type */
export type AlertType = 'speeding' | 'fuel-low' | 'geofence' | 'harsh-braking' | 'maintenance';

/** Backend API alert type - more comprehensive */
export type ApiAlertType = 'speeding' | 'geofence' | 'fuel' | 'maintenance' | 'connection' | 'sos';

/** Alert severity/priority - consistent naming */
export type AlertSeverity = 'critical' | 'warning' | 'info';
export type ApiAlertPriority = 'high' | 'medium' | 'low';

/** Alert status */
export type AlertStatus = 'active' | 'acknowledged' | 'resolved';

export const ALERT_TYPE = {
  SPEEDING: 'speeding' as const,
  FUEL_LOW: 'fuel-low' as const,
  GEOFENCE: 'geofence' as const,
  HARSH_BRAKING: 'harsh-braking' as const,
  MAINTENANCE: 'maintenance' as const,
};

export const API_ALERT_TYPE = {
  SPEEDING: 'speeding' as const,
  GEOFENCE: 'geofence' as const,
  FUEL: 'fuel' as const,
  MAINTENANCE: 'maintenance' as const,
  CONNECTION: 'connection' as const,
  SOS: 'sos' as const,
};

export const ALERT_SEVERITY = {
  CRITICAL: 'critical' as const,
  WARNING: 'warning' as const,
  INFO: 'info' as const,
};

export const API_ALERT_PRIORITY = {
  HIGH: 'high' as const,
  MEDIUM: 'medium' as const,
  LOW: 'low' as const,
};

export const ALERT_STATUS = {
  ACTIVE: 'active' as const,
  ACKNOWLEDGED: 'acknowledged' as const,
  RESOLVED: 'resolved' as const,
};

/** Map backend alert priority to frontend severity */
export const ALERT_SEVERITY_FROM_PRIORITY: Record<ApiAlertPriority, AlertSeverity> = {
  high: 'critical',
  medium: 'warning',
  low: 'info',
};

/** Map frontend severity to backend priority */
export const ALERT_PRIORITY_FROM_SEVERITY: Record<AlertSeverity, ApiAlertPriority> = {
  critical: 'high',
  warning: 'medium',
  info: 'low',
};

/** Map backend alert type to frontend alert type */
export const ALERT_TYPE_FROM_API: Record<ApiAlertType, AlertType> = {
  speeding: 'speeding',
  geofence: 'geofence',
  fuel: 'fuel-low',
  maintenance: 'maintenance',
  connection: 'maintenance', // Map connection issues to maintenance
  sos: 'speeding', // Map SOS to speeding as closest match (urgent)
};

// ============================================================================
// GPS Status (Driver device tracking)
// ============================================================================

export type GpsStatus = 'online' | 'offline' | 'no-device';

export const GPS_STATUS = {
  ONLINE: 'online' as const,
  OFFLINE: 'offline' as const,
  NO_DEVICE: 'no-device' as const,
};

// ============================================================================
// Vehicle Types
// ============================================================================

/** Frontend vehicle types */
export type VehicleType = 'truck' | 'van' | 'car' | 'boda' | 'generator';

/** Backend API vehicle types */
export type ApiVehicleType = 'truck' | 'pickup' | 'motorcycle' | 'car' | 'bus' | 'van';

export const VEHICLE_TYPE = {
  TRUCK: 'truck' as const,
  VAN: 'van' as const,
  CAR: 'car' as const,
  BODA: 'boda' as const,
  GENERATOR: 'generator' as const,
};

export const API_VEHICLE_TYPE = {
  TRUCK: 'truck' as const,
  PICKUP: 'pickup' as const,
  MOTORCYCLE: 'motorcycle' as const,
  CAR: 'car' as const,
  BUS: 'bus' as const,
  VAN: 'van' as const,
};

/** Map backend vehicle type to frontend */
export const VEHICLE_TYPE_FROM_API: Record<ApiVehicleType, VehicleType> = {
  truck: 'truck',
  pickup: 'truck', // Map pickup to truck
  motorcycle: 'boda',
  car: 'car',
  bus: 'van', // Map bus to van
  van: 'van',
};

/** Map frontend vehicle type to backend */
export const VEHICLE_TYPE_TO_API: Record<VehicleType, ApiVehicleType> = {
  truck: 'truck',
  van: 'van',
  car: 'car',
  boda: 'motorcycle',
  generator: 'truck', // Generators don't exist in API, use truck as fallback
};

// ============================================================================
// Unit Types
// ============================================================================

export type UnitType = 'vehicle' | 'generator';

export const UNIT_TYPE = {
  VEHICLE: 'vehicle' as const,
  GENERATOR: 'generator' as const,
};

// ============================================================================
// License Classes
// ============================================================================

export type LicenseClass = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

export const LICENSE_CLASS = {
  A: 'A' as const,
  B: 'B' as const,
  C: 'C' as const,
  D: 'D' as const,
  E: 'E' as const,
  F: 'F' as const,
  G: 'G' as const,
  H: 'H' as const,
};

// ============================================================================
// Route Colors
// ============================================================================

export type RouteColor = 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'teal';

export const ROUTE_COLOR = {
  BLUE: 'blue' as const,
  GREEN: 'green' as const,
  ORANGE: 'orange' as const,
  RED: 'red' as const,
  PURPLE: 'purple' as const,
  TEAL: 'teal' as const,
};

// ============================================================================
// Fuel Types
// ============================================================================

export type FuelType = 'diesel' | 'petrol' | 'lpg';

export const FUEL_TYPE = {
  DIESEL: 'diesel' as const,
  PETROL: 'petrol' as const,
  LPG: 'lpg' as const,
};

export type FuelEventType = 'filling' | 'theft' | 'consumption';

export const FUEL_EVENT_TYPE = {
  FILLING: 'filling' as const,
  THEFT: 'theft' as const,
  CONSUMPTION: 'consumption' as const,
};
