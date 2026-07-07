const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export function resolveAssetUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
  return `${API_BASE.replace(/\/$/, '')}${url.startsWith('/') ? url : `/${url}`}`;
}
