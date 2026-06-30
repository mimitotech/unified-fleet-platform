import type { FleetAsset, AssetStatus, AssetLocation, FleetAlert } from '@ufp/shared';
import { BaseAdapter, type AdapterCredentials } from './BaseAdapter.js';

interface WialonSearchResult {
  items: Array<{
    id: number;
    nm: string;
    pos?: { x: number; y: number; s: number; z?: number; t: number; sc?: number };
    prp?: Record<string, string>;
  }>;
}

export class WialonAdapter extends BaseAdapter {
  private sessionId: string | null = null;
  private baseUrl: string;
  private token: string;

  constructor(config: AdapterCredentials) {
    super(config);
    this.baseUrl = config.baseUrl || process.env.WIALON_API_URL || 'https://hst-api.wialon.com/wialon/ajax.html';
    this.token = config.token || '';
  }

  getSourceType() {
    return 'wialon' as const;
  }

  async connect(): Promise<void> {
    if (!this.token) throw new Error('Wialon token not configured');
    const params = new URLSearchParams({
      svc: 'token/login',
      params: JSON.stringify({ token: this.token }),
    });
    const res = await fetch(`${this.baseUrl}?${params}`);
    const data = await res.json();
    if (data.error) throw new Error(`Wialon login failed: ${data.error}`);
    this.sessionId = data.eid;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.connect();
      return true;
    } catch {
      return false;
    }
  }

  private async request<T>(svc: string, params: Record<string, unknown>): Promise<T> {
    if (!this.sessionId) await this.connect();
    const urlParams = new URLSearchParams({
      svc,
      params: JSON.stringify(params),
      sid: this.sessionId!,
    });
    const res = await fetch(`${this.baseUrl}?${urlParams}`);
    const data = await res.json();
    if (data.error === 1) {
      this.sessionId = null;
      await this.connect();
      return this.request(svc, params);
    }
    if (data.error) throw new Error(`Wialon API error: ${data.error}`);
    return data as T;
  }

  async getAssets(): Promise<FleetAsset[]> {
    const result = await this.request<WialonSearchResult>('core/search_items', {
      spec: {
        itemsType: 'avl_unit',
        propName: 'sys_name',
        propValueMask: '*',
        sortType: 'sys_name',
      },
      flags: 1,
      from: 0,
      to: 0,
    });
    return (result.items || []).map((item) => ({
      id: String(item.id),
      name: item.nm,
      registrationPlate: item.prp?.registration_plate || item.prp?.plate || undefined,
      vin: item.prp?.vin,
      make: item.prp?.brand,
      model: item.prp?.model,
      year: item.prp?.year ? parseInt(item.prp.year, 10) : undefined,
    }));
  }

  async getAssetStatus(assetId: string): Promise<AssetStatus> {
    const result = await this.request<{ item: WialonSearchResult['items'][0] }>('core/search_item', {
      id: parseInt(assetId, 10),
      flags: 1025,
    });
    const pos = result.item?.pos;
    if (!pos) {
      return {
        status: 'offline',
        location: { latitude: 0, longitude: 0, timestamp: new Date() },
      };
    }
    const status = pos.s > 0 ? 'moving' : (pos.sc ?? 0) > 0 ? 'idle' : 'stopped';
    return {
      status,
      location: {
        latitude: pos.y,
        longitude: pos.x,
        speed: pos.s,
        altitude: pos.z,
        timestamp: new Date(pos.t * 1000),
      },
      engineState: pos.s > 0 || (pos.sc ?? 0) > 0,
      source: 'wialon',
    };
  }

  async getAssetHistory(assetId: string, from: Date, to: Date): Promise<AssetLocation[]> {
    const result = await this.request<{ messages: Array<{ pos: { x: number; y: number; s: number }; t: number }> }>(
      'messages/load_interval',
      {
        itemId: parseInt(assetId, 10),
        timeFrom: Math.floor(from.getTime() / 1000),
        timeTo: Math.floor(to.getTime() / 1000),
        flags: 1,
        flagsMask: 65281,
        loadCount: 1000,
      }
    );
    return (result.messages || []).map((m) => ({
      latitude: m.pos.y,
      longitude: m.pos.x,
      speed: m.pos.s,
      timestamp: new Date(m.t * 1000),
    }));
  }

  async getAlerts(from: Date, to: Date): Promise<FleetAlert[]> {
    void from;
    void to;
    return [];
  }

  async sendCommand(assetId: string, command: string, params: Record<string, unknown>) {
    return this.request('unit/exec_cmd', {
      itemId: parseInt(assetId, 10),
      commandName: command,
      param: params,
      timeout: 60,
    });
  }
}
