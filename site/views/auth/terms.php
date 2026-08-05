<div class="hero-right" style="min-height:100vh;background:var(--page)">
  <div class="card login-card">
    <h1 style="color:var(--brand)">Terms of use</h1>
    <p class="muted">Please accept the terms to continue using MAMS.</p>
    <p id="terms-error" class="error" hidden></p>
    <button id="accept-terms" class="btn" style="margin-top:1rem;width:100%">I accept</button>
  </div>
</div>
<script>
(async () => {
  if (!MamsApi.getToken()) location.href = '/auth/login';
  document.getElementById('accept-terms').onclick = async () => {
    try {
      await MamsApi.api('/auth/accept-terms', { method: 'POST', body: '{}' });
      const me = await MamsApi.api('/auth/me');
      location.href = MamsApi.postLoginPath(me.user);
    } catch (e) {
      const el = document.getElementById('terms-error');
      el.hidden = false;
      el.textContent = e.message || 'Failed';
    }
  };
})();
</script>
