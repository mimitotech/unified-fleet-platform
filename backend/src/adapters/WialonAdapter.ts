import type { FleetAsset, AssetStatus, AssetLocation, FleetAlert } from '@ufp/shared';
import { BaseAdapter, type AdapterCredentials } from './BaseAdapter.js';
import { WialonClient } from './wialonClient.js';
import {
  WIALON_SEARCH_PAGE_SIZE,
  WIALON_UNIT_FLAGS,
  type WialonSearchResult,
} from './wialonUtils.js';

export class WialonAdapter extends BaseAdapter {
  private client: WialonClient;

  constructor(config: AdapterCredentials) {
    super(config);
    this.client = new WialonClient({
      token: (config.token || '').trim(),
      baseUrl: config.baseUrl,
      operateAs: config.operateAs,
    });
  }

  getSourceType() {
    return 'wialon' as const;
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async testConnection(): Promise<boolean> {
    await this.connect();
    await this.searchUnits(0, 10);
    return true;
  }

  private request<T>(svc: string, params: Record<string, unknown>): Promise<T> {
    return this.client.request<T>(svc, params);
  }

  private unitSearchSpec(): Record<string, unknown> {
    const accountId = this.config.accountId;
    if (accountId !== undefined && accountId !== null && String(accountId).trim() !== '') {
      return {
        itemsType: 'avl_unit',
        propName: 'sys_billing_account_guid',
        propValueMask: String(accountId),
        sortType: 'sys_name',
        propType: 'property',
      };
    }
    return {
      itemsType: 'avl_unit',
      propName: 'sys_name',
      propValueMask: '*',
      sortType: 'sys_name',
    };
  }

  private async searchUnits(from: number, to: number, flags = WIALON_UNIT_FLAGS): Promise<WialonSearchResult> {
    return this.request<WialonSearchResult>('core/search_items', {
      spec: this.unitSearchSpec(),
      force: 1,
      flags,
      from,
      to,
    });
  }

  async getAssets(): Promise<FleetAsset[]> {
    const assets: FleetAsset[] = [];
    let from = 0;

    while (true) {
      const to = from + WIALON_SEARCH_PAGE_SIZE - 1;
      const result = await this.searchUnits(from, to);
      const items = result.items || [];
      for (const item of items) {
        assets.push({
          id: String(item.id),
          name: item.nm,
          registrationPlate: item.prp?.registration_plate || item.prp?.plate || undefined,
          vin: item.prp?.vin,
          make: item.prp?.brand,
          model: item.prp?.model,
          year: item.prp?.year ? parseInt(item.prp.year, 10) : undefined,
        });
      }
      const total = result.totalItemsCount ?? assets.length;
      if (items.length === 0 || assets.length >= total) break;
      from += WIALON_SEARCH_PAGE_SIZE;
    }

    return assets;
  }

  async getBulkAssetStatus(unitIds: string[]): Promise<Map<string, AssetStatus>> {
    const map = new Map<string, AssetStatus>();
    if (!unitIds.length) return map;

    const ids = unitIds.map((id) => parseInt(id, 10)).filter((n) => !Number.isNaN(n));
    if (!ids.length) return map;

    try {
      const rows = await this.request<Array<{
        i: number;
        pos?: { y: number; x: number; s: number; z?: number; t: number; sc?: number };
      }>>('unit/calc_last', { itemIds: ids });

      for (const row of rows || []) {
        const pos = row.pos;
        if (!pos) continue;
        const status = pos.s > 0 ? 'moving' : (pos.sc ?? 0) > 0 ? 'idle' : 'stopped';
        map.set(String(row.i), {
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
        });
      }
    } catch {
      for (const id of unitIds) {
        try {
          map.set(id, await this.getAssetStatus(id));
        } catch { /* skip */ }
      }
    }
    return map;
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
    const assets = await this.getAssets();
    const unitIds = assets
      .map((a) => parseInt(a.id, 10))
      .filter((id) => !Number.isNaN(id))
      .slice(0, 50);
    if (!unitIds.length) return [];

    const timeFrom = Math.floor(from.getTime() / 1000);
    const timeTo = Math.floor(to.getTime() / 1000);

    try {
      const result = await this.request<{
        count?: number;
        messages?: Array<{
          item_id?: number;
          t: number;
          f?: number;
          tp?: string;
          et?: string;
          x?: number;
          y?: number;
          p?: Record<string, unknown>;
        }>;
      }>('messages/get_task_messages', {
        itemIds: unitIds,
        timeFrom,
        timeTo,
        loadCount: 500,
      });

      const unitToAsset = new Map(
        assets.map((a) => [parseInt(a.id, 10), a.id])
      );

      return (result.messages || []).map((m) => {
        const p = m.p || {};
        const title =
          (p.task_evt_name as string) ||
          (p.name as string) ||
          m.et ||
          'Wialon event';
        const description =
          (p.task_description as string) ||
          (p.text as string) ||
          undefined;
        const severity =
          m.f && (m.f & 1) ? ('critical' as const) : ('warning' as const);
        return {
          id: `wialon-${m.item_id}-${m.t}`,
          type: m.tp || 'wialon_event',
          severity,
          title,
          description,
          latitude: m.y,
          longitude: m.x,
          timestamp: new Date(m.t * 1000),
          sourceType: 'wialon' as const,
          externalId: `${m.item_id}-${m.t}`,
          assetId: m.item_id ? unitToAsset.get(m.item_id) : undefined,
          acknowledged: false,
        };
      });
    } catch {
      return [];
    }
  }

  private resourceSearchSpec(): Record<string, unknown> {
    const accountId = this.config.accountId;
    if (accountId !== undefined && accountId !== null && String(accountId).trim() !== '') {
      return {
        itemsType: 'avl_resource',
        propName: 'sys_billing_account_guid',
        propValueMask: String(accountId),
        sortType: 'sys_name',
        propType: 'property',
      };
    }
    return {
      itemsType: 'avl_resource',
      propName: 'sys_name',
      propValueMask: '*',
      sortType: 'sys_name',
    };
  }

  private async searchResources(flags: number): Promise<WialonSearchResult['items']> {
    const all: WialonSearchResult['items'] = [];
    let from = 0;
    while (true) {
      const to = from + WIALON_SEARCH_PAGE_SIZE - 1;
      const result = await this.request<WialonSearchResult>('core/search_items', {
        spec: this.resourceSearchSpec(),
        force: 1,
        flags,
        from,
        to,
      });
      const items = result.items || [];
      all.push(...items);
      const total = result.totalItemsCount ?? all.length;
      if (items.length === 0 || all.length >= total) break;
      from += WIALON_SEARCH_PAGE_SIZE;
    }
    return all;
  }

  async getDrivers(): Promise<Array<{ id: string; name: string; licenseNumber?: string; phone?: string; email?: string }>> {
    try {
      const resources = await this.searchResources(257);
      const drivers: Array<{ id: string; name: string; licenseNumber?: string; phone?: string; email?: string }> = [];
      for (const resource of resources) {
        const detail = await this.request<{
          item?: { drvrs?: Record<string, { id: number; n: string; p?: string; c?: string }> };
        }>('core/search_item', { id: resource.id, flags: 257 });
        const drvrs = detail.item?.drvrs || {};
        for (const d of Object.values(drvrs)) {
          drivers.push({
            id: String(d.id),
            name: d.n,
            phone: d.p,
            licenseNumber: d.c || String(d.id),
          });
        }
      }
      if (drivers.length) return drivers;
    } catch { /* fallback */ }

    const result = await this.request<WialonSearchResult>('core/search_items', {
      spec: { itemsType: 'driver', propName: 'sys_name', propValueMask: '*', sortType: 'sys_name' },
      force: 1,
      flags: 1,
      from: 0,
      to: WIALON_SEARCH_PAGE_SIZE - 1,
    });
    return (result.items || []).map((d) => ({
      id: String(d.id),
      name: d.nm,
      licenseNumber: d.prp?.license || String(d.id),
      phone: d.prp?.phone,
      email: d.prp?.email,
    }));
  }

  async getGeofences(): Promise<Array<{ name: string; type: 'circle' | 'polygon'; center?: { lat: number; lng: number }; radius?: number; points?: unknown[]; color?: string }>> {
    const resources = await this.searchResources(4097);
    const zones: Array<{ name: string; type: 'circle' | 'polygon'; center?: { lat: number; lng: number }; radius?: number; points?: unknown[]; color?: string }> = [];
    for (const resource of resources) {
      const detail = await this.request<{
        item?: {
          zl?: Record<string, { id: number; n: string; t: number; w?: number; c?: number; b?: { cen_x: number; cen_y: number } }>;
        };
      }>('core/search_item', { id: resource.id, flags: 4097 });
      const zl = detail.item?.zl || {};
      for (const z of Object.values(zl)) {
        const color = z.c ? `#${(z.c & 0xffffff).toString(16).padStart(6, '0')}` : '#3B82F6';
        if (z.t === 3 && z.b) {
          zones.push({
            name: z.n,
            type: 'circle',
            center: { lat: z.b.cen_y, lng: z.b.cen_x },
            radius: z.w,
            color,
          });
          continue;
        }
        if (z.t === 2) {
          try {
            const zoneData = await this.request<Array<{ p?: Array<{ x: number; y: number }> }>>(
              'resource/get_zone_data',
              { itemId: resource.id, col: [z.id], flags: 1 }
            );
            const pts = zoneData[0]?.p;
            if (pts?.length) {
              zones.push({
                name: z.n,
                type: 'polygon',
                points: pts.map((pt) => ({ lat: pt.y, lng: pt.x })),
                color,
              });
            }
          } catch { /* skip zone without detail */ }
        }
      }
    }
    return zones;
  }

  async getSensorValues(unitId: string): Promise<Array<{ name: string; value: string; unit?: string }>> {
    try {
      const result = await this.request<{ sensors?: Array<{ n: string; v: string; u?: string }> }>(
        'unit/calc_last_message',
        { unitId: parseInt(unitId, 10), sensors: [], flags: 1 }
      );
      return (result.sensors || []).map((s) => ({ name: s.n, value: s.v, unit: s.u }));
    } catch {
      return [];
    }
  }

  async getTrips(unitId: string, from: Date, to: Date) {
    return this.request<{ trips?: unknown[] }>('unit/get_trips', {
      itemId: parseInt(unitId, 10),
      timeFrom: Math.floor(from.getTime() / 1000),
      timeTo: Math.floor(to.getTime() / 1000),
      msgsSource: 0,
    });
  }

  async sendCommand(assetId: string, command: string, params: Record<string, unknown>) {
    const paramStr = params && Object.keys(params).length ? JSON.stringify(params) : '';
    return this.request('unit/exec_cmd', {
      itemId: parseInt(assetId, 10),
      commandName: command,
      linkType: '',
      param: paramStr,
      timeout: 60,
      flags: 0,
    });
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
  }
}
