import { Router } from 'express';
import { WialonVideoService } from '../services/WialonVideoService.js';
import { VideoShareLinkService } from '../services/VideoShareLinkService.js';
import { loadTenantWialonCreds } from '../services/tenantWialonCredentials.js';

const router = Router();

/** Public, token-gated clip playback (no tenant auth — link expires). */
router.get('/video/:token', async (req, res) => {
  try {
    const resolved = await VideoShareLinkService.resolve(String(req.params.token));
    if (!resolved) {
      return res.status(404).json({ success: false, error: 'Share link not found or expired' });
    }

    const creds = await loadTenantWialonCreds(resolved.tenantId);
    const file = await WialonVideoService.readClip(creds, resolved.clipRef);
    const download = req.query.download === '1' || req.query.download === 'true';

    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(file.fileName)}"`
    );
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.send(file.data);
  } catch (e) {
    return res.status(500).json({ success: false, error: (e as Error).message });
  }
});

export default router;
