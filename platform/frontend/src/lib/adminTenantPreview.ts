/**
 * Platform staff open a client app via View Client with ?tenant=<slug>.
 * Apply that slug to localStorage before React queries run so X-Tenant-Slug
 * always matches the client they clicked — not a leftover from a prior view.
 */

export const TENANT_PREVIEW_PARAM = 'tenant';
export const TENANT_PREVIEW_PARAM_ALT = 'as';

export function readTenantPreviewSlugFromLocation(
  search = typeof window !== 'undefined' ? window.location.search : ''
): string | null {
  try {
    const params = new URLSearchParams(search);
    const raw = params.get(TENANT_PREVIEW_PARAM) || params.get(TENANT_PREVIEW_PARAM_ALT);
    const slug = raw?.trim();
    return slug || null;
  } catch {
    return null;
  }
}

/** Call before React mount (and when URL search changes) for system-admin preview. */
export function syncTenantPreviewFromUrl(search?: string): string | null {
  const slug = readTenantPreviewSlugFromLocation(search);
  if (!slug) return null;
  try {
    if (!localStorage.getItem('ufp_token')) return slug;
    localStorage.setItem('ufp_tenant_slug', slug);
  } catch {
    /* private mode */
  }
  return slug;
}
