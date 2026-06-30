import crypto from 'crypto';
import { query } from '../config/database.js';
import { AlertOrchestrator } from '../orchestrators/AlertOrchestrator.js';

export class WebhookHandler {
  static verifyLocoNavSignature(payload: string, signature: string, secret: string): boolean {
    if (!secret) return false;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  static verifyTrackSolidSignature(payload: string, signature: string, secret: string): boolean {
    if (!secret) return false;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  static async handleLocoNav(tenantId: string, body: Record<string, unknown>): Promise<void> {
    const alertOrch = new AlertOrchestrator(tenantId);
    await alertOrch.insertAlert({
      tenantId,
      type: String(body.alert_type || body.type || 'camera'),
      severity: mapSeverity(body.severity),
      title: String(body.title || body.alert_type || 'LocoNav Alert'),
      description: body.description ? String(body.description) : undefined,
      latitude: typeof body.latitude === 'number' ? body.latitude : undefined,
      longitude: typeof body.longitude === 'number' ? body.longitude : undefined,
      timestamp: body.timestamp ? new Date(String(body.timestamp)) : new Date(),
      videoUrl: body.video_url ? String(body.video_url) : undefined,
      sourceType: 'loconav',
      externalId: body.id ? String(body.id) : undefined,
      assetId: await resolveAssetId(tenantId, body.vehicle_uuid || body.vehicle_id),
    });
  }

  static async handleTrackSolid(tenantId: string, body: Record<string, unknown>): Promise<void> {
    const alertOrch = new AlertOrchestrator(tenantId);
    await alertOrch.insertAlert({
      tenantId,
      type: String(body.type || 'tracksolid'),
      severity: mapSeverity(body.severity),
      title: String(body.title || 'TrackSolid Alert'),
      description: body.description ? String(body.description) : undefined,
      timestamp: body.timestamp ? new Date(Number(body.timestamp) * 1000) : new Date(),
      videoUrl: body.video_url ? String(body.video_url) : undefined,
      sourceType: 'tracksolid',
      externalId: body.id ? String(body.id) : undefined,
      assetId: await resolveAssetId(tenantId, body.asset_id),
    });
  }
}

function mapSeverity(s: unknown): 'info' | 'warning' | 'critical' | 'emergency' {
  const v = String(s || 'warning').toLowerCase();
  if (v === 'critical' || v === 'high' || v === 'emergency') return 'critical';
  if (v === 'info' || v === 'low') return 'info';
  return 'warning';
}

async function resolveAssetId(tenantId: string, externalId: unknown): Promise<string | undefined> {
  if (!externalId) return undefined;
  const { rows } = await query<{ asset_id: string }>(
    `SELECT am.asset_id FROM asset_mappings am
     JOIN assets a ON a.id = am.asset_id
     WHERE a.tenant_id = $1 AND am.external_id = $2 LIMIT 1`,
    [tenantId, String(externalId)]
  );
  return rows[0]?.asset_id;
}
