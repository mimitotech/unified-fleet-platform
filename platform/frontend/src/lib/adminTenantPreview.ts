/**
 * Platform staff open a client app via View Client with ?tenant=<slug>.
 * Preview must be per-browser-tab (sessionStorage), not shared localStorage,
 * so opening client A then client B does not scramble the first tab.
 */

export const TENANT_PREVIEW_PARAM = 'tenant';
export const TENANT_PREVIEW_PARAM_ALT = 'as';
export const TENANT_PREVIEW_SESSION_KEY = 'ufp_tenant_preview';

export function readTenantPreviewSlugFromLocation(
  search = typeof window !== 'undefined' ? window.location.search : '',
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

export function readTenantPreviewSlugFromSession(): string | null {
  try {
    return sessionStorage.getItem(TENANT_PREVIEW_SESSION_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

/** Bind URL ?tenant= into this tab's sessionStorage (and localStorage for branding). */
export function syncTenantPreviewFromUrl(search?: string): string | null {
  const slug = readTenantPreviewSlugFromLocation(search);
  if (!slug) return null;
  try {
    if (!localStorage.getItem('ufp_token')) return slug;
    sessionStorage.setItem(TENANT_PREVIEW_SESSION_KEY, slug);
    // Keep localStorage in sync for branding helpers that still read it,
    // but getTenantSlug() prefers URL / sessionStorage first.
    localStorage.setItem('ufp_tenant_slug', slug);
  } catch {
    /* private mode */
  }
  return slug;
}

/** Preserve ?tenant= / ?as= when navigating inside the client app. */
export function withTenantPreviewSearch(
  pathname: string,
  currentSearch = typeof window !== 'undefined' ? window.location.search : '',
): { pathname: string; search?: string } {
  const slug =
    readTenantPreviewSlugFromLocation(currentSearch) || readTenantPreviewSlugFromSession();
  if (!slug) return { pathname };
  const params = new URLSearchParams(currentSearch);
  if (!params.get(TENANT_PREVIEW_PARAM) && !params.get(TENANT_PREVIEW_PARAM_ALT)) {
    params.set(TENANT_PREVIEW_PARAM, slug);
  }
  const search = params.toString();
  return search ? { pathname, search: `?${search}` } : { pathname };
}
