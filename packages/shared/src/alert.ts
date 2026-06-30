import type { SourceType } from './asset.js';

export type AlertSeverity = 'info' | 'warning' | 'critical' | 'emergency';

export interface FleetAlert {
  id: string;
  type: string;
  severity: AlertSeverity;
  title: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  timestamp: Date;
  videoUrl?: string;
  sourceType: SourceType;
  externalId?: string;
  assetId?: string;
  acknowledged?: boolean;
}
