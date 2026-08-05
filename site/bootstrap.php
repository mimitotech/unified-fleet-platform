<?php
/**
 * MAMS PHP bootstrap — no Node, no build step.
 */
declare(strict_types=1);

define('SITE_ROOT', dirname(__DIR__));

require_once SITE_ROOT . '/lib/Env.php';
require_once SITE_ROOT . '/lib/Database.php';
require_once SITE_ROOT . '/lib/Jwt.php';
require_once SITE_ROOT . '/lib/Response.php';
require_once SITE_ROOT . '/lib/Auth.php';

Env::load(SITE_ROOT . '/.env');
Env::load(dirname(SITE_ROOT) . '/.env'); // fallback: repo root .env

date_default_timezone_set('UTC');

header('X-Content-Type-Options: nosniff');

$origin = Env::get('FRONTEND_URL', Env::get('API_PUBLIC_URL', 'https://mams.mimitotracking.co.ug'));
$reqOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($reqOrigin && ($reqOrigin === $origin || str_ends_with(parse_url($reqOrigin, PHP_URL_HOST) ?: '', 'mimitotracking.co.ug'))) {
    header('Access-Control-Allow-Origin: ' . $reqOrigin);
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Headers: Authorization, Content-Type, X-Tenant-Slug');
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
