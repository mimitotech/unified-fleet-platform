<div class="app-shell tenant-app" id="app-shell">
  <div class="sidebar-overlay" id="sidebar-overlay"></div>
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-brand">
      <div class="brand-row">
        <img src="/assets/img/mams-logo.png" alt="MAMS" id="tenant-logo" onerror="this.src='/assets/img/mams-logo.svg'" />
        <div>
          <div class="tenant-name" id="tenant-name">MAMS</div>
          <div class="tenant-sub" id="tenant-slug"></div>
        </div>
      </div>
    </div>
    <nav class="sidebar-nav" id="client-nav">
      <a href="/app/dashboard" data-mod="dashboard"><span class="nav-icon">◉</span> Dashboard</a>
      <a href="/app/monitoring" data-mod="monitoring"><span class="nav-icon">◎</span> Monitoring</a>
      <a href="/app/surveillance" data-mod="surveillance"><span class="nav-icon">📹</span> Surveillance</a>
      <a href="/app/drivers" data-mod="drivers"><span class="nav-icon">👤</span> Drivers</a>
      <a href="/app/routes" data-mod="routes"><span class="nav-icon">🛣</span> Routes</a>
      <a href="/app/fuel" data-mod="fuel"><span class="nav-icon">⛽</span> Fuel</a>
      <a href="/app/emissions" data-mod="emissions"><span class="nav-icon">🌿</span> Emissions</a>
      <a href="/app/workshop" data-mod="workshop"><span class="nav-icon">🔧</span> Workshop</a>
      <a href="/app/alerts" data-mod="alerts"><span class="nav-icon">🔔</span> Alerts</a>
      <a href="/app/trailers" data-mod="trailers"><span class="nav-icon">🚛</span> Trailers</a>
      <a href="/app/sensors" data-mod="sensors"><span class="nav-icon">📊</span> Sensors</a>
      <a href="/app/geofencing" data-mod="geofencing"><span class="nav-icon">📍</span> Geofencing</a>
      <a href="/app/commands" data-mod="commands"><span class="nav-icon">⌘</span> Commands</a>
      <a href="/app/settings" data-mod="settings" class="nav-settings-link"><span class="nav-icon">⚙</span> Settings</a>
    </nav>
    <div class="sidebar-footer sidebar-footer-powered">Powered by MAMS</div>
  </aside>
  <div class="main-col">
    <header class="topbar">
      <div class="topbar-left">
        <button class="menu-toggle" id="menu-toggle" aria-label="Open menu">☰</button>
        <img class="topbar-logo" src="/assets/img/mams-logo.png" alt="MAMS" onerror="this.src='/assets/img/mams-logo.svg'" />
        <div class="topbar-titles">
          <p class="topbar-brand" id="topbar-tenant-name">MAMS</p>
          <div class="topbar-page">
            <span id="page-title">Dashboard</span><span id="page-sub-wrap"> · <span id="page-sub">Live overview</span></span>
          </div>
        </div>
      </div>
      <div class="topbar-right">
        <span class="status-pill" id="status-pill" hidden>
          <span class="status-dot" id="status-dot"></span><span id="status-pill-text">Live</span>
        </span>
        <button type="button" class="icon-btn" id="refresh-btn" title="Refresh" aria-label="Refresh">⟳</button>
        <div class="bell-wrap">
          <button type="button" class="icon-btn" id="alerts-bell" aria-label="Alerts">
            🔔<span class="bell-badge" id="bell-badge" hidden>0</span>
          </button>
          <div class="dropdown-panel" id="alerts-dropdown" hidden>
            <div class="dropdown-head"><strong>Alerts</strong><a href="/app/alerts">View all</a></div>
            <div class="dropdown-body" id="alerts-dropdown-body"></div>
          </div>
        </div>
        <div class="user-menu">
          <button type="button" class="user-chip-btn" id="user-menu-trigger"></button>
          <div class="dropdown-panel dropdown-panel-right" id="user-dropdown" hidden>
            <div class="dropdown-user-info" id="user-dropdown-info"></div>
            <a href="/app/settings" class="dropdown-item">⚙ Settings</a>
            <button type="button" class="dropdown-item" id="logout-btn">↩ Sign out</button>
          </div>
        </div>
      </div>
    </header>
    <div class="main-content" id="app-content">
      <div class="page-loader"><div class="spinner"></div>Loading…</div>
    </div>
  </div>
</div>
<script src="/assets/js/api.js?v=20260805e"></script>
<script src="/assets/js/app.js?v=20260805e"></script>
