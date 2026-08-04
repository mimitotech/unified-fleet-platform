import { query } from '../config/database.js';
import { createAdapter } from '../adapters/AdapterFactory.js';
import { resolveSourceCredentials } from './integrationCredentials.js';
const SOURCE_CAPABILITIES = {
    wialon: ['gps', 'fuel', 'commands', 'geofencing', 'drivers', 'reports', 'video'],
    tracksolid: ['gps', 'video', 'fuel', 'commands', 'geofencing', 'obd', 'reports'],
    loconav: ['gps', 'video'],
};
const CAPABILITY_PRIORITY = {
    gps: ['wialon', 'tracksolid', 'loconav'],
    video: ['wialon', 'loconav', 'tracksolid'],
    fuel: ['wialon', 'tracksolid'],
    commands: ['wialon', 'tracksolid'],
    geofencing: ['wialon', 'tracksolid'],
    obd: ['tracksolid'],
    drivers: ['wialon'],
    reports: ['wialon', 'tracksolid'],
};
/** Routes client actions to the correct telematics system for a unified asset. */
export class SourceRouter {
    tenantId;
    constructor(tenantId) {
        this.tenantId = tenantId;
    }
    async getMappings(assetId) {
        const { rows } = await query(`SELECT am.source_type, am.external_id FROM asset_mappings am
       JOIN assets a ON a.id = am.asset_id
       WHERE a.id = $1 AND a.tenant_id = $2`, [assetId, this.tenantId]);
        return rows.map((r) => ({ sourceType: r.source_type, externalId: r.external_id }));
    }
    async resolveForCapability(assetId, capability) {
        const mappings = await this.getMappings(assetId);
        if (!mappings.length)
            return null;
        const priority = CAPABILITY_PRIORITY[capability];
        for (const sourceType of priority) {
            const mapping = mappings.find((m) => m.sourceType === sourceType);
            if (!mapping)
                continue;
            if (!SOURCE_CAPABILITIES[sourceType]?.includes(capability))
                continue;
            const { rows: ds } = await query(`SELECT credentials_encrypted FROM data_sources
         WHERE tenant_id = $1 AND source_type = $2 AND is_active = true`, [this.tenantId, sourceType]);
            if (!ds[0])
                continue;
            const adapter = createAdapter(sourceType, await resolveSourceCredentials(this.tenantId, sourceType, ds[0].credentials_encrypted));
            await adapter.connect();
            return { sourceType, externalId: mapping.externalId, adapter };
        }
        return null;
    }
    static getCapabilitiesForSources(sources) {
        const caps = new Set();
        for (const src of sources) {
            for (const c of SOURCE_CAPABILITIES[src] || [])
                caps.add(c);
        }
        return Array.from(caps);
    }
}
