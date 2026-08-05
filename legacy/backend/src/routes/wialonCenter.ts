import { Router } from 'express';
import { authMiddleware, requireAdminAccess, type AuthRequest } from '../middleware/auth.js';
import { success, error } from '../utils/response.js';
import { PlatformIntegrationService } from '../services/PlatformIntegrationService.js';
import { WialonMotherAccountService } from '../services/WialonMotherAccountService.js';
import { WialonHierarchyService } from '../services/WialonHierarchyService.js';
import { createWialonLiveHandlers } from './wialonLiveHandlers.js';

const router = Router();
router.use(authMiddleware);
router.use(requireAdminAccess);

async function resolveMotherId(raw?: string | null): Promise<string> {
  if (raw) return raw;
  const id = await WialonMotherAccountService.getDefaultId();
  if (!id) throw new Error('No Wialon mother account configured');
  return id;
}

const centerLive = createWialonLiveHandlers(async (req) => {
  const motherId = await resolveMotherId(
    (req.query.motherId as string) || (req.query.motherAccountId as string) || undefined
  );
  const creds = await WialonMotherAccountService.loadCreds(motherId);
  const accountId = req.query.accountId;
  if (accountId) return { ...creds, accountId: String(accountId) };
  return creds;
});

router.get('/centers/wialon', async (_req, res) => {
  try {
    const mothers = await WialonMotherAccountService.list();
    const status = await PlatformIntegrationService.getStatus('wialon');
    const assignments = await PlatformIntegrationService.getWialonAccountAssignments();
    return success(res, {
      ...status,
      configured: mothers.length > 0 || status.configured,
      connected: mothers.some((m) => m.connected) || status.connected,
      motherAccounts: mothers,
      motherAccountCount: mothers.length,
      assignedAccountCount: assignments.size,
    });
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.get('/centers/wialon/mothers', async (_req, res) => {
  try {
    const mothers = await WialonMotherAccountService.list();
    return success(res, { mothers, count: mothers.length });
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.post('/centers/wialon/mothers', async (req: AuthRequest, res) => {
  try {
    const body = (req.body.credentials || req.body) as Record<string, unknown>;
    const mother = await WialonMotherAccountService.create({
      name: String(body.name || body.label || 'Mother account'),
      token: String(body.token || ''),
      baseUrl: body.baseUrl ? String(body.baseUrl) : undefined,
    });
    return success(res, { mother });
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.put('/centers/wialon/mothers/:motherId', async (req, res) => {
  try {
    const body = (req.body.credentials || req.body) as Record<string, unknown>;
    const mother = await WialonMotherAccountService.update(String(req.params.motherId), {
      name: body.name ? String(body.name) : undefined,
      token: body.token ? String(body.token) : undefined,
      baseUrl: body.baseUrl !== undefined ? String(body.baseUrl) : undefined,
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
    });
    return success(res, { mother });
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.delete('/centers/wialon/mothers/:motherId', async (req, res) => {
  try {
    await WialonMotherAccountService.remove(String(req.params.motherId));
    return success(res, { deleted: true });
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.post('/centers/wialon/mothers/:motherId/test', async (req, res) => {
  try {
    const probe = await WialonMotherAccountService.probe(String(req.params.motherId));
    return success(res, { connected: true, probe });
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

/** Legacy: creates a named mother account (same as POST /mothers) */
router.put('/centers/wialon', async (req: AuthRequest, res) => {
  try {
    const body = (req.body.credentials || req.body) as Record<string, unknown>;
    const result = await PlatformIntegrationService.saveWialon(body);
    return success(res, result);
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.post('/centers/wialon/test', async (req, res) => {
  try {
    const body = (req.body.credentials || req.body) as Record<string, unknown>;
    const token = String(body.token || '').trim();
    if (!token) {
      const motherId = await resolveMotherId(body.motherId ? String(body.motherId) : undefined);
      const probe = await WialonMotherAccountService.probe(motherId);
      return success(res, { connected: true, probe });
    }
    const creds = {
      token,
      baseUrl: body.baseUrl ? String(body.baseUrl) : undefined,
    };
    const probe = await WialonHierarchyService.probe(creds);
    return success(res, { connected: true, probe });
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.get('/centers/wialon/hierarchy', async (req, res) => {
  try {
    const motherId = await resolveMotherId(
      (req.query.motherId as string) || (req.query.motherAccountId as string) || undefined
    );
    const creds = await WialonMotherAccountService.loadCreds(motherId);
    const probe = await WialonHierarchyService.probe(creds);
    const assignments = await WialonMotherAccountService.getAccountAssignments(motherId);
    const accounts = probe.accounts.map((a) => ({
      ...a,
      assignedTenant: assignments.get(a.id) || null,
    }));
    return success(res, { ...probe, accounts, motherAccountId: motherId });
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.get('/centers/wialon/mothers/:motherId/hierarchy', async (req, res) => {
  try {
    const motherId = String(req.params.motherId);
    const creds = await WialonMotherAccountService.loadCreds(motherId);
    const probe = await WialonHierarchyService.probe(creds);
    const assignments = await WialonMotherAccountService.getAccountAssignments(motherId);
    const accounts = probe.accounts.map((a) => ({
      ...a,
      assignedTenant: assignments.get(a.id) || null,
    }));
    return success(res, { ...probe, accounts, motherAccountId: motherId });
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.get('/centers/wialon/accounts/:accountId', async (req, res) => {
  try {
    const accountId = parseInt(String(req.params.accountId), 10);
    if (Number.isNaN(accountId)) return error(res, 'Invalid account id');
    const motherId = await resolveMotherId(
      (req.query.motherId as string) || (req.query.motherAccountId as string) || undefined
    );

    const creds = await WialonMotherAccountService.loadCreds(motherId);
    const scopedCreds = { ...creds, accountId: String(accountId) };
    const [units, users, assignments] = await Promise.all([
      WialonHierarchyService.getUnitsForAccount(scopedCreds, accountId),
      WialonHierarchyService.getUsersForAccount(scopedCreds, accountId),
      WialonMotherAccountService.getAccountAssignments(motherId),
    ]);

    const probe = await WialonHierarchyService.probe(scopedCreds);
    const accountName = probe.accounts.find((a) => a.id === accountId)?.name || String(accountId);

    return success(res, {
      accountId,
      accountName,
      motherAccountId: motherId,
      unitCount: units.length,
      userCount: users.length,
      units: units.slice(0, 100).map((u) => ({ id: u.id, name: u.nm })),
      users,
      assignedTenant: assignments.get(accountId) || null,
      sampleUnits: units.slice(0, 5).map((u) => u.nm),
    });
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.post('/centers/wialon/accounts/:accountId/test', async (req, res) => {
  try {
    const accountId = parseInt(String(req.params.accountId), 10);
    if (Number.isNaN(accountId)) return error(res, 'Invalid account id');
    const motherId = await resolveMotherId(
      req.body?.motherAccountId ? String(req.body.motherAccountId) : req.body?.motherId ? String(req.body.motherId) : undefined
    );
    await PlatformIntegrationService.assertAccountAvailable(accountId, req.body?.exceptTenantId as string | undefined);

    const creds = await WialonMotherAccountService.loadCreds(motherId);
    const scoped = { ...creds, accountId: String(accountId) };
    const units = await WialonHierarchyService.getUnitsForAccount(scoped, accountId);
    let users: Awaited<ReturnType<typeof WialonHierarchyService.getUsersForAccount>> = [];
    let userError: string | undefined;
    try {
      users = await WialonHierarchyService.getUsersForAccount(scoped, accountId);
    } catch (e) {
      userError = (e as Error).message;
    }
    return success(res, {
      ok: true,
      accountId,
      motherAccountId: motherId,
      unitCount: units.length,
      userCount: users.length,
      sampleUnits: units.slice(0, 8).map((u) => ({ id: u.id, name: u.nm })),
      users: users.map((u) => ({ id: u.id, name: u.name, email: u.email })),
      userError,
    });
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.get('/centers/wialon/live/units', centerLive.units);
router.get('/centers/wialon/live/geofences', centerLive.geofences);
router.get('/centers/wialon/live/units/:unitId/sensors', centerLive.unitSensors);
router.get('/centers/wialon/live/units/:unitId/trips', centerLive.unitTrips);
router.get('/centers/wialon/live/units/:unitId/track', centerLive.unitTrack);
router.get('/centers/wialon/live/units/:unitId/commands', centerLive.unitCommands);
router.post('/centers/wialon/live/units/:unitId/commands', centerLive.sendUnitCommand);
router.get('/centers/wialon/live/routes/:routeId/rounds', centerLive.routeRounds);
router.post('/centers/wialon/live/reports/exec', centerLive.execReport);

export default router;
