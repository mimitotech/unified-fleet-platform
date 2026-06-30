import type { FleetAsset, AssetStatus, AssetLocation, FleetAlert } from '@ufp/shared';
import { BaseAdapter, type AdapterCredentials } from './BaseAdapter.js';

export class LocoNavAdapter extends BaseAdapter {
  private baseUrl: string;
  private authToken: string;

  constructor(config: AdapterCredentials) {
    super(config);
    this.baseUrl = config.baseUrl || process.env.LOCONAV_API_URL || 'https://api.a.loconav.com';
    this.authToken = config.userAuthentication || config.token || '';
  }

  getSourceType() {
    return 'loconav' as const;
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'User-Authentication': this.authToken,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`LocoNav API error: ${res.status}`);
    return res.json();
  }

  async connect(): Promise<void> {
    await this.request('GET', '/api/v5/vehicles?per_page=1');
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.connect();
      return true;
    } catch {
      return false;
    }
  }

  async getAssets(): Promise<FleetAsset[]> {
    const result = (await this.request('GET', '/api/v5/vehicles?per_page=500')) as {
      data?: Array<{ id: string; name?: string; vehicle_number?: string }>;
    };
    const items = result.data || (result as unknown as FleetAsset[]);
    if (!Array.isArray(items)) return [];
    return items.map((v: { id: string; name?: string; vehicle_number?: string }) => ({
      id: String(v.id),
      name: v.name || v.vehicle_number || `Vehicle ${v.id}`,
      registrationPlate: v.vehicle_number,
    }));
  }

  async getAssetStatus(assetId: string): Promise<AssetStatus> {
    const result = (await this.request('GET', `/api/v5/vehicles/${assetId}`)) as {
      data?: {
        latitude?: number;
        longitude?: number;
        is_moving?: boolean;
        is_idle?: boolean;
        engine_state?: boolean;
        fuel_level?: number;
        last_updated?: string;
      };
    };
    const v = result.data || (result as AssetStatus);
    const lat = (v as { latitude?: number }).latitude ?? 0;
    const lng = (v as { longitude?: number }).longitude ?? 0;
    const moving = (v as { is_moving?: boolean }).is_moving;
    const idle = (v as { is_idle?: boolean }).is_idle;
    return {
      status: moving ? 'moving' : idle ? 'idle' : 'stopped',
      location: {
        latitude: lat,
        longitude: lng,
        timestamp: new Date((v as { last_updated?: string }).last_updated || Date.now()),
      },
      engineState: (v as { engine_state?: boolean }).engine_state,
      fuelLevel: (v as { fuel_level?: number }).fuel_level,
      source: 'loconav',
    };
  }

  async getAssetHistory(assetId: string, from: Date, to: Date): Promise<AssetLocation[]> {
    void assetId;
    void from;
    void to;
    return [];
  }

  async getAlerts(from: Date, to: Date): Promise<FleetAlert[]> {
    void from;
    void to;
    return [];
  }
}
