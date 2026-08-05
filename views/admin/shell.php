<div class="app-shell" id="app-shell">
  <div class="sidebar-overlay" id="sidebar-overlay"></div>
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-brand">
      <div class="brand-row">
        <img src="/assets/img/mams-logo.png" alt="MAMS" onerror="this.src='/assets/img/mams-logo.svg'" />
        <div>
          <div class="tenant-name">MAMS Admin</div>
          <div class="tenant-sub">Platform console</div>
        </div>
      </div>
    </div>
    <nav class="sidebar-nav" id="admin-nav">
      <a href="/admin/dashboard" data-mod="dashboard"><span class="nav-icon">◉</span> Dashboard</a>
      <a href="/admin/tenants" data-mod="tenants"><span class="nav-icon">🏢</span> Clients</a>
      <a href="/admin/users" data-mod="users"><span class="nav-icon">👥</span> Client Users</a>
      <a href="/admin/system-users" data-mod="system-users" id="nav-system-users"><span class="nav-icon">🛡</span> System Users</a>
      <a href="/admin/system" data-mod="system"><span class="nav-icon">⚙</span> System</a>
      <a href="/admin/marketplace" data-mod="marketplace"><span class="nav-icon">🔌</span> Integrations</a>
      <a href="/admin/wialon" data-mod="wialon"><span class="nav-icon">🛰</span> Wialon Center</a>
      <a href="/admin/loconav" data-mod="loconav"><span class="nav-icon">🧭</span> LocoNav Center</a>
      <a href="/admin/tracksolid" data-mod="tracksolid"><span class="nav-icon">📡</span> TrackSolid Center</a>
      <a href="/admin/support" data-mod="support"><span class="nav-icon">💬</span> Support</a>
      <a href="/admin/account" data-mod="account"><span class="nav-icon">👤</span> My Account</a>
    </nav>
    <div class="sidebar-footer sidebar-footer-powered">MAMS Platform Admin</div>
  </aside>
  <div class="main-col">
    <header class="topbar">
      <div class="topbar-left">
        <button class="menu-toggle" id="menu-toggle" aria-label="Open menu">☰</button>
        <div>
          <h1 id="page-title">Dashboard</h1>
          <p class="topbar-sub" id="page-sub">Platform overview</p>
        </div>
      </div>
      <div class="topbar-right">
        <div class="user-menu">
          <button type="button" class="user-chip-btn" id="user-menu-trigger"></button>
          <div class="dropdown-panel dropdown-panel-right" id="user-dropdown" hidden>
            <div class="dropdown-user-info" id="user-dropdown-info"></div>
            <button type="button" class="dropdown-item" id="logout-btn">↩ Sign out</button>
          </div>
        </div>
      </div>
    </header>
    <div class="main-content" id="admin-content">
      <div class="page-loader"><div class="spinner"></div>Loading…</div>
    </div>
  </div>
</div>
<script src="/assets/js/api.js?v=20260805e"></script>
<script src="/assets/js/admin.js?v=20260805e"></script>
