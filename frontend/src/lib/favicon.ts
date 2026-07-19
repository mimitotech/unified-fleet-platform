import { BRAND } from '@/lib/branding';
import { resolveAssetUrl } from '@/lib/assets';

const DEFAULT_TITLE = `${BRAND.name} — ${BRAND.fullName}`;

/** Apply the platform or tenant favicon (`/favicon.ico` when no custom URL). */
export function applyFavicon(href: string = BRAND.favicon): void {
  for (const rel of ['icon', 'shortcut icon'] as const) {
    let link = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = rel;
      document.head.appendChild(link);
    }
    link.type = 'image/x-icon';
    link.href = href;
  }
}

export function applyFaviconFromTenant(faviconUrl?: string | null): void {
  applyFavicon(resolveAssetUrl(faviconUrl) || BRAND.favicon);
}

export function applyDefaultDocumentBranding(): void {
  applyFavicon(BRAND.favicon);
  document.title = DEFAULT_TITLE;
}

export function getDefaultDocumentTitle(): string {
  return DEFAULT_TITLE;
}
