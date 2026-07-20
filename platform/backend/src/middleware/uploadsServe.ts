import type { RequestHandler } from 'express';
import express from 'express';
import { resolveUploadRoot } from '../utils/paths.js';
import { UploadService } from '../services/UploadService.js';

const UPLOAD_ROOT = resolveUploadRoot();

/**
 * Serve /uploads with disk-first, MySQL-fallback.
 * Hostinger redeploys wipe local files; logos survive in tenant_files.content.
 */
export function createUploadsMiddleware(): RequestHandler {
  const staticMw = express.static(UPLOAD_ROOT, {
    fallthrough: true,
    etag: true,
    maxAge: '7d',
  });

  return (req, res, next) => {
    staticMw(req, res, async (err) => {
      if (err) return next(err);

      // Only fall back for tenant branding assets we store in DB
      const rel = (req.path || '').replace(/^\/+/, '');
      if (!rel.startsWith('tenants/')) return next();

      const publicUrl = `/uploads/${rel}`;
      try {
        const found = await UploadService.findByPublicUrl(publicUrl);
        if (!found) return next();

        UploadService.rehydrateToDisk(found.filePath, found.content, rel);

        res.setHeader('Content-Type', found.mimeType);
        res.setHeader('Cache-Control', 'public, max-age=604800');
        return res.send(found.content);
      } catch (e) {
        return next(e);
      }
    });
  };
}
