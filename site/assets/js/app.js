(async () => {
  const content = document.getElementById('app-content');
  const logout = document.getElementById('logout-btn');
  logout?.addEventListener('click', () => {
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
    if (MamsApi.isSystemRole(user.role)) {
      location.href = '/admin/dashboard';
      return;
    }
    if (!user.termsAcceptedAt) {
      location.href = '/auth/terms';
      return;
    }
    document.getElementById('user-chip').textContent = user.fullName || user.email;

    try {
      const tenant = await MamsApi.api('/client/tenant');
      if (tenant?.name) document.getElementById('tenant-name').textContent = tenant.name;
    } catch (_) {}

    const path = location.pathname.replace(/\/$/, '') || '/app/dashboard';
    const page = path.split('/').pop() || 'dashboard';
    document.querySelectorAll('#client-nav a').forEach((a) => {
      a.classList.toggle('active', a.getAttribute('href') === path || a.dataset.mod === page);
    });
    document.getElementById('page-title').textContent =
      page.charAt(0).toUpperCase() + page.slice(1);

    if (page === 'dashboard' || path.endsWith('/app') || path.endsWith('/app/dashboard')) {
      const kpis = await MamsApi.api('/client/dashboard/kpis');
      content.innerHTML = `
        <div class="kpi-grid">
          <div class="kpi"><div class="muted">Assets</div><div class="n">${kpis.assets ?? kpis.assetCount ?? 0}</div></div>
          <div class="kpi"><div class="muted">Open alerts</div><div class="n">${kpis.unackedAlerts ?? kpis.alerts ?? 0}</div></div>
          <div class="kpi"><div class="muted">Drivers</div><div class="n">${kpis.drivers ?? 0}</div></div>
          <div class="kpi"><div class="muted">Fuel tx (30d)</div><div class="n">${kpis.fuelTransactions ?? kpis.fuel ?? 0}</div></div>
        </div>
        <div class="card" style="margin-top:1rem">
          <h3 style="margin-top:0;color:var(--brand)">Fleet snapshot</h3>
          <div id="fleet-box" class="muted">Loading fleet…</div>
        </div>`;
      try {
        const snap = await MamsApi.api('/client/fleet/snapshot');
        const units = snap.units || snap.assets || [];
        const box = document.getElementById('fleet-box');
        if (!units.length) {
          box.textContent = 'No units yet.';
        } else {
          box.innerHTML = `<table class="table"><thead><tr><th>Name</th><th>Status</th><th>Updated</th></tr></thead><tbody>
            ${units.slice(0, 50).map((u) => `<tr>
              <td>${escapeHtml(u.name || u.unitName || u.id || '')}</td>
              <td>${escapeHtml(u.status || u.motionStatus || u.ignition || '—')}</td>
              <td>${escapeHtml(u.updatedAt || u.lastUpdate || '')}</td>
            </tr>`).join('')}
          </tbody></table>`;
        }
      } catch (e) {
        document.getElementById('fleet-box').textContent = e.message || 'Fleet unavailable';
      }
    } else if (page === 'alerts') {
      const data = await MamsApi.api('/client/alerts');
      const alerts = data.alerts || data || [];
      content.innerHTML = `<div class="card"><table class="table"><thead><tr><th>Type</th><th>Message</th><th>When</th></tr></thead><tbody>
        ${(Array.isArray(alerts) ? alerts : []).slice(0, 100).map((a) => `<tr>
          <td>${escapeHtml(a.type || a.alertType || '')}</td>
          <td>${escapeHtml(a.message || a.title || '')}</td>
          <td>${escapeHtml(a.occurredAt || a.createdAt || '')}</td>
        </tr>`).join('') || '<tr><td colspan="3">No alerts</td></tr>'}
      </tbody></table></div>`;
    } else {
      content.innerHTML = `<div class="card"><p>Module <strong>${escapeHtml(page)}</strong> is available in the PHP rewrite shell.
        Full Wialon live panels are being ported endpoint-by-endpoint while keeping the same MySQL data.</p>
        <p class="muted">API stubs respond under <code>/api/client/…</code> so navigation stays stable.</p></div>`;
    }
  } catch (e) {
    if (e.status === 401) {
      MamsApi.clearAuth();
      location.href = '/auth/login';
      return;
    }
    content.innerHTML = `<p class="error">${escapeHtml(e.message || 'Failed to load')}</p>`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();
