export interface Driver {
    id: string;
    tenantId: string;
    name: string;
    licenseNumber: string;
    phone: string;
    email?: string;
    status: 'available' | 'driving' | 'off-duty';
    assignedAssetId?: string;
    photoUrl?: string;
    createdAt: string;
    updatedAt: string;
}
export interface FleetRoute {
    id: string;
    tenantId: string;
    name: string;
    status: 'scheduled' | 'in-progress' | 'completed' | 'cancelled';
    assetId?: string;
    assetName?: string;
    assetPlate?: string;
    driverId?: string;
    driverName?: string;
    startTime: string;
    endTime?: string;
    actualStartTime?: string;
    distance: number;
    waypoints: unknown[];
    eta?: string;
    color: string;
    estimatedDuration: number;
    actualDuration?: number;
    fuelUsage?: number;
    notes?: string;
    createdAt: string;
}
export interface TripSummary {
    id: string;
    tripId: string;
    unitId: string;
    unitName: string;
    departureTime: string;
    arrivalTime: string;
    mileage: number;
    duration: number;
    fuelUsed: number;
    avgSpeed: number;
    maxSpeed: number;
}
export interface FuelTransaction {
    id: string;
    unitId: string;
    unitName: string;
    section: 'consumption' | 'filling' | 'theft' | 'dispensed';
    tank: string;
    timestamp: number;
    timeStr: string;
    filled: number;
    fuelUsed: number;
    mileage: number;
    avgConsumption: number;
}
export interface EcoViolation {
    id: string;
    unitId: string;
    unitName: string;
    violationType: string;
    severity: string;
    occurredAt: string;
    value?: number;
    threshold?: number;
    driverName?: string;
}
export interface WorkshopKpis {
    pendingMaintenance: number;
    completedThisMonth: number;
    openBreakdowns: number;
    inspectionsDue: number;
    totalMaintenanceCost: number;
}
export interface Geofence {
    id: string;
    name: string;
    type: 'circle' | 'polygon';
    center?: {
        lat: number;
        lng: number;
    };
    radius?: number;
    points?: unknown[];
    color: string;
    isActive: boolean;
}
export interface VideoStream {
    id: string;
    assetId: string;
    assetName: string;
    channel: string;
    status: 'online' | 'offline';
    thumbnailUrl?: string;
    streamUrl?: string;
    sourceType: string;
}
