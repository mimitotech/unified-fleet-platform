/** Same-origin API client — mirrors frontend/src/lib/api.ts contract */
const MamsApi = (() => {
  const TOKEN_KEY = 'ufp_token';
  const TENANT_KEY = 'ufp_tenant_slug';
  const ROLE_KEY = 'ufp_role';

  function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
  function getTenantSlug() { return localStorage.getItem(TENANT_KEY) || ''; }
  function getRole() { return localStorage.getItem(ROLE_KEY) || ''; }

  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TENANT_KEY);
    localStorage.removeItem(ROLE_KEY);
  }

  function setAuth({ token, tenantSlug, role }) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (tenantSlug) localStorage.setItem(TENANT_KEY, tenantSlug);
    if (role) localStorage.setItem(ROLE_KEY, role);
  }

  function redirectLogin() {
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
      redirectLogin();
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
