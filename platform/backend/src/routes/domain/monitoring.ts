import { Router } from 'express';
import { requireTenant, type TenantRequest } from '../../middleware/tenant.js';
import { requireModule, requireWriteAccess } from '../../middleware/rbac.js';
import { success, error } from '../../utils/response.js';
import { fetchMergedViolationEvents } from '../../services/violationEventsService.js';

const router = Router();
const mod = requireModule('monitoring');

router.get('/events', requireTenant, mod, async (req: TenantRequest, res) => {
  const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || '120'), 10) || 120));
  const days = Math.min(90, Math.max(1, parseInt(String(req.query.days || '30'), 10) || 30));
  const events = await fetchMergedViolationEvents(String(req.tenantId), { limit, days });
  return success(res, events);
});

router.post('/sync-violations', requireTenant, mod, requireWriteAccess, async (req: TenantRequest, res) => {
  try {
    const { AlertOrchestrator } = await import('../../orchestrators/AlertOrchestrator.js');
    const { DomainSyncService } = await import('../../services/DomainSyncService.js');
    const { mirrorAlertsToEcoViolations } = await import('../../services/ecoViolationPersist.js');
    const { DriverScoringService } = await import('../../services/DriverScoringService.js');

    const orch = new AlertOrchestrator(String(req.tenantId));
    const alerts = await orch.syncFromAdapters();
    const mirrored = await mirrorAlertsToEcoViolations(String(req.tenantId), 30);
    const eco = await DomainSyncService.syncTenantEcoViolations(String(req.tenantId), { force: true });
    await DriverScoringService.linkEcoViolationsAllDrivers(String(req.tenantId)).catch(() => undefined);
    const scoring = await DriverScoringService.recomputeTenant(String(req.tenantId), 30).catch(() => ({
      drivers: 0,
    }));
    const events = await fetchMergedViolationEvents(String(req.tenantId), { limit: 120, days: 30 });
    return success(res, {
      alerts,
      mirrored,
      eco,
      drivers: scoring.drivers,
      events: events.length,
    });
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

export default router;
