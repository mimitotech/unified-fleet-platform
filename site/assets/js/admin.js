(async () => {
  const content = document.getElementById('admin-content');
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    MamsApi.clearAuth();
    location.href = '/auth/login';
  });

  if (!MamsApi.getToken()) {
    location.href = '/auth/login';
    return;
  }

  try {
    const me = await MamsApi.api('/auth/me');
    const user = me.user;
    if (!MamsApi.isSystemRole(user.role)) {
      location.href = '/app/dashboard';
      return;
    }
    document.getElementById('user-chip').textContent = user.fullName || user.email;

    const path = location.pathname;
    if (path.includes('/tenants')) {
      const data = await MamsApi.api('/admin/tenants');
      const tenants = data.tenants || data || [];
      content.innerHTML = `<div class="card"><table class="table"><thead><tr><th>Name</th><th>Slug</th><th>Status</th></tr></thead><tbody>
        ${(Array.isArray(tenants) ? tenants : []).map((t) => `<tr>
          <td><a href="/admin/tenants">${escapeHtml(t.name || '')}</a></td>
          <td>${escapeHtml(t.slug || '')}</td>
          <td>${escapeHtml(t.status || '')}</td>
        </tr>`).join('') || '<tr><td colspan="3">No tenants</td></tr>'}
      </tbody></table></div>`;
    } else if (path.includes('/users')) {
      const data = await MamsApi.api('/admin/users');
      const users = data.users || data || [];
      content.innerHTML = `<div class="card"><table class="table"><thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead><tbody>
        ${(Array.isArray(users) ? users : []).map((u) => `<tr>
          <td>${escapeHtml(u.fullName || u.full_name || '')}</td>
          <td>${escapeHtml(u.email || '')}</td>
          <td>${escapeHtml(u.role || '')}</td>
        </tr>`).join('') || '<tr><td colspan="3">No users</td></tr>'}
      </tbody></table></div>`;
    } else {
      const dash = await MamsApi.api('/admin/dashboard');
      const health = await MamsApi.api('/admin/system/health');
      content.innerHTML = `
        <div class="kpi-grid">
          <div class="kpi"><div class="muted">Tenants</div><div class="n">${dash.tenants ?? dash.tenantCount ?? 0}</div></div>
          <div class="kpi"><div class="muted">Users</div><div class="n">${dash.users ?? dash.userCount ?? 0}</div></div>
          <div class="kpi"><div class="muted">Assets</div><div class="n">${dash.assets ?? dash.assetCount ?? 0}</div></div>
          <div class="kpi"><div class="muted">Database</div><div class="n" style="font-size:1rem">${health.database || health.status || 'ok'}</div></div>
        </div>`;
    }
  } catch (e) {
    if (e.status === 401) {
      MamsApi.clearAuth();
      location.href = '/auth/login';
      return;
    }
    content.innerHTML = `<p class="error">${escapeHtml(e.message || 'Error')}</p>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
})();
