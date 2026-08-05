import { query } from '../config/database.js';
import type { SourceType } from '@ufp/shared';
import { isWialonTenantConnected } from './wialonConnectionStatus.js';

export type TenantDataSourceRow = {
  tenant_id: string;
  source_type: SourceType;
  is_active: boolean;
  connection_verified_at: string | null;
  wialon_resource_id: number | null;
  last_sync_at: string | null;
};

export type ActiveTenant = {
  id: string;
  sources: SourceType[];
};

function isSourceConnected(row: TenantDataSourceRow): boolean {
  if (!row.is_active || !row.connection_verified_at) return false;
  if (row.source_type === 'wialon') {
    return isWialonTenantConnected(row);
  }
  return true;
}

/** Tenants with at least one verified telematics connection. */
export async function listActiveTenants(
  sourceTypes?: SourceType[],
): Promise<ActiveTenant[]> {
  const { rows } = await query<TenantDataSourceRow>(
    `SELECT ds.tenant_id, ds.source_type, ds.is_active, ds.connection_verified_at,
            ds.wialon_resource_id, ds.last_sync_at
     FROM data_sources ds
     INNER JOIN tenants t ON t.id = ds.tenant_id
     WHERE t.is_active = true AND ds.is_active = true`,
  );

  const byTenant = new Map<string, Set<SourceType>>();
  for (const row of rows) {
    if (sourceTypes && !sourceTypes.includes(row.source_type)) continue;
    if (!isSourceConnected(row)) continue;
    const set = byTenant.get(row.tenant_id) ?? new Set<SourceType>();
    set.add(row.source_type);
    byTenant.set(row.tenant_id, set);
  }

  return [...byTenant.entries()].map(([id, sources]) => ({
    id,
    sources: [...sources],
  }));
}

/** Wialon-connected tenants (fuel, trips, eco DB sync). */
export async function listWialonConnectedTenantIds(): Promise<string[]> {
  const tenants = await listActiveTenants(['wialon']);
  return tenants.map((t) => t.id);
}
