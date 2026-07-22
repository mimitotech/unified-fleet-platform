import type { RequestHandler } from 'express';
import express from 'express';
import fs from 'fs';
import path from 'path';
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

      // Fall back for assets we store as BLOB (tenant branding + login slides)
      const rel = (req.path || '').replace(/^\/+/, '');
      if (!rel.startsWith('tenants/') && !rel.startsWith('login-slides/')) return next();

      const publicUrl = `/uploads/${rel}`;
      try {
        if (rel.startsWith('login-slides/')) {
          const { LoginSlideService } = await import('../services/LoginSlideService.js');
          const found = await LoginSlideService.findImageByPublicUrl(publicUrl);
          if (!found) return next();
          try {
            const dir = path.dirname(found.filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            if (!fs.existsSync(found.filePath)) fs.writeFileSync(found.filePath, found.content);
          } catch {
            /* rehydrate best-effort */
          }
          res.setHeader('Content-Type', found.mimeType);
          res.setHeader('Cache-Control', 'public, max-age=604800');
          return res.send(found.content);
        }

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
