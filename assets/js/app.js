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
    dashboard: { title: 'Dashboard', subtitle: 'Fleet overview & KPIs', icon: '◉' },
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

  /* ── Module renderers ── */
  async function renderDashboard() {
    const [kpis, snap] = await Promise.all([
      MamsApi.api('/client/dashboard/kpis'),
      MamsApi.api('/client/fleet/snapshot').catch(() => ({ units: [] })),
    ]);
    const units = snap.units || [];
    const rows = units.slice(0, 20).map((u) => `<tr>
      <td><strong>${esc(u.name)}</strong>${u.plate ? `<br><span class="muted">${esc(u.plate)}</span>` : ''}</td>
      <td>${statusBadge(u.status)}</td>
      <td>${u.position ? `${Number(u.position.speed || 0).toFixed(0)} km/h` : '—'}</td>
      <td>${u.fuelLevel != null ? esc(Math.round(u.fuelLevel)) + '%' : '—'}</td>
      <td class="muted">${u.position ? fmtDate(u.position.time * 1000) : '—'}</td>
    </tr>`).join('');

    return `<div class="kpi-grid">
      ${kpi('Total assets', kpis.totalVehicles ?? 0)}
      ${kpi('Moving', kpis.moving ?? 0)}
      ${kpi('Idle', kpis.idle ?? 0)}
      ${kpi('Offline', kpis.offline ?? 0)}
      ${kpi('Open alerts', kpis.unacknowledgedAlerts ?? 0, kpis.criticalAlerts ? kpis.criticalAlerts + ' critical' : '')}
      ${kpi('Drivers', kpis.totalDrivers ?? 0, (kpis.activeDrivers ?? 0) + ' active')}
      ${kpi('Fuel tx (30d)', kpis.fuelTransactions30d ?? 0)}
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Fleet snapshot</h3><span class="muted">${units.length} units</span></div>
      ${tableWrap(['Asset', 'Status', 'Speed', 'Fuel', 'Updated'], rows, 'No fleet units')}
    </div>`;
  }

  async function renderMonitoring() {
    const snap = await MamsApi.api('/client/fleet/snapshot');
    const units = snap.units || [];
    const counts = snap.counts || {};
    const rows = units.map((u) => `<tr data-lat="${u.position?.lat ?? ''}" data-lng="${u.position?.lng ?? ''}" data-name="${esc(u.name)}">
      <td><strong>${esc(u.name)}</strong></td>
      <td>${esc(u.plate || '—')}</td>
      <td>${statusBadge(u.status)}</td>
      <td>${u.position ? `${Number(u.position.lat).toFixed(5)}, ${Number(u.position.lng).toFixed(5)}` : '—'}</td>
      <td>${u.position ? Number(u.position.speed || 0).toFixed(0) + ' km/h' : '—'}</td>
    </tr>`).join('');

    return `<div class="kpi-grid">
      ${kpi('Total', counts.total ?? units.length)}
      ${kpi('Moving', counts.moving ?? 0)}
      ${kpi('Idle', counts.idle ?? 0)}
      ${kpi('With GPS', counts.withPosition ?? 0)}
    </div>
    <div class="grid-main-side mt-1">
      <div class="card card-flat">
        <div class="card-header"><h3>Live map</h3><span class="badge badge-brand">${snap.live ? 'Live' : 'Cached'}</span></div>
        <div id="fleet-map" class="map-panel"></div>
      </div>
      <div class="card card-flat">
        <div class="card-header"><h3>Fleet list</h3></div>
        ${tableWrap(['Name', 'Plate', 'Status', 'Position', 'Speed'], rows, 'No units with telemetry')}
      </div>
    </div>`;
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
    const [data, monthly] = await Promise.all([
      MamsApi.api('/client/fuel/transactions').catch(() => ({ transactions: [], kpis: {} })),
      MamsApi.api('/client/fuel/monthly-trend').catch(() => []),
    ]);
    const txs = data.transactions || (Array.isArray(data) ? data : []);
    const kpis = data.kpis || {};
    const trend = Array.isArray(monthly) ? monthly : [];

    const rows = txs.slice(0, 100).map((t) => `<tr>
      <td>${fmtDate(t.timestamp ? t.timestamp * 1000 : t.date)}</td>
      <td>${esc(t.unitName || t.assetName || '—')}</td>
      <td>${esc(t.section || '—')}</td>
      <td>${t.filled ? esc(t.filled) + ' L filled' : (t.fuelUsed ? esc(t.fuelUsed) + ' L used' : '—')}</td>
      <td>${esc(t.location || '—')}</td>
    </tr>`).join('');

    const trendRows = trend.slice(-6).map((m) => `<tr>
      <td>${esc(m.month)}</td>
      <td>${esc(m.filled)} L</td>
      <td>${esc(m.consumed)} L</td>
    </tr>`).join('');

    const banner = txs.length > 0
      ? `<div class="banner banner-info">Showing ${txs.length} fuel transactions for ${esc(data.from || '')} – ${esc(data.to || '')}.</div>`
      : integrationBanner('Wialon fuel reports');

    return `${banner}
    <div class="kpi-grid">
      ${kpi('Filled', (kpis.totalFilled ?? 0) + ' L')}
      ${kpi('Consumed', (kpis.totalConsumed ?? 0) + ' L')}
      ${kpi('Avg L/100km', kpis.avgConsumptionL100km ?? 0)}
      ${kpi('Transactions', kpis.transactionCount ?? txs.length)}
    </div>
    <div class="grid-main-side mt-2">
      <div class="card">
        <div class="card-header"><h3>Fuel transactions</h3></div>
        ${tableWrap(['Date', 'Asset', 'Type', 'Volume', 'Location'], rows, 'No fuel transactions yet')}
      </div>
      <div class="card">
        <div class="card-header"><h3>Monthly trend</h3></div>
        ${tableWrap(['Month', 'Filled', 'Consumed'], trendRows, 'No trend data yet')}
      </div>
    </div>`;
  }

  async function renderWorkshop() {
    const [kpis, inspections, maintenance, breakdowns] = await Promise.all([
      MamsApi.api('/client/workshop/kpis').catch(() => ({})),
      MamsApi.api('/client/workshop/inspections').catch(() => []),
      MamsApi.api('/client/workshop/maintenance').catch(() => []),
      MamsApi.api('/client/workshop/breakdowns').catch(() => []),
    ]);
    const insp = Array.isArray(inspections) ? inspections : [];
    const maint = Array.isArray(maintenance) ? maintenance : [];
    const brk = Array.isArray(breakdowns) ? breakdowns : [];
    return `<div class="kpi-grid">
      ${kpi('Pending maintenance', kpis.pendingMaintenance ?? 0)}
      ${kpi('Completed this month', kpis.completedThisMonth ?? 0)}
      ${kpi('Open breakdowns', kpis.openBreakdowns ?? 0)}
      ${kpi('Inspections', insp.length)}
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
    <div class="card mt-2">
      <div class="card-header"><h3>Maintenance logs</h3></div>
      ${tableWrap(['Asset', 'Type', 'Status', 'When'], maint.slice(0, 40).map((m) => `<tr>
        <td>${esc(m.vehicleName || m.assetName || m.vehiclePlate || m.assetId || '—')}</td>
        <td>${esc(m.maintenanceType || m.type || m.title || '—')}</td>
        <td>${statusBadge(m.status || '—')}</td>
        <td class="muted">${fmtDate(m.startDate || m.scheduledAt || m.createdAt)}</td>
      </tr>`).join(''), 'No maintenance logs')}
    </div>`;
  }

  async function renderAlerts() {
    const alerts = await MamsApi.api('/client/alerts');
    const list = Array.isArray(alerts) ? alerts : alerts.alerts || [];
    const rows = list.slice(0, 100).map((a) => `<tr>
      <td>${severityBadge(a.severity)}</td>
      <td>${esc(a.type)}</td>
      <td><strong>${esc(a.title)}</strong>${a.description ? `<br><span class="muted">${esc(a.description)}</span>` : ''}</td>
      <td>${a.acknowledged ? '<span class="badge badge-success">Ack</span>' : '<span class="badge badge-warning">Open</span>'}</td>
      <td class="muted">${fmtDate(a.timestamp || a.occurredAt)}</td>
      <td>${a.acknowledged ? '—' : `<button class="btn btn-sm" data-action="ack-alert" data-id="${esc(a.id)}">Acknowledge</button>`}</td>
    </tr>`).join('');

    const open = list.filter((a) => !a.acknowledged).length;
    return `<div class="kpi-grid">
      ${kpi('Total', list.length)}
      ${kpi('Open', open)}
      ${kpi('Acknowledged', list.length - open)}
    </div>
    <div class="card mt-2">
      ${tableWrap(['Severity', 'Type', 'Message', 'Status', 'When', 'Actions'], rows, 'No alerts')}
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
    const [routes, stats, trips] = await Promise.all([
      MamsApi.api('/client/routes').catch(() => []),
      MamsApi.api('/client/routes/stats').catch(() => ({})),
      MamsApi.api('/client/routes/trips').catch(() => []),
    ]);
    const list = Array.isArray(routes) ? routes : routes.items || [];
    const rows = list.map((r) => `<tr>
      <td><strong>${esc(r.name || r.id)}</strong></td>
      <td>${esc(r.assetName || '—')}</td>
      <td>${esc(r.driverName || '—')}</td>
      <td>${statusBadge(r.status || 'scheduled')}</td>
      <td class="muted">${fmtDate(r.startTime)}</td>
      <td>${r.distance != null ? esc(r.distance) + ' km' : '—'}</td>
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
      ${kpi('Completed', stats.completed ?? 0)}
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Routes</h3></div>
      ${tableWrap(['Route', 'Asset', 'Driver', 'Status', 'Start', 'Distance'], rows, 'No routes configured')}
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Recent trips</h3></div>
      ${tableWrap(['Unit', 'Departure', 'Arrival', 'Mileage'], tripRows, 'No trips recorded')}
    </div>`;
  }

  async function renderGeofencing() {
    const geofences = await MamsApi.api('/client/geofences').catch(() => []);
    const list = Array.isArray(geofences) ? geofences : geofences.items || [];
    const rows = list.map((g) => `<tr>
      <td><strong>${esc(g.name || g.id)}</strong></td>
      <td>${esc(g.type || 'circle')}</td>
      <td>${g.isActive !== false ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-inactive">Inactive</span>'}</td>
      <td class="muted">${fmtDate(g.createdAt)}</td>
      <td><button class="btn btn-sm btn-ghost" data-action="delete-geofence" data-id="${esc(g.id)}">Delete</button></td>
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
      <div class="card-header"><h3>Geofences</h3><span class="muted">${list.length} zones</span></div>
      ${tableWrap(['Name', 'Type', 'Status', 'Created', 'Actions'], rows, 'No geofences defined')}
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
    const [assets, history] = await Promise.all([
      MamsApi.api('/client/assets').catch(() => []),
      MamsApi.api('/client/commands/history').catch(() => []),
    ]);
    const list = Array.isArray(assets) ? assets : assets.assets || [];
    const hist = Array.isArray(history) ? history : [];
    const rows = list.slice(0, 50).map((a) => `<tr>
      <td><strong>${esc(a.name)}</strong></td>
      <td>${esc(a.registrationPlate || '—')}</td>
      <td>${(a.sources || []).map((s) => esc(s.type || s)).join(', ') || '—'}</td>
      <td><button class="btn btn-sm btn-ghost" disabled>Send command</button></td>
    </tr>`).join('');
    const histRows = hist.slice(0, 40).map((h) => `<tr>
      <td>${esc(h.command || h.type || '—')}</td>
      <td>${esc(h.assetName || h.assetId || '—')}</td>
      <td>${statusBadge(h.status || '—')}</td>
      <td class="muted">${fmtDate(h.createdAt || h.sentAt)}</td>
    </tr>`).join('');

    return `<div class="banner banner-warn">Remote commands require an active Wialon integration with appropriate permissions.</div>
    <div class="card">
      ${tableWrap(['Asset', 'Plate', 'Sources', 'Actions'], rows, 'No command-capable assets')}
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
    const rows = units.map((u) => `<tr>
      <td><strong>${esc(u.name)}</strong></td>
      <td>${u.fuelLevel != null ? esc(Math.round(u.fuelLevel)) + '%' : '—'}</td>
      <td>${u.position ? Number(u.position.speed || 0).toFixed(0) + ' km/h' : '—'}</td>
      <td>${statusBadge(u.status)}</td>
    </tr>`).join('');

    return `<div class="card">
      <div class="card-header"><h3>Sensor readings</h3><span class="muted">From latest fleet snapshot</span></div>
      ${tableWrap(['Asset', 'Fuel level', 'Speed', 'Status'], rows, 'No sensor data')}
    </div>`;
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
    </div>`;
  }

  async function renderReports() {
    const types = await MamsApi.api('/client/reports/types').catch(() => []);
    const list = Array.isArray(types) ? types : [];
    const options = list.map((t) => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join('');

    return `<div class="card">
      <div class="card-header"><h3>Generate report</h3></div>
      <form id="report-form" class="form-grid">
        <label><span>Report type</span><select class="select" name="type">${options}</select></label>
        <div class="form-grid-action"><button type="submit" class="btn">Load report</button></div>
      </form>
    </div>
    <div class="card mt-2" id="report-result">
      ${emptyState('📄', 'No report loaded', 'Choose a report type above and click Load report.')}
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

  function setUserChip(user) {
    const chip = document.getElementById('user-chip');
    if (!chip) return;
    const initials = (user.fullName || user.email || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    chip.innerHTML = `<div class="user-chip"><div class="user-avatar">${esc(initials)}</div><span>${esc(user.fullName || user.email)}</span></div>`;
  }

  /* ── Post-render module hook + event delegation ── */
  async function loadModule() {
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

    if (mod === 'monitoring') {
      const snap = await MamsApi.api('/client/fleet/snapshot').catch(() => ({ units: [] }));
      loadLeaflet(() => initFleetMap(snap.units || []));
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

  async function boot() {
    if (!MamsApi.getToken()) {
      location.href = '/auth/login';
      return;
    }

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

      setUserChip(user);

      try {
        const tenant = await MamsApi.api('/client/tenant');
        const el = document.getElementById('tenant-name');
        if (el && tenant?.name) el.textContent = tenant.name;
        if (tenant?.logoUrl) {
          const logo = document.getElementById('tenant-logo');
          if (logo) { logo.src = tenant.logoUrl; logo.hidden = false; }
        }
      } catch (_) {}

      await loadModule();
    } catch (e) {
      if (e.status === 401) return;
      content.innerHTML = `<div class="banner banner-error">${esc(e.message || 'Failed to load')}</div>`;
    }
  }

  boot();
})();
