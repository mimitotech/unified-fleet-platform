import { Router } from 'express';
import { query } from '../config/database.js';
import { WebhookHandler } from '../services/WebhookHandler.js';
import { success, error } from '../utils/response.js';

const router = Router();

router.post('/loconav/:tenantSlug', async (req, res) => {
  const { tenantSlug } = req.params;
  const signature = req.headers['x-loconav-signature'] as string || req.headers['x-signature'] as string || '';
  const secret = process.env.LOCONAV_WEBHOOK_SECRET || '';

  // Fail closed in production when secret is not configured.
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return error(res, 'Webhook secret not configured', 503);
    }
  } else if (!signature || !WebhookHandler.verifyLocoNavSignature(JSON.stringify(req.body), signature, secret)) {
    return error(res, 'Invalid signature', 401);
  }

  const { rows } = await query<{ id: string }>(`SELECT id FROM tenants WHERE slug = $1`, [tenantSlug]);
  if (!rows[0]) return error(res, 'Tenant not found', 404);

  await WebhookHandler.handleLocoNav(rows[0].id, req.body);
  return success(res, { received: true });
});

router.post('/tracksolid/:tenantSlug', async (req, res) => {
  const { tenantSlug } = req.params;
  const signature = req.headers['x-tracksolid-signature'] as string || '';
  const secret = process.env.TRACKSOLID_WEBHOOK_SECRET || '';

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return error(res, 'Webhook secret not configured', 503);
    }
  } else if (!signature || !WebhookHandler.verifyTrackSolidSignature(JSON.stringify(req.body), signature, secret)) {
    return error(res, 'Invalid signature', 401);
  }

  const { rows } = await query<{ id: string }>(`SELECT id FROM tenants WHERE slug = $1`, [tenantSlug]);
  if (!rows[0]) return error(res, 'Tenant not found', 404);

  await WebhookHandler.handleTrackSolid(rows[0].id, req.body);
  return success(res, { received: true });
});

export default router;
