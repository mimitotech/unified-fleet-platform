/**
 * Workshop & Maintenance Type Definitions
 * 
 * Types for vehicle inspections, maintenance logs, breakdowns, and cost tracking.
 * Fleet-centric approach: vehicles are the primary entity with maintenance history attached.
 */

// ============================================================================
// Inspection Types
// ============================================================================

export type InspectionType = 'pre-trip' | 'post-trip' | 'pre-delivery' | 'scheduled';
export type InspectionStatus = 'pass' | 'fail' | 'needs-attention';
export type ChecklistItemStatus = 'ok' | 'issue' | 'na';

/** Individual checklist item for inspections */
export interface ChecklistItem {
  id: string;
  name: string;
  category: 'truck-head' | 'trailer' | 'safety' | 'general';
  status: ChecklistItemStatus;
  comment?: string;
}

/** Pre/Post Trip Vehicle Inspection */
export interface VehicleInspection {
  id: string;
  vehicleId: string;
  vehicleName: string;
  vehiclePlate: string;
  driverId: string | null;
  driverName: string | null;
  inspectionType: InspectionType;
  inspectionDate: string; // ISO date
  odometerReading: number;
  nextServiceMileage?: number;
  truckHeadChecklist: ChecklistItem[];
  trailerChecklist: ChecklistItem[];
  overallStatus: InspectionStatus;
  notes?: string;
  inspectorName?: string;
  createdAt: string;
}

// ============================================================================
// Maintenance Types
// ============================================================================

export type MaintenanceType = 'scheduled' | 'repair' | 'breakdown' | 'preventive';
export type MaintenanceStatus = 'pending' | 'in-progress' | 'completed' | 'cancelled';
export type MaintenancePriority = 'low' | 'medium' | 'high' | 'critical';

/** Part used in maintenance */
export interface MaintenancePart {
  id: string;
  name: string;
  partNumber?: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

/** Maintenance Log Entry */
export interface MaintenanceLog {
  id: string;
  vehicleId: string;
  vehicleName: string;
  vehiclePlate: string;
  driverId?: string | null;
  driverName?: string;
  inspectionId?: string; // If triggered by inspection
  breakdownId?: string; // If triggered by breakdown
  maintenanceType: MaintenanceType;
  priority: MaintenancePriority;
  description: string;
  mechanicName: string;
  startDate: string;
  endDate?: string;
  laborHours: number;
  laborCost: number;
  partsCost: number;
  totalCost: number;
  partsUsed: MaintenancePart[];
  status: MaintenanceStatus;
  notes?: string;
  // Scheduled service fields (only for maintenanceType === 'scheduled')
  odometerReading?: number;
  nextServiceKm?: number;
  nextServiceHours?: number;
  nextServiceDays?: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Breakdown Types
// ============================================================================

export type BreakdownSeverity = 'minor' | 'major' | 'critical';

/** Breakdown Report */
export interface BreakdownReport {
  id: string;
  vehicleId: string;
  vehicleName: string;
  vehiclePlate: string;
  driverId: string | null;
  driverName: string | null;
  tripId?: string;
  location: {
    lat: number;
    lng: number;
    address?: string;
  };
  breakdownTime: string;
  resolutionTime?: string;
  severity: BreakdownSeverity;
  description: string;
  cause?: string;
  resolution?: string;
  downtimeHours: number;
  towingCost: number;
  repairCost: number;
  totalCost: number;
  maintenanceLogId?: string; // Link to resulting maintenance
  createdAt: string;
}

// ============================================================================
// Mechanic / Workshop Types
// ============================================================================

export interface Mechanic {
  id: string;
  name: string;
  phone: string;
  specialization?: string;
  hourlyRate: number;
  isExternal: boolean; // Internal vs external mechanic
  workshopName?: string; // For external mechanics
}

// ============================================================================
// Fleet Maintenance Summary (Vehicle-centric view)
// ============================================================================

/** Maintenance summary for a single vehicle */
export interface VehicleMaintenanceSummary {
  vehicleId: string;
  vehicleName: string;
  vehiclePlate: string;
  vehicleType: string;
  lastInspectionDate: string | null;
  lastInspectionStatus: InspectionStatus | null;
  nextServiceDue: number | null; // Mileage
  currentMileage: number;
  totalMaintenanceCost: number;
  pendingMaintenanceCount: number;
  breakdownCount: number;
  avgRepairTime: number; // Hours
  healthScore: number; // 0-100
}

/** Workshop KPIs */
export interface WorkshopKpis {
  totalMaintenanceCost: number;
  totalBreakdownCost: number;
  vehiclesNeedingService: number;
  activeMaintenanceJobs: number;
  avgRepairTime: number;
  inspectionPassRate: number;
  fleetHealthScore: number;
}

