/** Base URL for links shown in admin (tenant portal, login, etc.) */
export function getAppBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return import.meta.env.VITE_APP_URL || 'http://localhost:5173';
}

export function getClientLoginUrl(): string {
  return `${getAppBaseUrl()}/auth/login`;
}

export function getAdminUrl(path = '/admin/dashboard'): string {
  return `${getAppBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Branded client app entry — slug is stored on login for system users entering a tenant */
export function getClientPortalUrl(slug?: string): string {
  const base = `${getAppBaseUrl()}/app/dashboard`;
  return slug ? base : base;
}

export function getTenantPortalLabel(slug: string): string {
  return `${getAppBaseUrl()} · slug: ${slug}`;
}
