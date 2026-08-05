<?php
/**
 * API front controller — /api/*
 */
declare(strict_types=1);

require_once dirname(__DIR__) . '/bootstrap.php';

require_once __DIR__ . '/controllers/AuthController.php';
require_once __DIR__ . '/controllers/PublicController.php';
require_once __DIR__ . '/controllers/ClientController.php';
require_once __DIR__ . '/controllers/AdminController.php';
require_once __DIR__ . '/controllers/DomainController.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$uri = $_SERVER['REQUEST_URI'] ?? '/';
$path = parse_url($uri, PHP_URL_PATH) ?: '/';

// Normalize: /api/... or /site/api/...
if (preg_match('#/api(/.*)?$#', $path, $m)) {
    $apiPath = $m[1] ?? '/';
} else {
    $apiPath = $path;
}
$apiPath = '/' . trim($apiPath, '/');
if ($apiPath === '/') {
    $apiPath = '';
}

function route_match(string $pattern, string $path, ?array &$params = null): bool
{
    $params = [];
    $regex = preg_replace('#:([a-zA-Z_]+)#', '([^/]+)', $pattern);
    $regex = '#^' . $regex . '$#';
    if (!preg_match($regex, $path, $m)) {
        return false;
    }
    preg_match_all('#:([a-zA-Z_]+)#', $pattern, $names);
    foreach ($names[1] as $i => $name) {
        $params[$name] = $m[$i + 1] ?? null;
    }
    return true;
}

try {
    // Health
    if ($method === 'GET' && ($apiPath === '/health' || $apiPath === '' && isset($_GET['health']))) {
        // also support /api/../health via separate rewrite — handled in site index too
    }

    // Auth
    if ($apiPath === '/auth/login' && $method === 'POST') {
        AuthController::login();
    }
    if ($apiPath === '/auth/me' && $method === 'GET') {
        AuthController::me();
    }
    if ($apiPath === '/auth/change-password' && $method === 'POST') {
        AuthController::changePassword();
    }
    if ($apiPath === '/auth/accept-terms' && $method === 'POST') {
        AuthController::acceptTerms();
    }
    if ($apiPath === '/auth/forgot-password' && $method === 'POST') {
        AuthController::forgotPassword();
    }
    if ($apiPath === '/auth/reset-password' && $method === 'POST') {
        AuthController::resetPassword();
    }

    // Public
    if ($apiPath === '/public/login-slides' && $method === 'GET') {
        PublicController::loginSlides();
    }
    if ($apiPath === '/public/login-trust-logos' && $method === 'GET') {
        PublicController::loginTrustLogos();
    }

    // Client
    if ($apiPath === '/client/tenant' && $method === 'GET') {
        ClientController::tenant();
    }
    if ($apiPath === '/client/modules' && $method === 'GET') {
        ClientController::modules();
    }
    if ($apiPath === '/client/dashboard/kpis' && $method === 'GET') {
        ClientController::dashboardKpis();
    }
    if ($apiPath === '/client/fleet/snapshot' && $method === 'GET') {
        ClientController::fleetSnapshot();
    }
    if ($apiPath === '/client/assets' && $method === 'GET') {
        ClientController::assets();
    }
    if ($apiPath === '/client/alerts' && $method === 'GET') {
        ClientController::alerts();
    }
    if ($apiPath === '/client/preferences' && $method === 'GET') {
        ClientController::preferencesGet();
    }
    if ($apiPath === '/client/preferences' && ($method === 'PUT' || $method === 'POST')) {
        ClientController::preferencesPut();
    }

    // Domain stubs
    if ($apiPath === '/client/drivers' && $method === 'GET') {
        DomainController::drivers();
    }
    if ($apiPath === '/client/routes' && $method === 'GET') {
        DomainController::routes();
    }
    if ($apiPath === '/client/fuel/transactions' && $method === 'GET') {
        DomainController::fuelTransactions();
    }
    if ($apiPath === '/client/workshop/kpis' && $method === 'GET') {
        DomainController::workshopKpis();
    }
    if ($apiPath === '/client/geofences' && $method === 'GET') {
        DomainController::geofences();
    }
    if ($apiPath === '/client/emissions/metrics' && $method === 'GET') {
        DomainController::emissions();
    }

    // Admin
    if ($apiPath === '/admin/dashboard' && $method === 'GET') {
        AdminController::dashboard();
    }
    if ($apiPath === '/admin/system/health' && $method === 'GET') {
        AdminController::systemHealth();
    }
    if ($apiPath === '/admin/tenants' && $method === 'GET') {
        AdminController::tenants();
    }
    if (route_match('/admin/tenants/:id', $apiPath, $p) && $method === 'GET') {
        AdminController::tenant($p['id']);
    }
    if ($apiPath === '/admin/users' && $method === 'GET') {
        AdminController::users();
    }

    Response::error('Not found', 404);
} catch (Throwable $e) {
    $msg = Env::get('APP_DEBUG') === '1' ? $e->getMessage() : 'Server error';
    Response::error($msg, 500);
}
