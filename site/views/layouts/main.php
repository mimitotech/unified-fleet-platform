<?php
/** @var string $contentView */
$title = $title ?? 'MAMS — Mimito Asset Management System';
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title><?= htmlspecialchars($title, ENT_QUOTES, 'UTF-8') ?></title>
  <link rel="icon" href="/assets/img/favicon.ico" />
  <link rel="stylesheet" href="/assets/css/app.css" />
  <script src="/assets/js/api.js"></script>
</head>
<body>
<?php require SITE_ROOT . '/views/' . $contentView . '.php'; ?>
</body>
</html>
