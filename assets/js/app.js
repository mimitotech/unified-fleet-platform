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
    const params = new URLSearchParams(location.search);
    const rangeDays = Math.max(1, Math.min(90, Number(params.get('days') || 30)));
    const [kpis, snap, integrations, alertsRaw, wialonCtx, modulesRaw, fuelTrend, workshopKpis, driverStats, routeStats, geofencesRaw, prefs] = await Promise.all([
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
      MamsApi.api('/client/preferences').catch(() => ({})),
    ]);
    const layout = prefs.dashboardLayout || {};
    const arrange = params.get('arrange') === '1' || layout.arrangeMode === true;

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
    <div class="actions" style="gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center">
      <span class="muted">Range</span>
      ${[7, 14, 30, 90].map((d) =>
        `<a class="btn btn-sm ${rangeDays === d ? '' : 'btn-ghost'}" href="/app/dashboard?days=${d}${arrange ? '&arrange=1' : ''}">${d}d</a>`
      ).join('')}
      <a class="btn btn-sm btn-ghost" href="/app/dashboard?days=${rangeDays}&arrange=${arrange ? '0' : '1'}">${arrange ? 'Done arranging' : 'Arrange widgets'}</a>
      <span class="muted">Showing last ${rangeDays} days context</span>
    </div>
    <div class="dash-meta ${arrange ? 'dash-arrange' : ''}">
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


  /** Module Reports tab — Wialon templates filtered by keyword + domain CSV */
  async function moduleReportsHtml(moduleKey, title) {
    const keywords = {
      monitoring: /trip|unit|event|mileage|engine|track|fleet/i,
      drivers: /driver|eco|safety|violation/i,
      routes: /route|trip|round/i,
      geofencing: /geofence|zone|geo/i,
      commands: /command|exec/i,
      trailers: /trailer|unit/i,
      sensors: /sensor|param|io/i,
      emissions: /eco|emission|fuel|violation/i,
      workshop: /service|maintenance|workshop/i,
      surveillance: /video|camera|media/i,
    }[moduleKey] || /./i;

    const domainType = moduleKey === 'emissions' ? 'violations'
      : moduleKey === 'workshop' ? 'workshop'
      : moduleKey === 'drivers' ? 'drivers'
      : 'trips';

    const [templates, domain, snap] = await Promise.all([
      MamsApi.api('/client/wialon/reports/templates').catch(() => ({ templates: [] })),
      MamsApi.api(`/client/reports/data/${encodeURIComponent(domainType)}`).catch(() => []),
      MamsApi.api('/client/fleet/snapshot').catch(() => ({ units: [] })),
    ]);
    const list = (templates.templates || templates || []).filter((t) => keywords.test(String(t.name || t.n || '')));
    const units = snap.units || [];
    const unitOpts = units.slice(0, 200).map((u) =>
      `<option value="${esc(u.wialonId || u.id)}">${esc(u.name || u.wialonId)}</option>`
    ).join('');
    const rows = list.slice(0, 40).map((t) => `<tr>
      <td><strong>${esc(t.name || t.n)}</strong></td>
      <td class="muted">${esc(t.resourceName || '—')}</td>
      <td>${esc(t.id)}</td>
      <td><button type="button" class="btn btn-sm" data-action="exec-module-report"
        data-resource="${esc(t.resourceId || '')}" data-template="${esc(t.id)}"
        data-name="${esc(t.name || t.n || '')}">Run</button></td>
    </tr>`).join('');
    const domainList = Array.isArray(domain) ? domain : domain.rows || [];
    return `<div class="card mt-2 branded-panel" id="module-report-print-root">
      <div class="card-header"><h3>${esc(title || 'Reports')}</h3><span class="muted">${list.length} templates</span></div>
      <div class="form-row" style="gap:8px;flex-wrap:wrap;align-items:end;margin-bottom:8px">
        <label><span class="muted">Report object</span>
          <select class="select" id="module-report-object"><option value="">Auto (first unit / resource)</option>${unitOpts}</select>
        </label>
        <label><span class="muted">Days</span>
          <select class="select" id="module-report-days">
            <option value="1">1</option><option value="7" selected>7</option><option value="30">30</option>
          </select>
        </label>
      </div>
      ${tableWrap(['Template', 'Resource', 'ID', ''], rows, 'No matching report templates on this account')}
      <div id="module-report-result" class="mt-1"></div>
      <div class="actions mt-1" id="module-report-print-actions" hidden>
        <button type="button" class="btn btn-sm" data-action="print-module-report">Print / PDF</button>
      </div>
    </div>
    ${domainList.length ? `<div class="card mt-2"><div class="card-header"><h3>Domain export preview</h3><span class="muted">${domainList.length} rows</span></div>
      <p class="muted">Domain ledger available (${domainList.length} rows) — run a Hosting template above for charts.</p>
    </div>` : ''}`;
  }

  function printReportElement(root, title) {
    if (!root) return;
    const win = window.open('', '_blank', 'noopener,noreferrer,width=960,height=720');
    if (!win) {
      window.print();
      return;
    }
    const brand = (getComputedStyle(document.documentElement).getPropertyValue('--brand') || '#004225').trim();
    win.document.write(`<!DOCTYPE html><html><head><title>${esc(title || 'Report')}</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:24px;color:#111}
        h1{color:${brand};font-size:1.25rem;margin:0 0 12px}
        img{max-width:100%;height:auto;margin:8px 0;border-radius:6px}
        table{width:100%;border-collapse:collapse;font-size:12px;margin-top:12px}
        th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
        th{background:#f5f5f5}
        .muted{color:#666;font-size:11px}
        pre{white-space:pre-wrap;font-size:11px}
        @media print{body{padding:0}}
      </style></head><body>
      <h1>${esc(title || 'Report')}</h1>
      <p class="muted">${new Date().toLocaleString()}</p>
      ${root.innerHTML}
      <script>window.onload=function(){setTimeout(function(){window.print()},200)}<\/script>
      </body></html>`);
    win.document.close();
  }

  function workshopSectionHtml(sections) {
    if (!sections || !sections.length) return '<p class="muted">No checklist items</p>';
    return sections.map((sec, si) => {
      const items = (sec.items || []).map((it, ii) => {
        const name = typeof it === 'string' ? it : (it.name || '');
        return `<label class="checklist-item">
          <input type="checkbox" name="check_${si}_${ii}" data-section="${esc(sec.id || si)}" data-item="${esc(name)}" />
          <span>${esc(name)}</span>
        </label>`;
      }).join('');
      return `<div class="checklist-section branded-panel">
        <h4>${esc(sec.title || ('Section ' + (si + 1)))}</h4>
        <div class="checklist-grid">${items}</div>
      </div>`;
    }).join('');
  }

  async function renderMonitoring() {
    // Spec views: Live Map | Fleet List | Track | Events | Reports
    const params = new URLSearchParams(location.search);
    let view = (params.get('view') || 'map').toLowerCase();
    if (!['map', 'list', 'track', 'events', 'reports'].includes(view)) view = 'map';

    const [snap, alerts] = await Promise.all([
      MamsApi.api('/client/fleet/snapshot').catch(() => ({ units: [], counts: {}, live: false })),
      view === 'events' ? MamsApi.api('/client/alerts?limit=100').catch(() => []) : Promise.resolve([]),
    ]);
    const units = snap.units || [];
    const counts = snap.counts || {};
    window.__fleetUnits = units;

    const tabBar = `<div class="tab-bar branded-tabs">
      <a class="tab ${view === 'map' ? 'active' : ''}" href="/app/monitoring?view=map">Live Map</a>
      <a class="tab ${view === 'list' ? 'active' : ''}" href="/app/monitoring?view=list">Fleet List</a>
      <a class="tab ${view === 'track' ? 'active' : ''}" href="/app/monitoring?view=track">Track</a>
      <a class="tab ${view === 'events' ? 'active' : ''}" href="/app/monitoring?view=events">Events</a>
      <a class="tab ${view === 'reports' ? 'active' : ''}" href="/app/monitoring?view=reports">Reports</a>
    </div>
    <div class="kpi-grid mt-2">
      ${kpi('Total', counts.total ?? units.length)}
      ${kpi('Moving', counts.moving ?? 0)}
      ${kpi('Idle', counts.idle ?? 0)}
      ${kpi('Stopped', counts.stopped ?? 0)}
      ${kpi('Offline', counts.offline ?? 0)}
    </div>`;

    if (view === 'reports') {
      return tabBar + await moduleReportsHtml('monitoring', 'Monitoring reports');
    }

    if (view === 'events') {
      const list = Array.isArray(alerts) ? alerts : alerts.alerts || [];
      const rows = list.slice(0, 100).map((a) => `<tr>
        <td>${severityBadge(a.severity)}</td>
        <td><strong>${esc(a.title)}</strong></td>
        <td>${esc(a.type || '—')}</td>
        <td class="muted">${fmtDate(a.timestamp || a.occurredAt)}</td>
      </tr>`).join('');
      return `${tabBar}
      <div class="card mt-2 branded-panel">
        <div class="card-header"><h3>Fleet events</h3><span class="muted">From alerts inbox</span></div>
        ${tableWrap(['Severity', 'Event', 'Type', 'When'], rows, 'No events')}
      </div>`;
    }

    if (view === 'track') {
      const opts = units.slice(0, 200).map((u) =>
        `<option value="${esc(u.wialonId || u.id)}">${esc(u.name)}</option>`
      ).join('') || '<option value="">No units</option>';
      return `${tabBar}
      <div class="card mt-2">
        <div class="card-header"><h3>Track history</h3></div>
        <div class="form-grid">
          <label><span>Unit</span><select class="select" id="track-unit">${opts}</select></label>
          <label><span>Range</span><select class="select" id="track-range">
            <option value="3600">Last 1h</option>
            <option value="21600">Last 6h</option>
            <option value="86400" selected>Last 24h</option>
            <option value="259200">Last 3d</option>
          </select></label>
          <div class="form-grid-action"><button type="button" class="btn" data-action="load-monitoring-track">Load track</button></div>
        </div>
        <div id="track-map" class="map-panel mt-1"></div>
        <div id="track-meta" class="muted mt-1"></div>
      </div>`;
    }

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

    const banner = snap.live
      ? `<div class="banner banner-success">Live fleet · ${units.length} units</div>`
      : integrationBanner('Live fleet map');

    if (view === 'list') {
      return `${tabBar}${banner}
      <div class="card mt-2 branded-panel">
        <div class="card-header"><h3>Fleet list</h3><span class="badge ${snap.live ? 'badge-success' : 'badge-inactive'}">${snap.live ? 'Live' : 'Offline'}</span></div>
        ${tableWrap(['Name', 'Status', 'Speed', 'Fuel', 'Mileage', 'Battery', 'Updated'], rows, 'No units with telemetry')}
      </div>
      <div id="unit-detail-root"></div>`;
    }

    // Live Map (default)
    return `${tabBar}${banner}
    <div class="grid-main-side mt-1">
      <div class="card card-flat branded-panel">
        <div class="card-header"><h3>Live map</h3><span class="badge ${snap.live ? 'badge-success' : 'badge-inactive'}">${snap.live ? 'Live' : 'Offline'}</span></div>
        <div id="fleet-map" class="map-panel"></div>
      </div>
      <div class="card card-flat">
        <div class="card-header"><h3>Units</h3><span class="muted">${units.length}</span></div>
        ${tableWrap(['Name', 'Status', 'Speed', 'Fuel', 'Mileage', 'Battery', 'Updated'], rows, 'No units')}
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

  function loadHls(cb) {
    if (typeof Hls !== 'undefined') { cb(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.7/dist/hls.min.js';
    script.onload = cb;
    script.onerror = () => cb();
    document.head.appendChild(script);
  }

  function attachHlsPlayer(videoEl, url) {
    return new Promise((resolve, reject) => {
      if (!videoEl || !url) {
        reject(new Error('Missing video element or URL'));
        return;
      }
      if (videoEl._hls) {
        try { videoEl._hls.destroy(); } catch (_) {}
        videoEl._hls = null;
      }
      if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = url;
        videoEl.play().catch(() => {});
        resolve();
        return;
      }
      loadHls(() => {
        if (typeof Hls === 'undefined' || !Hls.isSupported()) {
          videoEl.src = url;
          videoEl.play().catch(() => {});
          resolve();
          return;
        }
        const hls = new Hls({ enableWorker: true });
        videoEl._hls = hls;
        hls.loadSource(url);
        hls.attachMedia(videoEl);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          videoEl.play().catch(() => {});
          resolve();
        });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data?.fatal) reject(new Error(data.type || 'HLS error'));
        });
      });
    });
  }

  function fuelCategoryOf(u) {
    const t = String(u.assetType || u.assetCategory || u.category || '').toLowerCase();
    const n = String(u.name || u.unitName || '').toLowerCase();
    // Spec: bowsers/tankers stay with generators, not vehicles
    if (/bowser|tanker|genset|generator|stationary/.test(n) || t === 'generator' || t === 'genset') return 'generator';
    if (t === 'machinery' || /machinery|excavator|crane/.test(n)) return 'machinery';
    if (t === 'vehicle' || t === 'truck' || t === 'car') return 'vehicle';
    return t || 'vehicle';
  }

  function fuelAlertCategory(type) {
    const t = String(type || '').toLowerCase();
    if (/fuel|fill|drain|theft|tank/.test(t)) return 'fuel';
    if (/power|battery|voltage|ignition/.test(t)) return 'power';
    if (/speed|harsh|eco|driver|idle/.test(t)) return 'driving';
    if (/geofence|zone|route/.test(t)) return 'geofence';
    if (/engine|rpm|hours/.test(t)) return 'engine';
    if (/sensor|temp|door/.test(t)) return 'sensors';
    return 'other';
  }

  async function renderFuel() {
    // Spec tabs: Vehicles | Generators | Machinery | Reports | Variance
    const params = new URLSearchParams(location.search);
    let tab = (params.get('fuelTab') || 'vehicles').toLowerCase();
    if (!['vehicles', 'generators', 'machinery', 'reports', 'variance'].includes(tab)) tab = 'vehicles';

    const [data, monthly, assetsRes, templates, variance, analytics] = await Promise.all([
      MamsApi.api('/client/fuel/transactions').catch(() => ({ transactions: [], kpis: {} })),
      MamsApi.api('/client/fuel/monthly-trend').catch(() => []),
      MamsApi.api('/client/wialon/fuel/assets').catch(() => ({ assets: [], summary: {}, live: false })),
      MamsApi.api('/client/wialon/reports/templates').catch(() => ({ templates: [] })),
      MamsApi.api('/client/fuel/variance').catch(() => ({ rows: [], configured: false })),
      MamsApi.api('/client/wialon/fuel/analytics?period=30').catch(() => null),
    ]);
    const txs = data.transactions || (Array.isArray(data) ? data : []);
    const kpis = data.kpis || {};
    const trend = Array.isArray(monthly) ? monthly : [];
    const ak = (analytics && analytics.kpis) || {};
    const topAssets = ((analytics && analytics.byAsset) || []).slice(0, 8);
    const anomalies = ((analytics && analytics.anomalies) || []).slice(0, 8);
    const assets = assetsRes.assets || [];
    const summary = assetsRes.summary || {};
    const live = !!assetsRes.live;

    const byCat = { vehicle: [], generator: [], machinery: [] };
    assets.forEach((a) => {
      const c = fuelCategoryOf(a);
      if (byCat[c]) byCat[c].push(a);
      else byCat.vehicle.push(a);
    });

    const catKey = tab === 'generators' ? 'generator' : tab === 'machinery' ? 'machinery' : 'vehicle';
    const catAssets = byCat[catKey] || [];
    const catTxs = txs.filter((t) => {
      const name = String(t.unitName || t.assetName || '');
      const hit = assets.find((a) => String(a.name || a.unitName) === name);
      if (!hit) {
        if (tab === 'vehicles') return !/genset|generator|bowser|tanker|machinery/i.test(name);
        if (tab === 'generators') return /genset|generator|bowser|tanker/i.test(name);
        if (tab === 'machinery') return /machinery|excavator|crane/i.test(name);
        return true;
      }
      return fuelCategoryOf(hit) === catKey;
    });

    const liveRows = catAssets.slice(0, 120).map((u) => `<tr>
      <td><strong>${esc(u.name || u.unitName)}</strong>${u.plate ? `<div class="muted">${esc(u.plate)}</div>` : ''}</td>
      <td>${statusBadge(u.status)}</td>
      <td>${u.fuelPercent != null || u.fuelLevel != null ? esc(Math.round(u.fuelPercent ?? u.fuelLevel)) + '%' : '—'}</td>
      <td>${u.fuelLiters != null ? esc(u.fuelLiters) + ' L' : '—'}</td>
      <td class="muted">${u.mileage != null ? esc(Math.round(Number(u.mileage))).toLocaleString() + ' km' : '—'}</td>
      <td><button type="button" class="btn btn-sm btn-ghost" data-action="fuel-unit-report" data-unit="${esc(u.unitId || u.wialonId || u.id)}" data-name="${esc(u.name || u.unitName || '')}">Refresh report</button></td>
    </tr>`).join('');

    const txRows = catTxs.slice(0, 100).map((t) => {
      const filled = Number(t.filled) || 0;
      const used = Number(t.fuelUsed || t.fuel_used) || 0;
      const isBowser = /bowser|tanker/i.test(String(t.unitName || t.assetName || ''));
      const label = filled > 0 ? `${filled} L filled` : (used > 0 ? `${used} L ${isBowser ? 'dispensed' : 'used'}` : '—');
      return `<tr>
        <td>${fmtDate(t.timestamp ? t.timestamp * 1000 : t.date)}</td>
        <td><strong>${esc(t.unitName || t.assetName || '—')}</strong></td>
        <td>${esc(t.section || (filled ? 'fill' : 'consume'))}</td>
        <td>${esc(label)}</td>
        <td>${esc(t.location || '—')}</td>
      </tr>`;
    }).join('');

    const filledSum = catTxs.reduce((s, t) => s + (Number(t.filled) || 0), 0);
    const usedSum = catTxs.reduce((s, t) => s + (Number(t.fuelUsed || t.fuel_used) || 0), 0);
    const withFuel = catAssets.filter((a) => a.fuelLiters != null || a.fuelPercent != null || a.fuelLevel != null).length;

    const fuelTemplates = (templates.templates || templates || []).filter((t) =>
      /fuel/i.test(String(t.name || t.n || ''))
    );
    const tplRows = fuelTemplates.slice(0, 40).map((t) => `<tr>
      <td><strong>${esc(t.name || t.n)}</strong></td>
      <td class="muted">${esc(t.resourceName || t.resourceId || '—')}</td>
      <td>${esc(t.id)}</td>
    </tr>`).join('');

    const varSummary = variance.summary || {};
    const varRows = (variance.rows || variance.assets || []).slice(0, 80).map((r) => `<tr>
      <td>${esc(r.station || r.registration || r.name || r.unitName || '—')}</td>
      <td>${esc(r.sheetLiters ?? r.stationLiters ?? '—')}</td>
      <td>${esc(r.telematicsLiters ?? r.flsLiters ?? '—')}</td>
      <td>${esc(r.variance ?? r.diff ?? '—')}</td>
    </tr>`).join('');

    const banner = !live
      ? integrationBanner('Live fuel levels')
      : `<div class="banner banner-success">Live tank levels · ledger from harvested fuel reports · ${withFuel} assets with readings</div>`;

    const catBody = `<div class="kpi-grid">
      ${kpi('Assets', catAssets.length)}
      ${kpi('With fuel reading', withFuel)}
      ${kpi('Filled (period)', Math.round(filledSum) + ' L')}
      ${kpi('Used / dispensed', Math.round(usedSum) + ' L')}
    </div>
    ${analytics ? `<div class="card mt-2 branded-panel">
      <div class="card-header"><h3>Fuel intelligence</h3>
        <span class="muted">${esc(analytics.from || '')} → ${esc(analytics.to || '')}</span>
        <button type="button" class="btn btn-sm" data-action="fuel-analytics-warm">Warm ledger</button>
      </div>
      <div class="kpi-grid">
        ${kpi('Filled', (ak.totalFilled ?? '—') + ' L')}
        ${kpi('Consumed', (ak.totalConsumed ?? '—') + ' L')}
        ${kpi('Drained', (ak.totalDrained ?? '—') + ' L')}
        ${kpi('Net', (ak.netBalance ?? '—') + ' L')}
      </div>
      <div class="grid-2 mt-1">
        <div>${tableWrap(['Unit', 'Filled', 'Used', 'Events'], topAssets.map((a) => `<tr>
          <td><button type="button" class="btn btn-ghost btn-sm" data-action="open-fuel-unit" data-id="${esc(a.unitId)}" data-name="${esc(a.unitName)}">${esc(a.unitName)}</button></td>
          <td>${esc(a.filled)}</td><td>${esc(a.consumed)}</td><td>${esc(a.events)}</td>
        </tr>`).join(''), 'No asset ledger yet')}</div>
        <div>${tableWrap(['Anomaly', 'Unit', 'L'], anomalies.map((a) => `<tr>
          <td>${esc(a.section)}</td><td>${esc(a.unitName)}</td><td>${esc(a.drained || a.filled || a.fuelUsed || '—')}</td>
        </tr>`).join(''), 'No anomalies')}</div>
      </div>
    </div>` : ''}
    <div class="card mt-2 branded-panel">
      <div class="card-header"><h3>Live levels</h3>
        <button type="button" class="btn btn-sm" data-action="fuel-harvest">Re-pull reports</button>
      </div>
      ${tableWrap(['Asset', 'Status', 'Fuel %', 'Liters', 'Odo', ''], liveRows, 'No assets in this category — check Wialon link')}
    </div>
    <div class="grid-main-side mt-2">
      <div class="card">
        <div class="card-header"><h3>Fill / use ledger</h3><span class="muted">MySQL</span></div>
        ${tableWrap(['Date', 'Asset', 'Type', 'Volume', 'Location'], txRows, 'No fuel transactions yet — wait for harvest or re-pull reports')}
      </div>
      <div class="card">
        <div class="card-header"><h3>Monthly trend</h3></div>
        ${tableWrap(['Month', 'Filled', 'Consumed'], trend.slice(-8).map((m) => `<tr>
          <td>${esc(m.month)}</td><td>${esc(m.filled)} L</td><td>${esc(m.consumed)} L</td>
        </tr>`).join(''), 'No trend data yet')}
        ${trend.some((r) => Number(r.filled) > 0 || Number(r.consumed) > 0) ? '<div class="chart-box mt-1" style="height:180px"><canvas id="fuel-page-trend"></canvas></div>' : ''}
      </div>
    </div>
    <div id="fuel-report-msg" class="mt-1"></div>`;

    return `${banner}
    <div class="tab-bar mt-2 branded-tabs">
      <a class="tab ${tab === 'vehicles' ? 'active' : ''}" href="/app/fuel?fuelTab=vehicles">Vehicles (${byCat.vehicle.length || summary.vehicles || 0})</a>
      <a class="tab ${tab === 'generators' ? 'active' : ''}" href="/app/fuel?fuelTab=generators">Generators (${byCat.generator.length || summary.generators || 0})</a>
      <a class="tab ${tab === 'machinery' ? 'active' : ''}" href="/app/fuel?fuelTab=machinery">Machinery (${byCat.machinery.length || summary.machinery || 0})</a>
      <a class="tab ${tab === 'reports' ? 'active' : ''}" href="/app/fuel?fuelTab=reports">Reports</a>
      <a class="tab ${tab === 'variance' ? 'active' : ''}" href="/app/fuel?fuelTab=variance">Variance</a>
    </div>
    ${tab === 'reports' ? `<div class="card mt-2">
      <div class="card-header"><h3>Fuel report templates</h3><span class="muted">Hosting templates for this account</span></div>
      ${tableWrap(['Template', 'Resource', 'ID'], tplRows, 'No fuel report templates found on this account')}
      <p class="muted mt-1">Canonical names: Fuel Report(Group/Unit), Fuel Usage Report(Gensets/Units).</p>
      <div class="actions mt-1"><button type="button" class="btn btn-sm" data-action="fuel-harvest">Force re-pull (≤20 units)</button></div>
      <div id="fuel-report-msg" class="mt-1"></div>
    </div>` : tab === 'variance' ? `<div class="card mt-2">
      <div class="card-header"><h3>Station variance</h3><span class="muted">FLS fills vs petrol-station sheets${variance.fromDate ? ` · ${esc(variance.fromDate)} → ${esc(variance.toDate)}` : ''}</span></div>
      ${variance.configured === false
        ? emptyState('⛽', 'Variance not configured', 'Upload petrol-station sheets in Admin → Tenant → Fuel module.')
        : `<div class="kpi-grid mt-1">
            ${kpi('Station L', varSummary.stationLiters ?? '—')}
            ${kpi('FLS L', varSummary.flsLiters ?? '—')}
            ${kpi('Variance', varSummary.variance ?? '—')}
            ${kpi('Assets', varSummary.assets ?? 0)}
          </div>
          ${tableWrap(['Station / unit', 'Sheet L', 'FLS L', 'Variance'], varRows, 'No matched variance rows — upload sheets and harvest fuel fills')}`}
    </div>` : catBody}`;
  }

  async function renderWorkshop() {
    // Spec tabs: Fleet Overview | Inspections | Maintenance Jobs | Breakdowns | Costing | Reports
    const params = new URLSearchParams(location.search);
    let tab = (params.get('wsTab') || 'overview').toLowerCase();
    if (!['overview', 'inspections', 'maintenance', 'breakdowns', 'costing', 'reports'].includes(tab)) tab = 'overview';
    const cat = (params.get('cat') || 'vehicle').toLowerCase();

    const [kpis, inspections, maintenance, breakdowns, mechanics, templates] = await Promise.all([
      MamsApi.api('/client/workshop/kpis').catch(() => ({})),
      MamsApi.api('/client/workshop/inspections').catch(() => []),
      MamsApi.api('/client/workshop/maintenance').catch(() => []),
      MamsApi.api('/client/workshop/breakdowns').catch(() => []),
      MamsApi.api('/client/workshop/mechanics').catch(() => []),
      tab === 'inspections'
        ? MamsApi.api(`/client/workshop/checklist-templates?assetCategory=${encodeURIComponent(cat)}`).catch(() => [])
        : Promise.resolve([]),
    ]);
    const insp = Array.isArray(inspections) ? inspections : [];
    const maint = Array.isArray(maintenance) ? maintenance : [];
    const brk = Array.isArray(breakdowns) ? breakdowns : [];
    const mechs = Array.isArray(mechanics) ? mechanics : [];
    const tplList = Array.isArray(templates) ? templates : [];
    const tpl = tplList[0] || null;
    const sections = (tpl && tpl.sections) || [];

    const tabBar = `<div class="tab-bar branded-tabs">
      <a class="tab ${tab === 'overview' ? 'active' : ''}" href="/app/workshop?wsTab=overview">Fleet Overview</a>
      <a class="tab ${tab === 'inspections' ? 'active' : ''}" href="/app/workshop?wsTab=inspections&cat=${esc(cat)}">Inspections</a>
      <a class="tab ${tab === 'maintenance' ? 'active' : ''}" href="/app/workshop?wsTab=maintenance">Maintenance Jobs</a>
      <a class="tab ${tab === 'breakdowns' ? 'active' : ''}" href="/app/workshop?wsTab=breakdowns">Breakdowns</a>
      <a class="tab ${tab === 'costing' ? 'active' : ''}" href="/app/workshop?wsTab=costing">Costing</a>
      <a class="tab ${tab === 'reports' ? 'active' : ''}" href="/app/workshop?wsTab=reports">Reports</a>
    </div>`;

    const kpisHtml = `<div class="kpi-grid mt-2">
      ${kpi('Pending maintenance', kpis.pendingMaintenance ?? 0)}
      ${kpi('Completed this month', kpis.completedThisMonth ?? 0)}
      ${kpi('Open breakdowns', kpis.openBreakdowns ?? 0)}
      ${kpi('Inspections due', kpis.inspectionsDue ?? 0)}
      ${kpi('Mechanics', mechs.length || (kpis.mechanics ?? 0))}
    </div>`;

    if (tab === 'reports') {
      return tabBar + kpisHtml + await moduleReportsHtml('workshop', 'Workshop reports');
    }

    if (tab === 'costing') {
      const costs = maint.reduce((s, m) => s + (Number(m.totalCost || m.cost || 0) || 0), 0);
      const brkCost = brk.reduce((s, b) => s + (Number(b.totalCost || b.repairCost || 0) || 0), 0);
      return `${tabBar}${kpisHtml}
      <div class="kpi-grid mt-2">
        ${kpi('Maintenance cost', 'UGX ' + Math.round(costs).toLocaleString())}
        ${kpi('Breakdown cost', 'UGX ' + Math.round(brkCost).toLocaleString())}
        ${kpi('Combined', 'UGX ' + Math.round(costs + brkCost).toLocaleString())}
      </div>
      <div class="card mt-2">
        <div class="card-header"><h3>Costing notes</h3></div>
        <p class="muted">Costs come from maintenance logs and breakdown reports. Add amounts when logging jobs.</p>
      </div>`;
    }

    if (tab === 'inspections') {
      const catBar = `<div class="actions mt-1" style="gap:.5rem;flex-wrap:wrap">
        ${['vehicle', 'generator', 'machinery'].map((c) =>
          `<a class="btn btn-sm ${cat === c ? '' : 'btn-ghost'}" href="/app/workshop?wsTab=inspections&cat=${c}">${c[0].toUpperCase() + c.slice(1)}</a>`
        ).join('')}
      </div>`;
      const inspRows = insp.filter((i) => !cat || String(i.assetCategory || 'vehicle').toLowerCase() === cat || !i.assetCategory)
        .slice(0, 40).map((i) => `<tr>
          <td>${esc(i.vehicleName || i.assetName || '—')}</td>
          <td><span class="badge badge-info">${esc(i.assetCategory || 'vehicle')}</span></td>
          <td>${esc(i.overallStatus || i.result || '—')}</td>
          <td class="muted">${fmtDate(i.inspectionDate || i.inspectedAt || i.createdAt)}</td>
        </tr>`).join('');
      return `${tabBar}${kpisHtml}${catBar}
      <div class="card mt-2 branded-panel">
        <div class="card-header"><h3>New ${esc(cat)} inspection</h3>
          <span class="muted">${esc((tpl && tpl.name) || 'checklist')}</span>
        </div>
        <form id="inspection-form" class="form-stack" data-category="${esc(cat)}">
          <input type="hidden" name="assetCategory" value="${esc(cat)}" />
          <div class="form-grid">
            <label><span>Asset name</span><input class="input" name="vehicleName" required /></label>
            <label><span>Plate / ID</span><input class="input" name="vehiclePlate" /></label>
            <label><span>Inspector</span><input class="input" name="inspectorName" /></label>
            ${cat === 'generator'
              ? '<label><span>Engine hours</span><input class="input" type="number" step="0.1" name="engineHours" /></label>'
              : '<label><span>Odometer</span><input class="input" type="number" step="0.1" name="odometerReading" /></label>'}
            <label><span>Result</span><select class="select" name="overallStatus">
              <option value="pass">Pass</option>
              <option value="needs-attention">Needs attention</option>
              <option value="fail">Fail</option>
            </select></label>
          </div>
          <p class="muted">${cat === 'generator' ? 'One form · Daily inspection + Monthly preventive maintenance' : 'Complete checklist items below'}</p>
          <div id="inspection-checklist">${workshopSectionHtml(sections)}</div>
          <label><span>Notes</span><textarea class="input" name="notes" rows="2"></textarea></label>
          <p id="inspection-error" class="error" hidden></p>
          <button type="submit" class="btn">Save inspection</button>
        </form>
      </div>
      <div class="card mt-2">
        <div class="card-header"><h3>Recent inspections</h3></div>
        ${tableWrap(['Asset', 'Category', 'Result', 'When'], inspRows, 'No inspections yet')}
      </div>`;
    }

    if (tab === 'maintenance') {
      return `${tabBar}${kpisHtml}
      <div class="grid-2 mt-2">
        <div class="card">
          <div class="card-header"><h3>Log maintenance</h3></div>
          <form id="maint-form" class="form-stack">
            <label><span>Asset name</span><input class="input" name="vehicleName" required /></label>
            <label><span>Plate</span><input class="input" name="vehiclePlate" /></label>
            <label><span>Category</span><select class="select" name="assetCategory"><option value="vehicle">Vehicle</option><option value="generator">Generator</option><option value="machinery">Machinery</option></select></label>
            <label><span>Type</span><select class="select" name="maintenanceType"><option value="service">Service</option><option value="repair">Repair</option><option value="inspection">Inspection follow-up</option></select></label>
            <label><span>Mechanic</span><input class="input" name="mechanicName" /></label>
            <label><span>Cost</span><input class="input" type="number" step="0.01" name="totalCost" /></label>
            <label><span>Description</span><textarea class="input" name="description" rows="2" required></textarea></label>
            <p id="maint-error" class="error" hidden></p>
            <button type="submit" class="btn">Save maintenance</button>
          </form>
        </div>
        <div class="card">
          <div class="card-header"><h3>Mechanics</h3></div>
          ${tableWrap(['Name', 'Phone', 'Status'], mechs.slice(0, 40).map((m) => `<tr>
            <td><strong>${esc(m.fullName || m.name || '—')}</strong></td>
            <td>${esc(m.phone || '—')}</td>
            <td>${statusBadge(m.isActive === false ? 'inactive' : 'active')}</td>
          </tr>`).join(''), 'No mechanics listed')}
        </div>
      </div>
      <div class="card mt-2">
        <div class="card-header"><h3>Maintenance jobs</h3></div>
        ${tableWrap(['Asset', 'Type', 'Status', 'When'], maint.slice(0, 40).map((m) => `<tr>
          <td>${esc(m.vehicleName || m.assetName || '—')}</td>
          <td>${esc(m.maintenanceType || m.type || '—')}</td>
          <td>${statusBadge(m.status || '—')}</td>
          <td class="muted">${fmtDate(m.startDate || m.scheduledAt || m.createdAt)}</td>
        </tr>`).join(''), 'No maintenance logs')}
      </div>`;
    }

    if (tab === 'breakdowns') {
      return `${tabBar}${kpisHtml}
      <div class="grid-2 mt-2">
        <div class="card">
          <div class="card-header"><h3>Report breakdown</h3></div>
          <form id="breakdown-form" class="form-stack">
            <label><span>Asset name</span><input class="input" name="vehicleName" required /></label>
            <label><span>Plate</span><input class="input" name="vehiclePlate" /></label>
            <label><span>Severity</span><select class="select" name="severity"><option value="minor">Minor</option><option value="major">Major</option><option value="critical">Critical</option></select></label>
            <label><span>Description</span><textarea class="input" name="description" rows="2" required></textarea></label>
            <p id="breakdown-error" class="error" hidden></p>
            <button type="submit" class="btn">Save breakdown</button>
          </form>
        </div>
        <div class="card">
          <div class="card-header"><h3>Open breakdowns</h3></div>
          ${tableWrap(['Asset', 'Status', 'When'], brk.slice(0, 40).map((b) => `<tr>
            <td>${esc(b.vehicleName || b.assetName || '—')}</td>
            <td>${statusBadge(b.resolutionTime ? 'resolved' : (b.status || 'open'))}</td>
            <td class="muted">${fmtDate(b.breakdownTime || b.reportedAt || b.createdAt)}</td>
          </tr>`).join(''), 'No breakdowns')}
        </div>
      </div>`;
    }

    // Overview
    return `${tabBar}${kpisHtml}
    <div class="grid-2 mt-2">
      <div class="card branded-panel">
        <div class="card-header"><h3>Fleet maintenance</h3></div>
        ${tableWrap(['Asset', 'Type', 'Status', 'When'], maint.slice(0, 25).map((m) => `<tr>
          <td>${esc(m.vehicleName || m.assetName || '—')}</td>
          <td>${esc(m.maintenanceType || m.type || '—')}</td>
          <td>${statusBadge(m.status || '—')}</td>
          <td class="muted">${fmtDate(m.startDate || m.createdAt)}</td>
        </tr>`).join(''), 'No maintenance jobs')}
      </div>
      <div class="card">
        <div class="card-header"><h3>Recent inspections</h3></div>
        ${tableWrap(['Asset', 'Result', 'When'], insp.slice(0, 25).map((i) => `<tr>
          <td>${esc(i.vehicleName || i.assetName || '—')}</td>
          <td>${esc(i.overallStatus || '—')}</td>
          <td class="muted">${fmtDate(i.inspectionDate || i.createdAt)}</td>
        </tr>`).join(''), 'No inspections')}
      </div>
    </div>`;
  }

  async function renderAlerts() {
    // Spec tabs: Inbox · Alert types · Reports (never bury types under inbox)
    const params = new URLSearchParams(location.search);
    let tab = (params.get('alertTab') || 'inbox').toLowerCase();
    if (!['inbox', 'types', 'reports'].includes(tab)) tab = 'inbox';
    const cat = (params.get('cat') || 'all').toLowerCase();
    const status = (params.get('status') || 'all').toLowerCase();
    const period = (params.get('period') || '7d').toLowerCase();

    const now = Date.now();
    const periodMs = period === 'today' ? 86400000
      : period === '14d' ? 14 * 86400000
      : period === '30d' ? 30 * 86400000
      : 7 * 86400000;
    const fromIso = new Date(now - periodMs).toISOString();

    const [alerts, wialonNf, templates] = await Promise.all([
      MamsApi.api(`/client/alerts?from=${encodeURIComponent(fromIso)}&limit=500`).catch(() => []),
      tab === 'types' || tab === 'inbox'
        ? MamsApi.api('/client/wialon/notifications').catch(() => ({ notifications: [] }))
        : Promise.resolve({ notifications: [] }),
      tab === 'reports'
        ? MamsApi.api('/client/wialon/reports/templates').catch(() => ({ templates: [] }))
        : Promise.resolve({ templates: [] }),
    ]);
    const list = Array.isArray(alerts) ? alerts : alerts.alerts || [];
    const nfList = wialonNf.notifications || [];

    let filtered = list.filter((a) => {
      const ts = new Date(a.timestamp || a.occurredAt || 0).getTime();
      if (period === 'today') {
        const start = new Date(); start.setHours(0, 0, 0, 0);
        if (ts < start.getTime()) return false;
      } else if (ts && ts < now - periodMs) return false;
      if (status === 'open' && a.acknowledged) return false;
      if (status === 'ack' && !a.acknowledged) return false;
      if (cat !== 'all' && fuelAlertCategory(a.type || a.title) !== cat) return false;
      return true;
    });

    const openIds = filtered.filter((a) => !a.acknowledged).map((a) => a.id);
    const open = list.filter((a) => !a.acknowledged).length;
    const openCrit = list.filter((a) => !a.acknowledged && ['critical', 'emergency'].includes(String(a.severity || '').toLowerCase())).length;
    const openWarn = list.filter((a) => !a.acknowledged && String(a.severity || '').toLowerCase() === 'warning').length;

    const rows = filtered.slice(0, 150).map((a) => `<tr>
      <td><strong>${esc(a.title)}</strong>${a.unitName || a.assetName ? `<div class="muted">${esc(a.unitName || a.assetName)}</div>` : ''}</td>
      <td>${severityBadge(a.severity)} <span class="badge badge-info">${esc(a.type || '—')}</span></td>
      <td class="muted">${esc(a.sourceType || a.source || 'harvest')}</td>
      <td>${a.description ? esc(a.description) : '—'}</td>
      <td class="muted">${fmtDate(a.timestamp || a.occurredAt)}</td>
      <td>${a.acknowledged
        ? '<span class="badge badge-success">Ack</span>'
        : `<button class="btn btn-sm" data-action="ack-alert" data-id="${esc(a.id)}">Ack</button>`}</td>
    </tr>`).join('');

    const nfRows = nfList.slice(0, 120).map((n) => `<tr>
      <td><strong>${esc(n.name)}</strong></td>
      <td class="muted">${esc(n.resourceName || '—')}</td>
      <td>${esc(n.unitCount ?? '—')}</td>
      <td>${esc(n.triggers ?? '—')}</td>
      <td>${n.active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-inactive">Inactive</span>'}</td>
    </tr>`).join('');

    const alertTpl = (templates.templates || templates || []).filter((t) =>
      /alert|event|notif|eco|safety/i.test(String(t.name || t.n || ''))
    );
    const reportRows = alertTpl.slice(0, 40).map((t) => `<tr>
      <td><strong>${esc(t.name || t.n)}</strong></td>
      <td class="muted">${esc(t.resourceName || '—')}</td>
      <td>${esc(t.id)}</td>
    </tr>`).join('');

    const cats = ['all', 'fuel', 'power', 'driving', 'geofence', 'engine', 'sensors', 'other'];
    const tabBar = `<div class="tab-bar mt-2 branded-tabs">
      <a class="tab ${tab === 'inbox' ? 'active' : ''}" href="/app/alerts?alertTab=inbox">Inbox</a>
      <a class="tab ${tab === 'types' ? 'active' : ''}" href="/app/alerts?alertTab=types">Alert types</a>
      <a class="tab ${tab === 'reports' ? 'active' : ''}" href="/app/alerts?alertTab=reports">Reports</a>
    </div>`;

    if (tab === 'types') {
      const active = nfList.filter((n) => n.active).length;
      return `${tabBar}
      <div class="kpi-grid mt-2">
        ${kpi('Total types', nfList.length)}
        ${kpi('Active', active)}
        ${kpi('Inactive', nfList.length - active)}
      </div>
      <div class="card mt-2 branded-panel">
        <div class="card-header"><h3>Configured alert types</h3>
          <button type="button" class="btn btn-sm" data-action="refresh-page">Refresh</button>
        </div>
        ${tableWrap(['Alert type', 'Account / resource', 'Units', 'Times triggered', 'Status'], nfRows,
          'No notification rules — link the client account and ensure Hosting notifications exist')}
      </div>`;
    }

    if (tab === 'reports') {
      return `${tabBar}
      <div class="card mt-2">
        <div class="card-header"><h3>Alert / event report templates</h3></div>
        ${tableWrap(['Template', 'Resource', 'ID'], reportRows, 'No matching report templates')}
      </div>`;
    }

    return `${tabBar}
    <div class="kpi-grid mt-2">
      ${kpi('Open', open)}
      ${kpi('Open critical', openCrit)}
      ${kpi('Open warnings', openWarn)}
      ${kpi('In period', filtered.length)}
    </div>
    <div class="actions mt-1" style="flex-wrap:wrap;gap:.5rem">
      ${['today', '7d', '14d', '30d'].map((p) =>
        `<a class="btn btn-sm ${period === p ? '' : 'btn-ghost'}" href="/app/alerts?alertTab=inbox&period=${p}&cat=${esc(cat)}&status=${esc(status)}">${p === 'today' ? 'Today' : p}</a>`
      ).join('')}
      <span class="muted">·</span>
      ${cats.map((c) =>
        `<a class="btn btn-sm ${cat === c ? '' : 'btn-ghost'}" href="/app/alerts?alertTab=inbox&period=${esc(period)}&cat=${c}&status=${esc(status)}">${c[0].toUpperCase() + c.slice(1)}</a>`
      ).join('')}
      <span class="muted">·</span>
      ${['all', 'open', 'ack'].map((s) =>
        `<a class="btn btn-sm ${status === s ? '' : 'btn-ghost'}" href="/app/alerts?alertTab=inbox&period=${esc(period)}&cat=${esc(cat)}&status=${s}">${s === 'ack' ? 'Acknowledged' : s[0].toUpperCase() + s.slice(1)}</a>`
      ).join('')}
      ${openIds.length ? `<button type="button" class="btn btn-sm" data-action="ack-alerts-bulk" data-ids="${esc(openIds.slice(0, 50).join(','))}">Ack open (${Math.min(openIds.length, 50)})</button>` : ''}
      <button type="button" class="btn btn-sm btn-ghost" data-action="alerts-sync">Sync now</button>
    </div>
    <div class="card mt-2 branded-panel">
      <div class="card-header"><h3>Inbox</h3><span class="muted">MySQL · harvested events</span></div>
      ${tableWrap(['Title · unit', 'Type', 'Source', 'Description', 'When', ''], rows,
        'No alerts in inbox — harvest runs every minute once Wialon is linked')}
    </div>`;
  }

  async function renderDrivers() {
    const params = new URLSearchParams(location.search);
    let tab = (params.get('tab') || 'roster').toLowerCase();
    if (!['roster', 'reports'].includes(tab)) tab = 'roster';
    const tabBar = `<div class="tab-bar branded-tabs">
      <a class="tab ${tab === 'roster' ? 'active' : ''}" href="/app/drivers?tab=roster">Roster</a>
      <a class="tab ${tab === 'reports' ? 'active' : ''}" href="/app/drivers?tab=reports">Reports</a>
    </div>`;
    if (tab === 'reports') {
      return tabBar + await moduleReportsHtml('drivers', 'Drivers reports');
    }

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

    return `${tabBar}
    <div class="kpi-grid mt-2">
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
    const params = new URLSearchParams(location.search);
    let tab = (params.get('tab') || 'routes').toLowerCase();
    if (!['routes', 'reports'].includes(tab)) tab = 'routes';
    const tabBar = `<div class="tab-bar branded-tabs">
      <a class="tab ${tab === 'routes' ? 'active' : ''}" href="/app/routes?tab=routes">Routes</a>
      <a class="tab ${tab === 'reports' ? 'active' : ''}" href="/app/routes?tab=reports">Reports</a>
    </div>`;
    if (tab === 'reports') {
      return tabBar + await moduleReportsHtml('routes', 'Routes reports');
    }

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

    return `${tabBar}<div class="kpi-grid mt-2">
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
    const params = new URLSearchParams(location.search);
    let tab = (params.get('tab') || 'zones').toLowerCase();
    if (!['zones', 'reports'].includes(tab)) tab = 'zones';
    const tabBar = `<div class="tab-bar branded-tabs">
      <a class="tab ${tab === 'zones' ? 'active' : ''}" href="/app/geofencing?tab=zones">Zones</a>
      <a class="tab ${tab === 'reports' ? 'active' : ''}" href="/app/geofencing?tab=reports">Reports</a>
    </div>`;
    if (tab === 'reports') {
      return tabBar + await moduleReportsHtml('geofencing', 'Geofencing reports');
    }

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

    return `${tabBar}<div class="card">
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
    const params = new URLSearchParams(location.search);
    let tab = (params.get('tab') || 'overview').toLowerCase();
    if (!['overview', 'reports'].includes(tab)) tab = 'overview';
    const tabBar = `<div class="tab-bar branded-tabs">
      <a class="tab ${tab === 'overview' ? 'active' : ''}" href="/app/emissions?tab=overview">Overview</a>
      <a class="tab ${tab === 'reports' ? 'active' : ''}" href="/app/emissions?tab=reports">Reports</a>
    </div>`;
    if (tab === 'reports') {
      return tabBar + await moduleReportsHtml('emissions', 'Overview reports');
    }

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
    return `${tabBar}<div class="kpi-grid">
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
    const params = new URLSearchParams(location.search);
    let tab = (params.get('tab') || 'commands').toLowerCase();
    if (!['commands', 'reports'].includes(tab)) tab = 'commands';
    const tabBar = `<div class="tab-bar branded-tabs">
      <a class="tab ${tab === 'commands' ? 'active' : ''}" href="/app/commands?tab=commands">Commands</a>
      <a class="tab ${tab === 'reports' ? 'active' : ''}" href="/app/commands?tab=reports">Reports</a>
    </div>`;
    if (tab === 'reports') {
      return tabBar + await moduleReportsHtml('commands', 'Commands reports');
    }

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
      return `${tabBar}<tr>
      <td><strong>${esc(a.name)}</strong></td>
      <td>${esc(a.registrationPlate || '—')}</td>
      <td>${live ? statusBadge(live.status) : '—'}</td>
      <td class="actions">
        <button type="button" class="btn btn-sm" data-action="load-unit-commands" data-unit="${esc(wialonId)}" data-asset="${esc(a.id)}" data-name="${esc(a.name)}" ${wialonId ? '' : 'disabled'}>Load commands</button>
        <button type="button" class="btn btn-sm btn-ghost" data-action="send-command" data-unit="${esc(wialonId)}" data-asset="${esc(a.id)}" data-name="${esc(a.name)}" data-cmd="query_pos" ${wialonId ? '' : 'disabled'}>Query pos</button>
      </td>
    </tr>
    <tr class="cmd-catalog-row" id="cmd-catalog-${esc(wialonId || a.id)}" hidden><td colspan="4" class="muted">Expand with Load commands</td></tr>`;
    }).join('');
    const histRows = hist.slice(0, 40).map((h) => `<tr>
      <td>${esc(h.command || h.type || '—')}</td>
      <td>${esc(h.assetName || h.assetId || '—')}</td>
      <td>${statusBadge(h.status || '—')}</td>
      <td class="muted">${fmtDate(h.createdAt || h.sentAt)}</td>
    </tr>`).join('');

    return `<div class="banner banner-info">Commands load from each unit’s Wialon catalog (<code>cml</code>). Prefer non-destructive commands first.</div>
    <div class="card">
      ${tableWrap(['Asset', 'Plate', 'Live', 'Actions'], rows, 'No command-capable assets')}
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Command history</h3></div>
      ${tableWrap(['Command', 'Asset', 'Status', 'When'], histRows, 'No command history')}
    </div>`;
  }

  async function renderSurveillance() {
    const params = new URLSearchParams(location.search);
    let tab = (params.get('tab') || 'cameras').toLowerCase();
    const tabs = ['cameras', 'live', 'playback', 'files', 'commands', 'events', 'reports'];
    if (!tabs.includes(tab)) tab = 'cameras';
    const unitIdParam = params.get('unitId') || params.get('unit') || '';

    const tabBar = `<div class="tab-bar branded-tabs">
      <a class="tab ${tab === 'cameras' ? 'active' : ''}" href="/app/surveillance?tab=cameras${unitIdParam ? '&unitId=' + encodeURIComponent(unitIdParam) : ''}">Cameras</a>
      <a class="tab ${tab === 'live' ? 'active' : ''}" href="/app/surveillance?tab=live${unitIdParam ? '&unitId=' + encodeURIComponent(unitIdParam) : ''}">Live</a>
      <a class="tab ${tab === 'playback' ? 'active' : ''}" href="/app/surveillance?tab=playback${unitIdParam ? '&unitId=' + encodeURIComponent(unitIdParam) : ''}">Playback</a>
      <a class="tab ${tab === 'files' ? 'active' : ''}" href="/app/surveillance?tab=files${unitIdParam ? '&unitId=' + encodeURIComponent(unitIdParam) : ''}">Files</a>
      <a class="tab ${tab === 'commands' ? 'active' : ''}" href="/app/surveillance?tab=commands${unitIdParam ? '&unitId=' + encodeURIComponent(unitIdParam) : ''}">Commands</a>
      <a class="tab ${tab === 'events' ? 'active' : ''}" href="/app/surveillance?tab=events${unitIdParam ? '&unitId=' + encodeURIComponent(unitIdParam) : ''}">Events</a>
      <a class="tab ${tab === 'reports' ? 'active' : ''}" href="/app/surveillance?tab=reports${unitIdParam ? '&unitId=' + encodeURIComponent(unitIdParam) : ''}">Reports</a>
    </div>`;

    if (tab === 'reports') {
      return tabBar + await moduleReportsHtml('surveillance', 'Cameras reports');
    }

    const [data, streamsRes] = await Promise.all([
      MamsApi.api('/client/surveillance/units').catch(() => ({ units: [], streaming: false })),
      tab === 'cameras' ? MamsApi.api('/client/surveillance/streams').catch(() => ({ streams: [] })) : Promise.resolve({ streams: [] }),
    ]);
    const list = data.units || [];
    const selectedId = unitIdParam || String((list[0] && (list[0].wialonId || list[0].id)) || '');
    const selected = list.find((u) => String(u.wialonId || u.id) === String(selectedId)) || list[0] || null;
    const selId = selected ? String(selected.wialonId || selected.id) : '';

    const unitPicker = `<div class="form-row" style="gap:8px;flex-wrap:wrap;align-items:end;margin:8px 0">
      <label style="flex:1;min-width:200px"><span class="muted">Video unit</span>
        <select class="select" id="surv-unit-select" data-action="surv-change-unit">
          ${list.map((u) => {
            const id = String(u.wialonId || u.id);
            return `<option value="${esc(id)}" ${id === selId ? 'selected' : ''}>${esc(u.name)}${u.plate ? ' · ' + esc(u.plate) : ''}</option>`;
          }).join('') || '<option value="">No video units</option>'}
        </select>
      </label>
    </div>`;

    let panel = '';
    if (!selected) {
      panel = emptyState('📹', 'No camera-capable units', data.message || 'Link Wialon and ensure MDVR units are online.');
    } else if (tab === 'cameras') {
      const cams = selected.cameras || [];
      const camRows = cams.map((c) => `<tr>
        <td><strong>${esc(c.name || ('Cam ' + c.channel))}</strong></td>
        <td>${esc(c.channel ?? c.index ?? '—')}</td>
        <td><span class="badge ${c.active !== false ? 'badge-success' : 'badge-inactive'}">${c.active !== false ? 'Active' : 'Off'}</span></td>
        <td><a class="btn btn-sm" href="/app/surveillance?tab=live&unitId=${encodeURIComponent(selId)}&ch=${encodeURIComponent(c.channel || 1)}">Go Live</a></td>
      </tr>`).join('');
      const streams = streamsRes.streams || [];
      const streamRows = streams.map((s) => `<tr>
        <td>${esc(s.name)}</td><td class="muted">${esc(s.protocol || '—')}</td>
        <td>${s.isActive ? statusBadge('moving') : '—'}</td>
      </tr>`).join('');
      panel = `<div class="card branded-panel">
        <div class="card-header"><h3>${esc(selected.name)}</h3><span class="muted">${cams.length} cameras</span></div>
        ${tableWrap(['Camera', 'Channel', 'Status', ''], camRows, 'No cameras on this unit')}
      </div>
      ${streams.length ? `<div class="card mt-2"><div class="card-header"><h3>External streams</h3></div>
        ${tableWrap(['Name', 'Protocol', 'Status'], streamRows, 'None')}
      </div>` : ''}`;
    } else if (tab === 'live') {
      const cams = selected.cameras || [];
      const ch = params.get('ch') || (cams[0] && (cams[0].channel || 1)) || 1;
      const camBtns = cams.map((c) =>
        `<button type="button" class="btn btn-sm ${(String(c.channel) === String(ch)) ? '' : 'btn-ghost'}" data-action="start-live-stream" data-unit="${esc(selId)}" data-channel="${esc(c.channel)}" data-name="${esc(selected.name)}">${esc(c.name || ('Cam ' + c.channel))}</button>`
      ).join(' ');
      panel = `<div class="card branded-panel">
        <div class="card-header"><h3>Live · ${esc(selected.name)}</h3></div>
        <div class="actions" style="flex-wrap:wrap;gap:6px">${camBtns || '<span class="muted">No cameras</span>'}</div>
        <div id="surveillance-video-wrap" class="mt-1">
          <video id="surveillance-video" controls playsinline style="width:100%;max-height:420px;background:#111;border-radius:8px"></video>
          <p id="surveillance-stream-msg" class="muted mt-1">Select a camera to start HLS live playback.</p>
        </div>
      </div>`;
    } else if (tab === 'playback') {
      const now = new Date();
      const from = new Date(now.getTime() - 3600000);
      const toLocal = (d) => {
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      };
      panel = `<div class="card branded-panel">
        <div class="card-header"><h3>Playback · ${esc(selected.name)}</h3></div>
        <p class="muted">Request historical video on the device (MDVR playback command), then open Files for clips.</p>
        <div class="form-row" style="gap:8px;flex-wrap:wrap;align-items:end">
          <label><span class="muted">From</span><input class="input" type="datetime-local" id="surv-pb-from" value="${toLocal(from)}" /></label>
          <label><span class="muted">To</span><input class="input" type="datetime-local" id="surv-pb-to" value="${toLocal(now)}" /></label>
          <label><span class="muted">Camera</span>
            <select class="select" id="surv-pb-cam">
              ${(selected.cameras || [{ channel: 1, name: 'Cam 1' }]).map((c) =>
                `<option value="${esc(c.channel || 1)}">${esc(c.name || ('Cam ' + c.channel))}</option>`
              ).join('')}
            </select>
          </label>
          <button type="button" class="btn" data-action="surv-request-playback" data-unit="${esc(selId)}">Request playback</button>
        </div>
        <div id="surv-playback-msg" class="mt-1"></div>
        <div id="surveillance-video-wrap" class="mt-1">
          <video id="surveillance-video" controls playsinline style="width:100%;max-height:360px;background:#111;border-radius:8px"></video>
        </div>
      </div>`;
    } else if (tab === 'files') {
      let files = [];
      try {
        const filesRes = await MamsApi.api(`/client/surveillance/units/${encodeURIComponent(selId)}/files`);
        files = filesRes.files || [];
      } catch (_) { files = []; }
      const fileRows = files.slice(0, 60).map((f) => {
        const playAttrs = f.source === 'message' && f.messageId
          ? `data-action="play-video-file" data-unit="${esc(selId)}" data-mid="${esc(f.messageId)}" data-source="message"`
          : f.path
            ? `data-action="play-video-file" data-unit="${esc(selId)}" data-path="${esc(f.path)}" data-storage="${esc(f.storageType || 2)}" data-source="storage"`
            : '';
        return `<tr>
          <td><strong>${esc(f.name)}</strong><div class="muted">${esc(f.source || '')}</div></td>
          <td class="muted">${f.occurredAt ? fmtDate(f.occurredAt) : '—'}</td>
          <td>${f.sizeBytes ? esc(Math.round(f.sizeBytes / 1024)) + ' KB' : '—'}</td>
          <td>${playAttrs ? `<button type="button" class="btn btn-sm" ${playAttrs}>Play</button>
            <button type="button" class="btn btn-sm btn-ghost" data-action="share-video-clip" data-unit="${esc(selId)}" ${f.messageId ? `data-mid="${esc(f.messageId)}"` : ''} ${f.path ? `data-path="${esc(f.path)}" data-storage="${esc(f.storageType || 2)}"` : ''} data-name="${esc(f.name || '')}">Share</button>` : '—'}</td>
        </tr>`;
      }).join('');
      panel = `<div class="card branded-panel">
        <div class="card-header"><h3>Archive files · ${esc(selected.name)}</h3><span class="muted">${files.length}</span></div>
        <div id="surveillance-video-wrap" class="mt-1">
          <video id="surveillance-video" controls playsinline style="width:100%;max-height:320px;background:#111;border-radius:8px"></video>
          <p id="surveillance-stream-msg" class="muted mt-1">Pick a file to play.</p>
        </div>
        ${tableWrap(['File', 'When', 'Size', ''], fileRows, 'No archived clips in the last 30 days')}
      </div>`;
    } else if (tab === 'commands') {
      let cmds = [];
      try {
        const cmdRes = await MamsApi.api(`/client/wialon/units/${encodeURIComponent(selId)}/commands`);
        cmds = cmdRes.commands || [];
      } catch (_) { cmds = []; }
      const videoCmds = cmds.filter((c) => /video|live|stream|playback|camera|qlv|qpb|mdvr/i.test(
        `${c.name || ''} ${c.label || ''} ${c.type || ''}`
      ));
      const show = videoCmds.length ? videoCmds : cmds;
      const cmdRows = show.slice(0, 40).map((c) => `<tr>
        <td><strong>${esc(c.label || c.name)}</strong><div class="muted">${esc(c.name)}</div></td>
        <td class="muted">${esc(c.type || c.linkType || '—')}</td>
        <td><button type="button" class="btn btn-sm" data-action="surv-send-command" data-unit="${esc(selId)}" data-cmd="${esc(c.name)}" data-param="${esc(c.params || c.param || '')}">Send</button></td>
      </tr>`).join('');
      panel = `<div class="card branded-panel">
        <div class="card-header"><h3>Video commands · ${esc(selected.name)}</h3></div>
        ${tableWrap(['Command', 'Type', ''], cmdRows, 'No commands on this unit')}
        <div id="surv-cmd-msg" class="mt-1"></div>
      </div>`;
    } else if (tab === 'events') {
      let events = [];
      try {
        events = await MamsApi.api(`/client/surveillance/violations?limit=80&unitId=${encodeURIComponent(selId)}`);
        if (!Array.isArray(events)) events = events.rows || events.data || [];
      } catch (_) { events = []; }
      const evRows = events.slice(0, 80).map((v) => {
        const title = v.violationType || v.title || v.type || 'Event';
        const clipBtn = v.clip && v.clip.messageId
          ? `<button type="button" class="btn btn-sm" data-action="play-video-file" data-unit="${esc(v.clip.unitId || selId)}" data-mid="${esc(v.clip.messageId)}" data-source="message">Play</button>`
          : (v.videoUrl ? `<a class="btn btn-sm" href="${esc(v.videoUrl)}" target="_blank" rel="noopener">Open</a>` : '—');
        return `<tr>
          <td><strong>${esc(title)}</strong><div class="muted">${esc(v.category || v.source || '')}</div></td>
          <td>${esc(v.unitName || selected.name || '—')}</td>
          <td class="muted">${v.occurredAt ? fmtDate(v.occurredAt) : '—'}</td>
          <td>${clipBtn}</td>
        </tr>`;
      }).join('');
      panel = `<div class="card branded-panel">
        <div class="card-header"><h3>Events · ${esc(selected.name)}</h3></div>
        <div id="surveillance-video-wrap" class="mb-1">
          <video id="surveillance-video" controls playsinline style="width:100%;max-height:280px;background:#111;border-radius:8px"></video>
          <p id="surveillance-stream-msg" class="muted mt-1"></p>
        </div>
        ${tableWrap(['Event', 'Unit', 'When', ''], evRows, 'No video / eco events for this unit')}
      </div>`;
    }

    const listRows = list.map((u) => {
      const id = String(u.wialonId || u.id);
      const cams = (u.cameras || []).length || u.cameraCount || 0;
      return `<tr class="row-clickable ${id === selId ? 'row-selected' : ''}" data-action="surv-select-unit" data-id="${esc(id)}">
        <td><strong>${esc(u.name)}</strong>${u.plate ? `<div class="muted">${esc(u.plate)}</div>` : ''}</td>
        <td>${u.status ? statusBadge(u.status) : (u.connected ? statusBadge('moving') : '—')}</td>
        <td>${cams}</td>
      </tr>`;
    }).join('');

    return `${tabBar}
    <div class="integration-panel mt-1">
      <h3>Surveillance & video</h3>
      <p>${esc(data.message || 'Cameras · Live · Playback · Files · Commands · Events · Reports')}</p>
      <p class="mt-1"><span class="badge badge-brand">Wialon Video</span>
        <span class="badge ${data.live ? 'badge-success' : 'badge-inactive'}">${data.live ? 'Live discovery' : 'Offline'}</span>
        <span class="badge ${data.streaming ? 'badge-success' : 'badge-info'}">${data.streaming ? 'HLS proxy on' : 'Discovery only'}</span>
      </p>
    </div>
    <div class="kpi-grid mt-2">
      ${kpi('Video units', data.count ?? list.length)}
      ${kpi('Source', data.live ? 'Live Wialon' : 'Fallback')}
    </div>
    ${unitPicker}
    <div class="grid-main-side mt-2">
      <div class="card">
        <div class="card-header"><h3>Units</h3><span class="muted">${list.length}</span></div>
        ${tableWrap(['Unit', 'Status', 'Cams'], listRows, 'No camera-capable units')}
      </div>
      <div id="surveillance-player-root">${panel}</div>
    </div>`;
  }

  async function renderSensors() {
    const params = new URLSearchParams(location.search);
    let tab = (params.get('tab') || 'live').toLowerCase();
    if (!['live', 'reports'].includes(tab)) tab = 'live';
    const tabBar = `<div class="tab-bar branded-tabs">
      <a class="tab ${tab === 'live' ? 'active' : ''}" href="/app/sensors?tab=live">Live</a>
      <a class="tab ${tab === 'reports' ? 'active' : ''}" href="/app/sensors?tab=reports">Reports</a>
    </div>`;
    if (tab === 'reports') {
      return tabBar + await moduleReportsHtml('sensors', 'Live reports');
    }

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

    return `${tabBar}<div class="kpi-grid">
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
    const params = new URLSearchParams(location.search);
    let tab = (params.get('tab') || 'trailers').toLowerCase();
    if (!['trailers', 'reports'].includes(tab)) tab = 'trailers';
    const tabBar = `<div class="tab-bar branded-tabs">
      <a class="tab ${tab === 'trailers' ? 'active' : ''}" href="/app/trailers?tab=trailers">Trailers</a>
      <a class="tab ${tab === 'reports' ? 'active' : ''}" href="/app/trailers?tab=reports">Reports</a>
    </div>`;
    if (tab === 'reports') {
      return tabBar + await moduleReportsHtml('trailers', 'Trailers reports');
    }

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

    return `${tabBar}<div class="card">
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
    const [types, catalog, snap] = await Promise.all([
      MamsApi.api('/client/reports/types').catch(() => []),
      MamsApi.api('/client/wialon/reports/catalog').catch(() => ({ templates: [], modules: [] })),
      MamsApi.api('/client/fleet/snapshot').catch(() => ({ units: [] })),
    ]);
    const list = Array.isArray(types) ? types : [];
    const modules = catalog.modules || [];
    const tplList = catalog.templates || [];
    const units = snap.units || [];
    const params = new URLSearchParams(location.search);
    const moduleFilter = params.get('reportModule') || '';
    const filteredTpl = moduleFilter
      ? tplList.filter((t) => t.module === moduleFilter)
      : tplList;

    const options = list.map((t) => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join('');
    const tplOptions = filteredTpl.slice(0, 300).map((t) =>
      `<option value="${esc(t.resourceId)}:${esc(t.id)}">${esc(t.name)} · ${esc(t.module || '')} (${esc(t.resourceName || t.resourceId)})</option>`
    ).join('');
    const unitOptions = units.slice(0, 300).map((u) =>
      `<option value="${esc(u.wialonId || u.id)}">${esc(u.name)}${u.plate ? ' · ' + esc(u.plate) : ''}</option>`
    ).join('');
    const now = Math.floor(Date.now() / 1000);
    const moduleTabs = [
      { id: '', label: `All (${tplList.length})` },
      ...modules.map((m) => ({ id: m.module, label: `${m.module} (${m.count})` })),
    ].map((m) =>
      `<a class="tab ${moduleFilter === m.id ? 'active' : ''}" href="/app/reports?reportModule=${encodeURIComponent(m.id)}">${esc(m.label)}</a>`
    ).join('');

    const liveQuick = [
      { id: 'fleet-status', label: 'Live fleet status' },
      { id: 'fleet-fuel', label: 'Live fuel levels' },
    ].map((r) =>
      `<button type="button" class="btn btn-sm" data-action="live-report" data-id="${esc(r.id)}">${esc(r.label)}</button>`
    ).join(' ');

    return `<div class="kpi-grid">
      ${kpi('Wialon templates', catalog.count ?? tplList.length)}
      ${kpi('Modules', modules.length)}
      ${kpi('Units', units.length)}
      ${kpi('DB report types', list.length)}
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Live snapshot reports</h3><span class="muted">No Wialon exec needed</span></div>
      <div class="actions">${liveQuick}</div>
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Generate DB report</h3></div>
      <form id="report-form" class="form-grid">
        <label><span>Report type</span><select class="select" name="type">${options}</select></label>
        <div class="form-grid-action"><button type="submit" class="btn">Load report</button></div>
      </form>
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Run Wialon template</h3><span class="muted">${filteredTpl.length} shown</span></div>
      <div class="tab-bar">${moduleTabs}</div>
      <form id="wialon-report-form" class="form-grid mt-1">
        <label><span>Template</span><select class="select" name="template" required>${tplOptions || '<option value="">No templates</option>'}</select></label>
        <label><span>Object (unit)</span><select class="select" name="objectId" required>${unitOptions || '<option value="">No units</option>'}</select></label>
        <label><span>Preset</span><select class="select" name="preset" id="report-preset">
          <option value="86400">Last 24h</option>
          <option value="604800">Last 7 days</option>
          <option value="2592000">Last 30 days</option>
          <option value="custom">Custom unix</option>
        </select></label>
        <label><span>From (unix)</span><input class="input" name="from" id="report-from" type="number" value="${now - 86400}" /></label>
        <label><span>To (unix)</span><input class="input" name="to" id="report-to" type="number" value="${now}" /></label>
        <div class="form-grid-action"><button type="submit" class="btn">Execute</button></div>
        <p id="wialon-report-error" class="error" hidden></p>
      </form>
    </div>
    <div class="card mt-2" id="report-result">
      ${emptyState('📄', 'No report loaded', 'Pick a live snapshot, DB type, or Wialon template.')}
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
  let lastFleetFetchedAt = null;

  function formatLiveAge(fetchedAt) {
    if (!fetchedAt) return '';
    const t = typeof fetchedAt === 'number'
      ? (fetchedAt < 1e12 ? fetchedAt * 1000 : fetchedAt)
      : Date.parse(fetchedAt);
    if (!Number.isFinite(t)) return '';
    const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (sec < 5) return 'Live · just now';
    if (sec < 60) return `Live · ${sec}s ago`;
    const m = Math.floor(sec / 60);
    return `Live · ${m}m ago`;
  }

  function updateLiveAge(fetchedAt) {
    if (fetchedAt) lastFleetFetchedAt = fetchedAt;
    const el = document.getElementById('live-age');
    if (!el) return;
    const label = formatLiveAge(lastFleetFetchedAt);
    if (!label) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = label;
  }

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
    if (typeof MamsBranding !== 'undefined') MamsBranding.reset();
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
      const [integrations, snap] = await Promise.all([
        MamsApi.api('/client/integrations/status'),
        MamsApi.api('/client/fleet/snapshot').catch(() => null),
      ]);
      const list = Array.isArray(integrations) ? integrations : [];
      const pill = document.getElementById('status-pill');
      const text = document.getElementById('status-pill-text');
      updateFooter(list);
      if (snap) updateLiveAge(snap.fetchedAt || snap.fetched_at || Date.now());
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
      const view = (new URLSearchParams(location.search).get('view') || 'map').toLowerCase();
      if (view === 'map' || view === 'list') {
        const snap = await MamsApi.api('/client/fleet/snapshot').catch(() => ({ units: [] }));
        if (view === 'map') loadLeaflet(() => initFleetMap(snap.units || []));
      }
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
    if (mod === 'fuel' && document.getElementById('fuel-intel-daily')) {
      const intel = await MamsApi.api('/client/wialon/fuel/intelligence').catch(() => null);
      const daily = ((intel && intel.daily) || []).slice(-14);
      if (daily.length && typeof MamsCharts?.composed === 'function') {
        const p = MamsCharts.palette();
        MamsCharts.composed(
          'fuel-intel-daily',
          daily.map((r) => String(r.date || '')),
          { label: 'Filled (L)', data: daily.map((r) => Number(r.filled) || 0) },
          { label: 'Consumed (L)', data: daily.map((r) => Number(r.consumed) || 0) },
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

    if (action === 'refresh-page') {
      await loadModule();
      return;
    }

    if (action === 'load-monitoring-track') {
      const unitId = document.getElementById('track-unit')?.value;
      const secs = Number(document.getElementById('track-range')?.value || 86400);
      const meta = document.getElementById('track-meta');
      if (!unitId) return;
      btn.disabled = true;
      if (meta) meta.textContent = 'Loading track…';
      try {
        const to = Math.floor(Date.now() / 1000);
        const from = to - (Number.isFinite(secs) ? secs : 86400);
        const data = await MamsApi.api(`/client/wialon/units/${encodeURIComponent(unitId)}/track?from=${from}&to=${to}`);
        const points = data.points || data.track || [];
        if (meta) meta.textContent = `${points.length} points`;
        loadLeaflet(() => {
          const el = document.getElementById('track-map');
          if (!el || typeof L === 'undefined') return;
          if (el._map) { try { el._map.remove(); } catch (_) {} el._map = null; }
          const latlngs = points
            .map((p) => [Number(p.lat ?? p.y), Number(p.lng ?? p.x)])
            .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
          const center = latlngs[0] || [-1.2921, 36.8219];
          const map = L.map(el).setView(center, 12);
          el._map = map;
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
          if (latlngs.length) {
            L.polyline(latlngs, { color: '#004225', weight: 3 }).addTo(map);
            map.fitBounds(latlngs, { padding: [24, 24] });
          }
          setTimeout(() => map.invalidateSize(), 200);
        });
      } catch (ex) {
        if (meta) meta.textContent = ex.message || 'Track failed';
      } finally {
        btn.disabled = false;
      }
      return;
    }

    if (action === 'exec-module-report') {
      const root = document.getElementById('module-report-result');
      const resourceId = Number(btn.dataset.resource || 0);
      const templateId = Number(btn.dataset.template || 0);
      if (!resourceId || !templateId) return;
      const objectSel = document.getElementById('module-report-object');
      const daysSel = document.getElementById('module-report-days');
      const objectId = Number(objectSel?.value || 0);
      const days = Math.max(1, Number(daysSel?.value || 7));
      btn.disabled = true;
      if (root) root.innerHTML = `<div class="banner banner-info">Running ${esc(btn.dataset.name || 'report')}…</div>`;
      try {
        const to = Math.floor(Date.now() / 1000);
        const from = to - 86400 * days;
        const body = { resourceId, templateId, from, to };
        if (objectId > 0) body.objectId = objectId;
        const data = await MamsApi.api('/client/wialon/reports/exec', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        const tables = data.tables || [];
        const charts = data.charts || data.images || [];
        const imgs = charts.map((c) => {
          const src = c.dataUrl || c.url || (c.data && c.data.image) || '';
          if (!src) return '';
          return `<figure class="report-chart"><figcaption class="muted">${esc(c.name || 'Chart')}</figcaption>
            <img src="${esc(src)}" alt="${esc(c.name || 'chart')}" style="max-width:100%;margin:.5rem 0;border-radius:8px" /></figure>`;
        }).join('');
        const tableHtml = tables.slice(0, 3).map((t) => {
          const sample = t.sample || [];
          const headers = Array.isArray(t.header) ? t.header : (sample[0] ? Object.keys(sample[0]).slice(0, 8) : []);
          const headCells = headers.length
            ? headers.map((h) => `<th>${esc(typeof h === 'object' ? (h.n || h.name || JSON.stringify(h)) : h)}</th>`).join('')
            : '<th>Row</th>';
          const bodyRows = sample.slice(0, 25).map((row) => {
            if (Array.isArray(row)) {
              return `<tr>${row.slice(0, 12).map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`;
            }
            if (row && typeof row === 'object') {
              const cells = headers.length
                ? headers.map((h) => {
                    const key = typeof h === 'object' ? (h.n || h.name) : h;
                    return `<td>${esc(row[key] ?? row.c?.[key] ?? '—')}</td>`;
                  }).join('')
                : `<td><pre class="muted">${esc(JSON.stringify(row).slice(0, 200))}</pre></td>`;
              return `<tr>${cells}</tr>`;
            }
            return `<tr><td>${esc(row)}</td></tr>`;
          }).join('');
          return `<div class="mt-1"><h4>${esc(t.name || 'Table')} <span class="muted">(${t.rows || 0} rows)</span></h4>
            <div class="table-wrap"><table><thead><tr>${headCells}</tr></thead><tbody>${bodyRows || '<tr><td class="muted">Empty</td></tr>'}</tbody></table></div></div>`;
        }).join('');
        if (root) {
          root.innerHTML = `<div class="banner banner-success">${esc(tables.length)} tables · ${charts.length} charts</div>${imgs}${tableHtml}`;
        }
        const printAct = document.getElementById('module-report-print-actions');
        if (printAct) printAct.hidden = false;
      } catch (ex) {
        if (root) root.innerHTML = `<div class="banner banner-error">${esc(ex.message || 'Report failed')}</div>`;
      } finally {
        btn.disabled = false;
      }
      return;
    }

    if (action === 'print-module-report') {
      const root = document.getElementById('module-report-result');
      printReportElement(root, 'Module report');
      return;
    }

    if (action === 'surv-select-unit') {
      const p = new URLSearchParams(location.search);
      const tab = p.get('tab') || 'cameras';
      location.href = `/app/surveillance?tab=${encodeURIComponent(tab)}&unitId=${encodeURIComponent(id)}`;
      return;
    }

    if (action === 'surv-request-playback') {
      const unitId = btn.dataset.unit;
      const msg = document.getElementById('surv-playback-msg');
      const fromEl = document.getElementById('surv-pb-from');
      const toEl = document.getElementById('surv-pb-to');
      const camEl = document.getElementById('surv-pb-cam');
      if (!unitId) return;
      btn.disabled = true;
      if (msg) msg.innerHTML = '<div class="banner banner-info">Requesting playback…</div>';
      try {
        const cmdsRes = await MamsApi.api(`/client/wialon/units/${encodeURIComponent(unitId)}/commands`);
        const cmds = cmdsRes.commands || [];
        const pb = cmds.find((c) => /playback|qpb|play.?back|history.?video/i.test(`${c.name || ''} ${c.label || ''}`))
          || cmds.find((c) => /live|stream|qlv|video/i.test(`${c.name || ''} ${c.label || ''}`));
        if (!pb) throw new Error('No playback/live video command on this unit');
        const fromSec = fromEl?.value ? Math.floor(new Date(fromEl.value).getTime() / 1000) : Math.floor(Date.now() / 1000) - 3600;
        const toSec = toEl?.value ? Math.floor(new Date(toEl.value).getTime() / 1000) : Math.floor(Date.now() / 1000);
        const cam = camEl?.value || '1';
        let param = String(pb.params || pb.param || '').trim();
        if (param.includes('{') || param.includes(',')) {
          param = param
            .replace(/\{from\}/gi, String(fromSec))
            .replace(/\{to\}/gi, String(toSec))
            .replace(/\{camera\}/gi, cam);
        } else {
          param = [fromSec, toSec, Number(cam)].join(',');
        }
        await MamsApi.api('/client/wialon/commands', {
          method: 'POST',
          body: JSON.stringify({ unitId: Number(unitId), command: pb.name, param }),
        });
        if (msg) {
          msg.innerHTML = `<div class="banner banner-success">Playback requested (${esc(pb.label || pb.name)}). Check Files in a minute for clips.</div>
            <a class="btn btn-sm mt-1" href="/app/surveillance?tab=files&unitId=${encodeURIComponent(unitId)}">Open Files</a>`;
        }
      } catch (ex) {
        if (msg) msg.innerHTML = `<div class="banner banner-error">${esc(ex.message || 'Playback failed')}</div>`;
      } finally {
        btn.disabled = false;
      }
      return;
    }

    if (action === 'surv-send-command') {
      const unitId = btn.dataset.unit;
      const command = btn.dataset.cmd;
      const msg = document.getElementById('surv-cmd-msg');
      if (!unitId || !command) return;
      btn.disabled = true;
      try {
        await MamsApi.api('/client/wialon/commands', {
          method: 'POST',
          body: JSON.stringify({
            unitId: Number(unitId),
            command,
            param: btn.dataset.param || '',
          }),
        });
        if (msg) msg.innerHTML = `<div class="banner banner-success">Sent ${esc(command)}</div>`;
      } catch (ex) {
        if (msg) msg.innerHTML = `<div class="banner banner-error">${esc(ex.message || 'Command failed')}</div>`;
      } finally {
        btn.disabled = false;
      }
      return;
    }

    if (action === 'ack-alerts-bulk') {
      const ids = String(btn.dataset.ids || '').split(',').filter(Boolean);
      btn.disabled = true;
      try {
        await MamsApi.api('/client/alerts/acknowledge-bulk', {
          method: 'POST',
          body: JSON.stringify(ids.length ? { ids } : {}),
        });
        await loadModule();
      } catch (ex) {
        alert(ex.message || 'Bulk acknowledge failed');
        btn.disabled = false;
      }
      return;
    }

    if (action === 'alerts-sync') {
      btn.disabled = true;
      try {
        const res = await MamsApi.api('/client/alerts/sync', { method: 'POST', body: '{}' });
        alert(`Synced · inserted ${res.inserted ?? 0}`);
        await loadModule();
      } catch (ex) {
        alert(ex.message || 'Sync failed');
        btn.disabled = false;
      }
      return;
    }

    if (action === 'fuel-analytics-warm') {
      btn.disabled = true;
      try {
        await MamsApi.api('/client/wialon/fuel/analytics/warm', { method: 'POST', body: '{}' });
        await loadModule();
      } catch (ex) {
        alert(ex.message || 'Warm failed');
        btn.disabled = false;
      }
      return;
    }

    if (action === 'open-fuel-unit') {
      const root = document.getElementById('fuel-report-msg') || document.getElementById('surveillance-player-root');
      const wrap = document.createElement('div');
      wrap.className = 'card mt-2 branded-panel';
      wrap.id = 'fuel-unit-detail';
      wrap.innerHTML = `<div class="card-header"><h3>${esc(btn.dataset.name || id)}</h3></div><p class="muted">Loading level series…</p>`;
      const host = document.querySelector('.tab-bar')?.parentElement || document.getElementById('module-content');
      const existing = document.getElementById('fuel-unit-detail');
      if (existing) existing.remove();
      (host || document.body).appendChild(wrap);
      try {
        const to = Math.floor(Date.now() / 1000);
        const from = to - 7 * 86400;
        const series = await MamsApi.api(`/client/wialon/fuel/level-series?unitId=${encodeURIComponent(id)}&from=${from}&to=${to}`).catch(() => ({ points: [] }));
        const analytics = await MamsApi.api(`/client/wialon/fuel/analytics?period=30&unitId=${encodeURIComponent(id)}`).catch(() => null);
        const pts = series.points || series.series || [];
        wrap.innerHTML = `<div class="card-header"><h3>${esc(btn.dataset.name || id)}</h3>
          <button type="button" class="btn btn-sm" data-action="fuel-level-series" data-id="${esc(id)}" data-name="${esc(btn.dataset.name || '')}">Refresh series</button></div>
          <div class="kpi-grid">
            ${kpi('Filled', (analytics?.kpis?.totalFilled ?? '—') + ' L')}
            ${kpi('Consumed', (analytics?.kpis?.totalConsumed ?? '—') + ' L')}
            ${kpi('Points', pts.length)}
          </div>
          <p class="muted mt-1">${pts.length ? 'Level series loaded — open Monitoring unit for map.' : 'No level series in range.'}</p>
          <div id="fuel-unit-series-root"></div>`;
      } catch (ex) {
        wrap.innerHTML = `<div class="banner banner-error">${esc(ex.message || 'Failed')}</div>`;
      }
      return;
    }

    if (action === 'share-video-clip') {
      const unitId = btn.dataset.unit;
      const mid = btn.dataset.mid;
      const path = btn.dataset.path;
      btn.disabled = true;
      try {
        const body = mid
          ? { unitId: Number(unitId), source: 'message', messageId: Number(mid), label: btn.dataset.name || 'Clip' }
          : { unitId: Number(unitId), source: 'storage', path, storageType: Number(btn.dataset.storage || 2), label: btn.dataset.name || 'Clip' };
        const link = await MamsApi.api('/client/surveillance/clips/share', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        const url = link.shareUrl || '';
        if (url && navigator.clipboard) {
          try { await navigator.clipboard.writeText(url); } catch (_) {}
        }
        alert(url ? `Share link copied:\n${url}` : 'Share link created');
      } catch (ex) {
        alert(ex.message || 'Share failed');
      } finally {
        btn.disabled = false;
      }
      return;
    }

    if (action === 'open-unit') {
      const root = document.getElementById('unit-detail-root');
      if (!root) return;
      root.innerHTML = `<div class="card mt-2 branded-panel">${typeof loader === 'function' ? loader() : 'Loading…'}</div>`;
      try {
        const detail = await MamsApi.api(`/client/wialon/units/${encodeURIComponent(id)}`);
        const u = detail.unit || {};
        const h = detail.health || {};
        const uid = u.wialonId || u.id || id;
        const sensors = detail.sensors || [];
        const cmds = detail.commands || [];
        const tanks = detail.tanks || [];
        const sensRows = sensors.slice(0, 40).map((s) => {
          const val = s.value != null ? s.value : (s.val != null ? s.val : (s.m != null ? s.m : '—'));
          return `<tr><td>${esc(s.name || s.n || '—')}</td><td>${esc(s.type || s.t || '—')}</td><td>${esc(typeof val === 'object' ? JSON.stringify(val) : val)}</td></tr>`;
        }).join('');
        const tankRows = tanks.map((t) => `<tr>
          <td>${esc(t.name || 'Tank')}</td>
          <td>${t.percent != null ? esc(Math.round(t.percent)) + '%' : '—'}</td>
          <td>${t.liters != null ? esc(t.liters) + ' L' : '—'}</td>
        </tr>`).join('');
        const cmdBtns = cmds.slice(0, 12).map((c) => {
          const name = c.name || c.n || '';
          const dangerous = /block|lock|engine_stop|immobil/i.test(name);
          return `<button type="button" class="btn btn-sm ${dangerous ? 'btn-ghost' : ''}" data-action="send-command" data-unit="${esc(uid)}" data-name="${esc(u.name || '')}" data-cmd="${esc(name)}">${esc(c.label || name)}</button>`;
        }).join(' ');
        root.innerHTML = `<div class="card mt-2 branded-panel">
          <div class="card-header">
            <h3>${esc(u.name || 'Unit')}</h3>
            <div class="actions">
              <button type="button" class="btn btn-sm" data-action="load-unit-track" data-id="${esc(uid)}">Load 24h track</button>
              <button type="button" class="btn btn-sm" data-action="load-unit-trips" data-id="${esc(uid)}">Load 24h trips</button>
              <button type="button" class="btn btn-sm btn-ghost" data-action="close-unit-detail">Close</button>
            </div>
          </div>
          <p class="muted">${esc(detail.address || (u.position ? `${Number(u.position.lat).toFixed(5)}, ${Number(u.position.lng).toFixed(5)}` : 'No position'))}</p>
          <div class="settings-grid">
            <div><span class="muted">Status</span><div>${statusBadge(u.status)}</div></div>
            <div><span class="muted">Plate</span><div>${esc(u.plate || '—')}</div></div>
            <div><span class="muted">Fuel</span><div>${h.fuelLevel != null ? esc(Math.round(h.fuelLevel)) + '%' : '—'}${h.fuelLiters != null ? ' · ' + esc(h.fuelLiters) + ' L' : ''}</div></div>
            <div><span class="muted">Mileage</span><div>${h.mileage != null ? esc(Math.round(h.mileage)).toLocaleString() + ' km' : '—'}</div></div>
            <div><span class="muted">Battery</span><div>${h.battery != null ? esc(Math.round(h.battery)) + '%' : '—'}</div></div>
            <div><span class="muted">Voltage</span><div>${h.voltage != null ? esc(Math.round(h.voltage * 10) / 10) + ' V' : '—'}</div></div>
            <div><span class="muted">Engine hours</span><div>${h.engineHours != null ? esc(Math.round(h.engineHours)) : '—'}</div></div>
            <div><span class="muted">Speed</span><div>${u.position ? Number(u.position.speed || 0).toFixed(0) + ' km/h' : '—'}</div></div>
          </div>
          ${tanks.length ? `<div class="mt-1"><h4>Fuel tanks</h4>${tableWrap(['Tank', '%', 'Liters'], tankRows, '')}</div>` : ''}
          <div class="mt-1"><h4>Commands</h4><div class="actions" style="flex-wrap:wrap;gap:6px">${cmdBtns || '<span class="muted">No commands on unit</span>'}</div></div>
          <div class="mt-1"><h4>Sensors</h4>${tableWrap(['Sensor', 'Type', 'Value'], sensRows, 'No live sensors')}</div>
          <div id="unit-track-map" class="map-panel mt-1" style="min-height:220px">Track map idle — click Load 24h track</div>
          <div id="unit-trips-root" class="mt-1 muted">Trips idle — click Load 24h trips</div>
        </div>`;
      } catch (ex) {
        root.innerHTML = `<div class="banner banner-error mt-2">${esc(ex.message || 'Unit detail unavailable (live fleet required)')}</div>`;
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
      if (/block|lock|engine_stop|immobil/i.test(cmd) && !confirm(`Send "${cmd}" to this unit?`)) return;
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

    if (action === 'load-unit-commands') {
      const unitId = btn.dataset.unit;
      if (!unitId) return;
      const row = document.getElementById('cmd-catalog-' + unitId);
      if (!row) return;
      btn.disabled = true;
      row.hidden = false;
      row.querySelector('td').innerHTML = typeof loader === 'function' ? loader() : 'Loading…';
      try {
        const data = await MamsApi.api(`/client/wialon/units/${encodeURIComponent(unitId)}/commands`);
        const cmds = data.commands || [];
        if (!cmds.length) {
          row.querySelector('td').innerHTML = `<span class="muted">${esc(data.error || 'No commands configured on this unit')}</span>
            <div class="actions mt-1">
              <button type="button" class="btn btn-sm" data-action="send-command" data-unit="${esc(unitId)}" data-asset="${esc(btn.dataset.asset || '')}" data-name="${esc(btn.dataset.name || '')}" data-cmd="query_pos">Query pos</button>
            </div>`;
        } else {
          const buttons = cmds.slice(0, 40).map((c) => {
            const name = c.name || c.label;
            const dangerous = /block|lock|engine_stop|immobil|cut|output/i.test(name);
            return `<button type="button" class="btn btn-sm ${dangerous ? 'btn-ghost' : ''}" data-action="send-command" data-unit="${esc(unitId)}" data-asset="${esc(btn.dataset.asset || '')}" data-name="${esc(btn.dataset.name || '')}" data-cmd="${esc(name)}" title="${esc(c.linkType || '')}">${esc(c.label || name)}</button>`;
          }).join(' ');
          row.querySelector('td').innerHTML = `<div class="muted mb-1">${cmds.length} commands from Wialon</div><div class="actions" style="flex-wrap:wrap;gap:6px">${buttons}</div>`;
        }
      } catch (ex) {
        row.querySelector('td').innerHTML = `<span class="error">${esc(ex.message || 'Failed to load commands')}</span>`;
      } finally {
        btn.disabled = false;
      }
      return;
    }

    if (action === 'live-report') {
      const reportId = btn.dataset.id;
      const resultEl = document.getElementById('report-result');
      if (!resultEl) return;
      resultEl.innerHTML = typeof loader === 'function' ? loader() : 'Loading…';
      try {
        const snap = await MamsApi.api('/client/fleet/snapshot');
        const units = snap.units || [];
        let cols;
        let body;
        if (reportId === 'fleet-fuel') {
          const fuel = await MamsApi.api('/client/wialon/fuel/live').catch(() => ({ units: [] }));
          const fuelUnits = fuel.units?.length ? fuel.units : units;
          cols = ['Asset', 'Type', 'Status', 'Fuel %', 'Liters', 'Mileage', 'Battery'];
          body = fuelUnits.map((u) => `<tr>
              <td><strong>${esc(u.name || u.unitName)}</strong></td>
              <td>${esc(u.assetType || '—')}</td>
              <td>${statusBadge(u.status)}</td>
              <td>${(u.fuelPercent ?? u.fuelLevel) != null ? esc(Math.round(u.fuelPercent ?? u.fuelLevel)) + '%' : '—'}</td>
              <td>${u.fuelLiters != null ? esc(u.fuelLiters) + ' L' : '—'}</td>
              <td>${u.mileage != null ? esc(Math.round(u.mileage)).toLocaleString() + ' km' : '—'}</td>
              <td>${u.battery != null ? esc(Math.round(u.battery)) + '%' : '—'}</td>
            </tr>`).join('');
          resultEl.innerHTML = `<div class="card-header"><h3>Live fuel levels</h3><span class="muted">${fuelUnits.length} units · ${fuel.live || snap.live ? 'Live' : 'Cached'}</span></div>${tableWrap(cols, body, 'No units')}`;
          return;
        } else {
          cols = ['Asset', 'Status', 'Speed', 'Fuel %', 'Position', 'Updated'];
          body = units.map((u) => `<tr>
            <td><strong>${esc(u.name)}</strong>${u.plate ? `<div class="muted">${esc(u.plate)}</div>` : ''}</td>
            <td>${statusBadge(u.status)}</td>
            <td>${u.position ? Number(u.position.speed || 0).toFixed(0) + ' km/h' : '—'}</td>
            <td>${u.fuelLevel != null ? esc(Math.round(u.fuelLevel)) + '%' : '—'}</td>
            <td class="muted">${u.position ? `${Number(u.position.lat).toFixed(4)}, ${Number(u.position.lng).toFixed(4)}` : '—'}</td>
            <td class="muted">${u.position ? fmtDate(u.position.time) : '—'}</td>
          </tr>`).join('');
        }
        resultEl.innerHTML = `<div class="card-header"><h3>${esc(reportId)}</h3><span class="muted">${units.length} units · ${snap.live ? 'Live' : 'Cached'}</span></div>${tableWrap(cols, body, 'No units')}`;
      } catch (ex) {
        resultEl.innerHTML = `<div class="banner banner-error">${esc(ex.message || 'Live report failed')}</div>`;
      }
      return;
    }

    if (action === 'fuel-unit-report') {
      const unitId = btn.dataset.unit;
      if (!unitId) return;
      const msg = document.getElementById('fuel-report-msg');
      btn.disabled = true;
      if (msg) msg.innerHTML = `<div class="banner banner-info">Pulling Wialon fuel report for ${esc(btn.dataset.name || unitId)}…</div>`;
      try {
        const data = await MamsApi.api('/client/wialon/fuel/unit-report', {
          method: 'POST',
          body: JSON.stringify({
            unitId: Number(unitId),
            from: Math.floor(Date.now() / 1000) - 86400 * 7,
            to: Math.floor(Date.now() / 1000),
            persist: true,
          }),
        });
        if (msg) {
          msg.innerHTML = `<div class="banner banner-success">Parsed ${esc(data.count || 0)} rows · inserted ${esc(data.inserted || 0)} · template ${esc(data.templateId)}</div>`;
        }
      } catch (ex) {
        if (msg) msg.innerHTML = `<div class="banner banner-error">${esc(ex.message || 'Unit report failed')}</div>`;
      } finally {
        btn.disabled = false;
      }
      return;
    }

    if (action === 'fuel-harvest') {
      const msg = document.getElementById('fuel-report-msg');
      btn.disabled = true;
      if (msg) msg.innerHTML = `<div class="banner banner-info">Harvesting fuel reports for up to 20 units — this can take a few minutes…</div>`;
      try {
        const data = await MamsApi.api('/client/wialon/fuel/harvest', {
          method: 'POST',
          body: JSON.stringify({
            from: Math.floor(Date.now() / 1000) - 86400 * 7,
            to: Math.floor(Date.now() / 1000),
            persist: true,
            cap: 20,
          }),
        });
        if (msg) {
          msg.innerHTML = `<div class="banner banner-success">Harvest done · ${esc(data.ok)}/${esc(data.attempted)} ok · inserted ${esc(data.inserted)} · failed ${esc(data.failed)}</div>`;
        }
      } catch (ex) {
        if (msg) msg.innerHTML = `<div class="banner banner-error">${esc(ex.message || 'Harvest failed')}</div>`;
      } finally {
        btn.disabled = false;
      }
      return;
    }

    if (action === 'load-fuel-series') {
      const unitEl = document.getElementById('fuel-series-unit');
      const rangeEl = document.getElementById('fuel-series-range');
      const root = document.getElementById('fuel-series-root');
      if (!unitEl || !root) return;
      const unitId = unitEl.value;
      if (!unitId) return;
      const secs = Number(rangeEl?.value || 604800);
      const to = Math.floor(Date.now() / 1000);
      const from = to - (Number.isFinite(secs) ? secs : 604800);
      btn.disabled = true;
      root.innerHTML = typeof loader === 'function' ? loader() : 'Loading…';
      try {
        const data = await MamsApi.api(`/client/wialon/fuel/level-series?unitId=${encodeURIComponent(unitId)}&from=${from}&to=${to}`);
        const points = data.points || [];
        const eventRows = points.filter((p) => p.event === 'refill' || p.event === 'drain').slice(-40).map((p) => `<tr>
          <td>${fmtDate(p.t * 1000)}</td>
          <td><span class="badge ${p.event === 'refill' ? 'badge-success' : 'badge-danger'}">${esc(p.event)}</span></td>
          <td>${esc(p.processed ?? p.liters)} L</td>
          <td>${esc(p.delta)} L</td>
        </tr>`).join('');
        root.innerHTML = `<div class="kpi-grid">
          ${kpi('Points', data.pointCount ?? points.length)}
          ${kpi('Refills', data.fillCount ?? 0)}
          ${kpi('Drains', data.drainCount ?? 0)}
          ${kpi('Unit', data.unitName || unitId)}
        </div>
        <div class="chart-box mt-1" style="height:220px"><canvas id="fuel-level-series-chart"></canvas></div>
        <div class="mt-1">${tableWrap(['When', 'Event', 'Level', 'Delta'], eventRows, 'No refill/drain markers in range')}</div>`;
        if (points.length && typeof MamsCharts?.line === 'function') {
          const step = Math.max(1, Math.ceil(points.length / 120));
          const sampled = points.filter((_, i) => i % step === 0 || points[i].event !== 'level');
          MamsCharts.line(
            'fuel-level-series-chart',
            sampled.map((p) => fmtDate(p.t * 1000)),
            [{ label: 'Fuel (L)', data: sampled.map((p) => Number(p.processed ?? p.liters) || 0) }],
          );
        } else if (points.length && typeof MamsCharts?.composed === 'function') {
          const step = Math.max(1, Math.ceil(points.length / 120));
          const sampled = points.filter((_, i) => i % step === 0);
          const p = MamsCharts.palette();
          MamsCharts.composed(
            'fuel-level-series-chart',
            sampled.map((pt) => ''),
            { label: 'Fuel (L)', data: sampled.map((pt) => Number(pt.processed ?? pt.liters) || 0) },
            { label: '', data: [] },
            { bar: p.primary, line: p.accent },
          );
        }
      } catch (ex) {
        root.innerHTML = `<div class="banner banner-error">${esc(ex.message || 'Level series failed')}</div>`;
      } finally {
        btn.disabled = false;
      }
      return;
    }

    if (action === 'open-surveillance-unit') {
      const root = document.getElementById('surveillance-player-root');
      if (!root) return;
      root.innerHTML = `<div class="card-header"><h3>${esc(btn.dataset.name || id)}</h3></div>${typeof loader === 'function' ? loader() : 'Loading…'}`;
      try {
        const [detail, filesRes] = await Promise.all([
          MamsApi.api(`/client/surveillance/units/${encodeURIComponent(id)}`),
          MamsApi.api(`/client/surveillance/units/${encodeURIComponent(id)}/files`).catch(() => ({ files: [] })),
        ]);
        const cams = detail.cameras || detail.allCameras || [];
        const files = filesRes.files || [];
        const camBtns = cams.map((c) =>
          `<button type="button" class="btn btn-sm" data-action="start-live-stream" data-unit="${esc(detail.id || id)}" data-channel="${esc(c.channel)}" data-name="${esc(detail.name || '')}">Go Live · ${esc(c.name || ('Cam ' + c.channel))}</button>`
        ).join(' ');
        const fileRows = files.slice(0, 40).map((f) => {
          const playAttrs = f.source === 'message' && f.messageId
            ? `data-action="play-video-file" data-unit="${esc(detail.id || id)}" data-mid="${esc(f.messageId)}" data-source="message"`
            : f.path
              ? `data-action="play-video-file" data-unit="${esc(detail.id || id)}" data-path="${esc(f.path)}" data-storage="${esc(f.storageType || 2)}" data-source="storage"`
              : '';
          return `<tr>
            <td><strong>${esc(f.name)}</strong><div class="muted">${esc(f.source || '')}</div></td>
            <td class="muted">${f.occurredAt ? fmtDate(f.occurredAt) : '—'}</td>
            <td>${f.sizeBytes ? esc(Math.round(f.sizeBytes / 1024)) + ' KB' : '—'}</td>
            <td>${playAttrs ? `<button type="button" class="btn btn-sm" ${playAttrs}>Play</button>
            <button type="button" class="btn btn-sm btn-ghost" data-action="share-video-clip" data-unit="${esc(selId)}" ${f.messageId ? `data-mid="${esc(f.messageId)}"` : ''} ${f.path ? `data-path="${esc(f.path)}" data-storage="${esc(f.storageType || 2)}"` : ''} data-name="${esc(f.name || '')}">Share</button>` : '—'}</td>
          </tr>`;
        }).join('');
        root.innerHTML = `<div class="card-header"><h3>${esc(detail.name || id)}</h3><span class="muted">${cams.length} cameras · ${files.length} files</span></div>
          <div class="actions" style="flex-wrap:wrap;gap:6px">${camBtns || '<span class="muted">No cameras</span>'}</div>
          <div id="surveillance-video-wrap" class="mt-1">
            <video id="surveillance-video" controls playsinline style="width:100%;max-height:360px;background:#111;border-radius:8px"></video>
            <p id="surveillance-stream-msg" class="muted mt-1">Pick a camera for live, or a file below for archive playback.</p>
          </div>
          <div class="mt-1">
            <div class="card-header"><h3>Archive files</h3></div>
            ${tableWrap(['File', 'When', 'Size', ''], fileRows, 'No archived clips in the last 30 days')}
          </div>`;
      } catch (ex) {
        root.innerHTML = `<div class="banner banner-error">${esc(ex.message || 'Unit detail failed')}</div>`;
      }
      return;
    }

    if (action === 'play-video-file') {
      const video = document.getElementById('surveillance-video');
      const msg = document.getElementById('surveillance-stream-msg');
      const unitId = btn.dataset.unit;
      if (!video || !unitId) return;
      let url = '';
      if (btn.dataset.source === 'message' && btn.dataset.mid) {
        url = `/api/client/surveillance/units/${encodeURIComponent(unitId)}/messages/${encodeURIComponent(btn.dataset.mid)}/file`;
      } else if (btn.dataset.path) {
        url = `/api/client/surveillance/units/${encodeURIComponent(unitId)}/files/stream?path=${encodeURIComponent(btn.dataset.path)}&storageType=${encodeURIComponent(btn.dataset.storage || '2')}`;
      }
      if (!url) return;
      btn.disabled = true;
      if (msg) msg.textContent = 'Loading archive clip…';
      try {
        // Fetch with auth then blob URL (video tag alone may miss Authorization)
        const token = localStorage.getItem('ufp_token') || '';
        const res = await fetch(url, {
          credentials: 'same-origin',
          headers: token ? { Authorization: 'Bearer ' + token } : {},
        });
        if (!res.ok) throw new Error('Failed to load clip (' + res.status + ')');
        const blob = await res.blob();
        if (video._objectUrl) URL.revokeObjectURL(video._objectUrl);
        video._objectUrl = URL.createObjectURL(blob);
        if (video._hls) {
          try { video._hls.destroy(); } catch (_) {}
          video._hls = null;
        }
        video.src = video._objectUrl;
        await video.play().catch(() => {});
        if (msg) msg.textContent = 'Playing archive clip';
      } catch (ex) {
        if (msg) msg.textContent = ex.message || 'Clip playback failed';
      } finally {
        btn.disabled = false;
      }
      return;
    }

    if (action === 'start-live-stream') {
      const unitId = btn.dataset.unit;
      const channel = btn.dataset.channel || '1';
      const msg = document.getElementById('surveillance-stream-msg');
      const video = document.getElementById('surveillance-video');
      if (!unitId || !video) return;
      btn.disabled = true;
      if (msg) msg.textContent = 'Starting live stream…';
      try {
        const data = await MamsApi.api(
          `/client/surveillance/units/${encodeURIComponent(unitId)}/cameras/${encodeURIComponent(channel)}/live/start`,
          { method: 'POST', body: '{}' }
        );
        const url = data.playbackUrl;
        if (!url) throw new Error('No playback URL returned');
        if (msg) msg.textContent = `${data.streamType || 'stream'} · channel ${data.channel}`;
        await attachHlsPlayer(video, url);
      } catch (ex) {
        if (msg) msg.textContent = ex.message || 'Failed to start live stream';
      } finally {
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

  content.addEventListener('change', (e) => {
    const el = e.target;
    if (el && el.id === 'report-preset') {
      const secs = Number(el.value);
      const fromEl = document.getElementById('report-from');
      const toEl = document.getElementById('report-to');
      if (!fromEl || !toEl || !Number.isFinite(secs) || secs <= 0) return;
      const now = Math.floor(Date.now() / 1000);
      toEl.value = String(now);
      fromEl.value = String(now - secs);
    }
    if (el && el.id === 'surv-unit-select') {
      const p = new URLSearchParams(location.search);
      const tab = p.get('tab') || 'cameras';
      const unitId = el.value;
      if (!unitId) return;
      location.href = `/app/surveillance?tab=${encodeURIComponent(tab)}&unitId=${encodeURIComponent(unitId)}`;
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
            assetCategory: fd.get('assetCategory') || 'vehicle',
            totalCost: fd.get('totalCost') ? Number(fd.get('totalCost')) : undefined,
          }),
        });
        form.reset();
        await loadModule();
      } catch (ex) {
        if (errEl) { errEl.textContent = ex.message || 'Failed to save maintenance'; errEl.hidden = false; }
      }
      return;
    }

    if (form.id === 'inspection-form') {
      e.preventDefault();
      const fd = new FormData(form);
      const errEl = document.getElementById('inspection-error');
      if (errEl) errEl.hidden = true;
      const bySection = {};
      form.querySelectorAll('input[type="checkbox"][data-item]').forEach((cb) => {
        const sid = cb.dataset.section || 'main';
        if (!bySection[sid]) bySection[sid] = { id: sid, title: sid, items: [] };
        bySection[sid].items.push({
          name: cb.dataset.item,
          status: cb.checked ? 'ok' : 'unchecked',
        });
      });
      form.querySelectorAll('.checklist-section').forEach((secEl, i) => {
        const title = secEl.querySelector('h4')?.textContent || '';
        const sid = Object.keys(bySection)[i];
        if (sid && bySection[sid] && title) bySection[sid].title = title;
      });
      try {
        await MamsApi.api('/client/workshop/inspections', {
          method: 'POST',
          body: JSON.stringify({
            vehicleName: fd.get('vehicleName'),
            vehiclePlate: fd.get('vehiclePlate') || '',
            inspectorName: fd.get('inspectorName') || '',
            overallStatus: fd.get('overallStatus') || 'pass',
            notes: fd.get('notes') || '',
            assetCategory: fd.get('assetCategory') || form.dataset.category || 'vehicle',
            engineHours: fd.get('engineHours') ? Number(fd.get('engineHours')) : null,
            odometerReading: fd.get('odometerReading') ? Number(fd.get('odometerReading')) : 0,
            checklistSections: Object.values(bySection),
          }),
        });
        form.reset();
        await loadModule();
      } catch (ex) {
        if (errEl) { errEl.textContent = ex.message || 'Failed to save inspection'; errEl.hidden = false; }
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
      alertsPollId = setInterval(refreshAlertsBell, 20000);
      statusPollId = setInterval(() => {
        refreshStatusPill();
        updateLiveAge();
      }, 8000);

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
