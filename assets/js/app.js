(() => {
  'use strict';

  /* ── Shared UI helpers ── */
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDate(v) {
    if (!v) return '—';
    const d = new Date(typeof v === 'number' ? v * 1000 : v);
    return isNaN(d) ? esc(v) : d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  }

  function statusBadge(status) {
    const s = String(status || 'offline').toLowerCase();
    const aliasMap = {
      available: 'active',
      driving: 'moving',
      'off-duty': 'stopped',
      scheduled: 'idle',
      'in-progress': 'moving',
      completed: 'active',
      cancelled: 'offline',
      pending: 'idle',
      open: 'warning',
    };
    const known = ['moving', 'idle', 'stopped', 'offline', 'active', 'critical', 'warning', 'info'];
    const cls = known.includes(s) ? s : (aliasMap[s] || 'offline');
    return `<span class="badge badge-${cls}">${esc(status || 'offline')}</span>`;
  }

  function severityBadge(sev) {
    const s = String(sev || 'info').toLowerCase();
    const cls = s === 'critical' || s === 'emergency' ? 'critical' : s === 'warning' ? 'warning' : 'info';
    return `<span class="badge badge-${cls}">${esc(sev || 'info')}</span>`;
  }

  function roleBadge(role) {
    return `<span class="badge badge-brand">${esc(role || '—')}</span>`;
  }

  /** Mirror React Dashboard unitParam — battery % / voltage from lmsg/prms/sens */
  function unitParam(unit, ...keys) {
    if (!unit) return null;
    const lmsg = (unit.lmsg && unit.lmsg.params) || {};
    const prms = {};
    (unit.prms || []).forEach((p) => {
      if (p && p.key != null) prms[p.key] = p.value;
    });
    for (const key of keys) {
      if (lmsg[key] != null && Number.isFinite(Number(lmsg[key]))) return Number(lmsg[key]);
      if (prms[key] != null && Number.isFinite(Number(prms[key]))) return Number(prms[key]);
    }
    for (const s of (unit.sens || [])) {
      const name = String(s.name || '').toLowerCase();
      const type = String(s.type || '').toLowerCase();
      const param = String(s.param || '');
      for (const key of keys) {
        const k = String(key).toLowerCase();
        if (name.includes(k) || type.includes(k) || param.toLowerCase() === k) {
          if (param && lmsg[param] != null && Number.isFinite(Number(lmsg[param]))) return Number(lmsg[param]);
          if (param && prms[param] != null && Number.isFinite(Number(prms[param]))) return Number(prms[param]);
        }
      }
    }
    return null;
  }

  const ADMIN_ROLES = ['tenant_admin', 'platform_admin', 'super_admin'];
  function isAdminRole(role) {
    return ADMIN_ROLES.includes(role);
  }

  /** Mirrors React moduleEnabledSet() — drops disabled modules and, for
   * non-admin users, modules whose data has been hidden by the tenant admin. */
  function moduleEnabledSet(modules, isAdmin) {
    const set = new Set();
    (Array.isArray(modules) ? modules : []).forEach((m) => {
      if (!m || m.isEnabled === false) return;
      if (m.isVisible === false && !isAdmin) return;
      set.add(m.moduleKey);
    });
    return set;
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
      return `<div class="card card-flat"><div class="table-wrap">${emptyState('📋', emptyMsg || 'No data', 'Nothing to show yet.')}</div></div>`;
    }
    return `<div class="card card-flat"><div class="table-wrap"><table class="table"><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table></div></div>`;
  }

  function integrationBanner(name) {
    return `<div class="banner banner-info">Connect ${esc(name)} in Settings to unlock live data for this module.</div>`;
  }

  /* ── Route config ── */
  const ROUTES = {
    dashboard: { title: 'Dashboard', subtitle: 'Live operational picture across your enabled modules', icon: '◉' },
    monitoring: { title: 'Monitoring', subtitle: 'Live fleet map & list', icon: '◎' },
    fuel: { title: 'Fuel', subtitle: 'Transactions & analytics', icon: '⛽' },
    workshop: { title: 'Workshop', subtitle: 'Maintenance & inspections', icon: '🔧' },
    alerts: { title: 'Alerts', subtitle: 'Events & notifications', icon: '🔔' },
    drivers: { title: 'Drivers', subtitle: 'Driver roster & performance', icon: '👤' },
    routes: { title: 'Routes', subtitle: 'Trips & route planning', icon: '🛣' },
    geofencing: { title: 'Geofencing', subtitle: 'Zones & boundaries', icon: '📍' },
    emissions: { title: 'Emissions', subtitle: 'Eco metrics & violations', icon: '🌿' },
    commands: { title: 'Commands', subtitle: 'Remote device commands', icon: '⌘' },
    surveillance: { title: 'Surveillance', subtitle: 'Video streams & cameras', icon: '📹' },
    sensors: { title: 'Sensors', subtitle: 'Telemetry & sensor data', icon: '📊' },
    trailers: { title: 'Trailers', subtitle: 'Trailer assets & coupling', icon: '🚛' },
    reports: { title: 'Reports', subtitle: 'Generate & export fleet data', icon: '📄' },
    users: { title: 'Users', subtitle: 'Tenant user accounts', icon: '👥' },
    settings: { title: 'Settings', subtitle: 'Preferences & account', icon: '⚙' },
  };

  /* Modules available for the quick-access grid — order mirrors React dashboardNav.ts */
  const QUICK_ACCESS_MODULES = [
    { key: 'monitoring', label: 'Monitoring', desc: 'Live map & tracks' },
    { key: 'alerts', label: 'Alerts', desc: 'Inbox & severity' },
    { key: 'fuel', label: 'Fuel', desc: 'Use, fills & drains' },
    { key: 'workshop', label: 'Workshop', desc: 'Jobs & costs' },
    { key: 'drivers', label: 'Drivers', desc: 'Roster & duty' },
    { key: 'routes', label: 'Routes', desc: 'Plans & trips' },
    { key: 'emissions', label: 'Emissions', desc: 'CO₂ & eco' },
    { key: 'surveillance', label: 'Surveillance', desc: 'Cameras & video' },
    { key: 'geofencing', label: 'Geofencing', desc: 'Zones & radius' },
    { key: 'sensors', label: 'Sensors', desc: 'Fuel % & engine' },
    { key: 'commands', label: 'Commands', desc: 'Remote control' },
    { key: 'trailers', label: 'Trailers', desc: 'Trailer roster' },
  ];

  function quickAccessGrid(enabled) {
    const links = QUICK_ACCESS_MODULES.filter((m) => !enabled || enabled.has(m.key));
    if (!links.length) return '';
    return `<div class="quick-access-grid">
      ${links.map((m) => `<a class="quick-access-tile" href="/app/${m.key}">
        <div class="qa-icon">${MamsIcons.forModule(m.key)}</div>
        <div class="qa-label">${esc(m.label)}</div>
        <div class="qa-desc">${esc(m.desc)}</div>
      </a>`).join('')}
    </div>`;
  }

  /* ── Module-gated sidebar (#client-nav) ── */
  const DEFAULT_MODULES_FALLBACK = [
    { moduleKey: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard', sortOrder: 0, isEnabled: true, isVisible: true },
    { moduleKey: 'monitoring', label: 'Monitoring', icon: 'Map', sortOrder: 1, isEnabled: true, isVisible: true },
    { moduleKey: 'surveillance', label: 'Surveillance', icon: 'Video', sortOrder: 2, isEnabled: true, isVisible: true },
    { moduleKey: 'alerts', label: 'Alerts', icon: 'Bell', sortOrder: 3, isEnabled: true, isVisible: true },
  ];

  function navLinkHtml(moduleKey, label, icon, isVisible, isAdmin) {
    const hiddenData = isVisible === false && !isAdmin;
    return `<a href="/app/${esc(moduleKey)}" data-mod="${esc(moduleKey)}" class="${hiddenData ? 'nav-hidden-data' : ''}"${hiddenData ? ' title="Data hidden by your tenant admin"' : ''}>
      <span class="nav-icon">${MamsIcons.forModule(moduleKey, icon)}</span>
      <span class="nav-label">${esc(label)}</span>
      ${hiddenData ? `<span class="nav-hidden-badge" aria-label="Data hidden">${MamsIcons.get('EyeOff')}</span>` : ''}
    </a>`;
  }

  function renderClientNavHtml(modules, isAdmin) {
    const list = (Array.isArray(modules) ? modules : []).filter((m) => m && m.isEnabled !== false).slice();
    list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const dashIdx = list.findIndex((m) => m.moduleKey === 'dashboard');
    if (dashIdx > 0) {
      const [dash] = list.splice(dashIdx, 1);
      list.unshift(dash);
    }
    const links = list.map((m) => navLinkHtml(
      m.moduleKey,
      m.label || (ROUTES[m.moduleKey] && ROUTES[m.moduleKey].title) || m.moduleKey,
      m.icon,
      m.isVisible,
      isAdmin
    )).join('');
    const settingsLink = navLinkHtml('settings', 'Settings', 'Settings', true, true);
    return links + settingsLink;
  }

  async function initClientNav(isAdmin) {
    let modules = DEFAULT_MODULES_FALLBACK;
    try {
      const data = await MamsApi.api('/client/modules');
      if (Array.isArray(data) && data.length) modules = data;
    } catch (_) { /* keep fallback */ }
    const nav = document.getElementById('client-nav');
    if (nav) nav.innerHTML = renderClientNavHtml(modules, isAdmin);
    setActiveNav(getModule());
    return modules;
  }

  /* ── Module renderers ── */
  async function renderDashboard() {
    const [kpis, snap, integrations, alertsRaw, wialonCtx, modulesRaw, fuelTrend, workshopKpis, driverStats, routeStats, geofencesRaw] = await Promise.all([
      MamsApi.api('/client/dashboard/kpis').catch(() => ({})),
      MamsApi.api('/client/fleet/snapshot').catch(() => ({ units: [], counts: {} })),
      MamsApi.api('/client/integrations/status').catch(() => []),
      MamsApi.api('/client/alerts').catch(() => []),
      MamsApi.api('/client/wialon/context').catch(() => ({ configured: false, connected: false })),
      MamsApi.api('/client/modules').catch(() => DEFAULT_MODULES_FALLBACK),
      MamsApi.api('/client/fuel/monthly-trend').catch(() => []),
      MamsApi.api('/client/workshop/kpis').catch(() => ({})),
      MamsApi.api('/client/drivers/stats').catch(() => ({})),
      MamsApi.api('/client/routes/stats').catch(() => ({})),
      MamsApi.api('/client/geofences').catch(() => []),
    ]);

    const units = snap.units || [];
    const counts = snap.counts || {};
    const intList = Array.isArray(integrations) ? integrations : [];
    const alertList = Array.isArray(alertsRaw) ? alertsRaw : alertsRaw.alerts || [];
    const modules = Array.isArray(modulesRaw) ? modulesRaw : [];
    const trend = Array.isArray(fuelTrend) ? fuelTrend : [];
    const geofences = Array.isArray(geofencesRaw) ? geofencesRaw : (geofencesRaw.geofences || []);
    const isAdmin = isAdminRole(currentUserRole);
    const enabled = moduleEnabledSet(modules, isAdmin);

    const openAlerts = alertList.filter((a) => !a.acknowledged).length;
    const criticalAlerts = alertList.filter((a) => !a.acknowledged && ['critical', 'emergency'].includes(String(a.severity || '').toLowerCase())).length;
    const acknowledgedAlerts = Math.max(0, (alertList.length || 0) - openAlerts);
    const warningAlerts = alertList.filter((a) => String(a.severity || '').toLowerCase() === 'warning').length;
    const infoAlerts = Math.max(0, (alertList.length || 0) - criticalAlerts - warningAlerts);
    const online = intList.filter((i) => i.connected).length;
    const moving = kpis.moving ?? counts.moving ?? 0;
    const idle = kpis.idle ?? counts.idle ?? 0;
    const total = kpis.totalVehicles ?? counts.total ?? units.length;
    const onlineCount = Math.max(0, total - (counts.offline ?? 0));
    const util = total ? Math.round(((moving + idle) / total) * 100) : 0;

    const rows = units.slice(0, 12).map((u) => `<tr>
      <td><strong>${esc(u.name)}</strong>${u.plate ? `<br><span class="muted">${esc(u.plate)}</span>` : ''}</td>
      <td>${statusBadge(u.status)}</td>
      <td>${u.position ? `${Number(u.position.speed || 0).toFixed(0)} km/h` : '—'}</td>
      <td>${u.fuelLevel != null ? esc(Math.round(u.fuelLevel)) + '%' : '—'}</td>
      <td class="muted">${u.position ? fmtDate(u.position.time * 1000) : '—'}</td>
    </tr>`).join('');

    const metrics = [];
    if (enabled.has('monitoring')) {
      metrics.push(metricCard('Assets', total, 'Total fleet units', 'Truck'));
      metrics.push(metricCard('Online', onlineCount, `${util}% utilization`, 'Activity'));
      metrics.push(metricCard('Moving', moving, 'In motion now', 'Zap'));
      metrics.push(metricCard('Idle', idle, 'Engine on, stopped', 'Gauge'));
    }
    if (enabled.has('alerts')) {
      metrics.push(metricCard('Alerts', openAlerts || (kpis.unacknowledgedAlerts ?? 0), `${criticalAlerts || (kpis.criticalAlerts ?? 0)} critical`, 'AlertTriangle'));
    }
    if (enabled.has('drivers')) {
      metrics.push(metricCard('Drivers', kpis.totalDrivers ?? driverStats?.total ?? 0, `${kpis.activeDrivers ?? 0} active`, 'Users'));
    }
    if (enabled.has('fuel')) {
      metrics.push(metricCard('Fuel tx', kpis.fuelTransactions30d ?? 0, 'Last 30 days', 'Fuel'));
    }
    metrics.push(metricCard('Sources', intList.length ? `${online}/${intList.length}` : '—', 'Integrations linked', 'Plug'));

    const chartCards = [];

    // Monitoring widget board (structure parity with legacy React dashboard)
    if (enabled.has('monitoring')) {
      chartCards.push(chartCardHtml(
        'Health check status',
        'Live connection · freshness · fuel risk',
        'dash-widget-health-check',
        `${moving} healthy · ${idle} watch · ${(counts.offline ?? 0)} offline`
      ));
      chartCards.push(chartCardHtml(
        'Connection status',
        'Live online vs offline',
        'dash-chart-connection',
        `${onlineCount}/${total} online now`
      ));
      chartCards.push(chartCardHtml(
        'Motion state',
        'Live motion · ignition · not period-filtered',
        'dash-widget-motion-state',
        `${moving} moving · ${idle} idle · ${(counts.stopped ?? 0)} stopped`
      ));
      chartCards.push(chartCardHtml(
        'Fleet status',
        'Moving · idle · stopped · offline',
        'dash-chart-fleet-status',
        `${(counts.moving ?? moving)} moving · ${(counts.idle ?? idle)} idle`
      ));
      chartCards.push(chartCardHtml('Mileage', snap.live ? 'Live odometer total · from Wialon' : 'Trip odometer total · from trip summaries', 'dash-widget-mileage',
        (() => {
          const totalKm = units.reduce((s, u) => s + (Number(u.mileage) || 0), 0);
          return totalKm > 0 ? `${Math.round(totalKm).toLocaleString()} km total` : 'No mileage yet';
        })()));
      chartCards.push(chartCardHtml('Top units by mileage', snap.live ? 'Live odometer leaders' : 'Trip odometer leaders', 'dash-widget-top-mileage',
        (() => {
          const leaders = [...units].filter((u) => Number(u.mileage) > 0).sort((a, b) => Number(b.mileage) - Number(a.mileage));
          return leaders[0] ? `${leaders[0].name} · ${Math.round(Number(leaders[0].mileage)).toLocaleString()} km` : 'No mileage yet';
        })()));
      chartCards.push(chartCardHtml('Fleet utilization', 'Moving + idle share · not period-filtered', 'dash-widget-fleet-utilization', `${util}% utilization`));
      chartCards.push(chartCardHtml('Geofences', 'Zones & boundaries', 'dash-widget-geofences', `${geofences.length} zones configured`));
      const battCount = units.filter((u) => unitParam(u, 'battery') != null).length;
      const voltCount = units.filter((u) => unitParam(u, 'pwr_ext', 'ext_voltage', 'external_voltage', 'battery_voltage', 'pwr_int') != null).length;
      chartCards.push(chartCardHtml('Device battery', 'Live battery % · not period-filtered', 'dash-widget-device-battery',
        battCount ? `${battCount} units reporting` : 'No battery sensors'));
      chartCards.push(chartCardHtml('Voltage level', 'Live supply / internal voltage', 'dash-widget-voltage-level',
        voltCount ? `${voltCount} units reporting` : 'No voltage sensors'));
    }

    // Alerts widget board (structure parity with legacy React dashboard)
    if (enabled.has('alerts')) {
      chartCards.push(chartCardHtml('Alerts trend', 'Last 24h alert volume', 'dash-widget-alerts-trend', 'Live alert volume preview'));
      chartCards.push(chartCardHtml('Alerts ack', 'Acknowledged vs unacknowledged', 'dash-widget-alerts-ack', `${openAlerts} open · ${acknowledgedAlerts} acknowledged`));
      chartCards.push(chartCardHtml('Alert severity', 'Critical · warning · info', 'dash-chart-alert-severity', `${criticalAlerts} critical · ${warningAlerts} warning · ${infoAlerts} info`));
      chartCards.push(chartCardHtml('Alert types', 'By alert type', 'dash-widget-alerts-types', 'Top types breakdown'));
      chartCards.push(chartCardHtml('Notifications', 'Latest notifications (preview)', 'dash-widget-notifications', `${alertList.length} latest alerts`));
      const speedingCount = alertList.filter((a) => /speed/i.test(String(a.type || '') + String(a.title || ''))).length;
      chartCards.push(chartCardHtml('Speedings', 'Speeding events from alerts', 'dash-widget-speedings', speedingCount ? `${speedingCount} speeding alerts` : 'No speeding alerts'));
    }

    // Fuel / Ops charts (what we already have data for)
    if (enabled.has('fuel') && trend.some((r) => Number(r.filled) > 0 || Number(r.consumed) > 0)) {
      chartCards.push(chartCardHtml('Monthly fill vs consumption', 'From fuel reports', 'dash-chart-fuel-trend'));
    }

    const workshopHasData = workshopKpis && Object.values(workshopKpis).some((v) => Number(v) > 0);
    if (enabled.has('workshop') && workshopHasData) {
      chartCards.push(chartCardHtml('Workshop load', 'Pending · done · breakdowns', 'dash-chart-workshop'));
    }

    if (enabled.has('drivers') && Number(driverStats?.total) > 0) {
      chartCards.push(chartCardHtml('Driver duty', 'Live roster split', 'dash-chart-driver-duty'));
    }

    if (enabled.has('routes') && Number(routeStats?.total) > 0) {
      chartCards.push(chartCardHtml('Route pipeline', 'Scheduled · in progress · completed', 'dash-chart-route-pipeline'));
    }

    if (intList.length) {
      chartCards.push(chartCardHtml('Integration sources', 'Connected vs configured', 'dash-chart-sources'));
    }

    const html = `
    <div class="dash-meta">
      <div><span class="muted">Fleet</span><strong>${total} assets</strong></div>
      <div><span class="muted">Online</span><strong>${onlineCount}/${total || '—'}</strong></div>
      <div><span class="muted">Utilization</span><strong>${util}%</strong></div>
      <div><span class="muted">Open alerts</span><strong>${openAlerts || (kpis.unacknowledgedAlerts ?? 0)}</strong></div>
      <div><span class="muted">Modules</span><strong>${enabled.size}</strong></div>
      ${wialonCtx?.connected ? `<div><span class="muted">Wialon</span><strong>Linked</strong></div>` : ''}
      ${snap.live ? `<div><span class="muted">Telemetry</span><strong>Live</strong></div>` : ''}
    </div>
    <div class="metric-strip">${metrics.join('')}</div>
    ${wialonBannerHtml(wialonCtx)}
    ${wialonSummaryHtml(wialonCtx)}
    ${chartCards.length ? `<div class="dash-section">
      <div class="dash-section-label">Charts</div>
      <div class="dash-widget-grid">${chartCards.join('')}</div>
    </div>` : ''}
    <div class="dash-section">
      <div class="dash-section-label">Quick access · your modules</div>
      ${quickAccessGrid(enabled)}
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Live fleet snapshot</h3><span class="muted">${units.length} units</span></div>
      ${tableWrap(['Asset', 'Status', 'Speed', 'Fuel', 'Updated'], rows, 'No fleet units')}
    </div>`;

    window.__dashPaint = () => paintDashboardCharts({
      units, counts, alertList, trend, workshopKpis, driverStats, routeStats, intList, onlineCount, total, geofences,
      moving, idle, snapLive: !!snap.live,
    });

    return html;
  }

  function metricCard(label, value, sub, iconName) {
    return `<div class="metric-card">
      ${iconName ? `<div class="metric-icon">${MamsIcons.get(iconName)}</div>` : ''}
      <div class="metric-label">${esc(label)}</div>
      <div class="metric-value">${esc(value)}</div>
      ${sub ? `<div class="metric-sub">${esc(sub)}</div>` : ''}
    </div>`;
  }

  function chartCardHtml(title, subtitle, canvasId, insight) {
    return `<div class="dash-widget chart-panel">
      <div class="chart-panel-head">
        <h4>${esc(title)}</h4>
        ${subtitle ? `<span class="muted">${esc(subtitle)}</span>` : ''}
      </div>
      ${insight ? `<div class="dash-widget-insight">${esc(insight)}</div>` : ''}
      <div class="chart-box"><canvas id="${canvasId}"></canvas></div>
    </div>`;
  }

  function fleetStatusSlices(counts) {
    const c = counts || {};
    const p = MamsCharts.palette();
    return [
      { label: 'Moving', value: c.moving || 0, color: p.fleet.moving },
      { label: 'Idle', value: c.idle || 0, color: p.fleet.idle },
      { label: 'Stopped', value: c.stopped || 0, color: p.fleet.stopped },
      { label: 'Offline', value: c.offline || 0, color: p.fleet.offline },
    ].filter((s) => s.value > 0);
  }

  function alertSeveritySlices(alertList) {
    const p = MamsCharts.palette();
    const buckets = { critical: 0, warning: 0, info: 0 };
    (alertList || []).forEach((a) => {
      const s = String(a.severity || 'info').toLowerCase();
      if (s === 'critical' || s === 'emergency') buckets.critical += 1;
      else if (s === 'warning') buckets.warning += 1;
      else buckets.info += 1;
    });
    return [
      { label: 'Critical', value: buckets.critical, color: p.severity.critical },
      { label: 'Warning', value: buckets.warning, color: p.severity.warning },
      { label: 'Info', value: buckets.info, color: p.severity.info },
    ].filter((s) => s.value > 0);
  }

  /** Error-state banner mirrors React WialonContextBanner (errorOnly variant). */
  function wialonBannerHtml(ctx) {
    if (!ctx || !ctx.configured || ctx.connected) return '';
    return `<div class="wialon-banner wialon-banner--error">
      <span class="wialon-banner-icon">${MamsIcons.get('Satellite')}</span>
      <span>Telematics is configured but not connected${ctx.lastError ? ': ' + esc(ctx.lastError) : '.'} Contact your account manager to restore the connection.</span>
    </div>`;
  }

  function wialonSummaryHtml(ctx) {
    if (!ctx || !ctx.connected) return '';
    return `<div class="wialon-banner wialon-banner--ok">
      <span class="wialon-banner-icon">${MamsIcons.get('Satellite')}</span>
      <span><strong>${esc(ctx.accountName || 'Connected account')}</strong></span>
      ${ctx.accountTier ? `<span class="badge badge-brand">${esc(ctx.accountTier)}</span>` : ''}
      ${ctx.unitCount != null ? `<span class="muted">${esc(ctx.unitCount)} units on this account</span>` : ''}
    </div>`;
  }

  /** Paints Chart.js canvases into the dashboard HTML after it is in the DOM. */
  function paintDashboardCharts(data) {
    if (typeof Chart === 'undefined') return;
    const { units, counts, alertList, trend, workshopKpis, driverStats, routeStats, intList, onlineCount, total, geofences } = data;
    const p = MamsCharts.palette();

    const drawNoDataDoughnut = (canvasId, label = 'No data') => {
      if (!document.getElementById(canvasId)) return;
      MamsCharts.doughnut(canvasId, [label], [1], [p.muted]);
    };

    const moving = Number(data.moving ?? counts?.moving ?? 0);
    const idle = Number(data.idle ?? counts?.idle ?? 0);
    const stopped = Number(counts?.stopped ?? 0);
    const offline = Number(counts?.offline ?? 0);

    // Health check (preview derived from fleet status partition)
    if (document.getElementById('dash-widget-health-check')) {
      const healthSlices = [
        { label: 'Healthy', value: moving, color: p.fleet.moving },
        { label: 'Watch', value: idle, color: p.fleet.idle },
        { label: 'Offline', value: offline > 0 ? offline : (Math.max(0, (total || 0) - (moving + idle + stopped))), color: p.fleet.offline },
      ].filter((s) => s.value > 0);
      if (healthSlices.length) {
        MamsCharts.doughnut(
          'dash-widget-health-check',
          healthSlices.map((s) => s.label),
          healthSlices.map((s) => s.value),
          healthSlices.map((s) => s.color),
        );
      } else {
        drawNoDataDoughnut('dash-widget-health-check');
      }
    }

    // Connection status
    if (document.getElementById('dash-chart-connection')) {
      const totalSafe = Math.max(0, Number(total || 0));
      const onlineSafe = Math.max(0, Number(onlineCount || 0));
      const offlineSafe = Math.max(0, totalSafe - onlineSafe);
      const connSlices = [
        { label: 'Online', value: onlineSafe, color: p.primary },
        { label: 'Offline', value: offlineSafe, color: p.fleet.offline },
      ].filter((s) => s.value > 0);
      if (connSlices.length) {
        MamsCharts.doughnut('dash-chart-connection', connSlices.map((s) => s.label), connSlices.map((s) => s.value), connSlices.map((s) => s.color));
      } else {
        drawNoDataDoughnut('dash-chart-connection');
      }
    }

    // Motion state (preview)
    if (document.getElementById('dash-widget-motion-state')) {
      const motionSlices = [
        { label: 'Moving', value: moving, color: p.fleet.moving },
        { label: 'Idle', value: idle, color: p.fleet.idle },
        { label: 'Stopped', value: stopped, color: p.fleet.stopped },
      ].filter((s) => s.value > 0);
      if (motionSlices.length) {
        MamsCharts.doughnut('dash-widget-motion-state', motionSlices.map((s) => s.label), motionSlices.map((s) => s.value), motionSlices.map((s) => s.color));
      } else {
        drawNoDataDoughnut('dash-widget-motion-state');
      }
    }

    // Fleet status (existing card, now always filled)
    if (document.getElementById('dash-chart-fleet-status')) {
      const fleetSlices = fleetStatusSlices(counts);
      if (fleetSlices.length) {
        MamsCharts.doughnut('dash-chart-fleet-status', fleetSlices.map((s) => s.label), fleetSlices.map((s) => s.value), fleetSlices.map((s) => s.color));
      } else {
        drawNoDataDoughnut('dash-chart-fleet-status');
      }
    }

    // Fleet utilization (preview)
    if (document.getElementById('dash-widget-fleet-utilization')) {
      const totalSafe = Math.max(0, Number(total || 0));
      const active = Number(moving || 0) + Number(idle || 0);
      const inactive = Math.max(0, totalSafe - active);
      const utilSlices = [
        { label: 'Active', value: active, color: p.accent },
        { label: 'Inactive', value: inactive, color: p.muted },
      ].filter((s) => s.value > 0);
      if (utilSlices.length) {
        MamsCharts.doughnut('dash-widget-fleet-utilization', utilSlices.map((s) => s.label), utilSlices.map((s) => s.value), utilSlices.map((s) => s.color));
      } else {
        drawNoDataDoughnut('dash-widget-fleet-utilization');
      }
    }

    // Mileage from trip summaries on fleet units
    if (document.getElementById('dash-widget-mileage') || document.getElementById('dash-widget-top-mileage')) {
      const leaders = [...(units || [])]
        .filter((u) => Number(u.mileage) > 0)
        .sort((a, b) => Number(b.mileage) - Number(a.mileage));
      const totalKm = leaders.reduce((s, u) => s + Number(u.mileage), 0);
      if (document.getElementById('dash-widget-mileage')) {
        if (totalKm > 0) {
          const top5 = leaders.slice(0, 5);
          const rest = Math.max(0, totalKm - top5.reduce((s, u) => s + Number(u.mileage), 0));
          const labels = top5.map((u) => u.name || u.plate || 'Unit');
          const values = top5.map((u) => Math.round(Number(u.mileage)));
          const colors = [p.primary, p.accent, p.info, p.warn, p.muted];
          if (rest > 0) { labels.push('Other'); values.push(Math.round(rest)); colors.push(p.muted); }
          MamsCharts.doughnut('dash-widget-mileage', labels, values, colors);
        } else {
          drawNoDataDoughnut('dash-widget-mileage', 'No mileage');
        }
      }
      if (document.getElementById('dash-widget-top-mileage')) {
        if (leaders.length) {
          const top = leaders.slice(0, 8);
          MamsCharts.bar(
            'dash-widget-top-mileage',
            top.map((u) => u.name || u.plate || 'Unit'),
            [{ label: 'km', data: top.map((u) => Math.round(Number(u.mileage))), backgroundColor: p.primary }],
          );
        } else {
          drawNoDataDoughnut('dash-widget-top-mileage', 'No mileage');
        }
      }
    }

    // Battery / voltage from live Wialon sensor params
    if (document.getElementById('dash-widget-device-battery')) {
      const batt = [...(units || [])]
        .map((u) => ({ name: u.name || u.plate || 'Unit', value: unitParam(u, 'battery') }))
        .filter((r) => r.value != null && r.value >= 0 && r.value <= 100)
        .sort((a, b) => a.value - b.value)
        .slice(0, 8);
      if (batt.length) {
        MamsCharts.bar(
          'dash-widget-device-battery',
          batt.map((r) => r.name),
          [{ label: '%', data: batt.map((r) => Math.round(r.value)), backgroundColor: p.warn }],
        );
      } else {
        drawNoDataDoughnut('dash-widget-device-battery', 'No sensor data');
      }
    }
    if (document.getElementById('dash-widget-voltage-level')) {
      const volts = [...(units || [])]
        .map((u) => ({
          name: u.name || u.plate || 'Unit',
          value: unitParam(u, 'pwr_ext', 'ext_voltage', 'external_voltage', 'battery_voltage', 'pwr_int'),
        }))
        .filter((r) => r.value != null && r.value > 0)
        .sort((a, b) => a.value - b.value)
        .slice(0, 8);
      if (volts.length) {
        MamsCharts.bar(
          'dash-widget-voltage-level',
          volts.map((r) => r.name),
          [{ label: 'V', data: volts.map((r) => Math.round(r.value * 10) / 10), backgroundColor: p.info }],
        );
      } else {
        drawNoDataDoughnut('dash-widget-voltage-level', 'No sensor data');
      }
    }

    if (document.getElementById('dash-widget-geofences')) {
      const count = Array.isArray(geofences) ? geofences.length : 0;
      if (count > 0) {
        MamsCharts.doughnut('dash-widget-geofences', ['Zones', 'Slots'], [count, Math.max(1, 12 - count)], [p.primary, p.muted]);
      } else {
        drawNoDataDoughnut('dash-widget-geofences', 'No zones');
      }
    }

    // Alerts trend (last 24 hours, preview)
    if (document.getElementById('dash-widget-alerts-trend')) {
      const now = Date.now();
      const bins = new Array(24).fill(0);
      const tsToBin = (ts) => {
        const d = now - ts;
        const h = Math.floor(d / 3600000);
        return h >= 0 && h < 24 ? 23 - h : null;
      };

      (alertList || []).forEach((a) => {
        const tsRaw = a.timestamp ?? a.occurredAt ?? null;
        const ts = typeof tsRaw === 'number' ? tsRaw * 1000 : (tsRaw ? Date.parse(String(tsRaw)) : NaN);
        if (!Number.isFinite(ts)) return;
        const bin = tsToBin(ts);
        if (bin == null) return;
        bins[bin] += 1;
      });

      const sum = bins.reduce((x, y) => x + y, 0);
      if (sum > 0) {
        const labels = bins.map((_, i) => {
          const hourTs = now - (23 - i) * 3600000;
          const d = new Date(hourTs);
          return `${String(d.getHours()).padStart(2, '0')}:00`;
        });
        MamsCharts.line(
          'dash-widget-alerts-trend',
          labels,
          [{ label: 'Alerts', data: bins, fill: true, borderColor: p.primary, backgroundColor: p.primary }],
        );
      } else {
        drawNoDataDoughnut('dash-widget-alerts-trend');
      }
    }

    // Alerts ack (preview from current alert list)
    if (document.getElementById('dash-widget-alerts-ack')) {
      const totalAlerts = Array.isArray(alertList) ? alertList.length : 0;
      const open = (alertList || []).filter((a) => !a.acknowledged).length;
      const acked = Math.max(0, totalAlerts - open);
      const ackSlices = [
        { label: 'Open', value: open, color: p.danger },
        { label: 'Acknowledged', value: acked, color: p.primary },
      ].filter((s) => s.value > 0);
      if (ackSlices.length) {
        MamsCharts.doughnut('dash-widget-alerts-ack', ackSlices.map((s) => s.label), ackSlices.map((s) => s.value), ackSlices.map((s) => s.color));
      } else {
        drawNoDataDoughnut('dash-widget-alerts-ack');
      }
    }

    // Alert severity (existing card, now always filled)
    if (document.getElementById('dash-chart-alert-severity')) {
      const severitySlices = alertSeveritySlices(alertList);
      if (severitySlices.length) {
        MamsCharts.doughnut('dash-chart-alert-severity', severitySlices.map((s) => s.label), severitySlices.map((s) => s.value), severitySlices.map((s) => s.color));
      } else {
        drawNoDataDoughnut('dash-chart-alert-severity');
      }
    }

    // Alert types (preview)
    if (document.getElementById('dash-widget-alerts-types')) {
      const buckets = {};
      (alertList || []).forEach((a) => {
        const t = String(a.type || 'other');
        buckets[t] = (buckets[t] || 0) + 1;
      });
      const entries = Object.entries(buckets).sort((a, b) => b[1] - a[1]);
      const top = entries.slice(0, 5);
      if (top.length) {
        const otherCount = entries.slice(5).reduce((s, [, v]) => s + v, 0);
        if (otherCount > 0) top.push(['Other', otherCount]);
        const palette = [p.primary, p.accent, p.warn, p.danger, p.info, p.muted];
        MamsCharts.doughnut(
          'dash-widget-alerts-types',
          top.map(([k]) => k),
          top.map(([, v]) => v),
          top.map((_, i) => palette[i % palette.length]),
        );
      } else {
        drawNoDataDoughnut('dash-widget-alerts-types');
      }
    }

    // Notifications + speedings from alert list
    if (document.getElementById('dash-widget-notifications')) {
      const latest = (alertList || []).slice(0, 6);
      if (latest.length) {
        const buckets = {};
        latest.forEach((a) => {
          const sev = String(a.severity || 'info').toLowerCase();
          buckets[sev] = (buckets[sev] || 0) + 1;
        });
        const entries = Object.entries(buckets);
        const palette = { critical: p.danger, emergency: p.danger, warning: p.warn, info: p.info };
        MamsCharts.doughnut(
          'dash-widget-notifications',
          entries.map(([k]) => k),
          entries.map(([, v]) => v),
          entries.map(([k]) => palette[k] || p.muted),
        );
      } else {
        drawNoDataDoughnut('dash-widget-notifications', 'No alerts');
      }
    }

    if (document.getElementById('dash-widget-speedings')) {
      const speeding = (alertList || []).filter((a) => /speed/i.test(String(a.type || '') + String(a.title || '')));
      if (speeding.length) {
        const byUnit = {};
        speeding.forEach((a) => {
          const name = a.assetName || a.unitName || a.title || 'Unit';
          byUnit[name] = (byUnit[name] || 0) + 1;
        });
        const top = Object.entries(byUnit).sort((a, b) => b[1] - a[1]).slice(0, 6);
        MamsCharts.bar(
          'dash-widget-speedings',
          top.map(([k]) => k),
          [{ label: 'Events', data: top.map(([, v]) => v), backgroundColor: p.warn }],
        );
      } else {
        drawNoDataDoughnut('dash-widget-speedings', 'No speedings');
      }
    }

    if (document.getElementById('dash-chart-fuel-trend')) {
      const rows = (trend || []).slice(-8);
      MamsCharts.composed('dash-chart-fuel-trend', rows.map((r) => String(r.month || r.name || '')),
        { label: 'Filled (L)', data: rows.map((r) => Number(r.filled) || 0) },
        { label: 'Consumed (L)', data: rows.map((r) => Number(r.consumed) || 0) },
        { bar: p.primary, line: p.accent });
    }

    if (document.getElementById('dash-chart-workshop')) {
      const w = workshopKpis || {};
      const rows = [
        { label: 'Pending', value: Number(w.pendingMaintenance) || 0, color: p.warn },
        { label: 'Done (mo)', value: Number(w.completedThisMonth) || 0, color: p.primary },
        { label: 'Breakdowns', value: Number(w.openBreakdowns) || 0, color: p.danger },
      ].filter((r) => r.value > 0);
      if (rows.length) {
        MamsCharts.bar('dash-chart-workshop', rows.map((r) => r.label), [{ label: 'Workshop', data: rows.map((r) => r.value), backgroundColor: rows.map((r) => r.color) }]);
      }
    }

    if (document.getElementById('dash-chart-driver-duty')) {
      const d = driverStats || {};
      const rows = [
        { label: 'Available', value: Number(d.available) || 0, color: p.fleet.moving },
        { label: 'Driving', value: Number(d.driving) || 0, color: p.primary },
        { label: 'Off duty', value: Number(d.offDuty) || 0, color: p.fleet.offline },
      ].filter((r) => r.value > 0);
      if (rows.length) {
        MamsCharts.doughnut('dash-chart-driver-duty', rows.map((r) => r.label), rows.map((r) => r.value), rows.map((r) => r.color));
      }
    }

    if (document.getElementById('dash-chart-route-pipeline')) {
      const r = routeStats || {};
      const rows = [
        { label: 'Scheduled', value: Number(r.scheduled) || 0, color: p.fleet.idle },
        { label: 'In progress', value: Number(r.inProgress) || 0, color: p.primary },
        { label: 'Completed', value: Number(r.completed) || 0, color: p.accent },
      ].filter((row) => row.value > 0);
      if (rows.length) {
        MamsCharts.bar('dash-chart-route-pipeline', rows.map((row) => row.label), [{ label: 'Routes', data: rows.map((row) => row.value), backgroundColor: rows.map((row) => row.color) }]);
      }
    }

    if (document.getElementById('dash-chart-sources')) {
      const list = intList || [];
      if (list.length) {
        MamsCharts.bar('dash-chart-sources', list.map((i) => String(i.sourceType || '—')),
          [{ label: 'Connected', data: list.map((i) => (i.connected ? 1 : 0)), backgroundColor: p.primary }]);
      }
    }
  }

  async function renderMonitoring() {
    const snap = await MamsApi.api('/client/fleet/snapshot');
    const units = snap.units || [];
    const counts = snap.counts || {};
    const rows = units.map((u) => {
      const batt = unitParam(u, 'battery');
      const km = Number(u.mileage) > 0 ? `${Math.round(Number(u.mileage)).toLocaleString()} km` : '—';
      return `<tr class="row-clickable" data-action="open-unit" data-id="${esc(u.wialonId || u.id)}" data-lat="${u.position?.lat ?? ''}" data-lng="${u.position?.lng ?? ''}" data-name="${esc(u.name)}">
      <td><strong>${esc(u.name)}</strong>${u.plate ? `<div class="muted">${esc(u.plate)}</div>` : ''}</td>
      <td>${statusBadge(u.status)}</td>
      <td>${u.position ? Number(u.position.speed || 0).toFixed(0) + ' km/h' : '—'}</td>
      <td>${u.fuelLevel != null ? esc(Math.round(u.fuelLevel)) + '%' : '—'}</td>
      <td>${esc(km)}</td>
      <td>${batt != null ? esc(Math.round(batt)) + '%' : '—'}</td>
      <td class="muted">${u.position ? fmtDate(u.position.time) : '—'}</td>
    </tr>`;
    }).join('');

    return `<div class="kpi-grid">
      ${kpi('Total', counts.total ?? units.length)}
      ${kpi('Moving', counts.moving ?? 0)}
      ${kpi('Idle', counts.idle ?? 0)}
      ${kpi('Offline', counts.offline ?? 0)}
      ${kpi('With GPS', counts.withPosition ?? 0)}
    </div>
    <div class="grid-main-side mt-1">
      <div class="card card-flat">
        <div class="card-header"><h3>Live map</h3><span class="badge ${snap.live ? 'badge-success' : 'badge-inactive'}">${snap.live ? 'Live Wialon' : 'Cached DB'}</span></div>
        <div id="fleet-map" class="map-panel"></div>
      </div>
      <div class="card card-flat">
        <div class="card-header"><h3>Fleet list</h3><span class="muted">${units.length}</span></div>
        ${tableWrap(['Name', 'Status', 'Speed', 'Fuel', 'Mileage', 'Battery', 'Updated'], rows, 'No units with telemetry')}
      </div>
    </div>
    <div id="unit-detail-root"></div>`;
  }

  function initFleetMap(units) {
    const el = document.getElementById('fleet-map');
    if (!el || typeof L === 'undefined') return;

    const withPos = units.filter((u) => u.position && u.position.lat && u.position.lng);
    const center = withPos.length
      ? [withPos[0].position.lat, withPos[0].position.lng]
      : [-1.2921, 36.8219];

    const map = L.map(el, { scrollWheelZoom: true }).setView(center, withPos.length ? 10 : 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const bounds = [];
    withPos.forEach((u) => {
      const { lat, lng } = u.position;
      const color = u.status === 'moving' ? '#047857' : u.status === 'idle' ? '#b45309' : '#64748b';
      const marker = L.circleMarker([lat, lng], { radius: 7, color, fillColor: color, fillOpacity: 0.85, weight: 2 })
        .bindPopup(`<strong>${esc(u.name)}</strong><br>${esc(u.status)}${u.plate ? '<br>' + esc(u.plate) : ''}`);
      marker.addTo(map);
      bounds.push([lat, lng]);
    });

    if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30] });
    setTimeout(() => map.invalidateSize(), 200);
  }

  function loadLeaflet(cb) {
    if (typeof L !== 'undefined') { cb(); return; }
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = cb;
    document.head.appendChild(script);
  }

  async function renderFuel() {
    const [data, monthly, liveFuel] = await Promise.all([
      MamsApi.api('/client/fuel/transactions').catch(() => ({ transactions: [], kpis: {} })),
      MamsApi.api('/client/fuel/monthly-trend').catch(() => []),
      MamsApi.api('/client/wialon/fuel/live').catch(() => ({ units: [], live: false })),
    ]);
    const txs = data.transactions || (Array.isArray(data) ? data : []);
    const kpis = data.kpis || {};
    const trend = Array.isArray(monthly) ? monthly : [];
    const liveUnits = liveFuel.units || [];
    const params = new URLSearchParams(location.search);
    const tab = (params.get('fuelTab') || 'all').toLowerCase();
    const fills = txs.filter((t) => Number(t.filled) > 0);
    const drains = txs.filter((t) => Number(t.fuelUsed || t.fuel_used) > 0 && !(Number(t.filled) > 0));
    const shown = tab === 'fills' ? fills : tab === 'drains' ? drains : tab === 'live' ? [] : txs;

    const rows = shown.slice(0, 100).map((t) => `<tr>
      <td>${fmtDate(t.timestamp ? t.timestamp * 1000 : t.date)}</td>
      <td><strong>${esc(t.unitName || t.assetName || '—')}</strong></td>
      <td>${esc(t.section || (t.filled ? 'fill' : 'consume'))}</td>
      <td>${t.filled ? esc(t.filled) + ' L filled' : (t.fuelUsed ? esc(t.fuelUsed) + ' L used' : '—')}</td>
      <td>${esc(t.location || '—')}</td>
      <td class="muted">${t.mileage != null ? esc(Math.round(Number(t.mileage))) + ' km' : '—'}</td>
    </tr>`).join('');

    const liveRows = liveUnits.slice(0, 80).map((u) => `<tr>
      <td><strong>${esc(u.name)}</strong>${u.plate ? `<div class="muted">${esc(u.plate)}</div>` : ''}</td>
      <td>${statusBadge(u.status)}</td>
      <td>${u.fuelLevel != null ? esc(Math.round(u.fuelLevel)) + '%' : '—'}</td>
      <td class="muted">${u.mileage != null ? esc(Math.round(Number(u.mileage))).toLocaleString() + ' km' : '—'}</td>
      <td>${u.battery != null ? esc(Math.round(u.battery)) + '%' : '—'}</td>
      <td>${u.voltage != null ? esc(Math.round(u.voltage * 10) / 10) + ' V' : '—'}</td>
    </tr>`).join('');

    const trendRows = trend.slice(-8).map((m) => `<tr>
      <td>${esc(m.month)}</td>
      <td>${esc(m.filled)} L</td>
      <td>${esc(m.consumed)} L</td>
    </tr>`).join('');

    const banner = liveFuel.live
      ? `<div class="banner banner-success">Live Wialon fuel levels available · ${liveUnits.length} units</div>`
      : (txs.length > 0
        ? `<div class="banner banner-info">Showing fuel events for ${esc(data.from || '')} – ${esc(data.to || '')}.</div>`
        : integrationBanner('Wialon fuel reports'));

    return `${banner}
    <div class="kpi-grid">
      ${kpi('Filled', (kpis.totalFilled ?? 0) + ' L')}
      ${kpi('Consumed', (kpis.totalConsumed ?? 0) + ' L')}
      ${kpi('Avg L/100km', kpis.avgConsumptionL100km ?? 0)}
      ${kpi('Live units', liveUnits.length)}
    </div>
    <div class="tab-bar mt-2">
      <a class="tab ${tab === 'all' ? 'active' : ''}" href="/app/fuel?fuelTab=all">All (${txs.length})</a>
      <a class="tab ${tab === 'fills' ? 'active' : ''}" href="/app/fuel?fuelTab=fills">Fills (${fills.length})</a>
      <a class="tab ${tab === 'drains' ? 'active' : ''}" href="/app/fuel?fuelTab=drains">Consumption (${drains.length})</a>
      <a class="tab ${tab === 'live' ? 'active' : ''}" href="/app/fuel?fuelTab=live">Live levels (${liveUnits.length})</a>
    </div>
    ${tab === 'live' ? `<div class="card mt-2">
      <div class="card-header"><h3>Live fuel / battery</h3><span class="badge ${liveFuel.live ? 'badge-success' : 'badge-inactive'}">${liveFuel.live ? 'Live' : 'Offline'}</span></div>
      ${tableWrap(['Asset', 'Status', 'Fuel', 'Mileage', 'Battery', 'Voltage'], liveRows, 'No live fuel levels (link + verify Wialon)')}
    </div>` : `<div class="grid-main-side mt-2">
      <div class="card">
        <div class="card-header"><h3>Fuel events</h3></div>
        ${tableWrap(['Date', 'Asset', 'Type', 'Volume', 'Location', 'Odo'], rows, 'No fuel transactions yet')}
      </div>
      <div class="card">
        <div class="card-header"><h3>Monthly trend</h3></div>
        ${tableWrap(['Month', 'Filled', 'Consumed'], trendRows, 'No trend data yet')}
        ${trend.some((r) => Number(r.filled) > 0 || Number(r.consumed) > 0) ? '<div class="chart-box mt-1" style="height:180px"><canvas id="fuel-page-trend"></canvas></div>' : ''}
      </div>
    </div>`}`;
  }

  async function renderWorkshop() {
    const [kpis, inspections, maintenance, breakdowns, mechanics] = await Promise.all([
      MamsApi.api('/client/workshop/kpis').catch(() => ({})),
      MamsApi.api('/client/workshop/inspections').catch(() => []),
      MamsApi.api('/client/workshop/maintenance').catch(() => []),
      MamsApi.api('/client/workshop/breakdowns').catch(() => []),
      MamsApi.api('/client/workshop/mechanics').catch(() => []),
    ]);
    const insp = Array.isArray(inspections) ? inspections : [];
    const maint = Array.isArray(maintenance) ? maintenance : [];
    const brk = Array.isArray(breakdowns) ? breakdowns : [];
    const mechs = Array.isArray(mechanics) ? mechanics : [];
    return `<div class="kpi-grid">
      ${kpi('Pending maintenance', kpis.pendingMaintenance ?? 0)}
      ${kpi('Completed this month', kpis.completedThisMonth ?? 0)}
      ${kpi('Open breakdowns', kpis.openBreakdowns ?? 0)}
      ${kpi('Mechanics', mechs.length || (kpis.mechanics ?? 0))}
    </div>
    <div class="grid-2 mt-2">
      <div class="card">
        <div class="card-header"><h3>Log maintenance</h3></div>
        <form id="maint-form" class="form-stack">
          <label><span>Vehicle name</span><input class="input" name="vehicleName" required /></label>
          <label><span>Plate</span><input class="input" name="vehiclePlate" /></label>
          <label><span>Type</span><select class="select" name="maintenanceType"><option value="service">Service</option><option value="repair">Repair</option><option value="inspection">Inspection follow-up</option></select></label>
          <label><span>Mechanic</span><input class="input" name="mechanicName" /></label>
          <label><span>Description</span><textarea class="input" name="description" rows="2" required></textarea></label>
          <p id="maint-error" class="error" hidden></p>
          <button type="submit" class="btn">Save maintenance</button>
        </form>
      </div>
      <div class="card">
        <div class="card-header"><h3>Report breakdown</h3></div>
        <form id="breakdown-form" class="form-stack">
          <label><span>Vehicle name</span><input class="input" name="vehicleName" required /></label>
          <label><span>Plate</span><input class="input" name="vehiclePlate" /></label>
          <label><span>Severity</span><select class="select" name="severity"><option value="minor">Minor</option><option value="major">Major</option><option value="critical">Critical</option></select></label>
          <label><span>Description</span><textarea class="input" name="description" rows="2" required></textarea></label>
          <p id="breakdown-error" class="error" hidden></p>
          <button type="submit" class="btn">Save breakdown</button>
        </form>
      </div>
    </div>
    <div class="grid-2 mt-2">
      <div class="card">
        <div class="card-header"><h3>Recent inspections</h3></div>
        ${tableWrap(['Asset', 'Result', 'When'], insp.slice(0, 20).map((i) => `<tr>
          <td>${esc(i.vehicleName || i.assetName || i.vehiclePlate || i.assetId || '—')}</td>
          <td>${esc(i.overallStatus || i.result || i.status || '—')}</td>
          <td class="muted">${fmtDate(i.inspectionDate || i.inspectedAt || i.createdAt)}</td>
        </tr>`).join(''), 'No inspections')}
      </div>
      <div class="card">
        <div class="card-header"><h3>Breakdowns</h3></div>
        ${tableWrap(['Asset', 'Status', 'When'], brk.slice(0, 20).map((b) => `<tr>
          <td>${esc(b.vehicleName || b.assetName || b.vehiclePlate || b.assetId || '—')}</td>
          <td>${statusBadge(b.resolutionTime ? 'resolved' : (b.status || 'open'))}</td>
          <td class="muted">${fmtDate(b.breakdownTime || b.reportedAt || b.createdAt)}</td>
        </tr>`).join(''), 'No breakdowns')}
      </div>
    </div>
    <div class="grid-2 mt-2">
      <div class="card">
        <div class="card-header"><h3>Maintenance logs</h3></div>
        ${tableWrap(['Asset', 'Type', 'Status', 'When'], maint.slice(0, 40).map((m) => `<tr>
          <td>${esc(m.vehicleName || m.assetName || m.vehiclePlate || m.assetId || '—')}</td>
          <td>${esc(m.maintenanceType || m.type || m.title || '—')}</td>
          <td>${statusBadge(m.status || '—')}</td>
          <td class="muted">${fmtDate(m.startDate || m.scheduledAt || m.createdAt)}</td>
        </tr>`).join(''), 'No maintenance logs')}
      </div>
      <div class="card">
        <div class="card-header"><h3>Mechanics</h3></div>
        ${tableWrap(['Name', 'Phone', 'Status'], mechs.slice(0, 40).map((m) => `<tr>
          <td><strong>${esc(m.fullName || m.name || '—')}</strong></td>
          <td>${esc(m.phone || '—')}</td>
          <td>${statusBadge(m.isActive === false ? 'inactive' : 'active')}</td>
        </tr>`).join(''), 'No mechanics listed')}
      </div>
    </div>`;
  }

  async function renderAlerts() {
    const [alerts, wialonNf] = await Promise.all([
      MamsApi.api('/client/alerts'),
      MamsApi.api('/client/wialon/notifications').catch(() => ({ notifications: [] })),
    ]);
    const list = Array.isArray(alerts) ? alerts : alerts.alerts || [];
    const nfList = wialonNf.notifications || [];
    const params = new URLSearchParams(location.search);
    const sev = (params.get('sev') || 'all').toLowerCase();
    const filtered = sev === 'all' ? list : list.filter((a) => {
      const s = String(a.severity || '').toLowerCase();
      if (sev === 'critical') return s === 'critical' || s === 'emergency';
      return s === sev;
    });
    const openIds = filtered.filter((a) => !a.acknowledged).map((a) => a.id);

    const rows = filtered.slice(0, 150).map((a) => `<tr>
      <td>${severityBadge(a.severity)}</td>
      <td>${esc(a.type)}</td>
      <td><strong>${esc(a.title)}</strong>${a.description ? `<br><span class="muted">${esc(a.description)}</span>` : ''}</td>
      <td>${a.acknowledged ? '<span class="badge badge-success">Ack</span>' : '<span class="badge badge-warning">Open</span>'}</td>
      <td class="muted">${fmtDate(a.timestamp || a.occurredAt)}</td>
      <td>${a.acknowledged ? '—' : `<button class="btn btn-sm" data-action="ack-alert" data-id="${esc(a.id)}">Acknowledge</button>`}</td>
    </tr>`).join('');

    const nfRows = nfList.slice(0, 80).map((n) => `<tr>
      <td><strong>${esc(n.name)}</strong><div class="muted">${esc(n.resourceName || '')}</div></td>
      <td>${n.active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-inactive">Off</span>'}</td>
      <td>${esc(n.controlType || '—')}</td>
      <td>${esc(n.unitCount ?? '—')}</td>
      <td>${esc(n.triggers ?? '—')}</td>
    </tr>`).join('');

    const open = list.filter((a) => !a.acknowledged).length;
    const critical = list.filter((a) => ['critical', 'emergency'].includes(String(a.severity || '').toLowerCase())).length;
    return `<div class="kpi-grid">
      ${kpi('Total', list.length)}
      ${kpi('Open', open)}
      ${kpi('Critical', critical)}
      ${kpi('Wialon rules', nfList.length)}
    </div>
    <div class="tab-bar mt-2">
      <a class="tab ${sev === 'all' ? 'active' : ''}" href="/app/alerts?sev=all">All</a>
      <a class="tab ${sev === 'critical' ? 'active' : ''}" href="/app/alerts?sev=critical">Critical</a>
      <a class="tab ${sev === 'warning' ? 'active' : ''}" href="/app/alerts?sev=warning">Warning</a>
      <a class="tab ${sev === 'info' ? 'active' : ''}" href="/app/alerts?sev=info">Info</a>
    </div>
    <div class="card mt-2">
      <div class="card-header">
        <h3>Alert inbox</h3>
        ${openIds.length ? `<button type="button" class="btn btn-sm" data-action="ack-alerts-bulk" data-ids="${esc(openIds.slice(0, 50).join(','))}">Ack open (${Math.min(openIds.length, 50)})</button>` : ''}
      </div>
      ${tableWrap(['Severity', 'Type', 'Message', 'Status', 'When', 'Actions'], rows, 'No alerts')}
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Wialon notification rules</h3><span class="muted">${nfList.length}</span></div>
      ${tableWrap(['Rule', 'Status', 'Control', 'Units', 'Triggers'], nfRows, 'No Wialon notification rules (link + verify Wialon)')}
    </div>`;
  }

  async function renderDrivers() {
    const [drivers, stats] = await Promise.all([
      MamsApi.api('/client/drivers').catch(() => []),
      MamsApi.api('/client/drivers/stats').catch(() => ({})),
    ]);
    const list = Array.isArray(drivers) ? drivers : drivers.items || [];
    const rows = list.map((d) => `<tr>
      <td><strong>${esc(d.fullName || d.name || '—')}</strong></td>
      <td>${esc(d.phone || d.mobile || '—')}</td>
      <td>${esc(d.licenseNumber || d.license || '—')}</td>
      <td>${esc(d.assignedAssetName || '—')}</td>
      <td>${statusBadge(d.status || 'available')}</td>
      <td><button class="btn btn-sm btn-ghost" data-action="delete-driver" data-id="${esc(d.id)}">Delete</button></td>
    </tr>`).join('');

    return `<div class="kpi-grid">
      ${kpi('Total', stats.total ?? list.length)}
      ${kpi('Available', stats.available ?? 0)}
      ${kpi('Driving', stats.driving ?? 0)}
      ${kpi('Off duty', stats.offDuty ?? 0)}
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Add driver</h3></div>
      <form id="driver-form" class="form-grid">
        <label><span>Full name</span><input class="input" name="name" required /></label>
        <label><span>Phone</span><input class="input" name="phone" /></label>
        <label><span>License number</span><input class="input" name="licenseNumber" required /></label>
        <label><span>Status</span><select class="select" name="status">
          <option value="available">Available</option>
          <option value="driving">Driving</option>
          <option value="off-duty">Off duty</option>
        </select></label>
        <div class="form-grid-action"><button type="submit" class="btn">+ Add driver</button></div>
        <p id="driver-error" class="error" hidden></p>
      </form>
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Drivers</h3><span class="muted">${list.length} registered</span></div>
      ${tableWrap(['Name', 'Phone', 'License', 'Asset', 'Status', 'Actions'], rows, 'No drivers registered')}
    </div>`;
  }

  async function renderRoutes() {
    const [routes, stats, trips, wialonRoutes] = await Promise.all([
      MamsApi.api('/client/routes').catch(() => []),
      MamsApi.api('/client/routes/stats').catch(() => ({})),
      MamsApi.api('/client/routes/trips').catch(() => []),
      MamsApi.api('/client/wialon/routes').catch(() => ({ routes: [] })),
    ]);
    const list = Array.isArray(routes) ? routes : routes.items || [];
    const liveRoutes = wialonRoutes.routes || [];
    const rows = list.map((r) => `<tr>
      <td><strong>${esc(r.name || r.id)}</strong></td>
      <td>${esc(r.assetName || '—')}</td>
      <td>${esc(r.driverName || '—')}</td>
      <td>${statusBadge(r.status || 'scheduled')}</td>
      <td class="muted">${fmtDate(r.startTime)}</td>
      <td>${r.distance != null ? esc(r.distance) + ' km' : '—'}</td>
    </tr>`).join('');

    const liveRows = liveRoutes.slice(0, 80).map((r) => `<tr>
      <td><strong>${esc(r.name || r.id)}</strong></td>
      <td class="muted">${esc(r.id)}</td>
      <td class="muted">${esc(r.accountId ?? '—')}</td>
    </tr>`).join('');

    const tripList = Array.isArray(trips) ? trips : [];
    const tripRows = tripList.slice(0, 30).map((t) => `<tr>
      <td>${esc(t.unitName || '—')}</td>
      <td class="muted">${fmtDate(t.departureTime)}</td>
      <td class="muted">${fmtDate(t.arrivalTime)}</td>
      <td>${t.mileage != null ? esc(t.mileage) + ' km' : '—'}</td>
    </tr>`).join('');

    return `<div class="kpi-grid">
      ${kpi('Total routes', stats.total ?? list.length)}
      ${kpi('Scheduled', stats.scheduled ?? 0)}
      ${kpi('In progress', stats.inProgress ?? 0)}
      ${kpi('Wialon live', liveRoutes.length)}
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Planned routes</h3></div>
      ${tableWrap(['Route', 'Asset', 'Driver', 'Status', 'Start', 'Distance'], rows, 'No routes configured')}
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Wialon routes</h3><span class="muted">${liveRoutes.length}</span></div>
      ${tableWrap(['Name', 'ID', 'Account'], liveRows, 'No live Wialon routes')}
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Recent trips</h3></div>
      ${tableWrap(['Unit', 'Departure', 'Arrival', 'Mileage'], tripRows, 'No trips recorded')}
    </div>`;
  }

  async function renderGeofencing() {
    const [geofences, liveZones] = await Promise.all([
      MamsApi.api('/client/geofences').catch(() => []),
      MamsApi.api('/client/wialon/geofences').catch(() => ({ geofences: [] })),
    ]);
    const list = Array.isArray(geofences) ? geofences : geofences.items || [];
    const live = liveZones.geofences || [];
    const rows = list.map((g) => `<tr>
      <td><strong>${esc(g.name || g.id)}</strong></td>
      <td>${esc(g.type || 'circle')}</td>
      <td>${g.isActive !== false ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-inactive">Inactive</span>'}</td>
      <td class="muted">${fmtDate(g.createdAt)}</td>
      <td><button class="btn btn-sm btn-ghost" data-action="delete-geofence" data-id="${esc(g.id)}">Delete</button></td>
    </tr>`).join('');
    const liveRows = live.slice(0, 100).map((g) => `<tr>
      <td><strong>${esc(g.name)}</strong><div class="muted">${esc(g.resourceName || '')}</div></td>
      <td>${esc(g.type)}</td>
      <td>${g.radius != null ? esc(Math.round(g.radius)) + ' m' : '—'}</td>
      <td class="muted">${g.center ? `${Number(g.center.lat).toFixed(4)}, ${Number(g.center.lng).toFixed(4)}` : '—'}</td>
    </tr>`).join('');

    return `<div class="card">
      <div class="card-header"><h3>New geofence</h3></div>
      <form id="geofence-form" class="form-grid">
        <label><span>Name</span><input class="input" name="name" required /></label>
        <label><span>Type</span><select class="select" name="type">
          <option value="circle">Circle</option>
          <option value="polygon">Polygon</option>
        </select></label>
        <label><span>Center (lat, lng)</span><input class="input" name="center" placeholder="-1.29, 36.82" /></label>
        <label><span>Radius (m)</span><input class="input" name="radius" type="number" placeholder="500" /></label>
        <div class="form-grid-action"><button type="submit" class="btn">+ New zone</button></div>
        <p id="geofence-error" class="error" hidden></p>
      </form>
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Platform geofences</h3><span class="muted">${list.length} zones</span></div>
      ${tableWrap(['Name', 'Type', 'Status', 'Created', 'Actions'], rows, 'No geofences defined')}
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Wialon geofences</h3><span class="muted">${live.length}</span></div>
      ${tableWrap(['Name', 'Type', 'Radius', 'Center'], liveRows, 'No live Wialon geofences')}
    </div>`;
  }

  async function renderEmissions() {
    const [metrics, violations] = await Promise.all([
      MamsApi.api('/client/emissions/metrics').catch(() => ({})),
      MamsApi.api('/client/emissions/violations').catch(() => []),
    ]);
    const list = Array.isArray(violations) ? violations : [];
    const rows = list.slice(0, 50).map((v) => `<tr>
      <td>${esc(v.assetName || v.assetId || '—')}</td>
      <td>${esc(v.violationType || v.type || '—')}</td>
      <td>${esc(v.severity || '—')}</td>
      <td class="muted">${fmtDate(v.occurredAt || v.createdAt)}</td>
    </tr>`).join('');
    return `<div class="kpi-grid">
      ${kpi('CO₂ estimate', metrics.co2Kg != null ? metrics.co2Kg + ' kg' : '—')}
      ${kpi('Fuel (L)', metrics.totalFuelLiters ?? '—')}
      ${kpi('Mileage (km)', metrics.totalMileageKm ?? '—')}
      ${kpi('Violations', list.length || metrics.violations || 0)}
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Eco-driving violations</h3></div>
      ${tableWrap(['Asset', 'Type', 'Severity', 'When'], rows, 'No violations recorded')}
    </div>`;
  }

  async function renderCommands() {
    const [assets, history, snap] = await Promise.all([
      MamsApi.api('/client/assets').catch(() => []),
      MamsApi.api('/client/commands/history').catch(() => []),
      MamsApi.api('/client/fleet/snapshot').catch(() => ({ units: [] })),
    ]);
    const list = Array.isArray(assets) ? assets : assets.assets || [];
    const units = snap.units || [];
    const byWialon = {};
    units.forEach((u) => {
      if (u.wialonId != null) byWialon[String(u.wialonId)] = u;
      byWialon[String(u.id)] = u;
    });
    const hist = Array.isArray(history) ? history : [];
    const rows = list.slice(0, 80).map((a) => {
      const wialonSrc = (a.sources || []).find((s) => (s.type || s) === 'wialon');
      const wialonId = wialonSrc?.id || a.wialonId || '';
      const live = byWialon[String(wialonId)] || null;
      return `<tr>
      <td><strong>${esc(a.name)}</strong></td>
      <td>${esc(a.registrationPlate || '—')}</td>
      <td>${live ? statusBadge(live.status) : '—'}</td>
      <td class="actions">
        <button type="button" class="btn btn-sm" data-action="send-command" data-unit="${esc(wialonId)}" data-asset="${esc(a.id)}" data-name="${esc(a.name)}" data-cmd="query_pos" ${wialonId ? '' : 'disabled'}>Query pos</button>
        <button type="button" class="btn btn-sm btn-ghost" data-action="send-command" data-unit="${esc(wialonId)}" data-asset="${esc(a.id)}" data-name="${esc(a.name)}" data-cmd="block_engine" ${wialonId ? '' : 'disabled'}>Block</button>
      </td>
    </tr>`;
    }).join('');
    const histRows = hist.slice(0, 40).map((h) => `<tr>
      <td>${esc(h.command || h.type || '—')}</td>
      <td>${esc(h.assetName || h.assetId || '—')}</td>
      <td>${statusBadge(h.status || '—')}</td>
      <td class="muted">${fmtDate(h.createdAt || h.sentAt)}</td>
    </tr>`).join('');

    return `<div class="banner banner-info">Commands are sent via Wialon <code>unit/exec_cmd</code>. Use query_pos for a safe test; block_engine requires elevated permissions.</div>
    <div class="card">
      ${tableWrap(['Asset', 'Plate', 'Live', 'Actions'], rows, 'No command-capable assets')}
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Command history</h3></div>
      ${tableWrap(['Command', 'Asset', 'Status', 'When'], histRows, 'No command history')}
    </div>`;
  }

  async function renderSurveillance() {
    const assets = await MamsApi.api('/client/assets').catch(() => []);
    const list = (Array.isArray(assets) ? assets : []).filter((a) => /cam|video|mdvr/i.test(a.name || ''));
    const rows = list.map((a) => `<tr>
      <td><strong>${esc(a.name)}</strong></td>
      <td>${esc(a.registrationPlate || '—')}</td>
      <td>${(a.sources || []).map((s) => esc(s.type || s)).join(', ') || '—'}</td>
    </tr>`).join('');

    return `<div class="integration-panel mt-1">
      <h3>📹 Surveillance & video</h3>
      <p>Live camera streams, event clips and Wialon video integration are available when your tenant has video telematics enabled.</p>
      <p class="mt-1"><span class="badge badge-brand">Wialon Video</span> <span class="badge badge-info">Coming soon in PHP UI</span></p>
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Camera-capable assets</h3><span class="muted">Matched by name</span></div>
      ${tableWrap(['Asset', 'Plate', 'Sources'], rows, 'No camera-capable assets detected in your fleet')}
    </div>`;
  }

  async function renderSensors() {
    const snap = await MamsApi.api('/client/fleet/snapshot').catch(() => ({ units: [] }));
    const units = snap.units || [];
    const rows = units.map((u) => {
      const batt = unitParam(u, 'battery');
      const volt = unitParam(u, 'pwr_ext', 'ext_voltage', 'external_voltage', 'battery_voltage', 'pwr_int');
      const sensCount = Array.isArray(u.sens) ? u.sens.length : 0;
      const prmCount = Array.isArray(u.prms) ? u.prms.length : 0;
      return `<tr class="row-clickable" data-action="open-sensors" data-id="${esc(u.wialonId || u.id)}" data-name="${esc(u.name)}">
      <td><strong>${esc(u.name)}</strong>${u.plate ? `<div class="muted">${esc(u.plate)}</div>` : ''}</td>
      <td>${u.fuelLevel != null ? esc(Math.round(u.fuelLevel)) + '%' : '—'}</td>
      <td>${batt != null ? esc(Math.round(batt)) + '%' : '—'}</td>
      <td>${volt != null ? esc(Math.round(volt * 10) / 10) + ' V' : '—'}</td>
      <td>${u.position ? Number(u.position.speed || 0).toFixed(0) + ' km/h' : '—'}</td>
      <td class="muted">${sensCount} sens · ${prmCount} params</td>
      <td>${statusBadge(u.status)}</td>
    </tr>`;
    }).join('');

    return `<div class="kpi-grid">
      ${kpi('Units', units.length)}
      ${kpi('With fuel', units.filter((u) => u.fuelLevel != null).length)}
      ${kpi('With battery', units.filter((u) => unitParam(u, 'battery') != null).length)}
      ${kpi('Source', snap.live ? 'Live Wialon' : 'Cached')}
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Sensor readings</h3><span class="muted">Click a unit for live calc_last_message</span></div>
      ${tableWrap(['Asset', 'Fuel', 'Battery', 'Voltage', 'Speed', 'Defs', 'Status'], rows, 'No sensor data')}
    </div>
    <div id="sensors-detail-root"></div>`;
  }

  async function renderTrailers() {
    const assets = await MamsApi.api('/client/assets').catch(() => []);
    const list = (Array.isArray(assets) ? assets : []).filter((a) =>
      /trailer|semi|caravan/i.test(a.name || '') || a.category === 'trailer'
    );
    const rows = list.map((a) => `<tr>
      <td><strong>${esc(a.name)}</strong></td>
      <td>${esc(a.registrationPlate || '—')}</td>
      <td>${esc(a.make || '')} ${esc(a.model || '')}</td>
      <td>—</td>
    </tr>`).join('');

    return `<div class="card">
      ${tableWrap(['Trailer', 'Plate', 'Make / model', 'Coupled to'], rows, 'No trailer assets found')}
    </div>`;
  }

  async function renderSettings() {
    const [prefs, tenant, me, integrations] = await Promise.all([
      MamsApi.api('/client/preferences'),
      MamsApi.api('/client/tenant').catch(() => ({})),
      MamsApi.api('/auth/me'),
      MamsApi.api('/client/integrations/status').catch(() => []),
    ]);
    const user = me.user || {};
    const intList = Array.isArray(integrations) ? integrations : [];
    const intRows = intList.map((i) => `<tr>
      <td><strong>${esc(i.sourceType)}</strong></td>
      <td>${i.connected ? '<span class="badge badge-success">Connected</span>' : '<span class="badge badge-inactive">Not connected</span>'}</td>
      <td class="muted">${fmtDate(i.lastSyncAt)}</td>
      <td class="muted">${esc(i.lastError || '—')}</td>
    </tr>`).join('');

    return `<div class="grid-2">
      <div class="card">
        <div class="card-header"><h3>Account</h3></div>
        <div class="settings-grid">
          <div class="setting-item"><span class="muted">Name</span><div><strong>${esc(user.fullName || user.email)}</strong></div></div>
          <div class="setting-item"><span class="muted">Email</span><div>${esc(user.email)}</div></div>
          <div class="setting-item"><span class="muted">Role</span><div><span class="badge badge-brand">${esc(user.role)}</span></div></div>
          <div class="setting-item"><span class="muted">Tenant</span><div>${esc(tenant.name || '—')}</div></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Preferences</h3></div>
        <form id="prefs-form" class="form-stack">
          <label><span>Language</span><select class="select" name="language"><option ${prefs.language === 'en' ? 'selected' : ''}>en</option></select></label>
          <label><span>Timezone</span><input class="input" name="timezone" value="${esc(prefs.timezone || 'UTC')}" /></label>
          <label><span>Date format</span><input class="input" name="dateFormat" value="${esc(prefs.dateFormat || 'YYYY-MM-DD')}" /></label>
          <label><span>Unit system</span><select class="select" name="unitSystem"><option value="metric" ${prefs.unitSystem === 'metric' ? 'selected' : ''}>Metric</option><option value="imperial" ${prefs.unitSystem === 'imperial' ? 'selected' : ''}>Imperial</option></select></label>
          <label><input type="checkbox" name="emailNotifications" ${prefs.emailNotifications !== false ? 'checked' : ''} /> Email notifications</label>
          <label><input type="checkbox" name="inAppNotifications" ${prefs.inAppNotifications !== false ? 'checked' : ''} /> In-app notifications</label>
          <button type="submit" class="btn">Save preferences</button>
          <p id="prefs-msg" class="success-text" hidden>Saved.</p>
        </form>
      </div>
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Integrations</h3></div>
      ${tableWrap(['Source', 'Status', 'Last sync', 'Error'], intRows, 'No integrations configured for this tenant')}
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>More</h3></div>
      <div class="stack">
        <a class="btn btn-ghost" href="/app/reports">📄 Reports — generate & export fleet data →</a>
        <a class="btn btn-ghost" href="/app/users">👥 Users — manage tenant user accounts →</a>
      </div>
    </div>`;
  }

  async function renderReports() {
    const [types, templates, snap] = await Promise.all([
      MamsApi.api('/client/reports/types').catch(() => []),
      MamsApi.api('/client/wialon/reports/templates').catch(() => ({ templates: [] })),
      MamsApi.api('/client/fleet/snapshot').catch(() => ({ units: [] })),
    ]);
    const list = Array.isArray(types) ? types : [];
    const tplList = templates.templates || [];
    const units = snap.units || [];
    const options = list.map((t) => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join('');
    const tplOptions = tplList.slice(0, 200).map((t) =>
      `<option value="${esc(t.resourceId)}:${esc(t.id)}" data-resource="${esc(t.resourceId)}" data-template="${esc(t.id)}">${esc(t.name)} (${esc(t.resourceName || t.resourceId)})</option>`
    ).join('');
    const unitOptions = units.slice(0, 300).map((u) =>
      `<option value="${esc(u.wialonId || u.id)}">${esc(u.name)}${u.plate ? ' · ' + esc(u.plate) : ''}</option>`
    ).join('');

    return `<div class="card">
      <div class="card-header"><h3>Generate DB report</h3></div>
      <form id="report-form" class="form-grid">
        <label><span>Report type</span><select class="select" name="type">${options}</select></label>
        <div class="form-grid-action"><button type="submit" class="btn">Load report</button></div>
      </form>
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Run Wialon template</h3><span class="muted">${tplList.length} templates</span></div>
      <form id="wialon-report-form" class="form-grid">
        <label><span>Template</span><select class="select" name="template" required>${tplOptions || '<option value="">No templates</option>'}</select></label>
        <label><span>Object (unit)</span><select class="select" name="objectId" required>${unitOptions || '<option value="">No units</option>'}</select></label>
        <label><span>From (unix)</span><input class="input" name="from" type="number" value="${Math.floor(Date.now() / 1000) - 86400}" /></label>
        <label><span>To (unix)</span><input class="input" name="to" type="number" value="${Math.floor(Date.now() / 1000)}" /></label>
        <div class="form-grid-action"><button type="submit" class="btn">Execute</button></div>
        <p id="wialon-report-error" class="error" hidden></p>
      </form>
    </div>
    <div class="card mt-2" id="report-result">
      ${emptyState('📄', 'No report loaded', 'Choose a DB report or run a Wialon template.')}
    </div>`;
  }

  async function loadReport(type) {
    const el = document.getElementById('report-result');
    if (!el || !type) return;
    el.innerHTML = loader();
    try {
      const data = await MamsApi.api(`/client/reports/data/${encodeURIComponent(type)}`);
      const rows = Array.isArray(data.rows) ? data.rows : [];
      if (!rows.length) {
        el.innerHTML = `<div class="card-header"><h3>${esc(type)} report</h3></div>${emptyState('📄', 'No data', 'This report has no rows for your tenant yet.')}`;
        return;
      }
      const cols = Object.keys(rows[0]).slice(0, 8);
      const body = rows.slice(0, 50).map((r) => `<tr>${cols.map((c) => {
        const v = r[c];
        return `<td>${esc(v != null && typeof v === 'object' ? JSON.stringify(v) : v)}</td>`;
      }).join('')}</tr>`).join('');
      el.innerHTML = `<div class="card-header"><h3>${esc(type)} report</h3><span class="muted">${rows.length} rows (showing up to 50)</span></div>${tableWrap(cols, body, 'No rows')}`;
    } catch (ex) {
      el.innerHTML = `<div class="banner banner-error">${esc(ex.message || 'Failed to load report')}</div>`;
    }
  }

  async function renderUsers() {
    const users = await MamsApi.api('/client/users').catch(() => []);
    const list = Array.isArray(users) ? users : users.users || [];
    const rows = list.map((u) => `<tr>
      <td><strong>${esc(u.fullName || '—')}</strong></td>
      <td>${esc(u.email)}</td>
      <td>${roleBadge(u.role)}</td>
      <td>${u.isActive !== false ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-inactive">Inactive</span>'}</td>
      <td class="muted">${fmtDate(u.lastLoginAt)}</td>
      <td><button class="btn btn-sm btn-ghost" data-action="toggle-user" data-id="${esc(u.id)}" data-active="${u.isActive !== false ? '1' : '0'}">${u.isActive !== false ? 'Deactivate' : 'Activate'}</button></td>
    </tr>`).join('');

    return `<div class="card">
      <div class="card-header"><h3>Add user</h3></div>
      <form id="user-form" class="form-grid">
        <label><span>Full name</span><input class="input" name="fullName" required /></label>
        <label><span>Email</span><input class="input" type="email" name="email" required /></label>
        <label><span>Role</span><select class="select" name="role">
          <option value="viewer">Viewer</option>
          <option value="operator">Operator</option>
          <option value="manager">Manager</option>
          <option value="tenant_admin">Tenant admin</option>
        </select></label>
        <label><span>Password</span><input class="input" type="password" name="password" required minlength="8" /></label>
        <div class="form-grid-action"><button type="submit" class="btn">+ Add user</button></div>
        <p id="user-error" class="error" hidden></p>
      </form>
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Users</h3><span class="muted">${list.length} users</span></div>
      ${tableWrap(['Name', 'Email', 'Role', 'Status', 'Last login', 'Actions'], rows, 'No users yet')}
    </div>`;
  }

  const RENDERERS = {
    dashboard: renderDashboard,
    monitoring: renderMonitoring,
    fuel: renderFuel,
    workshop: renderWorkshop,
    alerts: renderAlerts,
    drivers: renderDrivers,
    routes: renderRoutes,
    geofencing: renderGeofencing,
    emissions: renderEmissions,
    commands: renderCommands,
    surveillance: renderSurveillance,
    sensors: renderSensors,
    trailers: renderTrailers,
    reports: renderReports,
    users: renderUsers,
    settings: renderSettings,
  };

  /* ── Shell init ── */
  const content = document.getElementById('app-content');
  if (!content) return;

  let currentUserRole = '';
  let currentTenantName = 'MAMS';
  let alertsPollId = null;
  let statusPollId = null;

  /** Sets static topbar/menu icons from MamsIcons — parity with React ICON_MAP. */
  function initTopbarIcons() {
    const menu = document.getElementById('menu-toggle');
    if (menu) menu.innerHTML = MamsIcons.get('Menu');
    const refresh = document.getElementById('refresh-btn');
    if (refresh) refresh.innerHTML = MamsIcons.get('RefreshCw');
    const bell = document.getElementById('alerts-bell-icon');
    if (bell) bell.innerHTML = MamsIcons.get('Bell');
    const settingsLink = document.getElementById('user-settings-link');
    if (settingsLink) settingsLink.innerHTML = `<span class="dropdown-item-icon">${MamsIcons.get('Settings')}</span> Settings`;
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.innerHTML = `<span class="dropdown-item-icon">${MamsIcons.get('LogOut')}</span> Sign out`;
  }

  document.getElementById('logout-btn')?.addEventListener('click', () => {
    MamsApi.clearAuth();
    if (alertsPollId) clearInterval(alertsPollId);
    if (statusPollId) clearInterval(statusPollId);
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
    const path = location.pathname.replace(/\/$/, '') || '/app/dashboard';
    const parts = path.split('/').filter(Boolean);
    const mod = parts[1] || 'dashboard';
    return ROUTES[mod] ? mod : 'dashboard';
  }

  function setActiveNav(mod) {
    document.querySelectorAll('#client-nav a').forEach((a) => {
      a.classList.toggle('active', a.dataset.mod === mod);
    });
  }

  function initials(user) {
    return (user.fullName || user.email || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  }

  function setUserChip(user, tenantName) {
    const trigger = document.getElementById('user-menu-trigger');
    if (trigger) {
      trigger.innerHTML = `<span class="user-avatar">${esc(initials(user))}</span><span class="user-chip-name">${esc(user.fullName || user.email)}</span>`;
    }
    const info = document.getElementById('user-dropdown-info');
    if (info) {
      info.innerHTML = `<div class="n">${esc(user.fullName || '')}</div><div class="e">${esc(user.email || '')}</div>${tenantName ? `<div class="t">${esc(tenantName)}</div>` : ''}`;
    }
  }

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

  async function refreshAlertsBell() {
    try {
      const alerts = await MamsApi.api('/client/alerts');
      const list = Array.isArray(alerts) ? alerts : alerts.alerts || [];
      const open = list.filter((a) => !a.acknowledged);
      const badge = document.getElementById('bell-badge');
      if (badge) {
        if (open.length > 0) { badge.hidden = false; badge.textContent = open.length > 99 ? '99+' : String(open.length); }
        else badge.hidden = true;
      }
      const body = document.getElementById('alerts-dropdown-body');
      if (body) {
        body.innerHTML = open.length === 0
          ? '<p class="empty">No new alerts. Live events appear here as they happen.</p>'
          : open.slice(0, 8).map((a) => `<div class="dropdown-alert">
              <div class="t">${esc(a.title)}</div>
              ${a.description ? `<div class="d">${esc(a.description)}</div>` : ''}
              <button type="button" class="btn btn-sm ack-btn" data-action="ack-alert" data-id="${esc(a.id)}">Acknowledge</button>
            </div>`).join('');
      }
    } catch (_) { /* ignore */ }
  }

  /** Updates the topbar status pill + footer connection line from integration status. */
  function updateFooter(list) {
    const footer = document.getElementById('app-footer');
    const tenantEl = document.getElementById('app-footer-tenant');
    const statusEl = document.getElementById('app-footer-status');
    if (!footer) return;
    if (!list.length) { footer.hidden = true; return; }
    const allConnected = list.every((i) => i.connected);
    const anyConnected = list.some((i) => i.connected);
    if (tenantEl) tenantEl.textContent = currentTenantName;
    if (statusEl) {
      statusEl.textContent = allConnected
        ? 'All integrations connected'
        : anyConnected
          ? 'Some integrations connected'
          : 'Integrations offline';
    }
    footer.hidden = false;
  }

  async function refreshStatusPill() {
    try {
      const integrations = await MamsApi.api('/client/integrations/status');
      const list = Array.isArray(integrations) ? integrations : [];
      const pill = document.getElementById('status-pill');
      const text = document.getElementById('status-pill-text');
      updateFooter(list);
      if (!pill || !text || !list.length) { if (pill) pill.hidden = true; return; }
      const allConnected = list.every((i) => i.connected);
      const anyConnected = list.some((i) => i.connected);
      pill.hidden = false;
      pill.className = 'status-pill' + (allConnected ? ' is-live' : anyConnected ? ' is-partial' : '');
      text.textContent = allConnected ? 'Live' : anyConnected ? 'Partial' : 'Offline';
    } catch (_) { /* ignore */ }
  }

  /* ── Post-render module hook + event delegation ── */
  async function loadModule() {
    MamsCharts.destroyAll();
    window.__dashPaint = null;

    const mod = getModule();
    const route = ROUTES[mod];
    setActiveNav(mod);

    const titleEl = document.getElementById('page-title');
    const subEl = document.getElementById('page-sub');
    if (titleEl) titleEl.textContent = route.title;
    if (subEl) subEl.textContent = route.subtitle;
    document.title = route.title + ' — MAMS';

    const render = RENDERERS[mod] || RENDERERS.dashboard;
    content.innerHTML = await render();

    if (mod === 'dashboard' && typeof window.__dashPaint === 'function') {
      const paint = window.__dashPaint;
      requestAnimationFrame(() => {
        paint();
        window.__dashPaint = null;
      });
    }

    if (mod === 'monitoring') {
      const snap = await MamsApi.api('/client/fleet/snapshot').catch(() => ({ units: [] }));
      loadLeaflet(() => initFleetMap(snap.units || []));
    }

    if (mod === 'fuel' && document.getElementById('fuel-page-trend')) {
      const monthly = await MamsApi.api('/client/fuel/monthly-trend').catch(() => []);
      const rows = (Array.isArray(monthly) ? monthly : []).slice(-8);
      if (rows.length && typeof MamsCharts?.composed === 'function') {
        const p = MamsCharts.palette();
        MamsCharts.composed(
          'fuel-page-trend',
          rows.map((r) => String(r.month || '')),
          { label: 'Filled (L)', data: rows.map((r) => Number(r.filled) || 0) },
          { label: 'Consumed (L)', data: rows.map((r) => Number(r.consumed) || 0) },
          { bar: p.primary, line: p.accent },
        );
      }
    }
  }

  content.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action === 'ack-alert') {
      btn.disabled = true;
      btn.textContent = 'Acknowledging…';
      try {
        await MamsApi.api(`/client/alerts/${encodeURIComponent(id)}/acknowledge`, { method: 'POST' });
        await loadModule();
      } catch (ex) {
        alert(ex.message || 'Failed to acknowledge alert');
        btn.disabled = false;
        btn.textContent = 'Acknowledge';
      }
      return;
    }

    if (action === 'ack-alerts-bulk') {
      const ids = String(btn.dataset.ids || '').split(',').filter(Boolean);
      if (!ids.length) return;
      btn.disabled = true;
      try {
        for (const alertId of ids) {
          await MamsApi.api(`/client/alerts/${encodeURIComponent(alertId)}/acknowledge`, { method: 'POST' }).catch(() => null);
        }
        await loadModule();
      } catch (ex) {
        alert(ex.message || 'Bulk acknowledge failed');
        btn.disabled = false;
      }
      return;
    }

    if (action === 'open-unit') {
      const root = document.getElementById('unit-detail-root');
      if (!root) return;
      root.innerHTML = `<div class="card mt-2">${typeof loader === 'function' ? loader() : 'Loading…'}</div>`;
      try {
        const detail = await MamsApi.api(`/client/wialon/units/${encodeURIComponent(id)}`);
        const u = detail.unit || {};
        const h = detail.health || {};
        const uid = u.wialonId || u.id || id;
        root.innerHTML = `<div class="card mt-2">
          <div class="card-header">
            <h3>${esc(u.name || 'Unit')}</h3>
            <div class="actions">
              <button type="button" class="btn btn-sm" data-action="load-unit-track" data-id="${esc(uid)}">Load 24h track</button>
              <button type="button" class="btn btn-sm" data-action="load-unit-trips" data-id="${esc(uid)}">Load 24h trips</button>
              <button type="button" class="btn btn-sm btn-ghost" data-action="close-unit-detail">Close</button>
            </div>
          </div>
          <div class="settings-grid">
            <div><span class="muted">Status</span><div>${statusBadge(u.status)}</div></div>
            <div><span class="muted">Plate</span><div>${esc(u.plate || '—')}</div></div>
            <div><span class="muted">Fuel</span><div>${h.fuelLevel != null ? esc(Math.round(h.fuelLevel)) + '%' : '—'}</div></div>
            <div><span class="muted">Mileage</span><div>${h.mileage != null ? esc(Math.round(h.mileage)).toLocaleString() + ' km' : '—'}</div></div>
            <div><span class="muted">Battery</span><div>${h.battery != null ? esc(Math.round(h.battery)) + '%' : '—'}</div></div>
            <div><span class="muted">Voltage</span><div>${h.voltage != null ? esc(Math.round(h.voltage * 10) / 10) + ' V' : '—'}</div></div>
            <div><span class="muted">Engine hours</span><div>${h.engineHours != null ? esc(Math.round(h.engineHours)) : '—'}</div></div>
            <div><span class="muted">Position</span><div>${u.position ? `${Number(u.position.lat).toFixed(5)}, ${Number(u.position.lng).toFixed(5)}` : '—'}</div></div>
          </div>
          <div id="unit-track-map" class="map-panel mt-1" style="min-height:220px">Track map idle — click Load 24h track</div>
          <div id="unit-trips-root" class="mt-1 muted">Trips idle — click Load 24h trips</div>
        </div>`;
      } catch (ex) {
        root.innerHTML = `<div class="banner banner-error mt-2">${esc(ex.message || 'Unit detail unavailable (live Wialon required)')}</div>`;
      }
      return;
    }

    if (action === 'close-unit-detail') {
      const root = document.getElementById('unit-detail-root');
      if (root) root.innerHTML = '';
      return;
    }

    if (action === 'open-sensors') {
      const root = document.getElementById('sensors-detail-root');
      if (!root) return;
      const name = btn.dataset.name || id;
      root.innerHTML = `<div class="card mt-2">${typeof loader === 'function' ? loader() : 'Loading…'}</div>`;
      try {
        const data = await MamsApi.api(`/client/wialon/units/${encodeURIComponent(id)}/sensors`);
        const sensors = data.sensors || [];
        const rows = sensors.slice(0, 80).map((s) => {
          const val = s.value != null ? s.value : (s.val != null ? s.val : (s.m != null ? s.m : '—'));
          return `<tr>
            <td><strong>${esc(s.name || s.n || s.id || 'Sensor')}</strong></td>
            <td>${esc(s.type || s.t || '—')}</td>
            <td>${esc(typeof val === 'object' ? JSON.stringify(val) : val)}</td>
            <td class="muted">${esc(s.unit || s.measure || '')}</td>
          </tr>`;
        }).join('');
        root.innerHTML = `<div class="card mt-2">
          <div class="card-header">
            <h3>${esc(name)} — live sensors</h3>
            <button type="button" class="btn btn-sm btn-ghost" data-action="close-sensors-detail">Close</button>
          </div>
          ${tableWrap(['Sensor', 'Type', 'Value', 'Unit'], rows, data.error ? esc(data.error) : 'No sensor values')}
        </div>`;
      } catch (ex) {
        root.innerHTML = `<div class="banner banner-error mt-2">${esc(ex.message || 'Sensors unavailable')}</div>`;
      }
      return;
    }

    if (action === 'close-sensors-detail') {
      const root = document.getElementById('sensors-detail-root');
      if (root) root.innerHTML = '';
      return;
    }

    if (action === 'send-command') {
      const unitId = btn.dataset.unit;
      const cmd = btn.dataset.cmd || 'query_pos';
      if (!unitId) return;
      if (cmd === 'block_engine' && !confirm('Send block_engine to this unit?')) return;
      btn.disabled = true;
      try {
        await MamsApi.api('/client/wialon/commands', {
          method: 'POST',
          body: JSON.stringify({
            unitId: Number(unitId),
            command: cmd,
            assetId: btn.dataset.asset || undefined,
            assetName: btn.dataset.name || undefined,
          }),
        });
        alert('Command sent: ' + cmd);
        await loadModule();
      } catch (ex) {
        alert(ex.message || 'Command failed');
        btn.disabled = false;
      }
      return;
    }

    if (action === 'load-unit-track') {
      const unitId = btn.dataset.id;
      const mapEl = document.getElementById('unit-track-map');
      if (!unitId || !mapEl) return;
      btn.disabled = true;
      try {
        const track = await MamsApi.api(`/client/wialon/units/${encodeURIComponent(unitId)}/track`);
        const points = track.points || [];
        mapEl.textContent = points.length ? `${points.length} track points loaded` : 'No track points in last 24h';
        if (points.length) {
          loadLeaflet(() => {
            const map = L.map(mapEl).setView([points[0].lat, points[0].lng], 12);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
            const latlngs = points.map((p) => [p.lat, p.lng]);
            L.polyline(latlngs, { color: '#0f766e', weight: 3 }).addTo(map);
            map.fitBounds(latlngs, { padding: [20, 20] });
          });
        }
      } catch (ex) {
        mapEl.textContent = ex.message || 'Track unavailable';
      } finally {
        btn.disabled = false;
      }
      return;
    }

    if (action === 'load-unit-trips') {
      const unitId = btn.dataset.id;
      const tripsEl = document.getElementById('unit-trips-root');
      if (!unitId || !tripsEl) return;
      btn.disabled = true;
      tripsEl.innerHTML = typeof loader === 'function' ? loader() : 'Loading trips…';
      try {
        const data = await MamsApi.api(`/client/wialon/units/${encodeURIComponent(unitId)}/trips`);
        const trips = data.trips || [];
        const rows = trips.slice(0, 40).map((t) => {
          const fromTs = t.t1 || (typeof t.from === 'object' ? t.from?.t : null);
          const toTs = t.t2 || (typeof t.to === 'object' ? t.to?.t : null);
          const durSec = (fromTs && toTs && toTs > fromTs) ? (toTs - fromTs) : null;
          const dist = t.mileage != null ? t.mileage : t.distance;
          return `<tr>
            <td>${fromTs ? fmtDate(fromTs * 1000) : '—'}</td>
            <td>${toTs ? fmtDate(toTs * 1000) : '—'}</td>
            <td>${dist != null ? esc(Math.round(Number(dist) * 10) / 10) + ' km' : '—'}</td>
            <td class="muted">${durSec != null ? esc(Math.round(durSec / 60)) + ' min' : '—'}</td>
          </tr>`;
        }).join('');
        tripsEl.innerHTML = `<div class="card-header"><h3>Trips (24h)</h3><span class="muted">${trips.length}</span></div>
          ${tableWrap(['From', 'To', 'Distance', 'Duration'], rows, data.error ? esc(data.error) : 'No trips in range')}`;
      } catch (ex) {
        tripsEl.innerHTML = `<div class="banner banner-error">${esc(ex.message || 'Trips unavailable')}</div>`;
      } finally {
        btn.disabled = false;
      }
      return;
    }

    if (action === 'delete-driver') {
      if (!confirm('Delete this driver?')) return;
      try {
        await MamsApi.api(`/client/drivers/${encodeURIComponent(id)}`, { method: 'DELETE' });
        await loadModule();
      } catch (ex) {
        alert(ex.message || 'Failed to delete driver');
      }
    }

    if (action === 'delete-geofence') {
      if (!confirm('Delete this geofence?')) return;
      try {
        await MamsApi.api(`/client/geofences/${encodeURIComponent(id)}`, { method: 'DELETE' });
        await loadModule();
      } catch (ex) {
        alert(ex.message || 'Failed to delete geofence');
      }
    }

    if (action === 'toggle-user') {
      const active = btn.dataset.active === '1';
      btn.disabled = true;
      try {
        await MamsApi.api(`/client/users/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ isActive: !active }),
        });
        await loadModule();
      } catch (ex) {
        alert(ex.message || 'Failed to update user');
        btn.disabled = false;
      }
    }
  });

  content.addEventListener('submit', async (e) => {
    const form = e.target;

    if (form.id === 'prefs-form') {
      e.preventDefault();
      const fd = new FormData(form);
      try {
        await MamsApi.api('/client/preferences', {
          method: 'PUT',
          body: JSON.stringify({
            language: fd.get('language'),
            timezone: fd.get('timezone'),
            dateFormat: fd.get('dateFormat'),
            unitSystem: fd.get('unitSystem'),
            emailNotifications: fd.get('emailNotifications') === 'on',
            inAppNotifications: fd.get('inAppNotifications') === 'on',
          }),
        });
        const msg = document.getElementById('prefs-msg');
        if (msg) { msg.hidden = false; setTimeout(() => { msg.hidden = true; }, 2500); }
      } catch (ex) {
        alert(ex.message || 'Save failed');
      }
      return;
    }

    if (form.id === 'driver-form') {
      e.preventDefault();
      const fd = new FormData(form);
      const errEl = document.getElementById('driver-error');
      if (errEl) errEl.hidden = true;
      try {
        await MamsApi.api('/client/drivers', {
          method: 'POST',
          body: JSON.stringify({
            name: fd.get('name'),
            phone: fd.get('phone'),
            licenseNumber: fd.get('licenseNumber'),
            status: fd.get('status'),
          }),
        });
        await loadModule();
      } catch (ex) {
        if (errEl) { errEl.textContent = ex.message || 'Failed to add driver'; errEl.hidden = false; }
      }
      return;
    }

    if (form.id === 'maint-form') {
      e.preventDefault();
      const fd = new FormData(form);
      const errEl = document.getElementById('maint-error');
      if (errEl) errEl.hidden = true;
      try {
        await MamsApi.api('/client/workshop/maintenance', {
          method: 'POST',
          body: JSON.stringify({
            vehicleName: fd.get('vehicleName'),
            vehiclePlate: fd.get('vehiclePlate'),
            maintenanceType: fd.get('maintenanceType'),
            mechanicName: fd.get('mechanicName') || 'Unassigned',
            description: fd.get('description'),
          }),
        });
        form.reset();
        await loadModule();
      } catch (ex) {
        if (errEl) { errEl.textContent = ex.message || 'Failed to save maintenance'; errEl.hidden = false; }
      }
      return;
    }

    if (form.id === 'breakdown-form') {
      e.preventDefault();
      const fd = new FormData(form);
      const errEl = document.getElementById('breakdown-error');
      if (errEl) errEl.hidden = true;
      try {
        await MamsApi.api('/client/workshop/breakdowns', {
          method: 'POST',
          body: JSON.stringify({
            vehicleName: fd.get('vehicleName'),
            vehiclePlate: fd.get('vehiclePlate'),
            severity: fd.get('severity'),
            description: fd.get('description'),
          }),
        });
        form.reset();
        await loadModule();
      } catch (ex) {
        if (errEl) { errEl.textContent = ex.message || 'Failed to save breakdown'; errEl.hidden = false; }
      }
      return;
    }

    if (form.id === 'geofence-form') {
      e.preventDefault();
      const fd = new FormData(form);
      const errEl = document.getElementById('geofence-error');
      if (errEl) errEl.hidden = true;
      const type = fd.get('type');
      const radius = fd.get('radius');
      const centerRaw = String(fd.get('center') || '').trim();
      let geometry = null;
      if (type === 'circle' && centerRaw) {
        const parts = centerRaw.split(',').map((v) => parseFloat(v.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          geometry = { lat: parts[0], lng: parts[1] };
        }
      }
      try {
        await MamsApi.api('/client/geofences', {
          method: 'POST',
          body: JSON.stringify({
            name: fd.get('name'),
            type,
            geometry,
            radius: radius ? Number(radius) : undefined,
          }),
        });
        await loadModule();
      } catch (ex) {
        if (errEl) { errEl.textContent = ex.message || 'Failed to create geofence'; errEl.hidden = false; }
      }
      return;
    }

    if (form.id === 'report-form') {
      e.preventDefault();
      const fd = new FormData(form);
      loadReport(fd.get('type'));
      return;
    }

    if (form.id === 'wialon-report-form') {
      e.preventDefault();
      const fd = new FormData(form);
      const errEl = document.getElementById('wialon-report-error');
      const resultEl = document.getElementById('report-result');
      if (errEl) errEl.hidden = true;
      const tpl = String(fd.get('template') || '');
      const [resourceId, templateId] = tpl.split(':');
      const objectId = fd.get('objectId');
      if (!resourceId || !templateId || !objectId) {
        if (errEl) { errEl.textContent = 'Template and object are required'; errEl.hidden = false; }
        return;
      }
      if (resultEl) resultEl.innerHTML = loader();
      try {
        const data = await MamsApi.api('/client/wialon/reports/exec', {
          method: 'POST',
          body: JSON.stringify({
            reportResourceId: Number(resourceId),
            reportTemplateId: Number(templateId),
            reportObjectId: Number(objectId),
            from: Number(fd.get('from')) || undefined,
            to: Number(fd.get('to')) || undefined,
            maxRows: 100,
          }),
        });
        const tables = data.tables || [];
        if (!tables.length) {
          if (resultEl) {
            resultEl.innerHTML = `<div class="card-header"><h3>Wialon report</h3></div>${emptyState('📄', 'Empty result', 'Template returned no tables for this interval.')}`;
          }
          return;
        }
        const blocks = tables.map((t) => {
          const sample = t.sample || [];
          const header = Array.isArray(t.header) ? t.header.map((h) => (typeof h === 'object' ? (h.n || h.name || JSON.stringify(h)) : String(h))) : null;
          let cols = header;
          let bodyRows = sample;
          if (!cols || !cols.length) {
            if (sample.length && Array.isArray(sample[0]?.c)) {
              cols = sample[0].c.map((_, i) => 'Col ' + (i + 1));
              bodyRows = sample.map((r) => ({ cells: (r.c || []).map((c) => (c && typeof c === 'object' ? (c.t ?? c.v ?? JSON.stringify(c)) : c)) }));
            } else if (sample.length && typeof sample[0] === 'object' && !Array.isArray(sample[0])) {
              cols = Object.keys(sample[0]).slice(0, 8);
              bodyRows = sample.map((r) => ({ cells: cols.map((c) => r[c]) }));
            } else {
              cols = ['Row'];
              bodyRows = sample.map((r) => ({ cells: [typeof r === 'object' ? JSON.stringify(r) : r] }));
            }
          } else {
            bodyRows = sample.map((r) => {
              if (Array.isArray(r?.c)) {
                return { cells: r.c.map((c) => (c && typeof c === 'object' ? (c.t ?? c.v ?? JSON.stringify(c)) : c)) };
              }
              if (Array.isArray(r)) return { cells: r };
              return { cells: cols.map((c) => (r && typeof r === 'object' ? r[c] : r)) };
            });
          }
          const body = bodyRows.slice(0, 50).map((r) =>
            `<tr>${(r.cells || []).slice(0, cols.length).map((v) => `<td>${esc(v != null && typeof v === 'object' ? JSON.stringify(v) : v)}</td>`).join('')}</tr>`
          ).join('');
          return `<div class="mt-1"><div class="card-header"><h3>${esc(t.name || 'Table')}</h3><span class="muted">${esc(t.rows || 0)} rows</span></div>${tableWrap(cols, body, 'No sample rows')}</div>`;
        }).join('');
        if (resultEl) {
          resultEl.innerHTML = `<div class="card-header"><h3>Wialon report result</h3><span class="muted">${tables.length} table(s)</span></div>${blocks}`;
        }
      } catch (ex) {
        if (errEl) { errEl.textContent = ex.message || 'Report exec failed'; errEl.hidden = false; }
        if (resultEl) resultEl.innerHTML = `<div class="banner banner-error">${esc(ex.message || 'Report exec failed')}</div>`;
      }
      return;
    }

    if (form.id === 'user-form') {
      e.preventDefault();
      const fd = new FormData(form);
      const errEl = document.getElementById('user-error');
      if (errEl) errEl.hidden = true;
      try {
        await MamsApi.api('/client/users', {
          method: 'POST',
          body: JSON.stringify({
            email: fd.get('email'),
            fullName: fd.get('fullName'),
            role: fd.get('role'),
            password: fd.get('password'),
          }),
        });
        await loadModule();
      } catch (ex) {
        if (errEl) { errEl.textContent = ex.message || 'Failed to add user'; errEl.hidden = false; }
      }
    }
  });

  document.getElementById('refresh-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await Promise.all([loadModule(), refreshAlertsBell(), refreshStatusPill()]);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('alerts-dropdown')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="ack-alert"]');
    if (!btn) return;
    const id = btn.dataset.id;
    btn.disabled = true;
    btn.textContent = 'Acknowledging…';
    try {
      await MamsApi.api(`/client/alerts/${encodeURIComponent(id)}/acknowledge`, { method: 'POST' });
      await refreshAlertsBell();
      if (getModule() === 'alerts') await loadModule();
    } catch (ex) {
      alert(ex.message || 'Failed to acknowledge alert');
      btn.disabled = false;
      btn.textContent = 'Acknowledge';
    }
  });

  setupDropdown('alerts-bell', 'alerts-dropdown');
  setupDropdown('user-menu-trigger', 'user-dropdown');

  async function boot() {
    if (!MamsApi.getToken()) {
      location.href = '/auth/login';
      return;
    }

    initTopbarIcons();
    content.innerHTML = loader();

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

      currentUserRole = user.role || '';
      const isAdmin = isAdminRole(currentUserRole);

      let tenantName = 'MAMS';
      try {
        const tenant = await MamsApi.api('/client/tenant');
        const branding = MamsBranding.apply(tenant || {});
        if (tenant?.name) tenantName = tenant.name;
        currentTenantName = tenantName;

        const nameEl = document.getElementById('tenant-name');
        if (nameEl && tenant?.name) nameEl.textContent = tenant.name;
        const slugEl = document.getElementById('tenant-slug');
        if (slugEl && tenant?.slug) slugEl.textContent = tenant.slug;
        const topbarName = document.getElementById('topbar-tenant-name');
        if (topbarName && tenant?.name) topbarName.textContent = tenant.name;
        document.title = `${branding.name} — Fleet Management`;

        const logo = document.getElementById('tenant-logo');
        if (logo && branding.logoUrl) { logo.src = branding.logoUrl; logo.hidden = false; }
        const topbarLogo = document.getElementById('topbar-logo');
        if (topbarLogo && branding.logoUrl) topbarLogo.src = branding.logoUrl;

        const poweredEl = document.getElementById('sidebar-powered');
        if (poweredEl) {
          poweredEl.textContent = branding.usesMamsLogo
            ? 'Mimito Asset Management System'
            : 'Powered by MAMS';
        }
      } catch (_) {}

      setUserChip(user, tenantName);
      await initClientNav(isAdmin);
      refreshAlertsBell();
      refreshStatusPill();
      alertsPollId = setInterval(refreshAlertsBell, 60000);
      statusPollId = setInterval(refreshStatusPill, 60000);

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
