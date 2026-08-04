import { query } from '../config/database.js';
import { isWialonTenantConnected } from './wialonConnectionStatus.js';
function isSourceConnected(row) {
    if (!row.is_active || !row.connection_verified_at)
        return false;
    if (row.source_type === 'wialon') {
        return isWialonTenantConnected(row);
    }
    return true;
}
/** Tenants with at least one verified telematics connection. */
export async function listActiveTenants(sourceTypes) {
    const { rows } = await query(`SELECT ds.tenant_id, ds.source_type, ds.is_active, ds.connection_verified_at,
            ds.wialon_resource_id, ds.last_sync_at
     FROM data_sources ds
     INNER JOIN tenants t ON t.id = ds.tenant_id
     WHERE t.is_active = true AND ds.is_active = true`);
    const byTenant = new Map();
    for (const row of rows) {
        if (sourceTypes && !sourceTypes.includes(row.source_type))
            continue;
        if (!isSourceConnected(row))
            continue;
        const set = byTenant.get(row.tenant_id) ?? new Set();
        set.add(row.source_type);
        byTenant.set(row.tenant_id, set);
    }
    return [...byTenant.entries()].map(([id, sources]) => ({
        id,
        sources: [...sources],
    }));
}
/** Wialon-connected tenants (fuel, trips, eco DB sync). */
export async function listWialonConnectedTenantIds() {
    const tenants = await listActiveTenants(['wialon']);
    return tenants.map((t) => t.id);
}
