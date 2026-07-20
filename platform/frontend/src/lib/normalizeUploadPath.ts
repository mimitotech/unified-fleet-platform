/**
 * Normalize branding asset URLs for <img src> and storage.
 * Prefer same-origin `/uploads/...` — strip localhost and absolute hosts on uploads.
 */
export function normalizeUploadPath(value?: string | null): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;

  const local = s.match(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/uploads\/.+)$/i);
  if (local) return local[3];

  const absUpload = s.match(/^https?:\/\/[^/]+(\/uploads\/.+)$/i);
  if (absUpload) return absUpload[1];

  if (s.startsWith('/uploads/')) return s;
  if (s.startsWith('tenants/')) return `/uploads/${s}`;

  if (/^https?:\/\//i.test(s) || s.startsWith('data:') || s.startsWith('blob:')) {
    return s;
  }

  return s.startsWith('/') ? s : `/${s}`;
}
