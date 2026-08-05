<div class="login-page">
  <div class="login-split">
    <section class="login-media" id="login-media" aria-label="Feature slides">
      <div class="login-slides" id="login-slides">
        <div class="login-slide is-active">
          <img src="/assets/img/gps.jpg" alt="" draggable="false" onerror="this.src='/assets/img/gp1.png'" />
        </div>
      </div>
      <div class="login-dots" id="login-dots" hidden></div>
    </section>

    <div class="login-divider" aria-hidden="true"></div>

    <aside class="login-form-col">
      <div class="login-fleet-backdrop" aria-hidden="true">
        <div class="login-fleet-backdrop__base"></div>
        <div class="login-fleet-backdrop__grid"></div>
        <div class="login-fleet-backdrop__scan"></div>
        <div class="login-fleet-backdrop__radar"><div class="login-fleet-backdrop__radar-sweep"></div></div>
        <svg class="login-fleet-backdrop__svg" viewBox="0 0 400 640" preserveAspectRatio="xMidYMid slice">
          <path class="login-fleet-backdrop__route-b" d="M40 520 C90 480, 70 400, 130 360 S220 300, 200 240 S140 160, 210 120 S320 90, 360 40" />
          <path class="login-fleet-backdrop__route-a" d="M20 580 C80 540, 110 470, 160 430 S250 390, 280 320 S260 240, 310 190 S370 140, 390 80" />
          <path class="login-fleet-backdrop__route-b" d="M60 80 C120 140, 90 200, 150 250 S260 280, 240 360 S180 430, 230 490 S320 540, 350 600" />
        </svg>
        <div class="login-fleet-backdrop__pin" style="left:18%;top:22%"><span class="login-fleet-backdrop__pin-ring"></span><span class="login-fleet-backdrop__pin-core"></span></div>
        <div class="login-fleet-backdrop__pin" style="left:72%;top:38%;animation-delay:.6s"><span class="login-fleet-backdrop__pin-ring" style="animation-delay:.6s"></span><span class="login-fleet-backdrop__pin-core" style="animation-delay:.6s"></span></div>
        <div class="login-fleet-backdrop__pin" style="left:42%;top:68%;animation-delay:1.2s"><span class="login-fleet-backdrop__pin-ring" style="animation-delay:1.2s"></span><span class="login-fleet-backdrop__pin-core" style="animation-delay:1.2s"></span></div>
        <div class="login-fleet-backdrop__orbit"></div>
      </div>

      <div class="login-form-wrap">
        <div class="login-card-panel">
          <div class="login-card-head">
            <img src="/assets/img/mams-logo.png" alt="MAMS" onerror="this.src='/assets/img/mams-logo.svg'" />
            <h1>MAMS</h1>
            <p id="login-subtitle">Mimito Asset Management System</p>
          </div>

          <div class="login-card-body">
            <form id="login-form" class="login-fields" data-view="login">
              <label>
                <span>Email</span>
                <input class="input" type="email" name="email" required autocomplete="username" placeholder="you@company.com" autofocus />
              </label>
              <label>
                <div class="label-row">
                  <span>Password</span>
                  <button type="button" class="link-btn" id="forgot-open">Forgot password?</button>
                </div>
                <div class="password-field">
                  <input class="input" type="password" name="password" required autocomplete="current-password" placeholder="Your password" />
                  <button type="button" class="password-toggle" aria-label="Show password" data-target="password">
                    <svg class="icon-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                    <svg class="icon-eye-off" hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                  </button>
                </div>
              </label>
              <p id="login-error" class="error" hidden></p>
              <button class="btn login-submit" type="submit">Sign In</button>
              <div class="or-sep"><span>or</span></div>
              <a class="btn-wialon" href="https://hosting.wialon.com" target="_blank" rel="noopener noreferrer">Open Wialon Hosting</a>
            </form>

            <form id="forgot-form" class="login-fields" hidden>
              <p class="muted small">Enter the email on your account. If it exists, you can set a new password.</p>
              <label>
                <span>Email</span>
                <input class="input" type="email" name="email" required autocomplete="username" placeholder="you@company.com" />
              </label>
              <p id="forgot-error" class="error" hidden></p>
              <button class="btn login-submit" type="submit">Continue</button>
              <button type="button" class="link-btn center" id="forgot-back">← Back to sign in</button>
            </form>

            <form id="reset-form" class="login-fields" hidden>
              <p class="muted small">Resetting for <strong id="reset-email-label"></strong></p>
              <input type="hidden" name="token" id="reset-token" />
              <label>
                <span>New password</span>
                <div class="password-field">
                  <input class="input" type="password" name="newPassword" required minlength="8" autocomplete="new-password" placeholder="At least 8 characters" />
                  <button type="button" class="password-toggle" aria-label="Show password">
                    <svg class="icon-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                    <svg class="icon-eye-off" hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                  </button>
                </div>
              </label>
              <label>
                <span>Confirm password</span>
                <div class="password-field">
                  <input class="input" type="password" name="confirmPassword" required minlength="8" autocomplete="new-password" placeholder="Confirm new password" />
                  <button type="button" class="password-toggle" aria-label="Show password">
                    <svg class="icon-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                    <svg class="icon-eye-off" hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                  </button>
                </div>
              </label>
              <p id="reset-error" class="error" hidden></p>
              <button class="btn login-submit" type="submit">Save new password</button>
              <button type="button" class="link-btn center" id="reset-back">← Back to sign in</button>
            </form>

            <div class="login-legal">
              <a href="/terms-of-use">Terms of Use</a>
              <span>·</span>
              <a href="/privacy-policy">Privacy Policy</a>
            </div>
          </div>
        </div>
      </div>
    </aside>
  </div>

  <div class="login-trust-strip" id="trust-logos" hidden>
    <p class="login-trust-label">Trusted by</p>
    <div class="login-trust-marquee-wrap">
      <div class="login-trust-marquee-track" id="trust-logos-track"></div>
    </div>
  </div>
</div>
<script src="/assets/js/api.js?v=20260806a"></script>
<script src="/assets/js/branding.js?v=20260806a"></script>
<script src="/assets/js/auth.js?v=20260806a"></script>
<script>if (window.MamsBranding) MamsBranding.reset();</script>
