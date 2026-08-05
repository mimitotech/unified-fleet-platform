<div class="app-shell tenant-app" id="app-shell">
  <div class="sidebar-overlay" id="sidebar-overlay"></div>
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-brand">
      <div class="brand-row">
        <img src="/assets/img/mams-logo.png" alt="MAMS" id="tenant-logo" onerror="this.src='/assets/img/mams-logo.svg'" />
        <div class="sidebar-brand-text">
          <div class="tenant-name" id="tenant-name">MAMS</div>
          <div class="tenant-sub" id="tenant-slug"></div>
        </div>
      </div>
    </div>
    <nav class="sidebar-nav" id="client-nav" aria-label="Client modules">
      <!-- filled by app.js from /client/modules -->
    </nav>
    <div class="sidebar-footer sidebar-footer-powered" id="sidebar-powered">Powered by MAMS</div>
  </aside>
  <div class="main-col">
    <header class="topbar">
      <div class="topbar-left">
        <button class="menu-toggle" id="menu-toggle" aria-label="Open menu"></button>
        <img class="topbar-logo" id="topbar-logo" src="/assets/img/mams-logo.png" alt="MAMS" onerror="this.src='/assets/img/mams-logo.svg'" />
        <div class="topbar-titles">
          <p class="topbar-brand" id="topbar-tenant-name">MAMS</p>
          <div class="topbar-page">
            <span id="page-title">Dashboard</span><span id="page-sub-wrap"> · <span id="page-sub">Live operational picture across your enabled modules</span></span>
          </div>
        </div>
      </div>
      <div class="topbar-right">
        <span class="status-pill" id="status-pill" hidden>
          <span class="status-dot" id="status-dot"></span><span id="status-pill-text">Live</span>
        </span>
        <button type="button" class="icon-btn" id="refresh-btn" title="Refresh" aria-label="Refresh"></button>
        <div class="bell-wrap">
          <button type="button" class="icon-btn" id="alerts-bell" aria-label="Alerts">
            <span id="alerts-bell-icon"></span><span class="bell-badge" id="bell-badge" hidden>0</span>
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
            <a href="/app/settings" class="dropdown-item" id="user-settings-link">Settings</a>
            <button type="button" class="dropdown-item" id="logout-btn">Sign out</button>
          </div>
        </div>
      </div>
    </header>
    <div class="main-content" id="app-content">
      <div class="page-loader"><div class="spinner"></div>Loading…</div>
    </div>
    <footer class="app-footer" id="app-footer" hidden>
      <span id="app-footer-tenant"></span>
      <span class="app-footer-status" id="app-footer-status"></span>
    </footer>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<script src="/assets/js/api.js?v=20260805s"></script>
  <script src="/assets/js/icons.js?v=20260805s"></script>
  <script src="/assets/js/branding.js?v=20260805s"></script>
  <script src="/assets/js/charts.js?v=20260805s"></script>
  <script src="/assets/js/app.js?v=20260805s"></script>
