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

  function redirectLogin() {
    if (redirectInFlight) return;
    redirectInFlight = true;
    clearAuth();
    const next = encodeURIComponent(location.pathname + location.search);
    location.href = '/auth/login' + (next && next !== '%2Fauth%2Flogin' ? '?next=' + next : '');
  }

  async function api(path, options = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    const slug = getTenantSlug();
    if (slug) headers['X-Tenant-Slug'] = slug;

    const res = await fetch('/api' + path, Object.assign({}, options, { headers }));
    const json = await res.json().catch(() => ({}));

    if (res.status === 401) {
      const isAuthCheck = path === '/auth/me' || path === '/auth/login';
      if (!isAuthCheck) {
        // Some admin/client endpoints can transiently return 401 while the session is still valid.
        // Verify via /auth/me first; only redirect if the session is truly gone/invalid.
        try {
          const meRes = await fetch('/api/auth/me', { method: 'GET' });
          if (meRes.ok) {
            const err = new Error('Request unauthorized (session verified)');
            err.status = 401;
            throw err;
          }
        } catch (_) {
          // fall through to redirectLogin below
        }
        redirectLogin();
      }
      const err = new Error('Session expired');
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
    isSystemRole,
    postLoginPath,
  };
})();
