<?php

require_once __DIR__ . '/../../lib/Auth.php';
require_once __DIR__ . '/../../lib/Response.php';

class DomainController
{
    private static function requireTenantContext(): void
    {
        Auth::requireAuth();
        $user = Auth::user();
        if (!is_array($user)) {
            Response::error('Unauthorized', 401);
            exit;
        }
        $tenantId = $user['tenant_id'] ?? $user['tenantId'] ?? null;
        if ($tenantId === null || $tenantId === '') {
            Response::error('Tenant context required', 403);
            exit;
        }
    }

    /** GET /client/drivers — TODO: full port from backend/src/routes/domain/drivers.ts */
    public static function drivers(): void
    {
        self::requireTenantContext();
        Response::success([]);
    }

    /** GET /client/routes — TODO: full port from backend/src/routes/domain/routes.ts */
    public static function routes(): void
    {
        self::requireTenantContext();
        Response::success([]);
    }

    /** GET /client/fuel/transactions — TODO: full port from backend/src/routes/domain/fuel.ts */
    public static function fuelTransactions(): void
    {
        self::requireTenantContext();
        Response::success([
            'transactions' => [],
            'kpis' => [],
        ]);
    }

    /** GET /client/workshop/kpis — TODO: full port from backend/src/routes/domain/workshop.ts */
    public static function workshopKpis(): void
    {
        self::requireTenantContext();
        Response::success([]);
    }

    /** GET /client/geofences — TODO: full port from backend/src/routes/domain/geofences.ts */
    public static function geofences(): void
    {
        self::requireTenantContext();
        Response::success([]);
    }

    /** GET /client/emissions — TODO: full port from backend/src/routes/domain/emissions.ts */
    public static function emissions(): void
    {
        self::requireTenantContext();
        Response::success([]);
    }
}
