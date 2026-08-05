import crypto from 'crypto';
import { query } from '../config/database.js';
import { AlertOrchestrator } from '../orchestrators/AlertOrchestrator.js';
import { AssetOrchestrator } from '../orchestrators/AssetOrchestrator.js';
const LOCONAV_KIND_MAP = {
    ignition: { type: 'ignition', title: 'Ignition Alert', severity: 'info' },
    idling: { type: 'idling', title: 'Idling Alert', severity: 'warning' },
    fatigue: { type: 'fatigue', title: 'Driver Fatigue', severity: 'critical' },
    overrev: { type: 'overrev', title: 'Over-rev (RPM)', severity: 'warning' },
    anti_theft: { type: 'anti_theft', title: 'Anti-Theft Alert', severity: 'critical' },
    'anti theft': { type: 'anti_theft', title: 'Anti-Theft Alert', severity: 'critical' },
};
export class WebhookHandler {
    static verifyLocoNavSignature(payload, signature, secret) {
        if (!secret)
            return false;
        const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
        return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    }
    static verifyTrackSolidSignature(payload, signature, secret) {
        if (!secret)
            return false;
        const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
        try {
            return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
        }
        catch {
            return false;
        }
    }
    static async handleLocoNav(tenantId, body) {
        const kind = String(body.kind || body.event_key || body.alert_type || 'camera').toLowerCase();
        const meta = LOCONAV_KIND_MAP[kind] || { type: kind, title: `LocoNav: ${kind}`, severity: 'warning' };
        const lat = typeof body.active_event_latitude === 'number' ? body.active_event_latitude
            : typeof body.latitude === 'number' ? body.latitude : undefined;
        const lng = typeof body.active_event_longitude === 'number' ? body.active_event_longitude
            : typeof body.longitude === 'number' ? body.longitude : undefined;
        const vehicleRef = body.vehicle_number || body.vehicle_uuid || body.vehicle_id;
        const timestamp = body.active_event_time || body.event_time || body.created_at || body.timestamp;
        const alertOrch = new AlertOrchestrator(tenantId);
        await alertOrch.insertAlert({
            tenantId,
            type: meta.type,
            severity: body.severity ? mapSeverity(body.severity) : meta.severity,
            title: `${meta.title}${vehicleRef ? ` — ${vehicleRef}` : ''}`,
            description: buildLocoNavDescription(body, kind),
            latitude: lat,
            longitude: lng,
            timestamp: timestamp ? new Date(String(timestamp)) : new Date(),
            videoUrl: body.video_url ? String(body.video_url) : undefined,
            sourceType: 'loconav',
            externalId: body.id ? String(body.id) : undefined,
            assetId: await resolveAssetId(tenantId, body.vehicle_uuid || body.vehicle_id || vehicleRef),
        });
        await AssetOrchestrator.invalidateTenantCache(tenantId);
    }
    static async handleTrackSolid(tenantId, body) {
        const alertOrch = new AlertOrchestrator(tenantId);
        await alertOrch.insertAlert({
            tenantId,
            type: String(body.type || 'tracksolid'),
            severity: mapSeverity(body.severity),
            title: String(body.title || 'TrackSolid Alert'),
            description: body.description ? String(body.description) : undefined,
            latitude: typeof body.latitude === 'number' ? body.latitude : undefined,
            longitude: typeof body.longitude === 'number' ? body.longitude : undefined,
            timestamp: body.timestamp ? new Date(Number(body.timestamp) * 1000) : new Date(),
            videoUrl: body.video_url ? String(body.video_url) : undefined,
            sourceType: 'tracksolid',
            externalId: body.id ? String(body.id) : undefined,
            assetId: await resolveAssetId(tenantId, body.asset_id),
        });
        await AssetOrchestrator.invalidateTenantCache(tenantId);
    }
}
function buildLocoNavDescription(body, kind) {
    const parts = [];
    if (body.rpm_value)
        parts.push(`RPM: ${body.rpm_value}`);
    if (body.vehicle_number)
        parts.push(`Vehicle: ${body.vehicle_number}`);
    if (body.start_time)
        parts.push(`Start: ${body.start_time}`);
    if (body.inactive_event_time)
        parts.push(`End: ${body.inactive_event_time}`);
    if (!parts.length)
        parts.push(`Event: ${kind}`);
    return parts.join(' · ');
}
function mapSeverity(s) {
    const v = String(s || 'warning').toLowerCase();
    if (v === 'critical' || v === 'high' || v === 'emergency')
        return 'critical';
    if (v === 'info' || v === 'low')
        return 'info';
    return 'warning';
}
async function resolveAssetId(tenantId, externalId) {
    if (!externalId)
        return undefined;
    const { rows } = await query(`SELECT am.asset_id FROM asset_mappings am
     JOIN assets a ON a.id = am.asset_id
     WHERE a.tenant_id = $1 AND (am.external_id = $2 OR a.name ILIKE $2 OR a.registration_plate ILIKE $2) LIMIT 1`, [tenantId, String(externalId)]);
    return rows[0]?.asset_id;
}
