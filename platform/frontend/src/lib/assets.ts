/** Same-origin when VITE_API_URL is empty (Hostinger production). Never invent localhost. */
import { normalizeUploadPath } from '@/lib/normalizeUploadPath';

const API_BASE = String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

/**
 * Resolve tenant upload / branding asset URLs for <img src>.
 * - Absolute http(s)/data URLs pass through (except uploads hosts → relative)
 * - Relative /uploads/... stay same-origin when API_BASE is empty
 */
export function resolveAssetUrl(url?: string | null): string | undefined {
  const normalized = normalizeUploadPath(url);
  if (!normalized) return undefined;

  if (
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('data:') ||
    normalized.startsWith('blob:')
  ) {
    return normalized;
  }

  const path = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return API_BASE ? `${API_BASE}${path}` : path;
}
