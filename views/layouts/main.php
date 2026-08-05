<?php
/** @var string $contentView */
$title = $title ?? 'MAMS — Mimito Asset Management System';
$isApp = str_starts_with($contentView ?? '', 'app/') || str_starts_with($contentView ?? '', 'admin/');
$isLanding = ($contentView ?? '') === 'public/landing';
$bodyClass = $isApp ? 'app-body' : ($isLanding ? 'landing-body' : '');
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#004225" />
  <meta name="description" content="MAMS — Mimito Asset Management System. Unified fleet tracking, fuel, workshop and telematics." />
  <title><?= htmlspecialchars($title, ENT_QUOTES, 'UTF-8') ?></title>
  <link rel="icon" href="/assets/img/favicon.ico" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/assets/css/app.css?v=20260805f" />
  <script>window.MAMS_ASSET_V = '20260805f';</script>
  <?php if ($isLanding): ?>
  <style>
    /* Critical landing nav — prevents stacked/broken header if CSS is cached stale */
    body.landing-body { background: #fff !important; }
    .landing-page .site-nav-inner {
      display: flex !important; flex-direction: row !important;
      align-items: center !important; justify-content: space-between !important;
      height: 4rem !important; max-width: 80rem; margin: 0 auto; padding: 0 1rem;
    }
    .landing-page .site-nav-brand {
      display: flex !important; flex-direction: row !important;
      align-items: center !important; gap: 0.75rem !important;
    }
    .landing-page .site-nav-brand img {
      width: 48px !important; height: 48px !important;
      max-width: 48px !important; max-height: 48px !important;
      object-fit: contain !important;
    }
    .landing-page .site-nav-toggle { display: none !important; }
    @media (max-width: 767px) {
      .landing-page .site-nav-actions { display: none !important; }
      .landing-page .site-nav-toggle { display: block !important; }
      .landing-page .site-nav-brand-text p { display: none !important; }
    }
  </style>
  <?php endif; ?>
  <?php if (($contentView ?? '') === 'auth/login'): ?>
  <style>
    [hidden] { display: none !important; }
    #forgot-form[hidden], #reset-form[hidden], #login-form[hidden] { display: none !important; }
    .login-slide img {
      width: 100% !important; height: 100% !important; max-width: none !important;
      object-fit: contain; object-position: center;
    }
  </style>
  <?php endif; ?>
</head>
<body<?= $bodyClass !== '' ? ' class="' . htmlspecialchars($bodyClass, ENT_QUOTES, 'UTF-8') . '"' : '' ?>>
<?php require SITE_ROOT . '/views/' . $contentView . '.php'; ?>
</body>
</html>
