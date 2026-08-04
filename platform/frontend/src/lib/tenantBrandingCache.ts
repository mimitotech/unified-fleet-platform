import type { TenantInfo } from '@/lib/api';
import { applyTenantThemeVars, clearTenantThemeVars, resolveTenantBranding } from '@/lib/tenantBranding';
import { applyDefaultDocumentBranding, applyFaviconFromTenant } from '@/lib/favicon';

const KEY_PREFIX = 'ufp_tenant_branding:';
const VARS_KEY_PREFIX = 'ufp_tenant_theme_vars:';

const THEME_VAR_KEYS = [
  '--primary', '--primary-foreground', '--secondary', '--secondary-foreground',
  '--accent', '--accent-foreground', '--ring',
  '--sidebar-background', '--sidebar-foreground', '--sidebar-primary',
  '--sidebar-primary-foreground', '--sidebar-accent', '--sidebar-accent-foreground',
  '--sidebar-border', '--sidebar-ring', '--fleet-primary', '--fleet-primary-light',
  '--gradient-primary',
] as const;

function tenantSlug(): string | null {
  try {
    return localStorage.getItem('ufp_tenant_slug');
  } catch {
    return null;
  }
}

export function loadBrandingCache(slug?: string | null): TenantInfo | null {
  const key = slug ?? tenantSlug();
  if (!key) return null;
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as TenantInfo;
  } catch {
    return null;
  }
}

export function saveBrandingCache(tenant: TenantInfo): void {
  if (!tenant.slug) return;
  try {
    localStorage.setItem(
      `${KEY_PREFIX}${tenant.slug}`,
      JSON.stringify({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        primaryColor: tenant.primaryColor,
        secondaryColor: tenant.secondaryColor,
        accentColor: tenant.accentColor,
        logoUrl: tenant.logoUrl,
        faviconUrl: tenant.faviconUrl,
        customCss: tenant.customCss,
      })
    );
    saveThemeVarsCache(tenant.slug);
  } catch {
    /* quota / private mode */
  }
}

function saveThemeVarsCache(slug: string): void {
  const root = document.documentElement;
  const vars: Record<string, string> = {};
  for (const key of THEME_VAR_KEYS) {
    const value = root.style.getPropertyValue(key).trim();
    if (value) vars[key] = value;
  }
  if (Object.keys(vars).length > 0) {
    localStorage.setItem(`${VARS_KEY_PREFIX}${slug}`, JSON.stringify(vars));
  }
}

function applyThemeVarsFromCache(slug: string): boolean {
  try {
    const raw = localStorage.getItem(`${VARS_KEY_PREFIX}${slug}`);
    if (!raw) return false;
    const vars = JSON.parse(raw) as Record<string, string>;
    const root = document.documentElement;
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
    return true;
  } catch {
    return false;
  }
}

export function clearBrandingCache(slug?: string | null): void {
  const key = slug ?? tenantSlug();
  if (!key) return;
  try {
    localStorage.removeItem(`${KEY_PREFIX}${key}`);
    localStorage.removeItem(`${VARS_KEY_PREFIX}${key}`);
  } catch {
    /* ignore */
  }
}

function applyCustomCss(css?: string | null): void {
  let styleEl = document.getElementById('tenant-custom-css') as HTMLStyleElement | null;
  if (css?.trim()) {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'tenant-custom-css';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = css;
  } else if (styleEl) {
    styleEl.remove();
  }
}

function clearCustomCss(): void {
  document.getElementById('tenant-custom-css')?.remove();
}

/**
 * Strip client theme/CSS/favicon so public auth & marketing always show MAMS.
 * Does not delete the branding cache — that only applies after a successful login in /app.
 */
export function resetToPlatformBranding(): void {
  clearTenantThemeVars();
  clearCustomCss();
  applyDefaultDocumentBranding();
}

function isAuthenticatedAppPath(): boolean {
  try {
    const path = window.location.pathname;
    return path.startsWith('/app') || path.startsWith('/admin');
  } catch {
    return false;
  }
}

/**
 * Runs before React mount — prevents default-theme flash on /app reload only.
 * Login, landing, and other public routes stay on platform (MAMS) branding.
 */
export function hydrateTenantThemeFromCache(): void {
  let token: string | null = null;
  try {
    token = localStorage.getItem('ufp_token');
  } catch {
    return;
  }
  const slug = tenantSlug();
  if (!token || !slug || !isAuthenticatedAppPath()) return;

  if (applyThemeVarsFromCache(slug)) {
    const cached = loadBrandingCache(slug);
    if (cached?.customCss) applyCustomCss(cached.customCss);
    if (cached?.name) document.title = `${cached.name} — Fleet Management`;
    applyFaviconFromTenant(cached?.faviconUrl);
    return;
  }

  const cached = loadBrandingCache(slug);
  if (!cached) return;

  applyTenantThemeVars(resolveTenantBranding(cached));
  applyCustomCss(cached.customCss);
  saveThemeVarsCache(slug);

  if (cached.name) {
    document.title = `${cached.name} — Fleet Management`;
  }
  applyFaviconFromTenant(cached.faviconUrl);
}

export function applyTenantBranding(tenant: TenantInfo): void {
  applyTenantThemeVars(resolveTenantBranding(tenant));
  applyCustomCss(tenant.customCss);
  saveBrandingCache(tenant);
}
