/** Same-origin API client — mirrors frontend/src/lib/api.ts contract */
const MamsApi = (() => {
  const TOKEN_KEY = 'ufp_token';
  const TENANT_KEY = 'ufp_tenant_slug';
  const ROLE_KEY = 'ufp_role';
  const COOKIE_TOKEN_KEY = 'ufp_token';
  let redirectInFlight = false;

  function readCookie(name) {
    try {
      const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : '';
    } catch {
      return '';
    }
  }

  function setCookie(name, value, maxAgeSeconds) {
    try {
      const secure = location.protocol === 'https:';
      const parts = [
        name + '=' + encodeURIComponent(value || ''),
        'Path=/',
        'SameSite=Lax',
        'Max-Age=' + Math.floor(maxAgeSeconds || 0),
      ];
      if (secure) parts.push('Secure');
      document.cookie = parts.join('; ');
    } catch {
      /* ignore */
    }
  }

  function deleteCookie(name) {
    try {
      document.cookie = name + '=; Path=/; Max-Age=0; SameSite=Lax';
    } catch {
      /* ignore */
    }
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || readCookie(COOKIE_TOKEN_KEY) || '';
  }
  function getTenantSlug() { return localStorage.getItem(TENANT_KEY) || ''; }
  function getRole() { return localStorage.getItem(ROLE_KEY) || ''; }

  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TENANT_KEY);
    localStorage.removeItem(ROLE_KEY);
    deleteCookie(COOKIE_TOKEN_KEY);
  }

  function setAuth({ token, tenantSlug, role }) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    if (token) setCookie(COOKIE_TOKEN_KEY, token, 604800); // ~7 days
    else deleteCookie(COOKIE_TOKEN_KEY);
    if (tenantSlug) localStorage.setItem(TENANT_KEY, tenantSlug);
    else localStorage.removeItem(TENANT_KEY);
    if (role) localStorage.setItem(ROLE_KEY, role);
    else localStorage.removeItem(ROLE_KEY);
  }

  /** Keep cookie in sync with localStorage so Apache-stripped Authorization still works. */
  function syncTokenCookie() {
    const token = localStorage.getItem(TOKEN_KEY) || '';
    if (token) setCookie(COOKIE_TOKEN_KEY, token, 604800);
  }

  function redirectLogin() {
    if (redirectInFlight) return;
    redirectInFlight = true;
    clearAuth();
    const next = encodeURIComponent(location.pathname + location.search);
    location.href = '/auth/login' + (next && next !== '%2Fauth%2Flogin' ? '?next=' + next : '');
  }

  function authHeaders(extra) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    const slug = getTenantSlug();
    if (slug) headers['X-Tenant-Slug'] = slug;
    return headers;
  }

  /**
   * Confirm whether the JWT is still valid.
   * Always sends Bearer from localStorage — cookie-only verify was causing false logouts.
   */
  async function verifySessionAlive() {
    const token = getToken();
    if (!token) return false;
    try {
      const meRes = await fetch('/api/auth/me', {
        method: 'GET',
        headers: authHeaders(),
        credentials: 'same-origin',
      });
      if (meRes.ok) {
        syncTokenCookie();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async function api(path, options = {}) {
    syncTokenCookie();
    const headers = authHeaders(options.headers || {});

    const res = await fetch('/api' + path, Object.assign({}, options, {
      headers,
      credentials: 'same-origin',
    }));
    const json = await res.json().catch(() => ({}));

    if (res.status === 401) {
      const isAuthCheck = path === '/auth/me' || path === '/auth/login';
      if (!isAuthCheck) {
        // Module endpoints can return 401 for wrong reasons (missing tenant, bad route, etc.).
        // Only hard-logout when /auth/me also rejects the token.
        const alive = await verifySessionAlive();
        if (alive) {
          const err = new Error(json.error || 'Not allowed for this resource');
          err.status = 403;
          throw err;
        }
        redirectLogin();
      }
      const err = new Error(json.error || 'Session expired');
      err.status = 401;
      throw err;
    }

    if (!res.ok) {
      const err = new Error(json.error || res.statusText || 'Request failed');
      err.status = res.status;
      throw err;
    }

    return json.data !== undefined ? json.data : json;
  }

  function isSystemRole(role) {
    return role === 'super_admin' || role === 'platform_admin';
  }

  function postLoginPath(user) {
    if (!user?.termsAcceptedAt) return '/auth/terms';
    return isSystemRole(user.role) ? '/admin/dashboard' : '/app/dashboard';
  }

  return {
    api,
    getToken,
    getTenantSlug,
    getRole,
    clearAuth,
    setAuth,
    redirectLogin,
    verifySessionAlive,
    isSystemRole,
    postLoginPath,
  };
})();
