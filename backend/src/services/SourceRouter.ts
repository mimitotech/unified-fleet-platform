import { query } from '../config/database.js';
import { createAdapter } from '../adapters/AdapterFactory.js';
import { resolveSourceCredentials } from './integrationCredentials.js';
import type { SourceType } from '@ufp/shared';
import type { BaseAdapter } from '../adapters/BaseAdapter.js';

export type AssetCapability =
  | 'gps'
  | 'video'
  | 'fuel'
  | 'commands'
  | 'geofencing'
  | 'obd'
  | 'drivers'
  | 'reports';

const SOURCE_CAPABILITIES: Record<SourceType, AssetCapability[]> = {
  wialon: ['gps', 'fuel', 'commands', 'geofencing', 'drivers', 'reports', 'video'],
  tracksolid: ['gps', 'video', 'fuel', 'commands', 'geofencing', 'obd', 'reports'],
  loconav: ['gps', 'video'],
};

const CAPABILITY_PRIORITY: Record<AssetCapability, SourceType[]> = {
  gps: ['wialon', 'tracksolid', 'loconav'],
  video: ['wialon', 'loconav', 'tracksolid'],
  fuel: ['wialon', 'tracksolid'],
  commands: ['wialon', 'tracksolid'],
  geofencing: ['wialon', 'tracksolid'],
  obd: ['tracksolid'],
  drivers: ['wialon'],
  reports: ['wialon', 'tracksolid'],
};

export interface ResolvedSource {
  sourceType: SourceType;
  externalId: string;
  adapter: BaseAdapter;
}

/** Routes client actions to the correct telematics system for a unified asset. */
export class SourceRouter {
  constructor(private tenantId: string) {}

  async getMappings(assetId: string): Promise<Array<{ sourceType: SourceType; externalId: string }>> {
    const { rows } = await query<{ source_type: SourceType; external_id: string }>(
      `SELECT am.source_type, am.external_id FROM asset_mappings am
       JOIN assets a ON a.id = am.asset_id
       WHERE a.id = $1 AND a.tenant_id = $2`,
      [assetId, this.tenantId]
    );
    return rows.map((r) => ({ sourceType: r.source_type, externalId: r.external_id }));
  }

  async resolveForCapability(assetId: string, capability: AssetCapability): Promise<ResolvedSource | null> {
    const mappings = await this.getMappings(assetId);
    if (!mappings.length) return null;

    const priority = CAPABILITY_PRIORITY[capability];
    for (const sourceType of priority) {
      const mapping = mappings.find((m) => m.sourceType === sourceType);
      if (!mapping) continue;
      if (!SOURCE_CAPABILITIES[sourceType]?.includes(capability)) continue;

      const { rows: ds } = await query<{ credentials_encrypted: string }>(
        `SELECT credentials_encrypted FROM data_sources
         WHERE tenant_id = $1 AND source_type = $2 AND is_active = true`,
        [this.tenantId, sourceType]
      );
      if (!ds[0]) continue;

      const adapter = createAdapter(
        sourceType,
        await resolveSourceCredentials(this.tenantId, sourceType, ds[0].credentials_encrypted)
      );
      await adapter.connect();
      return { sourceType, externalId: mapping.externalId, adapter };
    }
    return null;
  }

  static getCapabilitiesForSources(sources: SourceType[]): AssetCapability[] {
    const caps = new Set<AssetCapability>();
    for (const src of sources) {
      for (const c of SOURCE_CAPABILITIES[src] || []) caps.add(c);
    }
    return Array.from(caps);
  }
}
