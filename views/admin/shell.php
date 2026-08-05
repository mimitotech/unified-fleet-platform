<div class="app-shell admin-app" id="app-shell">
  <div class="sidebar-overlay" id="sidebar-overlay"></div>
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-brand">
      <div class="brand-row">
        <img src="/assets/img/mams-logo.png" alt="MAMS" onerror="this.src='/assets/img/mams-logo.svg'" />
        <div class="sidebar-brand-text">
          <div class="tenant-name">MAMS Admin</div>
          <div class="tenant-sub">Platform console</div>
        </div>
      </div>
    </div>
    <div class="admin-nav-filter" id="admin-nav-filter-wrap">
      <input class="input admin-nav-search" id="admin-nav-search" type="search" placeholder="Filter navigation…" aria-label="Filter navigation" />
    </div>
    <nav class="sidebar-nav" id="admin-nav" aria-label="Admin navigation">
      <!-- filled by admin.js -->
    </nav>
    <div class="sidebar-footer sidebar-footer-powered">
      <span class="health-dot" id="admin-footer-health"></span>
      <span>MAMS Platform Admin</span>
    </div>
  </aside>
  <div class="main-col">
    <header class="topbar topbar-admin">
      <div class="topbar-left">
        <button class="menu-toggle" id="menu-toggle" aria-label="Open menu"></button>
        <div>
          <h1 id="page-title">Dashboard</h1>
          <p class="topbar-sub" id="page-sub">Real-time platform analytics</p>
        </div>
      </div>
      <div class="topbar-right">
        <span class="status-pill" id="admin-live-pill" hidden>
          <span class="status-dot ok"></span><span>Live</span>
        </span>
        <button type="button" class="icon-btn" id="refresh-btn" title="Refresh" aria-label="Refresh"></button>
        <div class="user-menu">
          <button type="button" class="user-chip-btn" id="user-menu-trigger"></button>
          <div class="dropdown-panel dropdown-panel-right" id="user-dropdown" hidden>
            <div class="dropdown-user-info" id="user-dropdown-info"></div>
            <button type="button" class="dropdown-item" id="logout-btn">Sign out</button>
          </div>
        </div>
      </div>
    </header>
    <div class="main-content" id="admin-content">
      <div class="page-loader"><div class="spinner"></div>Loading…</div>
    </div>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<script src="/assets/js/api.js?v=20260805p"></script>
  <script src="/assets/js/icons.js?v=20260805p"></script>
  <script src="/assets/js/branding.js?v=20260805p"></script>
  <script src="/assets/js/charts.js?v=20260805p"></script>
  <script src="/assets/js/admin.js?v=20260805p"></script>
