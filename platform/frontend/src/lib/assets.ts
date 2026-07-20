/** Same-origin when VITE_API_URL is empty (Hostinger production). Never invent localhost. */
const API_BASE = String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

/**
 * Resolve tenant upload / branding asset URLs for <img src>.
 * - Absolute http(s)/data URLs pass through (except bogus localhost in production)
 * - Relative /uploads/... stay same-origin when API_BASE is empty
 */
export function resolveAssetUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;

  // Fix logos persisted as http://localhost:3000/uploads/... in production
  const localhostUpload = trimmed.match(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/uploads\/.+)$/i);
  if (localhostUpload) {
    const path = localhostUpload[3];
    return API_BASE ? `${API_BASE}${path}` : path;
  }

  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }

  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return API_BASE ? `${API_BASE}${path}` : path;
}
