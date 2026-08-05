import { BRAND } from '@/lib/branding';
import type { TenantInfo } from '@/lib/api';

/** Mimito / MAMS defaults when tenant has not set custom branding */
export const TENANT_BRAND_DEFAULTS = {
  primaryColor: BRAND.primary,
  secondaryColor: '#0f172a',
  accentColor: BRAND.accent,
} as const;

export interface ResolvedTenantBranding {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl?: string;
  faviconUrl?: string;
  name: string;
  slug: string;
  isCustomPrimary: boolean;
  isCustomSecondary: boolean;
  isCustomAccent: boolean;
  usesMamsLogo: boolean;
}

export function hexToHsl(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return BRAND.primaryHsl;
  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function clamp(n: number, min = 0, max = 255): number {
  return Math.min(max, Math.max(min, n));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => clamp(Math.round(v)).toString(16).padStart(2, '0')).join('')}`;
}

/** Darken a hex color by a ratio 0–1 */
export function darkenHex(hex: string, amount = 0.12): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const f = 1 - amount;
  return rgbToHex(rgb.r * f, rgb.g * f, rgb.b * f);
}

/** Lighten a hex color by a ratio 0–1 */
export function lightenHex(hex: string, amount = 0.15): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(
    rgb.r + (255 - rgb.r) * amount,
    rgb.g + (255 - rgb.g) * amount,
    rgb.b + (255 - rgb.b) * amount
  );
}

function isSet(value?: string | null): value is string {
  return Boolean(value && value.trim());
}

export function resolveTenantBranding(tenant?: Partial<TenantInfo> | null): ResolvedTenantBranding {
  const primaryColor = isSet(tenant?.primaryColor)
    ? tenant!.primaryColor!
    : TENANT_BRAND_DEFAULTS.primaryColor;
  const secondaryColor = isSet(tenant?.secondaryColor)
    ? tenant!.secondaryColor!
    : TENANT_BRAND_DEFAULTS.secondaryColor;
  const accentColor = isSet(tenant?.accentColor)
    ? tenant!.accentColor!
    : TENANT_BRAND_DEFAULTS.accentColor;

  return {
    primaryColor,
    secondaryColor,
    accentColor,
    logoUrl: tenant?.logoUrl,
    faviconUrl: tenant?.faviconUrl,
    name: tenant?.name?.trim() || 'Fleet',
    slug: tenant?.slug?.trim() || '',
    isCustomPrimary: isSet(tenant?.primaryColor) && tenant!.primaryColor !== TENANT_BRAND_DEFAULTS.primaryColor,
    isCustomSecondary: isSet(tenant?.secondaryColor),
    isCustomAccent: isSet(tenant?.accentColor),
    usesMamsLogo: !isSet(tenant?.logoUrl),
  };
}

/** Apply tenant palette Integration CSS variables on document root */
export function applyTenantThemeVars(branding: ResolvedTenantBranding): void {
  const root = document.documentElement;
  const primaryHsl = hexToHsl(branding.primaryColor);
  const secondaryHsl = hexToHsl(branding.secondaryColor);
  const accentHsl = hexToHsl(branding.accentColor);
  const primaryHue = primaryHsl.split(' ')[0];
  const sidebarAccent = hexToHsl(darkenHex(branding.primaryColor, 0.08));
  const sidebarBorder = hexToHsl(darkenHex(branding.primaryColor, 0.14));

  root.style.setProperty('--primary', primaryHsl);
  root.style.setProperty('--primary-foreground', '0 0% 100%');
  root.style.setProperty('--secondary', `${primaryHue} 18% 96%`);
  root.style.setProperty('--secondary-foreground', secondaryHsl);
  root.style.setProperty('--accent', accentHsl);
  root.style.setProperty('--accent-foreground', '0 0% 100%');
  root.style.setProperty('--ring', primaryHsl);
  root.style.setProperty('--sidebar-background', primaryHsl);
  root.style.setProperty('--sidebar-foreground', '0 0% 98%');
  root.style.setProperty('--sidebar-primary', '0 0% 100%');
  root.style.setProperty('--sidebar-primary-foreground', primaryHsl);
  root.style.setProperty('--sidebar-accent', sidebarAccent);
  root.style.setProperty('--sidebar-accent-foreground', '0 0% 98%');
  root.style.setProperty('--sidebar-border', sidebarBorder);
  root.style.setProperty('--sidebar-ring', accentHsl);
  root.style.setProperty('--fleet-primary', primaryHsl);
  root.style.setProperty('--fleet-primary-light', hexToHsl(lightenHex(branding.primaryColor, 0.2)));
  root.style.setProperty(
    '--gradient-primary',
    `linear-gradient(135deg, hsl(${primaryHsl}), hsl(${hexToHsl(lightenHex(branding.primaryColor, 0.18))}))`
  );
  root.style.setProperty('--brand-primary', branding.primaryColor);
  root.style.setProperty('--brand-secondary', branding.secondaryColor);
  root.style.setProperty('--brand-accent', branding.accentColor);
  root.style.setProperty('--brand-primary-soft', hexToHsl(lightenHex(branding.primaryColor, 0.85)));
  root.style.setProperty('--brand-border', hexToHsl(lightenHex(branding.primaryColor, 0.55)));
}

export function clearTenantThemeVars(): void {
  const root = document.documentElement;
  const vars = [
    '--primary', '--primary-foreground', '--secondary', '--secondary-foreground',
    '--accent', '--accent-foreground', '--ring',
    '--sidebar-background', '--sidebar-foreground', '--sidebar-primary',
    '--sidebar-primary-foreground', '--sidebar-accent', '--sidebar-accent-foreground',
    '--sidebar-border', '--sidebar-ring', '--fleet-primary', '--fleet-primary-light', '--gradient-primary',
    '--brand-primary', '--brand-secondary', '--brand-accent', '--brand-primary-soft', '--brand-border',
  ];
  vars.forEach((v) => root.style.removeProperty(v));
}
