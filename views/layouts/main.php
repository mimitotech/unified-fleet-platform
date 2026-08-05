<?php
/** @var string $contentView */
$title = $title ?? 'MAMS — Mimito Asset Management System';
$isApp = str_starts_with($contentView ?? '', 'app/') || str_starts_with($contentView ?? '', 'admin/');
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
  <link rel="stylesheet" href="/assets/css/app.css" />
</head>
<body<?= $isApp ? ' class="app-body"' : '' ?>>
<?php require SITE_ROOT . '/views/' . $contentView . '.php'; ?>
</body>
</html>
