/** Tenant branding applicator — mirrors React tenantBranding.ts */
const MamsBranding = (() => {
  const DEFAULTS = {
    primary: '#004225',
    secondary: '#0f172a',
    accent: '#1a6b45',
  };

  function hexToRgb(hex) {
    const h = String(hex || '').replace('#', '');
    if (h.length !== 6) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }

  function rgbToHsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b); const min = Math.min(r, g, b);
    let h = 0; let s = 0; const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        default: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  }

  function darken(hex, amount) {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const f = 1 - amount;
    const to = (n) => Math.max(0, Math.min(255, Math.round(n * f))).toString(16).padStart(2, '0');
    return `#${to(rgb.r)}${to(rgb.g)}${to(rgb.b)}`;
  }

  function lighten(hex, amount) {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const to = (n) => Math.max(0, Math.min(255, Math.round(n + (255 - n) * amount))).toString(16).padStart(2, '0');
    return `#${to(rgb.r)}${to(rgb.g)}${to(rgb.b)}`;
  }

  function resolve(tenant) {
    const primary = tenant?.primaryColor || DEFAULTS.primary;
    const secondary = tenant?.secondaryColor || DEFAULTS.secondary;
    const accent = tenant?.accentColor || DEFAULTS.accent;
    return {
      name: tenant?.name || 'MAMS',
      slug: tenant?.slug || '',
      primaryColor: primary,
      secondaryColor: secondary,
      accentColor: accent,
      logoUrl: tenant?.logoUrl || null,
      faviconUrl: tenant?.faviconUrl || null,
      customCss: tenant?.customCss || null,
      usesMamsLogo: !tenant?.logoUrl,
    };
  }

  function applyTheme(branding) {
    const root = document.documentElement;
    const primary = branding.primaryColor || DEFAULTS.primary;
    const secondary = branding.secondaryColor || DEFAULTS.secondary;
    const accent = branding.accentColor || DEFAULTS.accent;
    const pRgb = hexToRgb(primary);
    const sRgb = hexToRgb(secondary);
    const aRgb = hexToRgb(accent);

    root.style.setProperty('--brand', primary);
    root.style.setProperty('--brand-dark', darken(primary, 0.18));
    root.style.setProperty('--brand-mid', accent);
    root.style.setProperty('--brand-light', lighten(primary, 0.92));
    root.style.setProperty('--brand-primary', primary);
    root.style.setProperty('--brand-secondary', secondary);
    root.style.setProperty('--brand-accent', accent);
    root.style.setProperty('--brand-primary-soft', lighten(primary, 0.9));
    root.style.setProperty('--brand-border', lighten(primary, 0.75));

    if (pRgb) {
      root.style.setProperty('--primary', rgbToHsl(pRgb));
      root.style.setProperty('--sidebar-background', rgbToHsl(pRgb));
      root.style.setProperty('--sidebar-primary', rgbToHsl(pRgb));
      root.style.setProperty('--ring', rgbToHsl(pRgb));
      root.style.setProperty('--fleet-primary', rgbToHsl(pRgb));
    }
    if (sRgb) root.style.setProperty('--secondary', rgbToHsl(sRgb));
    if (aRgb) root.style.setProperty('--accent', rgbToHsl(aRgb));

    root.style.setProperty('--sidebar-accent', darken(primary, 0.08));
    root.style.setProperty('--sidebar-border', darken(primary, 0.14));
    root.style.setProperty('--gradient-primary', `linear-gradient(135deg, ${primary}, ${lighten(primary, 0.2)})`);

    // Topbar border uses brand
    document.querySelectorAll('.topbar').forEach((el) => {
      el.style.borderBottomColor = primary;
    });
  }

  function applyFavicon(url) {
    const href = url || '/assets/img/favicon.ico';
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = href;
    let shortcut = document.querySelector('link[rel="shortcut icon"]');
    if (!shortcut) {
      shortcut = document.createElement('link');
      shortcut.rel = 'shortcut icon';
      document.head.appendChild(shortcut);
    }
    shortcut.href = href;
  }

  function applyCustomCss(css) {
    let el = document.getElementById('tenant-custom-css');
    if (!css) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('style');
      el.id = 'tenant-custom-css';
      document.head.appendChild(el);
    }
    el.textContent = css;
  }

  function apply(tenant) {
    const branding = resolve(tenant);
    applyTheme(branding);
    applyFavicon(branding.faviconUrl);
    applyCustomCss(branding.customCss);
    try {
      const slug = branding.slug || localStorage.getItem('ufp_tenant_slug') || 'default';
      localStorage.setItem(`ufp_tenant_branding:${slug}`, JSON.stringify(tenant || {}));
    } catch { /* ignore */ }
    return branding;
  }

  function reset() {
    apply({
      primaryColor: DEFAULTS.primary,
      secondaryColor: DEFAULTS.secondary,
      accentColor: DEFAULTS.accent,
      logoUrl: null,
      faviconUrl: null,
      customCss: null,
      name: 'MAMS',
    });
    try {
      document.title = 'MAMS — Mimito Asset Management System';
    } catch { /* ignore */ }
  }

  function hydrateFromCache() {
    try {
      // Spec: tenant theme ONLY under /app — never on /admin (MAMS chrome) or public
      if (!location.pathname.startsWith('/app')) return;
      const slug = localStorage.getItem('ufp_tenant_slug');
      if (!slug) return;
      const raw = localStorage.getItem(`ufp_tenant_branding:${slug}`);
      if (!raw) return;
      apply(JSON.parse(raw));
    } catch { /* ignore */ }
  }

  return { apply, reset, resolve, hydrateFromCache, DEFAULTS, darken, lighten };
})();

// Public pages: always MAMS green. App pages: hydrate tenant theme from cache.
if (location.pathname.startsWith('/app')) {
  MamsBranding.hydrateFromCache();
} else if (
  location.pathname.startsWith('/auth')
  || location.pathname === '/'
  || location.pathname.startsWith('/terms')
  || location.pathname.startsWith('/privacy')
) {
  MamsBranding.reset();
}
