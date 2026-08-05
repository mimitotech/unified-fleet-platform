<section class="hero">
  <div class="hero-left">
    <div class="brand-row">
      <img src="/assets/img/mams-logo.png" alt="MAMS" onerror="this.src='/assets/img/mams-logo.svg'" />
      <strong>MAMS</strong>
    </div>
    <h2 style="font-size:2rem;margin:0;max-width:18ch;line-height:1.15">Mimito Asset Management System</h2>
    <p style="max-width:36ch;opacity:.9">Unified fleet, fuel, workshop and telematics — now running natively on Apache + PHP.</p>
  </div>
  <div class="hero-right">
    <div class="login-card card">
      <h1>Sign in</h1>
      <p class="muted">Use your MAMS account</p>
      <form id="login-form" class="form-stack">
        <label>
          <span class="muted">Email</span>
          <input class="input" type="email" name="email" required autocomplete="username" />
        </label>
        <label>
          <span class="muted">Password</span>
          <input class="input" type="password" name="password" required autocomplete="current-password" />
        </label>
        <p id="login-error" class="error" hidden></p>
        <button class="btn" type="submit" style="width:100%">Sign in</button>
      </form>
      <p class="muted" style="margin-top:1rem;font-size:.85rem"><a href="/">Back to home</a></p>
    </div>
  </div>
</section>
<script src="/assets/js/auth.js"></script>
