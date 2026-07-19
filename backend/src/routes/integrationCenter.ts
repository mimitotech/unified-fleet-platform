import { Router } from 'express';
import { authMiddleware, requireAdminAccess } from '../middleware/auth.js';
import { success, error } from '../utils/response.js';
import { IntegrationCenterService } from '../services/IntegrationCenterService.js';

const router = Router();
router.use(authMiddleware);
router.use(requireAdminAccess);

router.get('/centers/loconav', async (_req, res) => {
  try {
    return success(res, await IntegrationCenterService.getCenterStatus('loconav'));
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.get('/centers/tracksolid', async (_req, res) => {
  try {
    return success(res, await IntegrationCenterService.getCenterStatus('tracksolid'));
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

export default router;
