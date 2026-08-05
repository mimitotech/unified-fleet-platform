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

  const SOURCE_LABELS = { wialon: 'Wialon', loconav: 'LocoNav', tracksolid: 'TrackSolid' };

  function cap(s) {
    const str = String(s || '');
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function fmtHourLabel(v) {
    const d = new Date(String(v || '').replace(' ', 'T'));
    return isNaN(d) ? esc(v) : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function fmtDayLabel(v) {
    const d = new Date(String(v || ''));
    return isNaN(d) ? esc(v) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function fmtTime(v) {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d) ? esc(v) : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function adminKpiCard(icon, tone, label, value, sub) {
    return `<div class="admin-kpi-card tone-${esc(tone)}">
      <div class="admin-kpi-icon">${MamsIcons.get(icon)}</div>
      <div class="admin-kpi-body">
        <div class="admin-kpi-label">${esc(label)}</div>
        <div class="admin-kpi-value">${esc(value)}</div>
        ${sub ? `<div class="admin-kpi-sub">${esc(sub)}</div>` : ''}
      </div>
    </div>`;
  }

  function chartPanelHtml(canvasId, title, desc, height, hasData, emptyMsg) {
    const body = hasData
      ? `<canvas id="${canvasId}"></canvas>`
      : `<div class="empty-hint">${esc(emptyMsg || 'No data yet.')}</div>`;
    return `<div class="chart-panel">
      <div class="chart-panel-header"><h4>${esc(title)}</h4>${desc ? `<span class="muted">${esc(desc)}</span>` : ''}</div>
      <div class="chart-canvas-wrap" style="height:${height}px">${body}</div>
    </div>`;
  }

  function listPanelHtml(title, desc, bodyHtml) {
    return `<div class="chart-panel">
      <div class="chart-panel-header"><h4>${esc(title)}</h4>${desc ? `<span class="muted">${esc(desc)}</span>` : ''}</div>
      ${bodyHtml}
    </div>`;
  }

  function tableWrap(headers, rowsHtml, emptyMsg) {
    if (!rowsHtml) {
      return `<div class="card card-flat">${emptyState('📋', emptyMsg || 'No data', 'Nothing to show yet.')}</div>`;
    }
    return `<div class="card card-flat"><div class="table-wrap"><table class="table"><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table></div></div>`;
  }

  const ROUTES = {
    dashboard: { title: 'Dashboard', subtitle: 'Real-time platform analytics', icon: '◉' },
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

  const NAV_ITEMS = [
    { key: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard', path: '/admin/dashboard' },
    { key: 'tenants', label: 'Clients', icon: 'Building2', path: '/admin/tenants' },
    { key: 'users', label: 'Client Users', icon: 'Users', path: '/admin/users' },
    { key: 'system-users', label: 'System Users', icon: 'Shield', path: '/admin/system-users', superAdminOnly: true },
    { key: 'system', label: 'System Settings', icon: 'Settings', path: '/admin/system' },
    { key: 'marketplace', label: 'Integrations', icon: 'Plug', path: '/admin/marketplace' },
    { key: 'wialon', label: 'Wialon Center', icon: 'Satellite', path: '/admin/wialon' },
    { key: 'loconav', label: 'LocoNav Center', icon: 'Navigation', path: '/admin/loconav' },
    { key: 'tracksolid', label: 'TrackSolid Center', icon: 'Radio', path: '/admin/tracksolid' },
    { key: 'support', label: 'Support', icon: 'LifeBuoy', path: '/admin/support' },
    { key: 'account', label: 'My Account', icon: 'UserCircle', path: '/admin/account' },
  ];

  function buildNav(role) {
    const nav = document.getElementById('admin-nav');
    if (!nav) return;
    const items = NAV_ITEMS.filter((item) => !item.superAdminOnly || role === 'super_admin');
    nav.innerHTML = items.map((item) => `<a href="${esc(item.path)}" data-mod="${esc(item.key)}" data-label="${esc(item.label.toLowerCase())}">
      <span class="nav-icon">${MamsIcons.get(item.icon)}</span>
      <span class="nav-label">${esc(item.label)}</span>
    </a>`).join('');
  }

  async function renderDashboard() {
    const [dash, health] = await Promise.all([
      MamsApi.api('/admin/dashboard'),
      MamsApi.api('/admin/system/health').catch(() => ({})),
    ]);

    const assetStatus = dash.assetStatusBreakdown || [];
    const alertsTimeline = dash.alertsTimeline || [];
    const alertsBySeverity = dash.alertsBySeverity || [];
    const alertsVolume7d = dash.alertsVolume7d || [];
    const syncTimeline = dash.syncTimeline || [];
    const integrationsBySource = dash.integrationsBySource || [];
    const healthHistory = dash.healthHistory || [];
    const growthHistory = dash.growthHistory || [];
    const recentActivity = dash.recentActivity || [];
    const topTenants = dash.topTenants || [];
    const recentSyncs = dash.recentSyncs || [];
    const recentIncidents = dash.recentIncidents || [];

    const kpiHtml = `<div class="admin-stat-strip">
      ${adminKpiCard('Building2', 'primary', 'Clients', dash.totalTenants ?? 0, `${dash.activeTenants ?? 0} active`)}
      ${adminKpiCard('Truck', 'info', 'Synced assets', dash.totalVehicles ?? 0, `${dash.activeVehiclesPct ?? 0}% online`)}
      ${adminKpiCard('Users', 'success', 'Users', dash.totalUsers ?? 0, `${dash.logins24h ?? 0} logins`)}
      ${adminKpiCard('AlertTriangle', 'destructive', 'Alerts', dash.pendingAlerts ?? 0, 'pending')}
      ${adminKpiCard('RefreshCw', 'warning', 'Sync rate', `${dash.syncRate24h ?? 100}%`, `${dash.syncs24h ?? 0} today`)}
      ${adminKpiCard('Radio', 'primary', 'Integrations', `${dash.integrationHealth ?? 0}%`, `${dash.webhooks24h ?? 0} webhooks`)}
    </div>`;

    const syncFeedHtml = recentSyncs.length
      ? `<div class="feed-list">${recentSyncs.map((s) => `<div class="feed-item">
          <div class="feed-item-main">
            <strong>${esc(s.tenantName || '—')}</strong> · ${esc(SOURCE_LABELS[s.sourceType] || s.sourceType || '—')}
            <div class="muted feed-item-sub">${s.vehiclesSynced ?? 0} assets · ${fmtTime(s.startedAt)}</div>
          </div>
          <span class="badge ${s.status === 'success' ? 'badge-success' : s.status === 'failed' ? 'badge-critical' : 'badge-inactive'}">${esc(s.status || '—')}</span>
        </div>`).join('')}</div>`
      : '<p class="muted">No sync activity.</p>';

    const topClientsLinks = topTenants.slice(0, 3).map((t) => `<a href="/admin/tenants">${esc(t.name)}</a>`).join('');

    const activityHtml = recentActivity.length
      ? `<div class="feed-list">${recentActivity.map((a) => `<div class="feed-item feed-item-plain">
          <strong>${esc(a.action || 'Activity')}</strong>
          ${a.message ? `<div class="muted feed-item-sub">${esc(a.message)}</div>` : ''}
          <div class="muted feed-item-sub">${a.tenantName ? esc(a.tenantName) + ' · ' : ''}${fmtDate(a.createdAt)}</div>
        </div>`).join('')}</div>`
      : '<p class="muted">No activity.</p>';

    const incidentsHtml = recentIncidents.length
      ? `<div class="incident-list">${recentIncidents.map((i) => `<p class="incident-item"><strong>${esc(i.tenantName || '—')}</strong> — ${esc(i.message || 'Failed')} · ${fmtDate(i.startedAt)}</p>`).join('')}</div>`
      : '';

    const html = `${kpiHtml}
    <div class="chart-grid chart-grid-3 mt-2">
      ${chartPanelHtml('chart-fleet-status', 'Fleet status', 'Moving · idle · stopped · offline', 200, assetStatus.length > 0, 'No fleet data — sync integrations first.')}
      ${chartPanelHtml('chart-alerts-24h', 'Alerts — 24 hours', 'Trend by severity', 200, alertsTimeline.length > 0, 'No alerts in the last 24 hours.')}
      ${chartPanelHtml('chart-alert-volume', 'Alert volume', 'Last 7 days', 200, (alertsVolume7d.length || alertsBySeverity.length) > 0, 'No alert data.')}
    </div>
    <div class="chart-grid chart-grid-3 mt-1">
      ${chartPanelHtml('chart-sync-timeline', 'Integration syncs', 'Success vs failed · 7 days', 180, syncTimeline.length > 0, 'No sync history yet.')}
      ${chartPanelHtml('chart-sources', 'Telematics sources', 'Active vs inactive', 180, integrationsBySource.length > 0, 'No integrations configured.')}
      ${chartPanelHtml('chart-integration-health', 'Integration health', 'Sync success rate · 7 days', 180, healthHistory.length > 0, 'Run client syncs to build history.')}
    </div>
    <div class="chart-grid mt-1" style="grid-template-columns:2fr 1fr">
      ${listPanelHtml('Live sync feed', 'Latest integration syncs', syncFeedHtml)}
      <div class="chart-panel">
        <div class="chart-panel-header"><h4>Top clients</h4><span class="muted">Synced fleet size</span></div>
        <div class="chart-canvas-wrap" style="height:180px">${topTenants.length ? '<canvas id="chart-top-clients"></canvas>' : '<div class="empty-hint">No clients yet.</div>'}</div>
        ${topClientsLinks ? `<div class="top-clients-links">${topClientsLinks}</div>` : ''}
      </div>
    </div>
    <div class="chart-grid chart-grid-2 mt-1">
      ${listPanelHtml('Platform activity', '', activityHtml)}
      ${chartPanelHtml('chart-growth', 'Client growth', 'New clients · 30 days', 160, true)}
    </div>
    ${recentIncidents.length ? `<div class="chart-panel mt-1"><div class="chart-panel-header"><h4>Sync failures</h4></div>${incidentsHtml}</div>` : ''}
    <div class="admin-footer-stats mt-1">
      <span>${dash.logins24h ?? 0} logins · ${dash.activeUsers7d ?? 0} active (7d)</span>
      ${dash.lastSync ? `<span>Last sync: ${fmtDate(dash.lastSync)}</span>` : ''}
    </div>`;

    window.__adminDashPaint = function paintAdminDashboard() {
      const p = MamsCharts.palette();

      if (assetStatus.length) {
        MamsCharts.bar('chart-fleet-status', assetStatus.map((s) => cap(s.status)),
          [{ label: 'Assets', data: assetStatus.map((s) => s.count), backgroundColor: assetStatus.map((s) => p.fleet[s.status] || p.muted), borderRadius: 4 }],
          { horizontal: true });
      }

      if (alertsTimeline.length) {
        MamsCharts.line('chart-alerts-24h', alertsTimeline.map((r) => fmtHourLabel(r.hour)), [
          { label: 'Critical', data: alertsTimeline.map((r) => r.critical), borderColor: p.severity.critical, backgroundColor: p.severity.critical },
          { label: 'Warning', data: alertsTimeline.map((r) => r.warning), borderColor: p.severity.warning, backgroundColor: p.severity.warning },
          { label: 'Info', data: alertsTimeline.map((r) => r.info), borderColor: p.severity.info, backgroundColor: p.severity.info },
        ]);
      }

      if (alertsVolume7d.length) {
        MamsCharts.bar('chart-alert-volume', alertsVolume7d.map((r) => fmtDayLabel(r.day)),
          [{ label: 'Alerts', data: alertsVolume7d.map((r) => r.count), backgroundColor: p.danger, borderRadius: 4 }]);
      } else if (alertsBySeverity.length) {
        MamsCharts.bar('chart-alert-volume', alertsBySeverity.map((r) => cap(r.severity)),
          [{ label: 'Alerts', data: alertsBySeverity.map((r) => r.count), backgroundColor: alertsBySeverity.map((r) => p.severity[r.severity] || p.muted), borderRadius: 4 }]);
      }

      if (syncTimeline.length) {
        MamsCharts.bar('chart-sync-timeline', syncTimeline.map((r) => fmtDayLabel(r.day)), [
          { label: 'Success', data: syncTimeline.map((r) => r.success), backgroundColor: p.success },
          { label: 'Failed', data: syncTimeline.map((r) => r.failed), backgroundColor: p.danger },
        ], { stacked: true });
      }

      if (integrationsBySource.length) {
        MamsCharts.bar('chart-sources', integrationsBySource.map((r) => SOURCE_LABELS[r.source_type] || r.source_type), [
          { label: 'Active', data: integrationsBySource.map((r) => r.active), backgroundColor: integrationsBySource.map((r) => p.sources[r.source_type] || p.primary) },
          { label: 'Inactive', data: integrationsBySource.map((r) => Math.max(0, (r.total || 0) - (r.active || 0))), backgroundColor: p.muted },
        ], { horizontal: true, stacked: true });
      }

      if (healthHistory.length) {
        MamsCharts.line('chart-integration-health', healthHistory.map((r) => fmtDayLabel(r.day)),
          [{ label: 'Health %', data: healthHistory.map((r) => r.score), borderColor: p.primary, backgroundColor: p.primary }]);
      }

      if (topTenants.length) {
        MamsCharts.bar('chart-top-clients', topTenants.map((t) => (t.name && t.name.length > 14 ? t.name.slice(0, 14) + '…' : t.name)),
          [{ label: 'Assets', data: topTenants.map((t) => t.vehicleCount), backgroundColor: p.primary, borderRadius: 4 }],
          { horizontal: true });
      }

      const growthData = growthHistory.length ? growthHistory : [{ day: null, count: dash.totalTenants ?? 0 }];
      MamsCharts.bar('chart-growth', growthData.map((r) => (r.day ? fmtDayLabel(r.day) : 'Now')),
        [{ label: 'Clients', data: growthData.map((r) => r.count), backgroundColor: p.accent, borderRadius: 4 }]);

      const livePill = document.getElementById('admin-live-pill');
      if (livePill) {
        const dbOk = health.overall === 'operational' || health.database?.status === 'ok';
        livePill.classList.toggle('is-live', dbOk);
        livePill.classList.toggle('is-partial', !dbOk);
        const label = livePill.querySelector('span:last-child');
        if (label) label.textContent = 'Live ' + new Date().toLocaleTimeString();
      }
    };

    return html;
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

  async function openTenantDetail(id, tab) {
    const root = document.getElementById('tenant-detail-root');
    if (!root) return;
    const activeTab = tab || 'general';
    root.innerHTML = `<div class="modal-overlay" id="tenant-modal"><div class="modal-panel modal-panel-wide">${loader()}</div></div>`;

    try {
      const [tenant, modules, integrations, users] = await Promise.all([
        MamsApi.api(`/admin/tenants/${encodeURIComponent(id)}`),
        MamsApi.api(`/admin/tenants/${encodeURIComponent(id)}/modules`).catch(() => []),
        MamsApi.api(`/admin/tenants/${encodeURIComponent(id)}/integrations`).catch(() => []),
        MamsApi.api(`/admin/users?tenant=${encodeURIComponent(id)}`).catch(() => []),
      ]);
      const modList = Array.isArray(modules) ? modules : [];
      const intList = Array.isArray(integrations) ? integrations : [];
      const userList = Array.isArray(users) ? users : users.users || [];
      let fuelCfg = null;
      let fuelTemplates = [];
      let fuelSheets = [];
      if (activeTab === 'fuel-module') {
        const [cfg, tpl, sheets] = await Promise.all([
          MamsApi.api(`/admin/tenants/${encodeURIComponent(id)}/fuel-module-config`).catch(() => null),
          MamsApi.api(`/admin/tenants/${encodeURIComponent(id)}/wialon/report-templates`).catch(() => ({ templates: [] })),
          MamsApi.api(`/admin/tenants/${encodeURIComponent(id)}/fuel-station-sheets`).catch(() => ({ uploads: [] })),
        ]);
        // Admin may not have client tenant context for templates — use empty if fails
        fuelCfg = cfg;
        fuelTemplates = (tpl && (tpl.templates || tpl)) || [];
        if (!Array.isArray(fuelTemplates)) fuelTemplates = [];
        fuelSheets = (sheets && sheets.uploads) || [];
      }
      const panel = document.querySelector('#tenant-modal .modal-panel');
      if (!panel) return;

      const tabs = ['general', 'integrations', 'branding', 'modules', 'fuel-module', 'users'];
      const tabBar = `<div class="tab-bar branded-tabs" style="margin:0.75rem 0">
        ${tabs.map((t) => `<button type="button" class="tab ${activeTab === t ? 'active' : ''}" data-action="tenant-detail-tab" data-id="${esc(id)}" data-tab="${t}">${esc(t)}</button>`).join('')}
      </div>`;

      let body = '';
      if (activeTab === 'general') {
        body = `
        <form id="tenant-general-form" class="form-stack" data-id="${esc(id)}">
          <div class="form-grid">
            <label><span>Name</span><input class="input" name="name" value="${esc(tenant.name || '')}" /></label>
            <label><span>Slug</span><input class="input" name="slug" value="${esc(tenant.slug || '')}" disabled /></label>
            <label><span>Contact email</span><input class="input" name="contactEmail" value="${esc(tenant.contactEmail || '')}" /></label>
            <label><span>Phone</span><input class="input" name="phone" value="${esc(tenant.phone || '')}" /></label>
            <label><span>Country</span><input class="input" name="country" value="${esc(tenant.country || '')}" /></label>
            <label><span>Timezone</span><input class="input" name="timezone" value="${esc(tenant.timezone || 'UTC')}" /></label>
            <label><span>Status</span><div>${statusBadge(tenant.status)}</div></label>
            <label><span>Manager</span><div>${esc(tenant.assignedManagerName || '—')}</div></label>
          </div>
          <div class="actions" style="gap:0.5rem;display:flex;flex-wrap:wrap">
            <button type="submit" class="btn btn-sm">Save profile</button>
            <button type="button" class="btn btn-sm" data-action="tenant-toggle-status" data-id="${esc(id)}" data-status="${esc(tenant.status === 'active' ? 'inactive' : 'active')}">${tenant.status === 'active' ? 'Suspend client' : 'Activate client'}</button>
          </div>
          <p id="tenant-general-msg" class="muted"></p>
        </form>`;
      } else if (activeTab === 'integrations') {
        const sources = ['wialon', 'loconav', 'tracksolid'];
        const byType = Object.fromEntries(intList.map((i) => [i.sourceType, i]));
        const cards = sources.map((src) => {
          const i = byType[src] || { sourceType: src, isActive: false, verified: false };
          const connected = i.isActive && i.verified;
          return `<div class="card branded-panel" style="margin-bottom:12px">
            <div class="card-header"><h3>${esc(src)}</h3>
              ${connected ? '<span class="badge badge-success">Connected</span>' : '<span class="badge badge-inactive">Not connected</span>'}
            </div>
            <p class="muted">${src === 'wialon' ? 'Prefer linking via Wialon Center; token can also be saved here.' : 'Save API credentials. Webhook URL is shown after save.'}</p>
            <form class="form-stack integration-cred-form" data-tenant="${esc(id)}" data-source="${esc(src)}">
              ${src === 'wialon' ? `<label><span>Token</span><input class="input" name="token" type="password" placeholder="${i.hasCredentials ? '•••• (unchanged if blank)' : 'Wialon token'}" autocomplete="off" /></label>
                <label><span>Operate as</span><input class="input" name="operateAs" placeholder="optional" /></label>` : ''}
              ${src === 'loconav' ? `<label><span>API token</span><input class="input" name="token" type="password" placeholder="${i.hasCredentials ? '••••' : 'LocoNav token'}" autocomplete="off" /></label>` : ''}
              ${src === 'tracksolid' ? `<label><span>App key</span><input class="input" name="appKey" autocomplete="off" /></label>
                <label><span>App secret</span><input class="input" name="appSecret" type="password" autocomplete="off" /></label>
                <label><span>Account / user id</span><input class="input" name="account" autocomplete="off" /></label>
                <label><span>Password</span><input class="input" name="password" type="password" placeholder="${i.hasCredentials ? '••••' : ''}" autocomplete="off" /></label>` : ''}
              <div class="actions" style="gap:6px;display:flex;flex-wrap:wrap">
                <button type="submit" class="btn btn-sm">Save</button>
                <button type="button" class="btn btn-sm btn-ghost" data-action="integration-test" data-tenant="${esc(id)}" data-source="${esc(src)}">Test</button>
                <button type="button" class="btn btn-sm btn-ghost" data-action="integration-sync" data-tenant="${esc(id)}" data-source="${esc(src)}">Sync</button>
              </div>
              <p class="muted integration-msg" data-source="${esc(src)}"></p>
            </form>
            ${i.wialonAccountName ? `<p class="muted">Account: ${esc(i.wialonAccountName)}</p>` : ''}
            ${i.lastSyncAt ? `<p class="muted">Last sync: ${fmtDate(i.lastSyncAt)}</p>` : ''}
            ${i.lastError ? `<p class="banner banner-error">${esc(i.lastError)}</p>` : ''}
          </div>`;
        }).join('');
        body = `
        <p class="muted">Configure Wialon, LocoNav, and TrackSolid. Mother-token linking remains in <a href="/admin/wialon">Wialon Center</a>.</p>
        ${cards}`;
      } else if (activeTab === 'branding') {
        body = `
        <form id="tenant-branding-form" class="form-stack" data-id="${esc(id)}">
          <div class="form-grid">
            <label><span>Primary</span><input class="input" type="color" name="primaryColor" value="${esc(tenant.primaryColor || '#004225')}" /></label>
            <label><span>Secondary</span><input class="input" type="color" name="secondaryColor" value="${esc(tenant.secondaryColor || '#0f172a')}" /></label>
            <label><span>Accent</span><input class="input" type="color" name="accentColor" value="${esc(tenant.accentColor || '#1a6b45')}" /></label>
            <label><span>Logo URL</span><input class="input" name="logoUrl" id="tenant-logo-url" value="${esc(tenant.logoUrl || '')}" placeholder="/uploads/…" /></label>
            <label><span>Favicon URL</span><input class="input" name="faviconUrl" id="tenant-favicon-url" value="${esc(tenant.faviconUrl || '')}" /></label>
          </div>
          <div class="form-grid">
            <label><span>Upload logo</span><input class="input" type="file" accept="image/*" id="tenant-logo-file" data-tenant="${esc(id)}" /></label>
            <label><span>Upload favicon</span><input class="input" type="file" accept="image/*" id="tenant-favicon-file" data-tenant="${esc(id)}" /></label>
          </div>
          ${tenant.logoUrl ? `<p><img src="${esc(tenant.logoUrl)}" alt="logo" style="max-height:48px;object-fit:contain" /></p>` : ''}
          <label><span>Custom CSS</span><textarea class="input" name="customCss" rows="4">${esc(tenant.customCss || '')}</textarea></label>
          <button type="submit" class="btn btn-sm">Save branding</button>
          <p id="tenant-branding-msg" class="muted"></p>
        </form>`;
      } else if (activeTab === 'modules') {
        const modToggles = modList.map((m) => `<label class="module-toggle">
          <input type="checkbox" data-module-key="${esc(m.moduleKey || m.key)}" ${m.isEnabled ? 'checked' : ''} />
          <span>${esc(m.label || m.moduleKey || m.key)}</span>
        </label>`).join('');
        body = `
        <div id="tenant-modules-form" data-tenant-id="${esc(id)}" style="display:flex;flex-wrap:wrap;gap:0.6rem 1rem">
          ${modToggles || '<span class="muted">No modules configured</span>'}
        </div>
        ${modList.length ? `<button type="button" class="btn btn-sm mt-1" data-action="tenant-save-modules" data-id="${esc(id)}">Save modules</button>` : ''}`;
      } else if (activeTab === 'fuel-module') {
        const selected = (fuelCfg && fuelCfg.selectedReports) || [];
        const selectedKeys = new Set(selected.map((r) => `${r.resourceId}:${r.templateId}`));
        const fuelTpls = fuelTemplates.filter((t) => /fuel/i.test(String(t.name || t.n || '')) || (t.module === 'fuel'));
        const tplChecks = (fuelTpls.length ? fuelTpls : fuelTemplates).slice(0, 60).map((t) => {
          const rid = t.resourceId || t.resource_id || '';
          const tid = t.id;
          const key = `${rid}:${tid}`;
          return `<label class="module-toggle">
            <input type="checkbox" data-fuel-tpl data-resource="${esc(rid)}" data-template="${esc(tid)}" data-name="${esc(t.name || t.n || '')}" ${selectedKeys.has(key) ? 'checked' : ''} />
            <span>${esc(t.name || t.n || tid)} <span class="muted">(${esc(rid)}/${esc(tid)})</span></span>
          </label>`;
        }).join('');
        const sheetRows = fuelSheets.map((u) => `<tr>
          <td>${esc(u.fileName)}</td>
          <td>${esc(u.importedCount ?? 0)} / ${esc(u.rowCount ?? 0)}</td>
          <td class="muted">${fmtDate(u.createdAt)}</td>
          <td><button type="button" class="btn btn-sm btn-ghost" data-action="fuel-sheet-delete" data-tenant="${esc(id)}" data-upload="${esc(u.id)}">Delete</button></td>
        </tr>`).join('');
        body = `
        <div class="banner banner-info">Bind Hosting fuel report templates. Canonical: Fuel Report(Group/Unit), Fuel Usage Report(Gensets/Units).</div>
        <form id="fuel-module-form" data-id="${esc(id)}" class="form-stack mt-1">
          <label><span>Fuel price / liter (optional)</span>
            <input class="input" type="number" step="0.01" name="fuelPricePerLiter" value="${esc((fuelCfg && fuelCfg.fuelPricePerLiter) ?? '')}" />
          </label>
          <h4 style="margin:0.75rem 0 0.35rem;color:var(--brand-dark)">Selected report templates</h4>
          <div style="display:flex;flex-wrap:wrap;gap:0.5rem 1rem;max-height:220px;overflow:auto">${tplChecks || '<span class="muted">No templates — link Wialon and open this tab while templates API is reachable, or paste IDs after harvest.</span>'}</div>
          <button type="submit" class="btn btn-sm">Save fuel module</button>
          <p id="fuel-module-msg" class="muted"></p>
        </form>
        <h4 style="margin:1.25rem 0 0.5rem;color:var(--brand-dark)">Station sheets (CSV)</h4>
        <p class="muted">Upload petrol-station .xlsx or .csv with Registration + Quantity + Date columns for Variance (FLS matching).</p>
        <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" id="fuel-sheet-file" data-tenant="${esc(id)}" />
        <p id="fuel-sheet-msg" class="muted"></p>
        ${tableWrap(['File', 'Imported', 'When', ''], sheetRows, 'No station sheets uploaded')}`;
      } else if (activeTab === 'users') {
        const urows = userList.map((u) => `<tr>
          <td><strong>${esc(u.fullName || u.full_name || '—')}</strong></td>
          <td>${esc(u.email)}</td>
          <td>${roleBadge(u.role)}</td>
          <td>${u.isActive !== false ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-inactive">Off</span>'}</td>
        </tr>`).join('');
        body = tableWrap(['Name', 'Email', 'Role', 'Status'], urows, 'No users for this client — create under Client Users');
      }

      panel.innerHTML = `
        <div class="modal-header">
          <h3>${esc(tenant.name)} <span class="muted" style="font-weight:400;font-size:.85rem">/${esc(tenant.slug)}</span></h3>
          <button type="button" class="modal-close" data-action="close-tenant-modal">✕</button>
        </div>
        ${tabBar}
        ${body}
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
      <td>${esc(u.assignedTenantCount ?? 0)}</td>
      <td class="muted">${fmtDate(u.lastLoginAt || u.last_login_at)}</td>
      <td class="actions">
        <button type="button" class="btn btn-sm btn-ghost" data-action="toggle-system-user" data-id="${esc(u.id)}" data-active="${u.isActive !== false ? '1' : '0'}">${u.isActive !== false ? 'Deactivate' : 'Activate'}</button>
        <button type="button" class="btn btn-sm btn-ghost" data-action="reset-system-user-pw" data-id="${esc(u.id)}">Reset password</button>
      </td>
    </tr>`).join('');
    return `<div class="card-header" style="margin-bottom:1rem"><h3 style="margin:0;color:var(--brand)">System users</h3><span class="muted">${list.length} admins</span></div>
    <div class="card mb-2">
      <div class="card-header"><h3>Add platform admin</h3></div>
      <form id="system-user-form" class="form-grid">
        <label><span>Full name</span><input class="input" name="fullName" /></label>
        <label><span>Email</span><input class="input" type="email" name="email" required /></label>
        <label><span>Password</span><input class="input" type="password" name="password" required minlength="8" autocomplete="new-password" /></label>
        <label><span>Role</span>
          <select class="input" name="role">
            <option value="platform_admin">Platform admin</option>
            <option value="super_admin">Super admin</option>
          </select>
        </label>
        <div class="form-grid-action"><button type="submit" class="btn">Create</button></div>
        <p id="system-user-error" class="error" hidden></p>
      </form>
    </div>
    ${tableWrap(['Name', 'Email', 'Role', 'Status', 'Clients', 'Last login', 'Actions'], rows, 'No system users')}`;
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
    const map = settings && typeof settings.map === 'object' ? settings.map : {};
    const readCfg = (key, fallback) => {
      const v = map?.[key];
      return v && typeof v === 'object' ? v : fallback;
    };
    const general = readCfg('general', { platformName: 'MAMS — Mimito Asset Management System', defaultLanguage: 'en', defaultTimezone: 'UTC' });
    const email = readCfg('email', { smtpHost: '', smtpPort: 587, fromEmail: '', fromName: '' });
    const security = readCfg('security', { minPasswordLength: 8, sessionTimeoutMinutes: 30, requireSpecialChar: false });
    const backup = readCfg('backup', { autoBackup: true, frequency: 'daily', retentionDays: 30 });
    const webhooks = readCfg('webhooks', { alertsEvents: true, statusUpdates: true });
    return `<div class="kpi-grid">
      ${kpi('Status', health.overall || health.status || '—')}
      ${kpi('Database', dbOk ? 'Connected' : (health.database?.status || '—'))}
      ${kpi('API', health.api?.status || 'ok')}
      ${kpi('Settings', settingsList.length)}
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>System settings</h3></div>
      <div class="toolbar" style="display:flex;gap:.5rem;flex-wrap:wrap">
        <button type="button" class="btn btn-sm btn-ghost active" data-action="switch-system-tab" data-tab="general">General</button>
        <button type="button" class="btn btn-sm btn-ghost" data-action="switch-system-tab" data-tab="login">Login media</button>
        <button type="button" class="btn btn-sm btn-ghost" data-action="switch-system-tab" data-tab="email">Email</button>
        <button type="button" class="btn btn-sm btn-ghost" data-action="switch-system-tab" data-tab="webhooks">Webhooks</button>
        <button type="button" class="btn btn-sm btn-ghost" data-action="switch-system-tab" data-tab="backup">Backup</button>
        <button type="button" class="btn btn-sm btn-ghost" data-action="switch-system-tab" data-tab="security">Security</button>
      </div>
      <div id="system-tab-general" class="mt-1">
        <div class="settings-grid" data-setting-form="general">
          <label>Platform name<input class="input" data-setting-field="platformName" value="${esc(general.platformName || '')}" /></label>
          <label>Default language<input class="input" data-setting-field="defaultLanguage" value="${esc(general.defaultLanguage || '')}" /></label>
          <label>Default timezone<input class="input" data-setting-field="defaultTimezone" value="${esc(general.defaultTimezone || '')}" /></label>
        </div>
        <button type="button" class="btn btn-sm mt-1" data-action="save-system-setting" data-key="general">Save general</button>
      </div>
      <div id="system-tab-login" class="mt-1" hidden>
        <div class="grid-2">
          <div>
            <div class="card-header"><h3>Login slides</h3>
              <button type="button" class="btn btn-sm" data-action="media-slide-new">Add slide</button>
            </div>
            <div id="login-slides-admin-root"><div class="page-loader"><div class="spinner"></div>Loading…</div></div>
          </div>
          <div>
            <div class="card-header"><h3>Trust logos</h3>
              <button type="button" class="btn btn-sm" data-action="media-logo-new">Add logo</button>
            </div>
            <div id="login-logos-admin-root"><div class="page-loader"><div class="spinner"></div>Loading…</div></div>
          </div>
        </div>
      </div>
      <div id="system-tab-email" class="mt-1" hidden>
        <div class="settings-grid" data-setting-form="email">
          <label>SMTP host<input class="input" data-setting-field="smtpHost" value="${esc(email.smtpHost || '')}" /></label>
          <label>SMTP port<input class="input" type="number" data-setting-field="smtpPort" value="${esc(email.smtpPort ?? 587)}" /></label>
          <label>From email<input class="input" data-setting-field="fromEmail" value="${esc(email.fromEmail || '')}" /></label>
          <label>From name<input class="input" data-setting-field="fromName" value="${esc(email.fromName || '')}" /></label>
        </div>
        <button type="button" class="btn btn-sm mt-1" data-action="save-system-setting" data-key="email">Save email</button>
      </div>
      <div id="system-tab-webhooks" class="mt-1" hidden>
        <div class="settings-grid" data-setting-form="webhooks">
          <label><input type="checkbox" data-setting-field="alertsEvents" ${webhooks.alertsEvents !== false ? 'checked' : ''} /> Alerts events</label>
          <label><input type="checkbox" data-setting-field="statusUpdates" ${webhooks.statusUpdates !== false ? 'checked' : ''} /> Status updates</label>
        </div>
        <button type="button" class="btn btn-sm mt-1" data-action="save-system-setting" data-key="webhooks">Save webhooks</button>
      </div>
      <div id="system-tab-backup" class="mt-1" hidden>
        <div class="settings-grid" data-setting-form="backup">
          <label><input type="checkbox" data-setting-field="autoBackup" ${backup.autoBackup !== false ? 'checked' : ''} /> Auto backup enabled</label>
          <label>Frequency<input class="input" data-setting-field="frequency" value="${esc(backup.frequency || 'daily')}" /></label>
          <label>Retention days<input class="input" type="number" data-setting-field="retentionDays" value="${esc(backup.retentionDays ?? 30)}" /></label>
        </div>
        <button type="button" class="btn btn-sm mt-1" data-action="save-system-setting" data-key="backup">Save backup</button>
      </div>
      <div id="system-tab-security" class="mt-1" hidden>
        <div class="settings-grid" data-setting-form="security">
          <label>Min password length<input class="input" type="number" data-setting-field="minPasswordLength" value="${esc(security.minPasswordLength ?? 8)}" /></label>
          <label>Session timeout (minutes)<input class="input" type="number" data-setting-field="sessionTimeoutMinutes" value="${esc(security.sessionTimeoutMinutes ?? 30)}" /></label>
          <label><input type="checkbox" data-setting-field="requireSpecialChar" ${security.requireSpecialChar ? 'checked' : ''} /> Require special characters</label>
        </div>
        <button type="button" class="btn btn-sm mt-1" data-action="save-system-setting" data-key="security">Save security</button>
      </div>
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Recent audit</h3></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Action</th><th>User</th><th>When</th></tr></thead><tbody>
        ${logList.map((l) => `<tr><td>${esc(l.action)}</td><td>${esc(l.userEmail || l.user_email || '—')}</td><td class="muted">${fmtDate(l.createdAt || l.created_at)}</td></tr>`).join('') || '<tr><td colspan="3">No audit entries</td></tr>'}
      </tbody></table></div>
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
    const cards = list.map((i) => {
      const enabled = i.isEnabledGlobally ?? i.enabled ?? (i.status === 'active');
      const builtIn = !!(i.isBuiltin || i.is_builtin);
      return `<div class="card">
        <div class="card-header">
          <h3>${esc(i.name || i.key || i.id)}</h3>
          <span class="badge ${builtIn ? 'badge-brand' : 'badge-inactive'}">${builtIn ? 'Built-in' : 'Plugin'}</span>
        </div>
        <p class="muted">${esc(i.description || 'Platform integration')}</p>
        <div class="settings-grid mt-1">
          <div><span class="muted">Category</span><div>${esc(i.category || i.type || '—')}</div></div>
          <div><span class="muted">State</span><div>${enabled ? 'Enabled' : 'Available'}</div></div>
        </div>
        ${i.key ? `<button type="button" class="btn btn-sm btn-ghost mt-1" data-action="toggle-marketplace" data-key="${esc(i.key)}" data-enabled="${enabled ? '1' : '0'}">${enabled ? 'Disable globally' : 'Enable globally'}</button>` : ''}
      </div>`;
    }).join('');
    return `<div class="chart-grid chart-grid-3">${cards}</div>`;
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
    <div class="kpi-grid mt-1">
      ${kpi('Clients', tenants.length)}
      ${kpi('Source', SOURCE_LABELS[sourceType] || sourceType)}
      ${kpi('Scope', tenants.length ? 'Per-tenant status' : 'No clients yet')}
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
    const status = await MamsApi.api('/admin/centers/wialon').catch(() => ({ motherAccounts: [] }));
    const mothers = status.motherAccounts || [];
    const connected = mothers.filter((m) => m.connected).length;
    const activeMotherId = mothers[0]?.id || '';

    const rows = mothers.map((m) => `<tr class="${m.id === activeMotherId ? 'row-selected' : ''}">
      <td><strong>${esc(m.name)}</strong></td>
      <td>${m.connected ? '<span class="badge badge-success">Connected</span>' : '<span class="badge badge-inactive">Idle</span>'}</td>
      <td>${esc(m.accountTier || '—')}</td>
      <td>${esc(m.linkedTenantCount ?? 0)}</td>
      <td class="muted">${fmtDate(m.verifiedAt)}</td>
      <td class="actions">
        <button type="button" class="btn btn-sm btn-ghost" data-action="wialon-mother-select" data-id="${esc(m.id)}">Tree</button>
        <button type="button" class="btn btn-sm btn-ghost" data-action="wialon-mother-test" data-id="${esc(m.id)}">Test</button>
        <button type="button" class="btn btn-sm btn-ghost" data-action="wialon-mother-delete" data-id="${esc(m.id)}">Delete</button>
      </td>
    </tr>`).join('');

    return `<div class="kpi-grid">
      ${kpi('Mother accounts', mothers.length)}
      ${kpi('Connected', `${connected}/${mothers.length || 0}`)}
      ${kpi('Linked clients', status.assignedAccountCount ?? 0)}
      ${kpi('Status', status.connected ? 'Online' : (status.configured ? 'Configured' : 'Empty'))}
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Add mother account</h3></div>
      <form id="wialon-mother-form" class="form-stack" style="max-width:520px">
        <label><span>Display name</span><input class="input" name="name" placeholder="e.g. Mimito East Africa" /></label>
        <label><span>API token</span><input class="input" name="token" type="password" required placeholder="Wialon access_token" autocomplete="off" /></label>
        <label><span>API host (optional)</span><input class="input" name="baseUrl" placeholder="https://hst-api.wialon.com/wialon/ajax.html" /></label>
        <p id="wialon-mother-error" class="error" hidden></p>
        <button type="submit" class="btn">Save mother account</button>
      </form>
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Saved mother accounts</h3><span class="muted">${mothers.length}</span></div>
      ${tableWrap(['Name', 'Status', 'Tier', 'Linked', 'Verified', 'Actions'], rows, 'No mother accounts yet')}
      <p class="muted mt-1">Pick Tree to probe the live Wialon hierarchy for that mother. Clients link a sub-account from Integrations.</p>
    </div>
    <div class="card mt-2" id="wialon-hierarchy-card" data-mother-id="${esc(activeMotherId)}">
      <div class="card-header">
        <h3>Account tree</h3>
        <div class="actions">
          <select class="input" id="wialon-mother-picker" style="max-width:220px">
            ${mothers.map((m) => `<option value="${esc(m.id)}" ${m.id === activeMotherId ? 'selected' : ''}>${esc(m.name)}</option>`).join('') || '<option value="">No mothers</option>'}
          </select>
          <button type="button" class="btn btn-sm btn-ghost" data-action="wialon-hierarchy-refresh">Refresh</button>
        </div>
      </div>
      <div id="wialon-hierarchy-root">${activeMotherId ? loader() : '<p class="muted">Add a mother account to browse the Wialon tree.</p>'}</div>
    </div>
    <div class="card mt-2" id="wialon-account-detail" hidden>
      <div class="card-header"><h3 id="wialon-account-title">Account</h3>
        <button type="button" class="btn btn-sm btn-ghost" data-action="wialon-account-close">Close</button>
      </div>
      <div id="wialon-account-body"></div>
    </div>`;
  }

  const WIALON_TIER = {
    mother: 'Mother account',
    dealer: 'Dealer',
    admin: 'Client admin',
    user: 'End user',
  };

  async function loadWialonHierarchy(motherId) {
    const root = document.getElementById('wialon-hierarchy-root');
    const card = document.getElementById('wialon-hierarchy-card');
    if (!root) return;
    if (!motherId) {
      root.innerHTML = '<p class="muted">Select a mother account.</p>';
      return;
    }
    if (card) card.dataset.motherId = motherId;
    root.innerHTML = loader();
    try {
      const probe = await MamsApi.api(`/admin/centers/wialon/hierarchy?motherId=${encodeURIComponent(motherId)}`);
      const counts = probe.counts || {};
      const accounts = probe.accounts || [];
      const sessionNm = probe.sessionUser?.nm || '—';
      const tier = WIALON_TIER[probe.accountTier] || probe.accountTier || '—';

      const accountRows = accounts.map((a) => {
        const depth = a.parentAccountId ? 1 : 0;
        const assigned = a.assignedTenant
          ? `<span class="badge badge-success">${esc(a.assignedTenant.name)}</span>`
          : '<span class="muted">—</span>';
        return `<tr>
          <td style="padding-left:${0.75 + depth * 1.25}rem"><strong>${esc(a.name)}</strong><div class="muted">${esc(a.id)}</div></td>
          <td>${esc(a.unitCount ?? 0)}</td>
          <td>${esc(a.userCount ?? 0)}</td>
          <td>${assigned}</td>
          <td class="actions">
            <button type="button" class="btn btn-sm btn-ghost" data-action="wialon-account-open" data-id="${esc(a.id)}" data-name="${esc(a.name)}">Units</button>
          </td>
        </tr>`;
      }).join('');

      root.innerHTML = `
        <div class="kpi-grid" style="margin-bottom:1rem">
          ${kpi('Session', sessionNm)}
          ${kpi('Tier', tier)}
          ${kpi('Units', counts.units ?? 0)}
          ${kpi('Accounts', counts.accounts ?? 0)}
          ${kpi('Users', counts.users ?? 0)}
          ${kpi('Dealer', probe.dealerRights ? 'Yes' : 'No')}
        </div>
        ${tableWrap(['Account', 'Units', 'Users', 'Linked client', ''], accountRows, 'No accounts returned from Wialon')}`;
    } catch (ex) {
      root.innerHTML = `<div class="banner banner-error">${esc(ex.message || 'Failed to load hierarchy')}</div>`;
    }
  }

  async function openWialonAccount(accountId, accountName) {
    const card = document.getElementById('wialon-account-detail');
    const body = document.getElementById('wialon-account-body');
    const title = document.getElementById('wialon-account-title');
    const motherId = document.getElementById('wialon-hierarchy-card')?.dataset?.motherId || '';
    if (!card || !body) return;
    card.hidden = false;
    if (title) title.textContent = accountName || `Account ${accountId}`;
    body.innerHTML = loader();
    try {
      const [detail, tenantsRes] = await Promise.all([
        MamsApi.api(
          `/admin/centers/wialon/accounts/${encodeURIComponent(accountId)}?motherId=${encodeURIComponent(motherId)}`
        ),
        MamsApi.api('/admin/tenants?limit=100').catch(() => ({ tenants: [] })),
      ]);
      const units = detail.sampleUnits || detail.units || [];
      const unitRows = units.slice(0, 50).map((u) => `<tr>
        <td><strong>${esc(u.nm || u.name || u.id)}</strong></td>
        <td class="muted">${esc(u.id)}</td>
      </tr>`).join('');
      const tenants = tenantsRes.tenants || (Array.isArray(tenantsRes) ? tenantsRes : []);
      const tenantOpts = tenants.map((t) =>
        `<option value="${esc(t.id)}" ${detail.assignedTenant && detail.assignedTenant.id === t.id ? 'selected' : ''}>${esc(t.name)} (${esc(t.slug || '')})</option>`
      ).join('');
      const linked = detail.assignedTenant
        ? `<div class="banner banner-success">Linked to <strong>${esc(detail.assignedTenant.name)}</strong></div>`
        : `<div class="banner banner-info">Not linked — pick a client and link this Hosting account.</div>`;
      body.innerHTML = `
        ${linked}
        <div class="settings-grid" style="margin-bottom:1rem">
          <div><span class="muted">Units</span><div><strong>${esc(detail.unitCount ?? units.length)}</strong></div></div>
          <div><span class="muted">Linked client</span><div>${detail.assignedTenant ? esc(detail.assignedTenant.name) : '—'}</div></div>
        </div>
        <div class="card" style="margin-bottom:1rem">
          <div class="card-header"><h3>Link to client</h3></div>
          <div class="form-grid">
            <label><span>Client</span>
              <select class="select" id="wialon-link-tenant">${tenantOpts || '<option value="">No clients</option>'}</select>
            </label>
            <div class="form-grid-action">
              <button type="button" class="btn" data-action="wialon-link-account"
                data-account="${esc(accountId)}" data-name="${esc(accountName || '')}" data-mother="${esc(motherId || detail.motherAccountId || '')}">
                Link account
              </button>
            </div>
          </div>
          <p id="wialon-link-msg" class="muted mt-1"></p>
        </div>
        ${tableWrap(['Unit', 'ID'], unitRows, 'No units in this account')}`;
    } catch (ex) {
      body.innerHTML = `<div class="banner banner-error">${esc(ex.message || 'Failed to load account')}</div>`;
    }
  }

  async function renderLoconav() {
    return renderSourceCenter('loconav', 'LocoNav Center', 'Client connections, fleet coverage, and webhook health');
  }

  async function renderTracksolid() {
    return renderSourceCenter('tracksolid', 'TrackSolid Center', 'Client connections, mapped assets, and alarm coverage');
  }

  async function renderSourceCenter(sourceType, title, subtitle) {
    const data = await MamsApi.api(`/admin/centers/${sourceType}`).catch(() => ({ tenants: [] }));
    const tenants = data.tenants || [];
    const alerts24h = tenants.reduce((s, t) => s + (Number(t.alerts24h) || 0), 0);
    const rows = tenants.map((t) => `<tr>
      <td><strong>${esc(t.tenantName)}</strong><div class="muted">${esc(t.tenantSlug)}</div></td>
      <td>${t.isActive ? '<span class="badge badge-success">Verified</span>' : '<span class="badge badge-inactive">Idle</span>'}</td>
      <td>${esc(t.assetCount ?? 0)}</td>
      <td>${esc(t.alerts24h ?? 0)}</td>
      <td class="muted">${fmtDate(t.lastSyncAt)}</td>
      <td class="muted">${esc(t.lastError || '—')}</td>
      <td><a class="btn btn-sm btn-ghost" href="/admin/tenants">Open client</a></td>
    </tr>`).join('');

    return `<div class="integration-panel">
      <h3>${esc(title)}</h3>
      <p>${esc(subtitle)}</p>
    </div>
    <div class="kpi-grid mt-1">
      ${kpi('Clients linked', data.tenantCount ?? tenants.length)}
      ${kpi('Verified', data.connectedTenants ?? 0)}
      ${kpi('Mapped assets', data.totalAssets ?? 0)}
      ${kpi('Alerts (24h)', alerts24h)}
    </div>
    ${data.webhookNote ? `<div class="banner banner-info mt-1">${esc(data.webhookNote)}</div>` : ''}
    <div class="card mt-2">
      <div class="card-header"><h3>Client connections</h3>
        <button type="button" class="btn btn-sm btn-ghost" data-action="reload-module">Refresh</button>
      </div>
      ${tableWrap(['Client', 'Status', 'Assets', 'Alerts 24h', 'Last sync', 'Error', ''], rows, 'No clients configured for this source yet')}
    </div>`;
  }

  async function loadLoginMediaPanels() {
    const slidesRoot = document.getElementById('login-slides-admin-root');
    const logosRoot = document.getElementById('login-logos-admin-root');
    if (!slidesRoot && !logosRoot) return;

    if (slidesRoot) {
      try {
        const data = await MamsApi.api('/admin/login-slides');
        const slides = data.slides || [];
        slidesRoot.innerHTML = slides.length
          ? `<div class="feed-list">${slides.map((s) => `<div class="feed-item">
              <div class="feed-item-main">
                <strong>${esc(s.title)}</strong>
                <div class="muted feed-item-sub">${esc(s.eyebrow || '')} · sort ${esc(s.sortOrder)}</div>
                ${s.imageUrl ? `<img src="${esc(s.imageUrl)}" alt="" style="max-width:120px;max-height:64px;object-fit:cover;border-radius:6px;margin-top:0.35rem" />` : ''}
              </div>
              <div class="actions">
                <span class="badge ${s.isEnabled ? 'badge-success' : 'badge-inactive'}">${s.isEnabled ? 'On' : 'Off'}</span>
                <button type="button" class="btn btn-sm btn-ghost" data-action="media-slide-toggle" data-id="${esc(s.id)}" data-enabled="${s.isEnabled ? '1' : '0'}">${s.isEnabled ? 'Disable' : 'Enable'}</button>
                <button type="button" class="btn btn-sm btn-ghost" data-action="media-slide-delete" data-id="${esc(s.id)}">Delete</button>
              </div>
            </div>`).join('')}</div>`
          : '<p class="muted">No login slides yet.</p>';
      } catch (ex) {
        slidesRoot.innerHTML = `<div class="banner banner-error">${esc(ex.message || 'Failed to load slides')}</div>`;
      }
    }

    if (logosRoot) {
      try {
        const data = await MamsApi.api('/admin/login-trust-logos');
        const logos = data.logos || [];
        logosRoot.innerHTML = logos.length
          ? `<div class="feed-list">${logos.map((l) => `<div class="feed-item">
              <div class="feed-item-main" style="display:flex;align-items:center;gap:0.75rem">
                ${l.imageUrl ? `<img src="${esc(l.imageUrl)}" alt="" style="width:48px;height:32px;object-fit:contain" />` : ''}
                <div><strong>${esc(l.name)}</strong><div class="muted feed-item-sub">sort ${esc(l.sortOrder)}</div></div>
              </div>
              <div class="actions">
                <span class="badge ${l.isEnabled ? 'badge-success' : 'badge-inactive'}">${l.isEnabled ? 'On' : 'Off'}</span>
                <button type="button" class="btn btn-sm btn-ghost" data-action="media-logo-toggle" data-id="${esc(l.id)}" data-enabled="${l.isEnabled ? '1' : '0'}">${l.isEnabled ? 'Disable' : 'Enable'}</button>
                <button type="button" class="btn btn-sm btn-ghost" data-action="media-logo-delete" data-id="${esc(l.id)}">Delete</button>
              </div>
            </div>`).join('')}</div>`
          : '<p class="muted">No trust logos yet.</p>';
      } catch (ex) {
        logosRoot.innerHTML = `<div class="banner banner-error">${esc(ex.message || 'Failed to load logos')}</div>`;
      }
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsDataURL(file);
    });
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
  let footerHealthPollId = null;

  document.getElementById('logout-btn')?.addEventListener('click', () => {
    MamsApi.clearAuth();
    if (footerHealthPollId) clearInterval(footerHealthPollId);
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

  /* ── Topbar / nav chrome (icon parity with React AdminLayout) ── */
  const menuToggleEl = document.getElementById('menu-toggle');
  if (menuToggleEl) menuToggleEl.innerHTML = MamsIcons.get('Menu');
  const refreshBtnEl = document.getElementById('refresh-btn');
  if (refreshBtnEl) refreshBtnEl.innerHTML = MamsIcons.get('RefreshCw');
  const logoutBtnEl = document.getElementById('logout-btn');
  if (logoutBtnEl) logoutBtnEl.innerHTML = `${MamsIcons.get('LogOut')}<span>Sign out</span>`;

  document.getElementById('admin-nav-search')?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('#admin-nav a').forEach((a) => {
      const label = a.dataset.label || '';
      a.style.display = !q || label.includes(q) ? '' : 'none';
    });
  });

  async function refreshFooterHealth() {
    const dot = document.getElementById('admin-footer-health');
    if (!dot) return;
    try {
      const health = await MamsApi.api('/admin/system/health');
      const ok = health.overall === 'operational' || health.database?.status === 'ok';
      dot.className = 'health-dot ' + (ok ? 'ok' : 'err');
    } catch (_) {
      dot.className = 'health-dot err';
    }
  }

  refreshBtnEl?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await Promise.all([loadModule(), refreshFooterHealth()]);
    } finally {
      btn.disabled = false;
    }
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

    MamsCharts.destroyAll();
    window.__adminDashPaint = null;

    const titleEl = document.getElementById('page-title');
    const subEl = document.getElementById('page-sub');
    if (titleEl) titleEl.textContent = route.title;
    if (subEl) subEl.textContent = route.subtitle;
    document.title = route.title + ' — MAMS Admin';

    const livePill = document.getElementById('admin-live-pill');
    if (livePill) livePill.hidden = mod !== 'dashboard';

    if (mod === 'system-users' && currentUserRole !== 'super_admin') {
      content.innerHTML = `<div class="banner banner-warn">Only super administrators can manage system users.</div>`;
      return;
    }

    const render = RENDERERS[mod] || RENDERERS.dashboard;
    content.innerHTML = await render();

    if (typeof window.__adminDashPaint === 'function') {
      window.__adminDashPaint();
    }

    if (mod === 'system') {
      // Prefetch login media so the Login media tab is ready
      loadLoginMediaPanels();
    }

    if (mod === 'wialon') {
      const motherId = document.getElementById('wialon-mother-picker')?.value
        || document.getElementById('wialon-hierarchy-card')?.dataset?.motherId;
      if (motherId) loadWialonHierarchy(motherId);
    }
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

      if (action === 'tenant-detail-tab') {
        await openTenantDetail(btn.dataset.id, btn.dataset.tab);
        return;
      }

      if (action === 'integration-test' || action === 'integration-sync') {
        const tenantId = btn.dataset.tenant;
        const source = btn.dataset.source;
        const msg = document.querySelector(`.integration-msg[data-source="${source}"]`);
        if (!tenantId || !source) return;
        btn.disabled = true;
        if (msg) msg.textContent = action === 'integration-test' ? 'Testing…' : 'Syncing…';
        try {
          const path = action === 'integration-test' ? 'test' : 'sync';
          const result = await MamsApi.api(
            `/admin/tenants/${encodeURIComponent(tenantId)}/integrations/${encodeURIComponent(source)}/${path}`,
            { method: 'POST', body: '{}' }
          );
          if (msg) {
            msg.textContent = action === 'integration-test'
              ? (result.connected ? `Connected · ${result.assetCount || 0} assets` : (result.error || 'Not connected'))
              : (result.message || `Synced ${result.vehiclesSynced || 0}`);
          }
        } catch (ex) {
          if (msg) msg.textContent = ex.message || 'Failed';
        } finally {
          btn.disabled = false;
        }
        return;
      }

      if (action === 'fuel-sheet-delete') {
        if (!confirm('Delete this station sheet upload?')) return;
        btn.disabled = true;
        try {
          await MamsApi.api(
            `/admin/tenants/${encodeURIComponent(btn.dataset.tenant)}/fuel-station-sheets/${encodeURIComponent(btn.dataset.upload)}`,
            { method: 'DELETE' }
          );
          await openTenantDetail(btn.dataset.tenant, 'fuel-module');
        } catch (ex) {
          alert(ex.message || 'Delete failed');
          btn.disabled = false;
        }
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

      if (action === 'switch-system-tab') {
        const tab = btn.dataset.tab || 'general';
        content.querySelectorAll('[id^="system-tab-"]').forEach((el) => {
          el.hidden = el.id !== `system-tab-${tab}`;
        });
        content.querySelectorAll('[data-action="switch-system-tab"]').forEach((el) => {
          el.classList.toggle('active', el === btn);
        });
        if (tab === 'login') loadLoginMediaPanels();
        return;
      }

      if (action === 'reload-module') {
        await loadModule();
        return;
      }

      if (action === 'media-slide-new') {
        const title = prompt('Slide title:');
        if (!title) return;
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.onchange = async () => {
          try {
            const file = fileInput.files && fileInput.files[0];
            const payload = { title, details: '', eyebrow: '', sortOrder: 0, isEnabled: true };
            if (file) {
              payload.fileName = file.name;
              payload.mimeType = file.type || 'image/jpeg';
              payload.dataBase64 = await readFileAsDataUrl(file);
            }
            await MamsApi.api('/admin/login-slides', { method: 'POST', body: JSON.stringify(payload) });
            await loadLoginMediaPanels();
          } catch (ex) {
            alert(ex.message || 'Failed to create slide');
          }
        };
        fileInput.click();
        return;
      }

      if (action === 'media-slide-toggle') {
        try {
          await MamsApi.api(`/admin/login-slides/${encodeURIComponent(btn.dataset.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ isEnabled: btn.dataset.enabled !== '1' }),
          });
          await loadLoginMediaPanels();
        } catch (ex) {
          alert(ex.message || 'Failed to update slide');
        }
        return;
      }

      if (action === 'media-slide-delete') {
        if (!confirm('Delete this login slide?')) return;
        try {
          await MamsApi.api(`/admin/login-slides/${encodeURIComponent(btn.dataset.id)}`, { method: 'DELETE' });
          await loadLoginMediaPanels();
        } catch (ex) {
          alert(ex.message || 'Failed to delete slide');
        }
        return;
      }

      if (action === 'media-logo-new') {
        const name = prompt('Client / brand name:');
        if (!name) return;
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.onchange = async () => {
          try {
            const file = fileInput.files && fileInput.files[0];
            if (!file) {
              alert('Logo image is required');
              return;
            }
            await MamsApi.api('/admin/login-trust-logos', {
              method: 'POST',
              body: JSON.stringify({
                name,
                sortOrder: 0,
                isEnabled: true,
                fileName: file.name,
                mimeType: file.type || 'image/png',
                dataBase64: await readFileAsDataUrl(file),
              }),
            });
            await loadLoginMediaPanels();
          } catch (ex) {
            alert(ex.message || 'Failed to create logo');
          }
        };
        fileInput.click();
        return;
      }

      if (action === 'media-logo-toggle') {
        try {
          await MamsApi.api(`/admin/login-trust-logos/${encodeURIComponent(btn.dataset.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ isEnabled: btn.dataset.enabled !== '1' }),
          });
          await loadLoginMediaPanels();
        } catch (ex) {
          alert(ex.message || 'Failed to update logo');
        }
        return;
      }

      if (action === 'media-logo-delete') {
        if (!confirm('Delete this trust logo?')) return;
        try {
          await MamsApi.api(`/admin/login-trust-logos/${encodeURIComponent(btn.dataset.id)}`, { method: 'DELETE' });
          await loadLoginMediaPanels();
        } catch (ex) {
          alert(ex.message || 'Failed to delete logo');
        }
        return;
      }

      if (action === 'wialon-mother-test') {
        btn.disabled = true;
        try {
          const res = await MamsApi.api(`/admin/centers/wialon/mothers/${encodeURIComponent(btn.dataset.id)}/test`, { method: 'POST', body: '{}' });
          const counts = res.probe?.counts || {};
          alert(res.connected
            ? `Connection OK — ${counts.accounts ?? 0} accounts, ${counts.units ?? 0} units, ${counts.users ?? 0} users.`
            : 'Test completed.');
          await loadModule();
        } catch (ex) {
          alert(ex.message || 'Test failed');
          btn.disabled = false;
        }
        return;
      }

      if (action === 'wialon-mother-select') {
        const picker = document.getElementById('wialon-mother-picker');
        if (picker) picker.value = btn.dataset.id;
        await loadWialonHierarchy(btn.dataset.id);
        return;
      }

      if (action === 'wialon-hierarchy-refresh') {
        const motherId = document.getElementById('wialon-mother-picker')?.value
          || document.getElementById('wialon-hierarchy-card')?.dataset?.motherId;
        await loadWialonHierarchy(motherId);
        return;
      }

      if (action === 'wialon-account-open') {
        await openWialonAccount(btn.dataset.id, btn.dataset.name);
        return;
      }

      if (action === 'wialon-account-close') {
        const card = document.getElementById('wialon-account-detail');
        if (card) card.hidden = true;
        return;
      }

      if (action === 'wialon-link-account') {
        const tenantId = document.getElementById('wialon-link-tenant')?.value || '';
        const msg = document.getElementById('wialon-link-msg');
        if (!tenantId) {
          if (msg) msg.textContent = 'Select a client first';
          return;
        }
        btn.disabled = true;
        if (msg) msg.textContent = 'Linking…';
        try {
          const result = await MamsApi.api(`/admin/tenants/${encodeURIComponent(tenantId)}/wialon/link-account`, {
            method: 'POST',
            body: JSON.stringify({
              accountId: Number(btn.dataset.account),
              accountName: btn.dataset.name || undefined,
              motherAccountId: btn.dataset.mother || undefined,
            }),
          });
          if (msg) {
            msg.innerHTML = `<span class="banner banner-success">Linked · ${esc(result.unitCount ?? 0)} units · ${esc(result.assetsSynced ?? 0)} assets synced</span>`;
          }
          await openWialonAccount(btn.dataset.account, btn.dataset.name);
        } catch (ex) {
          if (msg) msg.innerHTML = `<span class="banner banner-error">${esc(ex.message || 'Link failed')}</span>`;
          btn.disabled = false;
        }
        return;
      }

      if (action === 'tenant-save-modules') {
        const form = document.getElementById('tenant-modules-form');
        if (!form) return;
        const modules = [...form.querySelectorAll('[data-module-key]')].map((el) => ({
          moduleKey: el.dataset.moduleKey,
          enabled: !!el.checked,
        }));
        btn.disabled = true;
        try {
          await MamsApi.api(`/admin/tenants/${encodeURIComponent(btn.dataset.id)}/modules`, {
            method: 'PUT',
            body: JSON.stringify({ modules }),
          });
          alert('Modules saved');
          await openTenantDetail(btn.dataset.id);
        } catch (ex) {
          alert(ex.message || 'Failed to save modules');
          btn.disabled = false;
        }
        return;
      }

      if (action === 'tenant-toggle-status') {
        btn.disabled = true;
        try {
          await MamsApi.api(`/admin/tenants/${encodeURIComponent(btn.dataset.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: btn.dataset.status }),
          });
          await openTenantDetail(btn.dataset.id);
          await reloadTenants(document.getElementById('tenant-search')?.value || '');
        } catch (ex) {
          alert(ex.message || 'Failed to update status');
          btn.disabled = false;
        }
        return;
      }

      if (action === 'toggle-system-user') {
        btn.disabled = true;
        try {
          await MamsApi.api(`/admin/system-users/${encodeURIComponent(btn.dataset.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ isActive: btn.dataset.active !== '1' }),
          });
          await loadModule();
        } catch (ex) {
          alert(ex.message || 'Failed to update user');
          btn.disabled = false;
        }
        return;
      }

      if (action === 'reset-system-user-pw') {
        const pw = prompt('New temporary password (leave blank to auto-generate):');
        if (pw === null) return;
        try {
          const res = await MamsApi.api(`/admin/system-users/${encodeURIComponent(btn.dataset.id)}/reset-password`, {
            method: 'POST',
            body: JSON.stringify(pw ? { password: pw } : {}),
          });
          alert(`Password reset. Temporary password: ${res.temporaryPassword || '(set)'}`);
        } catch (ex) {
          alert(ex.message || 'Reset failed');
        }
        return;
      }

      if (action === 'wialon-mother-delete') {
        if (!confirm('Remove this mother account?')) return;
        try {
          await MamsApi.api(`/admin/centers/wialon/mothers/${encodeURIComponent(btn.dataset.id)}`, { method: 'DELETE' });
          await loadModule();
        } catch (ex) {
          alert(ex.message || 'Delete failed');
        }
        return;
      }

      if (action === 'save-system-setting') {
        const key = btn.dataset.key;
        if (!key) return;
        const form = content.querySelector(`[data-setting-form="${key}"]`);
        if (!form) return;

        const payload = {};
        form.querySelectorAll('[data-setting-field]').forEach((el) => {
          const field = el.dataset.settingField;
          if (!field) return;
          if (el.type === 'checkbox') {
            payload[field] = !!el.checked;
            return;
          }
          if (el.type === 'number') {
            payload[field] = el.value === '' ? null : Number(el.value);
            return;
          }
          payload[field] = el.value;
        });

        btn.disabled = true;
        const prevText = btn.textContent;
        btn.textContent = 'Saving…';
        try {
          await MamsApi.api(`/admin/system/settings/${encodeURIComponent(key)}`, {
            method: 'PUT',
            body: JSON.stringify({ value: payload }),
          });
          btn.textContent = 'Saved';
          setTimeout(() => { btn.textContent = prevText; }, 1000);
        } catch (ex) {
          alert(ex.message || 'Failed to save setting');
          btn.textContent = prevText;
        } finally {
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
      return;
    }
    if (e.target.id === 'wialon-mother-picker') {
      await loadWialonHierarchy(e.target.value);
      return;
    }

    async function readFileAsBase64(file) {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    }

    if (e.target.id === 'tenant-logo-file' || e.target.id === 'tenant-favicon-file') {
      const file = e.target.files?.[0];
      const tenantId = e.target.dataset.tenant;
      const msg = document.getElementById('tenant-branding-msg');
      if (!file || !tenantId) return;
      const fileType = e.target.id === 'tenant-favicon-file' ? 'favicon' : 'logo';
      if (msg) msg.textContent = `Uploading ${fileType}…`;
      try {
        const data = await readFileAsBase64(file);
        const result = await MamsApi.api(`/admin/tenants/${encodeURIComponent(tenantId)}/upload`, {
          method: 'POST',
          body: JSON.stringify({
            fileName: file.name,
            mimeType: file.type || undefined,
            fileType,
            data,
          }),
        });
        if (msg) msg.textContent = result.message || 'Uploaded';
        await openTenantDetail(tenantId, 'branding');
      } catch (ex) {
        if (msg) msg.textContent = ex.message || 'Upload failed';
      }
      return;
    }

    if (e.target.id === 'fuel-sheet-file') {
      const file = e.target.files?.[0];
      const tenantId = e.target.dataset.tenant;
      const msg = document.getElementById('fuel-sheet-msg');
      if (!file || !tenantId) return;
      if (msg) msg.textContent = 'Importing sheet…';
      try {
        const data = await readFileAsBase64(file);
        const result = await MamsApi.api(`/admin/tenants/${encodeURIComponent(tenantId)}/fuel-station-sheets`, {
          method: 'POST',
          body: JSON.stringify({ fileName: file.name, data }),
        });
        if (msg) msg.textContent = `Imported ${result.imported}/${result.rowCount} rows` + (result.skipped ? ` (${result.skipped} skipped)` : '');
        await openTenantDetail(tenantId, 'fuel-module');
      } catch (ex) {
        if (msg) msg.textContent = ex.message || 'Import failed';
      }
    }
  });

  content.addEventListener('submit', async (e) => {
    const form = e.target;

    if (form.classList?.contains('integration-cred-form')) {
      e.preventDefault();
      const tenantId = form.dataset.tenant;
      const source = form.dataset.source;
      const msg = form.querySelector('.integration-msg');
      const fd = new FormData(form);
      const credentials = {};
      fd.forEach((v, k) => {
        if (String(v).trim() !== '') credentials[k] = String(v).trim();
      });
      if (msg) msg.textContent = 'Saving…';
      try {
        const result = await MamsApi.api(
          `/admin/tenants/${encodeURIComponent(tenantId)}/integrations/${encodeURIComponent(source)}`,
          { method: 'PUT', body: JSON.stringify({ credentials }) }
        );
        if (msg) {
          msg.textContent = result.message || 'Saved'
            + (result.webhookUrl ? ` · webhook: ${result.webhookUrl}` : '');
        }
        await openTenantDetail(tenantId, 'integrations');
      } catch (ex) {
        if (msg) msg.textContent = ex.message || 'Save failed';
      }
      return;
    }

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

    if (form.id === 'tenant-general-form') {
      e.preventDefault();
      const fd = new FormData(form);
      const msg = document.getElementById('tenant-general-msg');
      try {
        await MamsApi.api(`/admin/tenants/${encodeURIComponent(form.dataset.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: fd.get('name'),
            contactEmail: fd.get('contactEmail'),
            phone: fd.get('phone'),
            country: fd.get('country'),
            timezone: fd.get('timezone'),
          }),
        });
        if (msg) msg.textContent = 'Profile saved';
        await openTenantDetail(form.dataset.id, 'general');
      } catch (ex) {
        if (msg) msg.textContent = ex.message || 'Save failed';
      }
      return;
    }

    if (form.id === 'tenant-branding-form') {
      e.preventDefault();
      const fd = new FormData(form);
      const msg = document.getElementById('tenant-branding-msg');
      try {
        await MamsApi.api(`/admin/tenants/${encodeURIComponent(form.dataset.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            primaryColor: fd.get('primaryColor'),
            secondaryColor: fd.get('secondaryColor'),
            accentColor: fd.get('accentColor'),
            logoUrl: fd.get('logoUrl') || null,
            faviconUrl: fd.get('faviconUrl') || null,
            customCss: fd.get('customCss') || null,
          }),
        });
        if (msg) msg.textContent = 'Branding saved';
        await openTenantDetail(form.dataset.id, 'branding');
      } catch (ex) {
        if (msg) msg.textContent = ex.message || 'Save failed';
      }
      return;
    }

    if (form.id === 'fuel-module-form') {
      e.preventDefault();
      const msg = document.getElementById('fuel-module-msg');
      const selectedReports = [...form.querySelectorAll('[data-fuel-tpl]:checked')].map((el) => ({
        resourceId: Number(el.dataset.resource),
        templateId: Number(el.dataset.template),
        templateName: el.dataset.name || '',
        module: 'fuel',
      }));
      const price = form.fuelPricePerLiter?.value;
      try {
        await MamsApi.api(`/admin/tenants/${encodeURIComponent(form.dataset.id)}/fuel-module-config`, {
          method: 'PUT',
          body: JSON.stringify({
            selectedReports,
            fuelPricePerLiter: price !== '' ? Number(price) : null,
          }),
        });
        if (msg) msg.textContent = `Saved · ${selectedReports.length} templates`;
        await openTenantDetail(form.dataset.id, 'fuel-module');
      } catch (ex) {
        if (msg) msg.textContent = ex.message || 'Save failed';
      }
      return;
    }

    if (form.id === 'wialon-mother-form') {
      e.preventDefault();
      const fd = new FormData(form);
      const errEl = document.getElementById('wialon-mother-error');
      if (errEl) errEl.hidden = true;
      try {
        await MamsApi.api('/admin/centers/wialon/mothers', {
          method: 'POST',
          body: JSON.stringify({
            name: fd.get('name') || 'Mother account',
            token: fd.get('token'),
            baseUrl: fd.get('baseUrl') || undefined,
          }),
        });
        form.reset();
        await loadModule();
      } catch (ex) {
        if (errEl) { errEl.textContent = ex.message || 'Failed to save mother account'; errEl.hidden = false; }
      }
      return;
    }

    if (form.id === 'system-user-form') {
      e.preventDefault();
      const fd = new FormData(form);
      const errEl = document.getElementById('system-user-error');
      if (errEl) errEl.hidden = true;
      try {
        await MamsApi.api('/admin/system-users', {
          method: 'POST',
          body: JSON.stringify({
            fullName: fd.get('fullName') || undefined,
            email: fd.get('email'),
            password: fd.get('password'),
            role: fd.get('role') || 'platform_admin',
          }),
        });
        form.reset();
        await loadModule();
      } catch (ex) {
        if (errEl) { errEl.textContent = ex.message || 'Failed to create system user'; errEl.hidden = false; }
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
      buildNav(user.role);

      refreshFooterHealth();
      footerHealthPollId = setInterval(refreshFooterHealth, 60000);

      await loadModule();
    } catch (e) {
      if (e.status === 401) {
        MamsApi.redirectLogin();
        return;
      }
      content.innerHTML = `<div class="banner banner-error">${esc(e.message || 'Failed to load')}</div>`;
    }
  }

  boot();
})();
