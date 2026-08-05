<div class="app-shell">
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
      <div class="nav-section">
        <div class="nav-section-label">Platform</div>
        <a href="/admin/dashboard" data-mod="dashboard"><span class="nav-icon">◉</span> Dashboard</a>
        <a href="/admin/tenants" data-mod="tenants"><span class="nav-icon">🏢</span> Clients</a>
        <a href="/admin/users" data-mod="users"><span class="nav-icon">👥</span> Client users</a>
        <a href="/admin/system-users" data-mod="system-users"><span class="nav-icon">🛡</span> System users</a>
        <a href="/admin/system" data-mod="system"><span class="nav-icon">⚙</span> System</a>
      </div>
      <div class="nav-section">
        <div class="nav-section-label">Integrations</div>
        <a href="/admin/marketplace" data-mod="marketplace"><span class="nav-icon">🔌</span> Marketplace</a>
        <a href="/admin/wialon" data-mod="wialon"><span class="nav-icon">🛰</span> Wialon</a>
        <a href="/admin/loconav" data-mod="loconav"><span class="nav-icon">🧭</span> LocoNav</a>
        <a href="/admin/tracksolid" data-mod="tracksolid"><span class="nav-icon">📡</span> TrackSolid</a>
      </div>
      <div class="nav-section">
        <div class="nav-section-label">Support</div>
        <a href="/admin/support" data-mod="support"><span class="nav-icon">💬</span> Support</a>
        <a href="/admin/account" data-mod="account"><span class="nav-icon">👤</span> My account</a>
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
          <h1 id="page-title">Admin</h1>
          <p class="topbar-sub" id="page-sub">Platform overview</p>
        </div>
      </div>
      <div class="topbar-right">
        <div id="user-chip"></div>
      </div>
    </header>
    <div class="main-content" id="admin-content">
      <div class="page-loader"><div class="spinner"></div>Loading…</div>
    </div>
  </div>
</div>
<script src="/assets/js/api.js"></script>
<script src="/assets/js/admin.js"></script>
