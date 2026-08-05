<?php
/**
 * MAMS PHP front controller — HTML pages + /health
 * Document root should be this `site/` folder on StackCP.
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

$route = $_GET['route'] ?? '';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$path = '/' . trim($path, '/');
if ($path === '/') {
    $path = '/';
}

// Strip /site prefix if aliased
if (str_starts_with($path, '/site/')) {
    $path = substr($path, 5) ?: '/';
}

if ($route === 'health' || $path === '/health') {
    $ok = Database::ping();
    header('Content-Type: application/json; charset=utf-8');
    http_response_code($ok ? 200 : 503);
    echo json_encode([
        'status' => $ok ? 'ok' : 'degraded',
        'database' => $ok ? 'connected' : 'disconnected',
        'engine' => 'mysql',
        'runtime' => 'php',
        'timestamp' => gmdate('c'),
    ]);
    exit;
}

function view(string $name, array $vars = []): void
{
    extract($vars, EXTR_SKIP);
    $viewFile = SITE_ROOT . '/views/' . $name . '.php';
    if (!is_file($viewFile)) {
        http_response_code(404);
        echo 'View not found';
        exit;
    }
    require SITE_ROOT . '/views/layouts/main.php';
}

$page = 'landing';
if ($path === '/auth/login' || $path === '/login') {
    $page = 'auth/login';
} elseif ($path === '/auth/terms') {
    $page = 'auth/terms';
} elseif (str_starts_with($path, '/app')) {
    $page = 'app/shell';
} elseif (str_starts_with($path, '/admin')) {
    $page = 'admin/shell';
} elseif ($path === '/terms' || $path === '/terms-of-use') {
    $page = 'public/terms';
} elseif ($path === '/privacy' || $path === '/privacy-policy') {
    $page = 'public/privacy';
} elseif ($path === '/' || $path === '') {
    $page = 'public/landing';
} else {
    $page = 'public/landing';
}

$viewFile = SITE_ROOT . '/views/' . $page . '.php';
$contentView = $page;
require SITE_ROOT . '/views/layouts/main.php';
