import { Router } from 'express';
import { requireTenant, type TenantRequest } from '../../middleware/tenant.js';
import { success } from '../../utils/response.js';
import { VideoOrchestrator } from '../../orchestrators/VideoOrchestrator.js';
import { query } from '../../config/database.js';
import { toCamelRows } from '../../utils/mapper.js';

const router = Router();

router.get('/streams', requireTenant, async (req: TenantRequest, res) => {
  const orch = new VideoOrchestrator(req.tenantId!);
  const streams = await orch.listStreams();
  return success(res, streams);
});

router.get('/violations', requireTenant, async (req: TenantRequest, res) => {
  const limit = parseInt(String(req.query.limit || '50'), 10);
  const { rows: eco } = await query(
    `SELECT id, unit_name, violation_type as type, severity, occurred_at, driver_name, 'eco' as source
     FROM eco_driving_violations WHERE tenant_id = $1 ORDER BY occurred_at DESC LIMIT $2`,
    [req.tenantId, limit]
  );
  const { rows: alerts } = await query(
    `SELECT id, title, type, severity, occurred_at, video_url, source_type as source
     FROM alerts WHERE tenant_id = $1 AND video_url IS NOT NULL ORDER BY occurred_at DESC LIMIT $2`,
    [req.tenantId, limit]
  );
  const combined = [
    ...toCamelRows(eco).map((r) => ({ ...r, category: 'driving' })),
    ...toCamelRows(alerts).map((r) => ({ ...r, category: 'video' })),
  ].sort((a, b) => {
    const aTime = new Date(String((a as Record<string, unknown>).occurredAt || 0)).getTime();
    const bTime = new Date(String((b as Record<string, unknown>).occurredAt || 0)).getTime();
    return bTime - aTime;
  });
  return success(res, combined.slice(0, limit));
});

export default router;
