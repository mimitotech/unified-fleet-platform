(() => {
  'use strict';

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDate(v) {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d) ? esc(v) : d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  }

  function statusBadge(status) {
    const s = String(status || 'inactive').toLowerCase();
    const cls = s === 'active' || s === 'operational' ? 'success' : s === 'warning' ? 'warning' : 'inactive';
    return `<span class="badge badge-${cls}">${esc(status || 'inactive')}</span>`;
  }

  function roleBadge(role) {
    return `<span class="badge badge-brand">${esc(role || '—')}</span>`;
  }

  function emptyState(icon, title, desc) {
    return `<div class="empty-state"><div class="icon">${icon}</div><h3>${esc(title)}</h3><p>${esc(desc)}</p></div>`;
  }

  function loader() {
    return '<div class="page-loader"><div class="spinner"></div>Loading…</div>';
  }

  function kpi(label, value, sub) {
    return `<div class="kpi"><div class="label">${esc(label)}</div><div class="n">${esc(value)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>`;
  }

  function tableWrap(headers, rowsHtml, emptyMsg) {
    if (!rowsHtml) {
      return `<div class="card card-flat">${emptyState('📋', emptyMsg || 'No data', 'Nothing to show yet.')}</div>`;
    }
    return `<div class="card card-flat"><div class="table-wrap"><table class="table"><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table></div></div>`;
  }

  const ROUTES = {
    dashboard: { title: 'Dashboard', subtitle: 'Platform overview', icon: '◉' },
    tenants: { title: 'Clients', subtitle: 'Tenant management', icon: '🏢' },
    users: { title: 'Client Users', subtitle: 'End-user accounts', icon: '👥' },
    'system-users': { title: 'System Users', subtitle: 'Platform administrators', icon: '🛡' },
    system: { title: 'System', subtitle: 'Health & configuration', icon: '⚙' },
    marketplace: { title: 'Integrations', subtitle: 'Marketplace & connectors', icon: '🔌' },
    wialon: { title: 'Wialon Center', subtitle: 'Wialon integration hub', icon: '🛰' },
    loconav: { title: 'LocoNav Center', subtitle: 'LocoNav integration hub', icon: '🧭' },
    tracksolid: { title: 'TrackSolid Center', subtitle: 'TrackSolid integration hub', icon: '📡' },
    support: { title: 'Support', subtitle: 'Help & documentation', icon: '💬' },
    account: { title: 'My Account', subtitle: 'Profile & security', icon: '👤' },
  };

  async function renderDashboard() {
    const [dash, health] = await Promise.all([
      MamsApi.api('/admin/dashboard'),
      MamsApi.api('/admin/system/health'),
    ]);
    const dbOk = health.database?.status === 'ok' || health.overall === 'operational';
    return `<div class="kpi-grid">
      ${kpi('Clients', dash.totalTenants ?? 0, (dash.activeTenants ?? 0) + ' active')}
      ${kpi('Vehicles', dash.totalVehicles ?? 0, (dash.activeVehicles ?? 0) + ' online')}
      ${kpi('Users', dash.totalUsers ?? 0)}
      ${kpi('Pending alerts', dash.pendingAlerts ?? 0)}
      ${kpi('Client warnings', dash.tenantWarning ?? 0)}
      ${kpi('System', dbOk ? 'Operational' : 'Degraded')}
    </div>
    <div class="grid-2 mt-2">
      <div class="card">
        <div class="card-header"><h3>Platform health</h3>
          <span class="health-dot ${dbOk ? 'ok' : 'err'}"></span>
        </div>
        <div class="settings-grid">
          <div><span class="muted">Overall</span><div><strong>${esc(health.overall || '—')}</strong></div></div>
          <div><span class="muted">Database</span><div>${statusBadge(health.database?.status || 'unknown')}</div></div>
          <div><span class="muted">API</span><div>${statusBadge(health.api?.status || 'ok')}</div></div>
          <div><span class="muted">Generated</span><div class="muted">${fmtDate(dash.generatedAt)}</div></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Quick links</h3></div>
        <div class="stack">
          <a class="btn btn-ghost" href="/admin/tenants">Manage clients →</a>
          <a class="btn btn-ghost" href="/admin/users">Client users →</a>
          <a class="btn btn-ghost" href="/admin/wialon">Wialon Center →</a>
          <a class="btn btn-ghost" href="/admin/system">System settings →</a>
        </div>
      </div>
    </div>`;
  }

  function tenantRowsHtml(tenants) {
    return tenants.map((t) => {
      const status = t.status || (t.isActive ? 'active' : 'inactive');
      return `<tr class="row-clickable" data-id="${esc(t.id)}">
        <td><strong>${esc(t.name)}</strong><br><span class="muted">${esc(t.slug)}</span></td>
        <td>${statusBadge(status)}</td>
        <td>${t.vehicleCount ?? '—'}</td>
        <td>${t.userCount ?? '—'}</td>
        <td class="muted">${esc(t.contactEmail || '—')}</td>
        <td class="muted">${fmtDate(t.createdAt)}</td>
        <td><button type="button" class="btn btn-sm btn-ghost" data-action="toggle-tenant" data-id="${esc(t.id)}" data-status="${esc(status)}">${status === 'active' ? 'Deactivate' : 'Activate'}</button></td>
      </tr>`;
    }).join('');
  }

  function tenantTableHtml(data) {
    const tenants = data.tenants || (Array.isArray(data) ? data : []);
    return `<div class="muted" style="margin-bottom:0.5rem">${data.total ?? tenants.length} total</div>
    ${tableWrap(['Client', 'Status', 'Vehicles', 'Users', 'Contact', 'Created', 'Actions'], tenantRowsHtml(tenants), 'No clients yet')}`;
  }

  async function reloadTenants(search) {
    const root = document.getElementById('tenant-table-root');
    if (!root) return;
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    try {
      const data = await MamsApi.api('/admin/tenants' + q);
      root.innerHTML = tenantTableHtml(data);
    } catch (ex) {
      root.innerHTML = `<div class="banner banner-error">${esc(ex.message || 'Search failed')}</div>`;
    }
  }

  async function renderTenants() {
    const data = await MamsApi.api('/admin/tenants');

    return `<div class="search-bar">
      <input class="input" id="tenant-search" placeholder="Search clients…" />
      <button type="button" class="btn btn-sm btn-ghost" data-action="toggle-tenant-form">+ New client</button>
    </div>
    <div class="card mt-1" id="tenant-new-form-wrap" hidden>
      <div class="card-header"><h3>New client</h3></div>
      <form id="tenant-form" class="form-grid">
        <label><span>Name</span><input class="input" name="name" required /></label>
        <label><span>Slug</span><input class="input" name="slug" required placeholder="acme-logistics" /></label>
        <label><span>Contact email</span><input class="input" type="email" name="contactEmail" /></label>
        <div class="form-grid-action"><button type="submit" class="btn">Create client</button></div>
        <p id="tenant-form-error" class="error" hidden></p>
      </form>
    </div>
    <div id="tenant-table-root">${tenantTableHtml(data)}</div>
    <div id="tenant-detail-root"></div>`;
  }

  async function openTenantDetail(id) {
    const root = document.getElementById('tenant-detail-root');
    if (!root) return;
    root.innerHTML = `<div class="modal-overlay" id="tenant-modal"><div class="modal-panel">${loader()}</div></div>`;

    try {
      const [tenant, modules, integrations] = await Promise.all([
        MamsApi.api(`/admin/tenants/${encodeURIComponent(id)}`),
        MamsApi.api(`/admin/tenants/${encodeURIComponent(id)}/modules`).catch(() => []),
        MamsApi.api(`/admin/tenants/${encodeURIComponent(id)}/integrations`).catch(() => []),
      ]);
      const modList = Array.isArray(modules) ? modules : [];
      const intList = Array.isArray(integrations) ? integrations : [];
      const panel = document.querySelector('#tenant-modal .modal-panel');
      if (!panel) return;

      const intRows = intList.map((i) => `<tr>
        <td><strong>${esc(i.sourceType)}</strong></td>
        <td>${i.isActive && i.verified ? '<span class="badge badge-success">Connected</span>' : '<span class="badge badge-inactive">Not connected</span>'}</td>
        <td class="muted">${fmtDate(i.lastSyncAt)}</td>
      </tr>`).join('');

      panel.innerHTML = `
        <div class="modal-header">
          <h3>${esc(tenant.name)}</h3>
          <button type="button" class="modal-close" data-action="close-tenant-modal">✕</button>
        </div>
        <div class="settings-grid">
          <div><span class="muted">Slug</span><div><strong>${esc(tenant.slug)}</strong></div></div>
          <div><span class="muted">Status</span><div>${statusBadge(tenant.status)}</div></div>
          <div><span class="muted">Contact</span><div>${esc(tenant.contactEmail || '—')}</div></div>
          <div><span class="muted">Manager</span><div>${esc(tenant.assignedManagerName || '—')}</div></div>
          <div><span class="muted">Vehicles used</span><div>${tenant.usage?.vehiclesUsed ?? '—'}${tenant.maxVehicles ? ' / ' + tenant.maxVehicles : ''}</div></div>
          <div><span class="muted">Users used</span><div>${tenant.usage?.usersUsed ?? '—'}${tenant.maxUsers ? ' / ' + tenant.maxUsers : ''}</div></div>
        </div>
        <h4 style="margin:1.25rem 0 0.5rem;color:var(--brand-dark)">Modules</h4>
        <div style="display:flex;flex-wrap:wrap;gap:0.4rem">
          ${modList.map((m) => `<span class="badge ${m.isEnabled ? 'badge-success' : 'badge-inactive'}">${esc(m.label)}</span>`).join('') || '<span class="muted">No modules configured</span>'}
        </div>
        <h4 style="margin:1.25rem 0 0.5rem;color:var(--brand-dark)">Integrations</h4>
        ${intList.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Source</th><th>Status</th><th>Last sync</th></tr></thead><tbody>${intRows}</tbody></table></div>` : '<p class="muted">No integrations configured</p>'}
      `;
    } catch (ex) {
      root.innerHTML = `<div class="modal-overlay" id="tenant-modal"><div class="modal-panel"><div class="banner banner-error">${esc(ex.message || 'Failed to load client')}</div></div></div>`;
    }
  }

  async function renderUsers() {
    const users = await MamsApi.api('/admin/users');
    const list = Array.isArray(users) ? users : users.users || [];
    const rows = list.map((u) => `<tr>
      <td><strong>${esc(u.fullName || u.full_name || '—')}</strong></td>
      <td>${esc(u.email)}</td>
      <td>${roleBadge(u.role)}</td>
      <td>${esc(u.tenantName || u.tenantSlug || '—')}</td>
      <td>${u.isActive !== false ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-inactive">Inactive</span>'}</td>
      <td class="muted">${fmtDate(u.lastLoginAt)}</td>
      <td class="actions">
        <button type="button" class="btn btn-sm btn-ghost" data-action="toggle-admin-user" data-id="${esc(u.id)}" data-active="${u.isActive !== false ? '1' : '0'}">${u.isActive !== false ? 'Deactivate' : 'Activate'}</button>
        <button type="button" class="btn btn-sm btn-ghost" data-action="reset-admin-user-pw" data-id="${esc(u.id)}">Reset password</button>
      </td>
    </tr>`).join('');

    return `<div class="card-header" style="margin-bottom:1rem"><h3 style="margin:0;color:var(--brand)">Client users</h3><span class="muted">${list.length} users</span></div>
    ${tableWrap(['Name', 'Email', 'Role', 'Client', 'Status', 'Last login', 'Actions'], rows, 'No client users')}`;
  }

  async function renderSystemUsers() {
    const data = await MamsApi.api('/admin/system-users').catch(() => ({ users: [] }));
    const list = Array.isArray(data) ? data : data.users || [];
    const rows = list.map((u) => `<tr>
      <td><strong>${esc(u.fullName || u.full_name || '—')}</strong></td>
      <td>${esc(u.email || '—')}</td>
      <td>${roleBadge(u.role)}</td>
      <td>${statusBadge(u.isActive === false ? 'inactive' : 'active')}</td>
      <td class="muted">${fmtDate(u.lastLoginAt || u.last_login_at)}</td>
    </tr>`).join('');
    return `<div class="card-header" style="margin-bottom:1rem"><h3 style="margin:0;color:var(--brand)">System users</h3><span class="muted">${list.length} admins</span></div>
    ${tableWrap(['Name', 'Email', 'Role', 'Status', 'Last login'], rows, 'No system users')}`;
  }

  async function renderSystem() {
    const [health, settings, audit] = await Promise.all([
      MamsApi.api('/admin/system/health').catch(() => ({})),
      MamsApi.api('/admin/system/settings').catch(() => ({ settings: [], map: {} })),
      MamsApi.api('/admin/audit').catch(() => []),
    ]);
    const dbOk = health.database?.status === 'ok' || health.database === 'connected' || health.status === 'ok';

    let settingsList = [];
    if (Array.isArray(settings)) {
      settingsList = settings;
    } else if (Array.isArray(settings.settings) && settings.settings.length) {
      settingsList = settings.settings;
    } else if (settings.map && typeof settings.map === 'object') {
      settingsList = Object.entries(settings.map).map(([key, value]) => ({ key, value }));
    }

    const logs = Array.isArray(audit) ? audit : audit.logs || [];
    const logList = logs.slice(0, 30);
    return `<div class="kpi-grid">
      ${kpi('Status', health.overall || health.status || '—')}
      ${kpi('Database', dbOk ? 'Connected' : (health.database?.status || '—'))}
      ${kpi('API', health.api?.status || 'ok')}
      ${kpi('Settings', settingsList.length)}
    </div>
    <div class="grid-2 mt-2">
      <div class="card">
        <div class="card-header"><h3>System settings</h3></div>
        <div class="settings-grid">
          ${settingsList.slice(0, 12).map((s) => {
            const v = s.value;
            const display = v != null && typeof v === 'object' ? JSON.stringify(v) : (v ?? '—');
            return `<div><span class="muted">${esc(s.key || s.name)}</span><div><strong>${esc(display)}</strong></div></div>`;
          }).join('') || '<p class="muted">No settings rows</p>'}
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Recent audit</h3></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>Action</th><th>User</th><th>When</th></tr></thead><tbody>
          ${logList.map((l) => `<tr><td>${esc(l.action)}</td><td>${esc(l.userEmail || l.user_email || '—')}</td><td class="muted">${fmtDate(l.createdAt || l.created_at)}</td></tr>`).join('') || '<tr><td colspan="3">No audit entries</td></tr>'}
        </tbody></table></div>
      </div>
    </div>`;
  }

  function integrationCenter(name, desc, features) {
    return `<div class="integration-panel">
      <h3>${esc(name)}</h3>
      <p>${esc(desc)}</p>
      <div style="margin-top:1.25rem;display:flex;flex-wrap:wrap;gap:0.5rem;justify-content:center">
        ${features.map((f) => `<span class="badge badge-brand">${esc(f)}</span>`).join('')}
      </div>
    </div>
    <div class="card mt-2">${emptyState('🔌', 'Integration center', 'Full live panels for credential management, sync status and device trees are being ported from the React admin UI.')}</div>`;
  }

  async function renderMarketplace() {
    const data = await MamsApi.api('/admin/marketplace').catch(() => ({ items: [] }));
    const list = Array.isArray(data) ? data : data.items || data.integrations || [];
    if (!list.length) {
      return integrationCenter('Integrations Marketplace', 'Connect telematics providers, fuel systems and third-party services for your clients.', [
        'Wialon', 'LocoNav', 'TrackSolid', 'Fuel cards', 'ERP',
      ]);
    }
    const rows = list.map((i) => {
      const enabled = i.isEnabledGlobally ?? i.enabled ?? (i.status === 'active');
      return `<tr>
        <td><strong>${esc(i.name || i.key || i.id)}</strong></td>
        <td>${esc(i.category || i.type || '—')}</td>
        <td>${statusBadge(enabled ? 'active' : 'inactive')}</td>
        <td>${i.key ? `<button type="button" class="btn btn-sm btn-ghost" data-action="toggle-marketplace" data-key="${esc(i.key)}" data-enabled="${enabled ? '1' : '0'}">${enabled ? 'Disable' : 'Enable'}</button>` : '—'}</td>
      </tr>`;
    }).join('');
    return `<div class="card">${tableWrap(['Integration', 'Category', 'Status', 'Actions'], rows, 'No marketplace items')}</div>`;
  }

  async function hubIntegrationHtml(tenantId, sourceType) {
    if (!tenantId) {
      return '<p class="muted">No clients to show.</p>';
    }
    try {
      const integrations = await MamsApi.api(`/admin/tenants/${encodeURIComponent(tenantId)}/integrations`);
      const list = (Array.isArray(integrations) ? integrations : []).filter((i) => i.sourceType === sourceType);
      if (!list.length) {
        return emptyState('🔌', 'Not connected', `This client has no ${sourceType} integration configured yet.`);
      }
      const rows = list.map((i) => `<tr>
        <td>${i.isActive ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-inactive">Inactive</span>'}</td>
        <td>${i.verified ? '<span class="badge badge-success">Verified</span>' : '<span class="badge badge-warning">Unverified</span>'}</td>
        <td class="muted">${fmtDate(i.lastSyncAt)}</td>
        <td class="muted">${esc(i.lastError || '—')}</td>
      </tr>`).join('');
      return tableWrap(['Status', 'Verified', 'Last sync', 'Error'], rows, 'No data');
    } catch (ex) {
      return `<div class="banner banner-error">${esc(ex.message || 'Failed to load integration status')}</div>`;
    }
  }

  async function renderIntegrationHub(sourceType, name, desc, features) {
    const data = await MamsApi.api('/admin/tenants?limit=100').catch(() => ({ tenants: [] }));
    const tenants = data.tenants || (Array.isArray(data) ? data : []);
    const firstId = tenants[0]?.id || '';
    const initialHtml = await hubIntegrationHtml(firstId, sourceType);
    const options = tenants.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');

    return `<div class="integration-panel">
      <h3>${esc(name)}</h3>
      <p>${esc(desc)}</p>
      <div style="margin-top:1.25rem;display:flex;flex-wrap:wrap;gap:0.5rem;justify-content:center">
        ${features.map((f) => `<span class="badge badge-brand">${esc(f)}</span>`).join('')}
      </div>
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Client integration status</h3></div>
      ${tenants.length ? `<div class="search-bar">
        <select class="select" id="hub-tenant-select" data-source="${esc(sourceType)}" style="max-width:320px">${options}</select>
      </div>` : ''}
      <div id="hub-integration-root">${initialHtml}</div>
      <p class="muted mt-1">Live sync dashboards, credential management and device trees require the Wialon HTTP integration to be enabled per tenant; this view shows connection status only.</p>
    </div>`;
  }

  async function renderWialon() {
    return renderIntegrationHub('wialon', 'Wialon Center', 'Central hub for Wialon hosting URLs, account trees, sync jobs, report templates and fleet mapping.', [
      'Account tree', 'Sync status', 'Report templates', 'Fuel intelligence', 'Video streams',
    ]);
  }

  async function renderLoconav() {
    return renderIntegrationHub('loconav', 'LocoNav Center', 'Manage LocoNav API credentials, device imports and live position sync for supported tenants.', [
      'Credentials', 'Device sync', 'Live positions',
    ]);
  }

  async function renderTracksolid() {
    return renderIntegrationHub('tracksolid', 'TrackSolid Center', 'TrackSolid / Jimi IoT integration for GPS trackers, commands and sensor data.', [
      'Device registry', 'Commands', 'Sensor polling',
    ]);
  }

  async function renderSupport() {
    return `<div class="card">
      <div class="card-header"><h3>Support & resources</h3></div>
      <div class="stack">
        <p>Need help with MAMS? Contact your platform administrator or Mimito support.</p>
        <div class="settings-grid">
          <div class="setting-item"><span class="muted">Documentation</span><div>Internal wiki & API reference</div></div>
          <div class="setting-item"><span class="muted">Status</span><div><a href="/health" target="_blank">System health endpoint</a></div></div>
          <div class="setting-item"><span class="muted">Email</span><div>support@mimito.com</div></div>
        </div>
      </div>
    </div>`;
  }

  async function renderAccount() {
    const me = await MamsApi.api('/auth/me');
    const user = me.user || {};
    const initials = (user.fullName || user.email || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    return `<div class="grid-2">
      <div class="card">
        <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem">
          <div class="user-avatar" style="width:48px;height:48px;font-size:1rem">${esc(initials)}</div>
          <div>
            <h3 style="margin:0;color:var(--brand)">${esc(user.fullName || user.email)}</h3>
            <p class="muted" style="margin:0">${esc(user.email)}</p>
          </div>
        </div>
        <div class="settings-grid">
          <div><span class="muted">Role</span><div>${roleBadge(user.role)}</div></div>
          <div><span class="muted">Last login</span><div>${fmtDate(user.lastLoginAt)}</div></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Security</h3></div>
        <form id="pw-form" class="form-stack">
          <label><span>Current password</span><input class="input" type="password" name="current" required autocomplete="current-password" /></label>
          <label><span>New password</span><input class="input" type="password" name="new" required minlength="8" autocomplete="new-password" /></label>
          <label><span>Confirm new password</span><input class="input" type="password" name="confirm" required autocomplete="new-password" /></label>
          <p id="pw-error" class="error" hidden></p>
          <p id="pw-ok" class="success-text" hidden>Password updated.</p>
          <button type="submit" class="btn">Change password</button>
        </form>
      </div>
    </div>`;
  }

  const RENDERERS = {
    dashboard: renderDashboard,
    tenants: renderTenants,
    users: renderUsers,
    'system-users': renderSystemUsers,
    system: renderSystem,
    marketplace: renderMarketplace,
    wialon: renderWialon,
    loconav: renderLoconav,
    tracksolid: renderTracksolid,
    support: renderSupport,
    account: renderAccount,
  };

  const content = document.getElementById('admin-content');
  if (!content) return;

  document.getElementById('logout-btn')?.addEventListener('click', () => {
    MamsApi.clearAuth();
    location.href = '/auth/login';
  });

  document.getElementById('menu-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('open');
    document.getElementById('sidebar-overlay')?.classList.toggle('show');
  });
  document.getElementById('sidebar-overlay')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('show');
  });

  function getModule() {
    const path = location.pathname.replace(/\/$/, '') || '/admin/dashboard';
    const parts = path.split('/').filter(Boolean);
    let mod = parts[1] || 'dashboard';
    if (mod === 'system-users') return mod;
    return ROUTES[mod] ? mod : 'dashboard';
  }

  function setActiveNav(mod) {
    document.querySelectorAll('#admin-nav a').forEach((a) => {
      a.classList.toggle('active', a.dataset.mod === mod);
    });
  }

  function initials(user) {
    return (user.fullName || user.email || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  }

  function setUserChip(user) {
    const trigger = document.getElementById('user-menu-trigger');
    if (trigger) {
      trigger.innerHTML = `<span class="user-avatar">${esc(initials(user))}</span><span class="user-chip-name">${esc(user.fullName || user.email)}</span>`;
    }
    const info = document.getElementById('user-dropdown-info');
    if (info) {
      info.innerHTML = `<div class="n">${esc(user.fullName || '')}</div><div class="e">${esc(user.email || '')}</div><div class="t">${esc(ROLE_LABELS[user.role] || user.role || '')}</div>`;
    }
  }

  const ROLE_LABELS = {
    super_admin: 'Super Admin',
    platform_admin: 'Platform Admin',
  };

  function setupDropdown(triggerId, panelId) {
    const trigger = document.getElementById(triggerId);
    const panel = document.getElementById(panelId);
    if (!trigger || !panel) return;
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = panel.hidden;
      document.querySelectorAll('.dropdown-panel').forEach((p) => { p.hidden = true; });
      panel.hidden = !willOpen;
    });
    panel.addEventListener('click', (e) => e.stopPropagation());
  }

  document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-panel').forEach((p) => { p.hidden = true; });
  });

  setupDropdown('user-menu-trigger', 'user-dropdown');

  let currentUserRole = '';

  async function loadModule() {
    const mod = getModule();
    const route = ROUTES[mod];
    setActiveNav(mod);

    const titleEl = document.getElementById('page-title');
    const subEl = document.getElementById('page-sub');
    if (titleEl) titleEl.textContent = route.title;
    if (subEl) subEl.textContent = route.subtitle;
    document.title = route.title + ' — MAMS Admin';

    if (mod === 'system-users' && currentUserRole !== 'super_admin') {
      content.innerHTML = `<div class="banner banner-warn">Only super administrators can manage system users.</div>`;
      return;
    }

    const render = RENDERERS[mod] || RENDERERS.dashboard;
    content.innerHTML = await render();
  }

  content.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (btn) {
      const action = btn.dataset.action;
      const id = btn.dataset.id;

      if (action === 'toggle-tenant-form') {
        document.getElementById('tenant-new-form-wrap')?.toggleAttribute('hidden');
        return;
      }

      if (action === 'close-tenant-modal') {
        const root = document.getElementById('tenant-detail-root');
        if (root) root.innerHTML = '';
        return;
      }

      if (action === 'toggle-tenant') {
        const newStatus = btn.dataset.status === 'active' ? 'inactive' : 'active';
        btn.disabled = true;
        try {
          await MamsApi.api(`/admin/tenants/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: newStatus }),
          });
          await reloadTenants(document.getElementById('tenant-search')?.value || '');
        } catch (ex) {
          alert(ex.message || 'Failed to update client status');
          btn.disabled = false;
        }
        return;
      }

      if (action === 'toggle-admin-user') {
        const active = btn.dataset.active === '1';
        btn.disabled = true;
        try {
          await MamsApi.api(`/admin/users/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ isActive: !active }),
          });
          await loadModule();
        } catch (ex) {
          alert(ex.message || 'Failed to update user');
          btn.disabled = false;
        }
        return;
      }

      if (action === 'reset-admin-user-pw') {
        const pw = prompt('Enter a new password for this user (min 8 characters):');
        if (!pw) return;
        if (pw.length < 8) {
          alert('Password must be at least 8 characters');
          return;
        }
        try {
          await MamsApi.api(`/admin/users/${encodeURIComponent(id)}/reset-password`, {
            method: 'POST',
            body: JSON.stringify({ password: pw }),
          });
          alert('Password reset successfully.');
        } catch (ex) {
          alert(ex.message || 'Failed to reset password');
        }
        return;
      }

      if (action === 'toggle-marketplace') {
        const key = btn.dataset.key;
        const enabled = btn.dataset.enabled === '1';
        btn.disabled = true;
        try {
          await MamsApi.api(`/admin/marketplace/${encodeURIComponent(key)}`, {
            method: 'PATCH',
            body: JSON.stringify({ enabled: !enabled }),
          });
          await loadModule();
        } catch (ex) {
          alert(ex.message || 'Failed to update integration');
          btn.disabled = false;
        }
        return;
      }

      return;
    }

    if (e.target.id === 'tenant-modal') {
      const root = document.getElementById('tenant-detail-root');
      if (root) root.innerHTML = '';
      return;
    }

    if (e.target.closest('button, a, input, select')) return;
    const row = e.target.closest('tr.row-clickable');
    if (row && row.dataset.id) {
      openTenantDetail(row.dataset.id);
    }
  });

  let tenantSearchTimer = null;
  content.addEventListener('input', (e) => {
    if (e.target.id === 'tenant-search') {
      clearTimeout(tenantSearchTimer);
      const val = e.target.value;
      tenantSearchTimer = setTimeout(() => reloadTenants(val), 350);
    }
  });

  content.addEventListener('change', async (e) => {
    if (e.target.id === 'hub-tenant-select') {
      const root = document.getElementById('hub-integration-root');
      if (!root) return;
      root.innerHTML = loader();
      root.innerHTML = await hubIntegrationHtml(e.target.value, e.target.dataset.source);
    }
  });

  content.addEventListener('submit', async (e) => {
    const form = e.target;

    if (form.id === 'tenant-form') {
      e.preventDefault();
      const fd = new FormData(form);
      const errEl = document.getElementById('tenant-form-error');
      if (errEl) errEl.hidden = true;
      try {
        await MamsApi.api('/admin/tenants', {
          method: 'POST',
          body: JSON.stringify({
            name: fd.get('name'),
            slug: fd.get('slug'),
            contactEmail: fd.get('contactEmail'),
          }),
        });
        form.reset();
        document.getElementById('tenant-new-form-wrap')?.setAttribute('hidden', '');
        await reloadTenants('');
      } catch (ex) {
        if (errEl) { errEl.textContent = ex.message || 'Failed to create client'; errEl.hidden = false; }
      }
      return;
    }

    if (form.id === 'pw-form') {
      e.preventDefault();
      const fd = new FormData(form);
      const errEl = document.getElementById('pw-error');
      const okEl = document.getElementById('pw-ok');
      if (errEl) errEl.hidden = true;
      if (okEl) okEl.hidden = true;
      if (fd.get('new') !== fd.get('confirm')) {
        if (errEl) { errEl.textContent = 'Passwords do not match'; errEl.hidden = false; }
        return;
      }
      try {
        await MamsApi.api('/auth/change-password', {
          method: 'POST',
          body: JSON.stringify({ currentPassword: fd.get('current'), newPassword: fd.get('new') }),
        });
        form.reset();
        if (okEl) okEl.hidden = false;
      } catch (ex) {
        if (errEl) { errEl.textContent = ex.message || 'Failed'; errEl.hidden = false; }
      }
    }
  });

  async function boot() {
    if (!MamsApi.getToken()) {
      location.href = '/auth/login';
      return;
    }

    content.innerHTML = loader();

    try {
      const me = await MamsApi.api('/auth/me');
      const user = me.user;
      if (!MamsApi.isSystemRole(user.role)) {
        location.href = '/app/dashboard';
        return;
      }

      currentUserRole = user.role;
      setUserChip(user);

      if (user.role !== 'super_admin') {
        document.getElementById('nav-system-users')?.remove();
      }

      await loadModule();
    } catch (e) {
      if (e.status === 401) return;
      content.innerHTML = `<div class="banner banner-error">${esc(e.message || 'Failed to load')}</div>`;
    }
  }

  boot();
})();
