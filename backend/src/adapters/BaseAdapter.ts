import type { FleetAsset, AssetStatus, AssetLocation, FleetAlert, SourceType } from '@ufp/shared';

export type { FleetAsset, AssetStatus, AssetLocation, FleetAlert, SourceType };

export interface AdapterCredentials {
  baseUrl?: string;
  token?: string;
  accountId?: string;
  userAuthentication?: string;
  apiKey?: string;
  secretKey?: string;
}

export abstract class BaseAdapter {
  protected config: AdapterCredentials;

  constructor(config: AdapterCredentials) {
    this.config = config;
  }

  abstract getSourceType(): SourceType;
  abstract connect(): Promise<void>;
  abstract testConnection(): Promise<boolean>;
  abstract getAssets(): Promise<FleetAsset[]>;
  abstract getAssetStatus(assetId: string): Promise<AssetStatus>;
  abstract getAssetHistory(assetId: string, from: Date, to: Date): Promise<AssetLocation[]>;
  abstract getAlerts(from: Date, to: Date): Promise<FleetAlert[]>;
  sendCommand?(assetId: string, command: string, params: Record<string, unknown>): Promise<unknown>;
}
