<?php
$doc = LegalDocuments::find('privacy');
?>
<div class="legal-page">
  <header class="legal-page-header">
    <div class="legal-page-header-inner">
      <a href="/" class="legal-page-brand">
        <img src="/assets/img/mams-logo.png" alt="MAMS Logo" onerror="this.src='/assets/img/mams-logo.svg'" />
        <div>
          <strong>MAMS</strong>
          <span>Mimito Asset Management System</span>
        </div>
      </a>
      <a href="/" class="btn btn-sm btn-outline-brand">← Back to Home</a>
    </div>
  </header>
  <main class="legal-page-main">
    <div class="legal-page-card">
      <?php if ($doc): ?>
        <?= LegalDocuments::renderDocument($doc) ?>
      <?php else: ?>
        <p class="muted">Privacy policy unavailable.</p>
      <?php endif; ?>
      <?= LegalDocuments::renderFooterLinks() ?>
    </div>
  </main>
</div>
