export type SourceType = 'wialon' | 'loconav' | 'tracksolid';
export type AssetMotionStatus = 'moving' | 'idle' | 'stopped' | 'offline';
export interface AssetLocation {
    latitude: number;
    longitude: number;
    speed?: number;
    altitude?: number;
    timestamp: Date;
}
export interface FleetAsset {
    id: string;
    name: string;
    registrationPlate?: string;
    vin?: string;
    make?: string;
    model?: string;
    year?: number;
    sources?: Array<{
        type: SourceType;
        id: string;
    }>;
}
export interface AssetStatus {
    status: AssetMotionStatus;
    location: AssetLocation;
    engineState?: boolean;
    fuelLevel?: number;
    source?: SourceType;
}
export interface UnifiedAsset extends FleetAsset {
    tenantId?: string;
    sources: Array<{
        type: SourceType;
        id: string;
    }>;
}
