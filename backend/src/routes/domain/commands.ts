import { Router } from 'express';
import { query } from '../../config/database.js';
import { requireTenant, type TenantRequest } from '../../middleware/tenant.js';
import { requireCommandAccess } from '../../middleware/rbac.js';
import { success, error } from '../../utils/response.js';
import { toCamelRows } from '../../utils/mapper.js';
import { SourceRouter } from '../../services/SourceRouter.js';

const router = Router();

const COMMAND_MAP: Record<string, string> = {
  lock: 'block_engine',
  unlock: 'unblock_engine',
  locate: 'request_position',
  block_engine: 'block_engine',
  unblock_engine: 'unblock_engine',
  request_position: 'request_position',
  query_pos: 'query_pos',
};

router.get('/history', requireTenant, async (req: TenantRequest, res) => {
  const { rows } = await query(
    `SELECT * FROM command_logs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [req.tenantId]
  );
  return success(res, toCamelRows(rows));
});

router.post('/:assetId', requireTenant, requireCommandAccess, async (req: TenantRequest, res) => {
  const { command, params = {} } = req.body as { command: string; params?: Record<string, unknown> };
  if (!command) return error(res, 'command required');

  const routerSvc = new SourceRouter(req.tenantId!);
  const resolved = await routerSvc.resolveForCapability(String(req.params.assetId), 'commands');
  if (!resolved) return error(res, 'This asset has no command-capable telematics source (Wialon or TrackSolid)', 400);

  const cmd = COMMAND_MAP[command] || command;

  const { rows: assetRow } = await query<{ name: string }>(
    `SELECT name FROM assets WHERE id = $1`,
    [req.params.assetId]
  );

  let status = 'sent';
  let response: unknown = null;
  try {
    if (resolved.adapter.sendCommand) {
      response = await resolved.adapter.sendCommand(resolved.externalId, cmd, params);
      status = 'success';
    } else {
      throw new Error('Adapter does not support commands');
    }
  } catch (err) {
    status = 'failed';
    response = { error: (err as Error).message };
  }

  const { rows: logRows } = await query(
    `INSERT INTO command_logs (tenant_id, asset_id, external_asset_id, asset_name, command, params, status, response, source_type, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [
      req.tenantId, req.params.assetId, resolved.externalId, assetRow[0]?.name,
      command, JSON.stringify(params), status, JSON.stringify(response),
      resolved.sourceType, req.user?.id || null,
    ]
  );

  if (status === 'failed') {
    return error(res, (response as { error: string })?.error || 'Command failed', 502);
  }
  return success(res, toCamelRows(logRows)[0]);
});

export default router;
