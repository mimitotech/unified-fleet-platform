import type { FleetAsset, AssetStatus, AssetLocation, FleetAlert } from '@ufp/shared';
import { BaseAdapter, type AdapterCredentials } from './BaseAdapter.js';

/** TrackSolid Pro adapter — stub until API credentials are configured. */
export class TrackSolidAdapter extends BaseAdapter {
  private baseUrl: string;
  private apiKey: string;
  private secretKey: string;

  constructor(config: AdapterCredentials) {
    super(config);
    this.baseUrl = config.baseUrl || process.env.TRACKSOLID_API_URL || 'https://api.tracksolid.com';
    this.apiKey = config.apiKey || '';
    this.secretKey = config.secretKey || '';
  }

  getSourceType() {
    return 'tracksolid' as const;
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'X-API-Key': this.apiKey,
        'X-Secret-Key': this.secretKey,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`TrackSolid API error: ${res.status}`);
    return res.json();
  }

  async connect(): Promise<void> {
    if (!this.apiKey) return;
    try {
      await this.request('GET', '/api/auth/verify');
    } catch {
      // Stub mode when API unavailable
    }
  }

  async testConnection(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      await this.connect();
      return true;
    } catch {
      return false;
    }
  }

  async getAssets(): Promise<FleetAsset[]> {
    if (!this.apiKey) return [];
    try {
      const result = (await this.request('GET', '/api/assets')) as Array<{
        id: string;
        name: string;
        plate?: string;
        vin?: string;
        make?: string;
        model?: string;
        year?: number;
      }>;
      return (result || []).map((a) => ({
        id: String(a.id),
        name: a.name,
        registrationPlate: a.plate,
        vin: a.vin,
        make: a.make,
        model: a.model,
        year: a.year,
      }));
    } catch {
      return [];
    }
  }

  async getAssetStatus(assetId: string): Promise<AssetStatus> {
    if (!this.apiKey) {
      return { status: 'offline', location: { latitude: 0, longitude: 0, timestamp: new Date() } };
    }
    try {
      const r = (await this.request('GET', `/api/assets/${assetId}/status`)) as {
        moving?: boolean;
        engine_on?: boolean;
        latitude: number;
        longitude: number;
        speed?: number;
        fuel_level?: number;
        timestamp: number;
      };
      return {
        status: r.moving ? 'moving' : r.engine_on ? 'idle' : 'stopped',
        location: {
          latitude: r.latitude,
          longitude: r.longitude,
          speed: r.speed,
          timestamp: new Date(r.timestamp * 1000),
        },
        engineState: r.engine_on,
        fuelLevel: r.fuel_level,
        source: 'tracksolid',
      };
    } catch {
      return { status: 'offline', location: { latitude: 0, longitude: 0, timestamp: new Date() } };
    }
  }

  async getAssetHistory(assetId: string, from: Date, to: Date): Promise<AssetLocation[]> {
    if (!this.apiKey) return [];
    try {
      const result = (await this.request('GET', `/api/assets/${assetId}/history`, {
        from: Math.floor(from.getTime() / 1000),
        to: Math.floor(to.getTime() / 1000),
      })) as Array<{ lat: number; lng: number; speed?: number; timestamp: number }>;
      return (result || []).map((h) => ({
        latitude: h.lat,
        longitude: h.lng,
        speed: h.speed,
        timestamp: new Date(h.timestamp * 1000),
      }));
    } catch {
      return [];
    }
  }

  async getAlerts(from: Date, to: Date): Promise<FleetAlert[]> {
    if (!this.apiKey) return [];
    try {
      const result = (await this.request('GET', '/api/alerts', {
        from: Math.floor(from.getTime() / 1000),
        to: Math.floor(to.getTime() / 1000),
      })) as Array<{
        id: string;
        type: string;
        severity: string;
        title: string;
        description?: string;
        lat?: number;
        lng?: number;
        timestamp: number;
        video_url?: string;
      }>;
      return (result || []).map((a) => ({
        id: a.id,
        type: a.type,
        severity: a.severity === 'high' ? 'critical' : 'warning',
        title: a.title,
        description: a.description,
        latitude: a.lat,
        longitude: a.lng,
        timestamp: new Date(a.timestamp * 1000),
        videoUrl: a.video_url,
        sourceType: 'tracksolid',
        externalId: a.id,
      }));
    } catch {
      return [];
    }
  }
}
