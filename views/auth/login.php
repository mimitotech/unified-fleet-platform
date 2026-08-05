<section class="hero">
  <div class="hero-left">
    <div class="brand-row">
      <img src="/assets/img/mams-logo.png" alt="MAMS" onerror="this.src='/assets/img/mams-logo.svg'" />
      <strong>MAMS</strong>
    </div>
    <h2 style="font-size:clamp(1.75rem,3vw,2.25rem);max-width:18ch">Mimito Asset Management System</h2>
    <p class="hero-tagline">Unified fleet tracking, fuel intelligence, workshop management and telematics — powered by your live data on Apache + PHP.</p>
    <ul style="margin:0;padding-left:1.25rem;opacity:0.85;font-size:0.9375rem;line-height:1.8">
      <li>Real-time fleet monitoring & alerts</li>
      <li>Fuel, workshop & driver modules</li>
      <li>Wialon, LocoNav & multi-source integrations</li>
    </ul>
  </div>
  <div class="hero-right">
    <div class="login-card card">
      <h1>Sign in</h1>
      <p class="muted">Use your MAMS account credentials</p>
      <form id="login-form" class="form-stack">
        <label>
          <span class="muted">Email address</span>
          <input class="input" type="email" name="email" required autocomplete="username" placeholder="you@company.com" />
        </label>
        <label>
          <span class="muted">Password</span>
          <input class="input" type="password" name="password" required autocomplete="current-password" placeholder="••••••••" />
        </label>
        <p id="login-error" class="error" hidden></p>
        <button class="btn" type="submit" style="width:100%">Sign in</button>
      </form>
      <p class="muted" style="margin-top:1rem;font-size:0.85rem;text-align:center"><a href="/">← Back to home</a></p>
      <div class="trust-logos" id="trust-logos" hidden></div>
    </div>
  </div>
</section>
<script src="/assets/js/api.js"></script>
<script src="/assets/js/auth.js"></script>
