<div class="app-shell" id="app-shell">
  <div class="sidebar-overlay" id="sidebar-overlay"></div>
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-brand">
      <div class="brand-row">
        <img src="/assets/img/mams-logo.png" alt="MAMS" id="tenant-logo" onerror="this.src='/assets/img/mams-logo.svg'" />
        <div>
          <div class="tenant-name" id="tenant-name">MAMS</div>
          <div class="tenant-sub">Client portal</div>
        </div>
      </div>
    </div>
    <nav class="sidebar-nav" id="client-nav">
      <div class="nav-section">
        <div class="nav-section-label">Overview</div>
        <a href="/app/dashboard" data-mod="dashboard"><span class="nav-icon">◉</span> Dashboard</a>
        <a href="/app/monitoring" data-mod="monitoring"><span class="nav-icon">◎</span> Monitoring</a>
        <a href="/app/alerts" data-mod="alerts"><span class="nav-icon">🔔</span> Alerts</a>
      </div>
      <div class="nav-section">
        <div class="nav-section-label">Operations</div>
        <a href="/app/fuel" data-mod="fuel"><span class="nav-icon">⛽</span> Fuel</a>
        <a href="/app/workshop" data-mod="workshop"><span class="nav-icon">🔧</span> Workshop</a>
        <a href="/app/drivers" data-mod="drivers"><span class="nav-icon">👤</span> Drivers</a>
        <a href="/app/routes" data-mod="routes"><span class="nav-icon">🛣</span> Routes</a>
        <a href="/app/trailers" data-mod="trailers"><span class="nav-icon">🚛</span> Trailers</a>
      </div>
      <div class="nav-section">
        <div class="nav-section-label">Intelligence</div>
        <a href="/app/geofencing" data-mod="geofencing"><span class="nav-icon">📍</span> Geofencing</a>
        <a href="/app/emissions" data-mod="emissions"><span class="nav-icon">🌿</span> Emissions</a>
        <a href="/app/sensors" data-mod="sensors"><span class="nav-icon">📊</span> Sensors</a>
        <a href="/app/surveillance" data-mod="surveillance"><span class="nav-icon">📹</span> Surveillance</a>
        <a href="/app/commands" data-mod="commands"><span class="nav-icon">⌘</span> Commands</a>
      </div>
      <div class="nav-section">
        <div class="nav-section-label">Account</div>
        <a href="/app/reports" data-mod="reports"><span class="nav-icon">📄</span> Reports</a>
        <a href="/app/users" data-mod="users"><span class="nav-icon">👥</span> Users</a>
        <a href="/app/settings" data-mod="settings"><span class="nav-icon">⚙</span> Settings</a>
      </div>
    </nav>
    <div class="sidebar-footer">
      <button class="btn btn-ghost" id="logout-btn" style="color:#fff;border-color:rgba(255,255,255,0.25)">Sign out</button>
    </div>
  </aside>
  <div class="main-col">
    <header class="topbar">
      <div style="display:flex;align-items:center;gap:0.75rem">
        <button class="menu-toggle" id="menu-toggle" aria-label="Open menu">☰</button>
        <div>
          <h1 id="page-title">Dashboard</h1>
          <p class="topbar-sub" id="page-sub">Live overview</p>
        </div>
      </div>
      <div class="topbar-right">
        <div id="user-chip"></div>
      </div>
    </header>
    <div class="main-content" id="app-content">
      <div class="page-loader"><div class="spinner"></div>Loading…</div>
    </div>
  </div>
</div>
<script src="/assets/js/api.js"></script>
<script src="/assets/js/app.js"></script>
