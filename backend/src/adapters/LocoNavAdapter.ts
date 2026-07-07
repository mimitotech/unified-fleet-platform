import type { FleetAsset, AssetStatus, AssetLocation, FleetAlert } from '@ufp/shared';
import { BaseAdapter, type AdapterCredentials } from './BaseAdapter.js';
import {
  extractLocoNavVehicles,
  locoNavVehicleId,
  locoNavVehicleName,
  type LocoNavVehicle,
} from './loconavUtils.js';

/** LocoNav Integration API v1 — same paths as working Mamsvv loconav-api edge function */
const LOCONAV_VEHICLES_PATH = '/integration/api/v1/vehicles';

export class LocoNavAdapter extends BaseAdapter {
  private baseUrl: string;
  private authToken: string;

  constructor(config: AdapterCredentials) {
    super(config);
    this.baseUrl = (config.baseUrl || process.env.LOCONAV_API_URL || 'https://api.a.loconav.com').replace(/\/$/, '');
    this.authToken = (config.userAuthentication || config.token || '').trim();
  }

  getSourceType() {
    return 'loconav' as const;
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'User-Authentication': this.authToken,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(
          `LocoNav API error: ${res.status}${detail ? ` — ${detail.slice(0, 240)}` : ''}. ` +
            'Check User-Authentication token and LOCONAV_API_URL (https://api.a.loconav.com or https://api.loconav.com).'
        );
      }
      return res.json();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('LocoNav API request timed out after 15s');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async connect(): Promise<void> {
    if (!this.authToken) throw new Error('LocoNav User-Authentication token not configured');
    await this.request('GET', `${LOCONAV_VEHICLES_PATH}?page=1&perPage=1`);
  }

  async testConnection(): Promise<boolean> {
    await this.connect();
    return true;
  }

  async getAssets(): Promise<FleetAsset[]> {
    const vehicles: LocoNavVehicle[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const result = await this.request('GET', `${LOCONAV_VEHICLES_PATH}?page=${page}&perPage=${perPage}`);
      const batch = extractLocoNavVehicles(result);
      if (!batch.length) break;
      vehicles.push(...batch);
      if (batch.length < perPage) break;
      page++;
      if (page > 50) break;
    }

    return vehicles
      .filter((v) => locoNavVehicleId(v))
      .map((v) => ({
        id: locoNavVehicleId(v),
        name: locoNavVehicleName(v),
        registrationPlate: v.vehicleNumber,
      }));
  }

  async getAssetStatus(assetId: string): Promise<AssetStatus> {
    const result = (await this.request('GET', `${LOCONAV_VEHICLES_PATH}/${assetId}`)) as Record<string, unknown>;
    const vehicle = (result.data as Record<string, unknown>) || result;
    const telematics = await this.request('POST', '/integration/api/v1/vehicles/telematics/last_known?page=1&perPage=1', {
      vehicleIds: [assetId],
      sensors: ['gps', 'ignition'],
    }).catch(() => null);

    let lat = 0;
    let lng = 0;
    let speed = 0;
    let timestamp = new Date();
    let moving = false;
    let idle = false;
    let engineOn = false;

    if (telematics) {
      const values = extractTelematicsValues(telematics);
      const row = values.find((v) => v.vehicleId === assetId) || values[0];
      if (row) {
        lat = row.latitude;
        lng = row.longitude;
        speed = row.speed ?? 0;
        timestamp = row.timestamp;
        moving = row.movementStatus === 'MOVING' || (row.speed ?? 0) > 0;
        idle = row.movementStatus === 'IDLE' || row.ignition === true;
        engineOn = row.ignition === true;
      }
    }

    const vLat = (vehicle.latitude as number) ?? lat;
    const vLng = (vehicle.longitude as number) ?? lng;

    return {
      status: moving ? 'moving' : idle ? 'idle' : 'stopped',
      location: {
        latitude: vLat || lat,
        longitude: vLng || lng,
        speed,
        timestamp,
      },
      engineState: engineOn,
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

function extractTelematicsValues(data: unknown): Array<{
  vehicleId: string;
  latitude: number;
  longitude: number;
  speed?: number;
  timestamp: Date;
  ignition?: boolean;
  movementStatus?: string;
}> {
  const root = data as Record<string, unknown>;
  let raw: Array<Record<string, unknown>> = [];

  if (root.success && (root.data as Record<string, unknown>)?.values) {
    raw = (root.data as Record<string, unknown>).values as Array<Record<string, unknown>>;
  } else if ((root.data as Record<string, unknown>)?.values) {
    raw = (root.data as Record<string, unknown>).values as Array<Record<string, unknown>>;
  } else if (Array.isArray(root.values)) {
    raw = root.values as Array<Record<string, unknown>>;
  } else if (Array.isArray(root.data)) {
    raw = root.data as Array<Record<string, unknown>>;
  }

  return raw.map((item) => {
    const gps = item.gps as Record<string, unknown> | undefined;
    const coords = gps?.currentLocationCoordinates as Record<string, unknown> | undefined;
    const lat = (coords?.lat as { value?: number })?.value ?? 0;
    const lng = (coords?.long as { value?: number })?.value ?? 0;
    const speed = (gps?.speed as { value?: number })?.value;
    const ignitionVal = (gps?.ignition as { value?: string })?.value;
    const movement = (gps?.movement as { movementStatus?: string })?.movementStatus;
    const ts =
      (coords?.lat as { timestamp?: number })?.timestamp ||
      (gps?.speed as { timestamp?: number })?.timestamp ||
      Date.now() / 1000;

    return {
      vehicleId: String(item.vehicleId || ''),
      latitude: lat,
      longitude: lng,
      speed,
      timestamp: new Date(typeof ts === 'number' ? ts * 1000 : Date.now()),
      ignition: ignitionVal === 'ON' || ignitionVal === 'true',
      movementStatus: movement,
    };
  });
}
