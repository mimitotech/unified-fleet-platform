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
require_once __DIR__ . '/controllers/AdminMediaController.php';
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

    // Client — core
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
    if (route_match('/client/alerts/:id/acknowledge', $apiPath, $p) && $method === 'POST') {
        ClientController::alertAcknowledge($p['id']);
    }
    if ($apiPath === '/client/integrations/status' && $method === 'GET') {
        ClientController::integrationsStatus();
    }
    if ($apiPath === '/client/wialon/context' && $method === 'GET') {
        ClientController::wialonContext();
    }
    if ($apiPath === '/client/wialon/fleet' && $method === 'GET') {
        ClientController::wialonFleet();
    }
    if (route_match('/client/wialon/units/:id', $apiPath, $p) && $method === 'GET') {
        ClientController::wialonUnitDetail($p['id']);
    }
    if (route_match('/client/wialon/units/:id/track', $apiPath, $p) && $method === 'GET') {
        ClientController::wialonUnitTrack($p['id']);
    }
    if ($apiPath === '/client/wialon/routes' && $method === 'GET') {
        ClientController::wialonRoutes();
    }
    if ($apiPath === '/client/wialon/notifications' && $method === 'GET') {
        ClientController::wialonNotifications();
    }
    if ($apiPath === '/client/wialon/reports/templates' && $method === 'GET') {
        ClientController::wialonReportTemplates();
    }
    if ($apiPath === '/client/wialon/commands' && $method === 'POST') {
        ClientController::wialonCommandSend();
    }
    if ($apiPath === '/client/preferences' && $method === 'GET') {
        ClientController::preferencesGet();
    }
    if ($apiPath === '/client/preferences' && ($method === 'PUT' || $method === 'POST')) {
        ClientController::preferencesPut();
    }

    // Client — tenant users
    if ($apiPath === '/client/users' && $method === 'GET') {
        ClientController::clientUsers();
    }
    if ($apiPath === '/client/users' && $method === 'POST') {
        ClientController::clientUsersCreate();
    }
    if (route_match('/client/users/:id', $apiPath, $p) && $method === 'PATCH') {
        ClientController::clientUsersPatch($p['id']);
    }
    if (route_match('/client/users/:id/reset-password', $apiPath, $p) && $method === 'POST') {
        ClientController::clientUsersResetPassword($p['id']);
    }

    // Client — domain modules
    if ($apiPath === '/client/drivers' && $method === 'GET') {
        DomainController::drivers();
    }
    if ($apiPath === '/client/drivers' && $method === 'POST') {
        DomainController::driversCreate();
    }
    if ($apiPath === '/client/drivers/stats' && $method === 'GET') {
        DomainController::driversStats();
    }
    if (route_match('/client/drivers/:id', $apiPath, $p) && $method === 'PATCH') {
        DomainController::driversPatch($p['id']);
    }
    if (route_match('/client/drivers/:id', $apiPath, $p) && $method === 'DELETE') {
        DomainController::driversDelete($p['id']);
    }
    if ($apiPath === '/client/routes' && $method === 'GET') {
        DomainController::routes();
    }
    if ($apiPath === '/client/routes/stats' && $method === 'GET') {
        DomainController::routesStats();
    }
    if ($apiPath === '/client/routes/trips' && $method === 'GET') {
        DomainController::routesTrips();
    }
    if ($apiPath === '/client/fuel/transactions' && $method === 'GET') {
        DomainController::fuelTransactions();
    }
    if ($apiPath === '/client/fuel/kpis' && $method === 'GET') {
        DomainController::fuelKpis();
    }
    if ($apiPath === '/client/fuel/monthly-trend' && $method === 'GET') {
        DomainController::fuelMonthlyTrend();
    }
    if ($apiPath === '/client/fuel/sync-status' && $method === 'GET') {
        DomainController::fuelSyncStatus();
    }
    if ($apiPath === '/client/workshop/kpis' && $method === 'GET') {
        DomainController::workshopKpis();
    }
    if ($apiPath === '/client/workshop/inspections' && $method === 'GET') {
        DomainController::workshopInspections();
    }
    if ($apiPath === '/client/workshop/maintenance' && $method === 'GET') {
        DomainController::workshopMaintenance();
    }
    if ($apiPath === '/client/workshop/breakdowns' && $method === 'GET') {
        DomainController::workshopBreakdowns();
    }
    if ($apiPath === '/client/workshop/mechanics' && $method === 'GET') {
        DomainController::workshopMechanics();
    }
    if ($apiPath === '/client/workshop/maintenance' && $method === 'POST') {
        DomainController::workshopMaintenanceCreate();
    }
    if ($apiPath === '/client/workshop/breakdowns' && $method === 'POST') {
        DomainController::workshopBreakdownCreate();
    }
    if ($apiPath === '/client/geofences' && $method === 'GET') {
        DomainController::geofences();
    }
    if ($apiPath === '/client/geofences' && $method === 'POST') {
        DomainController::geofencesCreate();
    }
    if (route_match('/client/geofences/:id', $apiPath, $p) && $method === 'DELETE') {
        DomainController::geofencesDelete($p['id']);
    }
    if ($apiPath === '/client/emissions/violations' && $method === 'GET') {
        DomainController::emissionsViolations();
    }
    if ($apiPath === '/client/emissions/metrics' && $method === 'GET') {
        DomainController::emissionsMetrics();
    }
    if ($apiPath === '/client/commands/history' && $method === 'GET') {
        DomainController::commandsHistory();
    }
    if ($apiPath === '/client/reports/types' && $method === 'GET') {
        DomainController::reportTypes();
    }
    if (route_match('/client/reports/data/:type', $apiPath, $p) && $method === 'GET') {
        DomainController::reportsData($p['type']);
    }

    // Admin
    if ($apiPath === '/admin/dashboard' && $method === 'GET') {
        AdminController::dashboard();
    }
    if ($apiPath === '/admin/system/health' && $method === 'GET') {
        AdminController::systemHealth();
    }
    if ($apiPath === '/admin/system/settings' && $method === 'GET') {
        AdminController::systemSettings();
    }
    if ($apiPath === '/admin/marketplace' && $method === 'GET') {
        AdminController::marketplace();
    }
    if ($apiPath === '/admin/audit' && $method === 'GET') {
        AdminController::auditLog();
    }
    if ($apiPath === '/admin/system-users' && $method === 'GET') {
        AdminController::systemUsers();
    }
    if ($apiPath === '/admin/system-users' && $method === 'POST') {
        AdminController::systemUsersCreate();
    }
    if (route_match('/admin/system-users/:id', $apiPath, $p) && $method === 'PATCH') {
        AdminController::systemUsersPatch($p['id']);
    }
    if (route_match('/admin/system-users/:id/reset-password', $apiPath, $p) && $method === 'POST') {
        AdminController::systemUsersResetPassword($p['id']);
    }
    if ($apiPath === '/admin/tenants' && $method === 'GET') {
        AdminController::tenants();
    }
    if ($apiPath === '/admin/tenants' && $method === 'POST') {
        AdminController::tenantCreate();
    }
    if (route_match('/admin/tenants/:id', $apiPath, $p) && $method === 'GET') {
        AdminController::tenant($p['id']);
    }
    if (route_match('/admin/tenants/:id', $apiPath, $p) && $method === 'PATCH') {
        AdminController::tenantPatch($p['id']);
    }
    if (route_match('/admin/tenants/:id/modules', $apiPath, $p) && $method === 'GET') {
        AdminController::tenantModules($p['id']);
    }
    if (route_match('/admin/tenants/:id/modules', $apiPath, $p) && $method === 'PUT') {
        AdminController::tenantModulesPut($p['id']);
    }
    if (route_match('/admin/tenants/:id/integrations', $apiPath, $p) && $method === 'GET') {
        AdminController::tenantIntegrations($p['id']);
    }
    if ($apiPath === '/admin/users' && $method === 'GET') {
        AdminController::users();
    }
    if (route_match('/admin/users/:id', $apiPath, $p) && $method === 'PATCH') {
        AdminController::userPatch($p['id']);
    }
    if (route_match('/admin/users/:id/reset-password', $apiPath, $p) && $method === 'POST') {
        AdminController::userResetPassword($p['id']);
    }
    if (route_match('/admin/system/settings/:key', $apiPath, $p) && $method === 'PUT') {
        AdminController::systemSettingPut($p['key']);
    }
    if (route_match('/admin/marketplace/:key', $apiPath, $p) && $method === 'PATCH') {
        AdminController::marketplacePatch($p['key']);
    }

    // Admin — login media CRUD
    if ($apiPath === '/admin/login-slides' && $method === 'GET') {
        AdminMediaController::loginSlidesList();
    }
    if ($apiPath === '/admin/login-slides' && $method === 'POST') {
        AdminMediaController::loginSlidesCreate();
    }
    if (route_match('/admin/login-slides/:id', $apiPath, $p) && $method === 'PATCH') {
        AdminMediaController::loginSlidesPatch($p['id']);
    }
    if (route_match('/admin/login-slides/:id', $apiPath, $p) && $method === 'DELETE') {
        AdminMediaController::loginSlidesDelete($p['id']);
    }
    if ($apiPath === '/admin/login-trust-logos' && $method === 'GET') {
        AdminMediaController::trustLogosList();
    }
    if ($apiPath === '/admin/login-trust-logos' && $method === 'POST') {
        AdminMediaController::trustLogosCreate();
    }
    if (route_match('/admin/login-trust-logos/:id', $apiPath, $p) && $method === 'PATCH') {
        AdminMediaController::trustLogosPatch($p['id']);
    }
    if (route_match('/admin/login-trust-logos/:id', $apiPath, $p) && $method === 'DELETE') {
        AdminMediaController::trustLogosDelete($p['id']);
    }

    // Admin — integration centers
    if ($apiPath === '/admin/centers/wialon' && $method === 'GET') {
        AdminController::wialonCenterStatus();
    }
    if ($apiPath === '/admin/centers/wialon/mothers' && $method === 'GET') {
        AdminController::wialonMothersList();
    }
    if ($apiPath === '/admin/centers/wialon/mothers' && $method === 'POST') {
        AdminController::wialonMothersCreate();
    }
    if (route_match('/admin/centers/wialon/mothers/:id', $apiPath, $p) && $method === 'PUT') {
        AdminController::wialonMothersUpdate($p['id']);
    }
    if (route_match('/admin/centers/wialon/mothers/:id', $apiPath, $p) && $method === 'DELETE') {
        AdminController::wialonMothersDelete($p['id']);
    }
    if (route_match('/admin/centers/wialon/mothers/:id/test', $apiPath, $p) && $method === 'POST') {
        AdminController::wialonMothersTest($p['id']);
    }
    if ($apiPath === '/admin/centers/wialon/hierarchy' && $method === 'GET') {
        AdminController::wialonHierarchy();
    }
    if (route_match('/admin/centers/wialon/mothers/:id/hierarchy', $apiPath, $p) && $method === 'GET') {
        $_GET['motherId'] = $p['id'];
        AdminController::wialonHierarchy();
    }
    if (route_match('/admin/centers/wialon/accounts/:accountId', $apiPath, $p) && $method === 'GET') {
        AdminController::wialonAccount($p['accountId']);
    }
    if (route_match('/admin/centers/:source', $apiPath, $p) && $method === 'GET') {
        AdminController::integrationCenter($p['source']);
    }

    Response::error('Not found', 404);
} catch (Throwable $e) {
    $msg = Env::get('APP_DEBUG') === '1' ? $e->getMessage() : 'Server error';
    Response::error($msg, 500);
}
