<div class="app-shell">
  <aside class="sidebar">
    <div class="brand-row" style="margin-bottom:1.25rem">
      <img src="/assets/img/mams-logo.png" alt="" style="height:32px;filter:brightness(10)" />
      <strong>MAMS Admin</strong>
    </div>
    <nav>
      <a href="/admin/dashboard">Dashboard</a>
      <a href="/admin/tenants">Clients</a>
      <a href="/admin/users">Client users</a>
      <a href="/admin/system">System</a>
    </nav>
    <p style="margin-top:2rem"><button class="btn-ghost btn" id="logout-btn" style="color:#fff;border-color:#3d6b54">Sign out</button></p>
  </aside>
  <main class="main">
    <div class="topbar">
      <h1 id="page-title" style="margin:0;font-size:1.35rem;color:var(--brand)">Admin</h1>
      <div id="user-chip" class="muted"></div>
    </div>
    <div id="admin-content"><p class="muted">Loading…</p></div>
  </main>
</div>
<script src="/assets/js/admin.js"></script>
