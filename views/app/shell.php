<div class="app-shell" id="app-shell">
  <aside class="sidebar">
    <div class="brand-row" style="margin-bottom:1.25rem">
      <img src="/assets/img/mams-logo.png" alt="" style="height:32px;filter:brightness(10)" />
      <div>
        <strong id="tenant-name">MAMS</strong>
        <div class="muted" style="color:#9cbcac;font-size:.75rem">Client</div>
      </div>
    </div>
    <nav id="client-nav">
      <a href="/app/dashboard" data-mod="dashboard">Dashboard</a>
      <a href="/app/monitoring" data-mod="monitoring">Monitoring</a>
      <a href="/app/fuel" data-mod="fuel">Fuel</a>
      <a href="/app/workshop" data-mod="workshop">Workshop</a>
      <a href="/app/alerts" data-mod="alerts">Alerts</a>
      <a href="/app/drivers" data-mod="drivers">Drivers</a>
      <a href="/app/routes" data-mod="routes">Routes</a>
      <a href="/app/geofencing" data-mod="geofencing">Geofencing</a>
      <a href="/app/settings" data-mod="settings">Settings</a>
    </nav>
    <p style="margin-top:2rem"><button class="btn-ghost btn" id="logout-btn" style="color:#fff;border-color:#3d6b54">Sign out</button></p>
  </aside>
  <main class="main">
    <div class="topbar">
      <div>
        <h1 id="page-title" style="margin:0;font-size:1.35rem;color:var(--brand)">Dashboard</h1>
        <p class="muted" id="page-sub" style="margin:.2rem 0 0">Live overview</p>
      </div>
      <div class="muted" id="user-chip"></div>
    </div>
    <div id="app-content"><p class="muted">Loading…</p></div>
  </main>
</div>
<script src="/assets/js/app.js"></script>
