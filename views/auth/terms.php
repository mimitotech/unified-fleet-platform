<?php
$docs = LegalDocuments::all();
$version = LegalDocuments::version();
?>
<div class="terms-accept-page">
  <header class="terms-accept-header">
    <div class="terms-accept-header-inner">
      <a href="/" class="terms-accept-brand">
        <img src="/assets/img/mams-logo.png" alt="MAMS" onerror="this.src='/assets/img/mams-logo.svg'" />
        <div>
          <strong>MAMS</strong>
          <span id="terms-user-label" class="muted">First-time access</span>
        </div>
      </a>
    </div>
  </header>

  <main class="terms-accept-main">
    <div class="terms-accept-intro">
      <h1>Privacy Policy &amp; Terms of Use</h1>
      <p class="muted">Please read the following before accessing Mimito Asset Management System. You must accept to continue.</p>
    </div>

    <div class="terms-accept-card">
      <div class="terms-accept-scroll">
        <?php foreach ($docs as $doc): ?>
          <?= LegalDocuments::renderDocument($doc, true) ?>
        <?php endforeach; ?>
      </div>
      <div class="terms-accept-footer">
        <p class="muted">Version <?= htmlspecialchars($version, ENT_QUOTES, 'UTF-8') ?> · Mimito Technologies Limited</p>
        <p id="terms-error" class="error" hidden></p>
        <button id="accept-terms" class="btn" type="button">✓ Accept</button>
      </div>
    </div>
  </main>
</div>
<script src="/assets/js/api.js?v=20260805e"></script>
<script>
(async () => {
  if (!MamsApi.getToken()) { location.href = '/auth/login'; return; }
  try {
    const me = await MamsApi.api('/auth/me');
    const user = me.user || me;
    if (user.termsAcceptedAt) {
      location.href = MamsApi.postLoginPath(user);
      return;
    }
    const label = document.getElementById('terms-user-label');
    if (label) label.textContent = user.fullName || user.email || 'First-time access';
  } catch (_) {}

  document.getElementById('accept-terms').onclick = async () => {
    const err = document.getElementById('terms-error');
    const btn = document.getElementById('accept-terms');
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      await MamsApi.api('/auth/accept-terms', { method: 'POST', body: '{}' });
      const me = await MamsApi.api('/auth/me');
      location.href = MamsApi.postLoginPath(me.user || me);
    } catch (e) {
      err.hidden = false;
      err.textContent = e.message || 'Failed';
      btn.disabled = false;
      btn.textContent = '✓ Accept';
    }
  };
})();
</script>
