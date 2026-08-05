import { Router } from 'express';
import { WialonVideoService } from '../services/WialonVideoService.js';
import { VideoShareLinkService } from '../services/VideoShareLinkService.js';
import { loadTenantWialonCreds } from '../services/tenantWialonCredentials.js';
import { LoginSlideService } from '../services/LoginSlideService.js';
import { LoginTrustLogoService } from '../services/LoginTrustLogoService.js';
import { success, error } from '../utils/response.js';
const router = Router();
/** Enabled login slideshow slides (no auth — used by /login). */
router.get('/login-slides', async (_req, res) => {
    try {
        const slides = await LoginSlideService.listPublic();
        return success(res, {
            slides: slides.map((s) => ({
                id: s.id,
                title: s.title,
                details: s.details,
                eyebrow: s.eyebrow,
                imageUrl: s.imageUrl,
                sortOrder: s.sortOrder,
            })),
        });
    }
    catch (e) {
        return error(res, e.message);
    }
});
/** Enabled client trust logos for the login “trusted by” marquee. */
router.get('/login-trust-logos', async (_req, res) => {
    try {
        const logos = await LoginTrustLogoService.listPublic();
        return success(res, {
            logos: logos.map((l) => ({
                id: l.id,
                name: l.name,
                imageUrl: l.imageUrl,
                sortOrder: l.sortOrder,
            })),
        });
    }
    catch (e) {
        return error(res, e.message);
    }
});
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
        res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(file.fileName)}"`);
        res.setHeader('Cache-Control', 'private, max-age=300');
        return res.send(file.data);
    }
    catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});
export default router;
