/**
 * Workshop & Maintenance Type Definitions
 *
 * Supports vehicles, generators, and machinery with category-aware checklists.
 */

// ============================================================================
// Asset category
// ============================================================================

export type WorkshopAssetCategory = 'vehicle' | 'generator' | 'machinery';

// ============================================================================
// Inspection Types
// ============================================================================

export type InspectionType = 'pre-trip' | 'post-trip' | 'pre-delivery' | 'scheduled';
export type InspectionStatus = 'pass' | 'fail' | 'needs-attention';
export type ChecklistItemStatus = 'pending' | 'ok' | 'issue' | 'na';

/** Individual checklist item for inspections */
export interface ChecklistItem {
  id: string;
  name: string;
  /** Free-form section key (truck-head, engine, hydraulics, …) */
  category: string;
  status: ChecklistItemStatus;
  comment?: string;
}

/** Named section of a category-specific inspection checklist */
export interface ChecklistSection {
  id: string;
  title: string;
  items: ChecklistItem[];
}

/** Pre/Post Trip / Pre-delivery Inspection */
export interface VehicleInspection {
  id: string;
  vehicleId: string;
  vehicleName: string;
  vehiclePlate: string;
  assetCategory?: WorkshopAssetCategory;
  driverId: string | null;
  driverName: string | null;
  inspectionType: InspectionType;
  inspectionDate: string; // ISO date
  odometerReading: number;
  engineHours?: number | null;
  nextServiceMileage?: number;
  /** Preferred storage for category-aware checklists */
  checklistSections?: ChecklistSection[];
  /** Legacy dual-write fields (first two sections flattened) */
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
  assetCategory?: WorkshopAssetCategory;
  driverId?: string | null;
  driverName?: string;
  inspectionId?: string;
  breakdownId?: string;
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
  odometerReading?: number;
  engineHours?: number | null;
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
  assetCategory?: WorkshopAssetCategory;
  failureSystem?: string | null;
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
  maintenanceLogId?: string;
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
  isExternal: boolean;
  workshopName?: string;
}

// ============================================================================
// Fleet Maintenance Summary
// ============================================================================

export interface VehicleMaintenanceSummary {
  vehicleId: string;
  vehicleName: string;
  vehiclePlate: string;
  vehicleType: string;
  lastInspectionDate: string | null;
  lastInspectionStatus: InspectionStatus | null;
  nextServiceDue: number | null;
  currentMileage: number;
  totalMaintenanceCost: number;
  pendingMaintenanceCount: number;
  breakdownCount: number;
  avgRepairTime: number;
  healthScore: number;
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
