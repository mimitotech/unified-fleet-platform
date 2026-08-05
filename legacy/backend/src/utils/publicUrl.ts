/**
 * Absolute public origin for webhooks, share links, and emails.
 * Never invents localhost in production — that breaks Hostinger / real clients.
 */
export function getPublicBaseUrl(): string {
  const configured = (
    process.env.API_PUBLIC_URL ||
    process.env.FRONTEND_URL ||
    process.env.BACKEND_URL ||
    ''
  )
    .trim()
    .replace(/\/$/, '');

  if (configured) return configured;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'API_PUBLIC_URL (or FRONTEND_URL) is required in production for public links and webhooks'
    );
  }

  return `http://localhost:${process.env.PORT || '3000'}`;
}

/** Prefer absolute public URL; fall back to a same-origin path when unset in prod soft contexts. */
export function publicUrlOrPath(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  try {
    return `${getPublicBaseUrl()}${p}`;
  } catch {
    return p;
  }
}
