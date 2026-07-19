import type { FleetAsset, AssetStatus, AssetLocation, FleetAlert, SourceType } from '@ufp/shared';

export type { FleetAsset, AssetStatus, AssetLocation, FleetAlert, SourceType };

export interface AdapterCredentials {
  baseUrl?: string;
  token?: string;
  /** Wialon billing account / resource id — limits unit sync to one client account */
  accountId?: string | number;
  /** Wialon user id or name for token/login operateAs */
  operateAs?: string | number;
  userAuthentication?: string;
  /** TrackSolid / legacy alias */
  apiKey?: string;
  secretKey?: string;
  /** TrackSolid Pro (Jimi) */
  appKey?: string;
  appSecret?: string;
  account?: string;
  userId?: string;
  password?: string;
  passwordMd5?: string;
  userPwdMd5?: string;
  refreshToken?: string;
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
  /** Release remote sessions (Wialon token/login). */
  disconnect?(): Promise<void>;
}
