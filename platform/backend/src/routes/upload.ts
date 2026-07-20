import { Router } from 'express';
import { authMiddleware, requireAdminAccess, type AuthRequest } from '../middleware/auth.js';
import { UploadService } from '../services/UploadService.js';
import { success, error } from '../utils/response.js';

const router = Router();
router.use(authMiddleware);
router.use(requireAdminAccess);

router.post('/tenants/:id/upload', async (req: AuthRequest, res, next) => {
  try {
    const { fileName, mimeType, data, fileType = 'logo' } = req.body as {
      fileName: string;
      mimeType: string;
      data: string;
      fileType?: 'logo' | 'favicon';
    };
    if (!fileName || !mimeType || !data) return error(res, 'fileName, mimeType, and data required');

    const base64 = data.includes(',') ? data.split(',')[1] : data;
    const buffer = Buffer.from(base64, 'base64');
    const result = await UploadService.saveTenantFile(
      String(req.params.id),
      fileType,
      fileName,
      mimeType,
      buffer
    );

    const publicBase = (process.env.API_PUBLIC_URL || '').replace(/\/$/, '');
    // Prefer relative /uploads/... so same-origin production works; optionally absolute via API_PUBLIC_URL
    const publicUrl = result.url.startsWith('http')
      ? result.url
      : publicBase
        ? `${publicBase}${result.url}`
        : result.url;
    return success(res, { ...result, publicUrl, url: result.url });
  } catch (e) {
    next(e);
  }
});

export default router;
