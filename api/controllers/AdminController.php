<?php

require_once __DIR__ . '/../../lib/Database.php';
require_once __DIR__ . '/../../lib/Auth.php';
require_once __DIR__ . '/../../lib/Response.php';

class AdminController
{
    /** @param array<string, mixed> $row */
    private static function camelCase(array $row): array
    {
        $out = [];
        foreach ($row as $key => $value) {
            $camel = preg_replace_callback('/_([a-z])/', static fn(array $m): string => strtoupper($m[1]), (string) $key);
            $out[$camel] = $value;
        }
        return $out;
    }

    /** @param array<int, array<string, mixed>> $rows */
    private static function camelRows(array $rows): array
    {
        return array_map([self::class, 'camelCase'], $rows);
    }

    private static function normalizeUploadPath(?string $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (preg_match('#^https?://localhost#i', $value)) {
            $path = parse_url($value, PHP_URL_PATH);
            return is_string($path) && $path !== '' ? $path : null;
        }
        if (str_starts_with($value, '/uploads/')) {
            return $value;
        }
        return $value;
    }

    /** @param array<string, mixed> $row */
    private static function mapTenant(array $row): array
    {
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'slug' => $row['slug'],
            'primaryColor' => $row['primary_color'] ?? null,
            'secondaryColor' => $row['secondary_color'] ?? null,
            'accentColor' => $row['accent_color'] ?? null,
            'logoUrl' => self::normalizeUploadPath(isset($row['logo_url']) ? (string) $row['logo_url'] : null),
            'faviconUrl' => self::normalizeUploadPath(isset($row['favicon_url']) ? (string) $row['favicon_url'] : null),
            'isActive' => (bool) ((int) ($row['is_active'] ?? 0)),
            'status' => $row['status'] ?? (((int) ($row['is_active'] ?? 0)) === 1 ? 'active' : 'inactive'),
            'contactEmail' => $row['contact_email'] ?? null,
            'phone' => $row['phone'] ?? null,
            'address' => $row['address'] ?? null,
            'country' => $row['country'] ?? null,
            'timezone' => $row['timezone'] ?? null,
            'language' => $row['language'] ?? null,
            'maxVehicles' => isset($row['max_vehicles']) ? (int) $row['max_vehicles'] : null,
            'maxUsers' => isset($row['max_users']) ? (int) $row['max_users'] : null,
            'maxStorageGb' => isset($row['max_storage_gb']) ? (int) $row['max_storage_gb'] : null,
            'customCss' => $row['custom_css'] ?? null,
            'assignedManagerId' => $row['assigned_manager_id'] ?? null,
            'assignedManagerName' => $row['assigned_manager_name'] ?? null,
            'createdAt' => $row['created_at'] ?? null,
            'updatedAt' => $row['updated_at'] ?? null,
        ];
    }

    /** @return array<string, mixed> */
    private static function currentUser(): array
    {
        Auth::requireAdmin();
        $user = Auth::user();
        return is_array($user) ? $user : [];
    }

    /** GET /admin/dashboard */
    public static function dashboard(): void
    {
        self::currentUser();

        $tenantRows = Database::query(
            "SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'active' OR (status IS NULL AND is_active = 1) THEN 1 ELSE 0 END) AS active,
                SUM(CASE WHEN status = 'warning' THEN 1 ELSE 0 END) AS warning,
                SUM(CASE WHEN status IN ('inactive', 'suspended') OR is_active = 0 THEN 1 ELSE 0 END) AS inactive
             FROM tenants"
        );
        $tenantStats = $tenantRows[0] ?? [];

        $vehicleRows = Database::query(
            "SELECT COUNT(*) AS total,
                    SUM(CASE WHEN (
                        SELECT s.status FROM asset_status s
                        WHERE s.asset_id = a.id
                        ORDER BY s.recorded_at DESC
                        LIMIT 1
                    ) IN ('moving', 'idle', 'stopped') THEN 1 ELSE 0 END) AS active
             FROM assets a"
        );
        $vehicleStats = $vehicleRows[0] ?? [];

        $userRows = Database::query(
            "SELECT COUNT(*) AS total FROM users WHERE role NOT IN ('platform_admin', 'super_admin')"
        );
        $userStats = $userRows[0] ?? [];

        $alertRows = Database::query(
            'SELECT COUNT(*) AS pending FROM alerts WHERE acknowledged = 0'
        );
        $alertStats = $alertRows[0] ?? [];

        $totalTenants = (int) ($tenantStats['total'] ?? 0);
        $activeTenants = (int) ($tenantStats['active'] ?? 0);
        $totalVehicles = (int) ($vehicleStats['total'] ?? 0);
        $activeVehicles = (int) ($vehicleStats['active'] ?? 0);

        Response::success([
            'totalTenants' => $totalTenants,
            'activeTenants' => $activeTenants,
            'activeTenantsPct' => $totalTenants > 0 ? (int) round(($activeTenants / $totalTenants) * 100) : 0,
            'totalVehicles' => $totalVehicles,
            'activeVehicles' => $activeVehicles,
            'activeVehiclesPct' => $totalVehicles > 0 ? (int) round(($activeVehicles / $totalVehicles) * 100) : 0,
            'totalUsers' => (int) ($userStats['total'] ?? 0),
            'pendingAlerts' => (int) ($alertStats['pending'] ?? 0),
            'tenantWarning' => (int) ($tenantStats['warning'] ?? 0),
            'tenantInactive' => (int) ($tenantStats['inactive'] ?? 0),
            'generatedAt' => gmdate('c'),
        ]);
    }

    /** GET /admin/tenants */
    public static function tenants(): void
    {
        $user = self::currentUser();
        $search = trim((string) ($_GET['search'] ?? ''));
        $status = trim((string) ($_GET['status'] ?? 'all'));
        $sort = trim((string) ($_GET['sort'] ?? 'name'));
        $page = max(1, (int) ($_GET['page'] ?? 1));
        $limit = max(1, min(100, (int) ($_GET['limit'] ?? 25)));
        $offset = ($page - 1) * $limit;

        $params = [];
        $where = 'WHERE 1=1';

        if (($user['role'] ?? '') === 'platform_admin' && !empty($user['id'])) {
            $where .= ' AND t.assigned_manager_id = ?';
            $params[] = (string) $user['id'];
        }

        if ($search !== '') {
            $where .= ' AND (LOWER(t.name) LIKE LOWER(?) OR LOWER(t.slug) LIKE LOWER(?))';
            $like = '%' . $search . '%';
            $params[] = $like;
            $params[] = $like;
        }

        if ($status !== '' && $status !== 'all') {
            $where .= " AND COALESCE(t.status, CASE WHEN t.is_active = 1 THEN 'active' ELSE 'inactive' END) = ?";
            $params[] = $status;
        }

        $sortMap = [
            'name' => 't.name ASC',
            'vehicles' => 'vehicle_count DESC',
            'users' => 'user_count DESC',
            'created' => 't.created_at DESC',
            'manager' => 'mgr.full_name IS NULL, mgr.full_name ASC, t.name ASC',
        ];
        $orderBy = $sortMap[$sort] ?? 't.name ASC';

        $listParams = array_merge($params, [$limit, $offset]);
        $rows = Database::query(
            "SELECT t.*,
                    mgr.full_name AS assigned_manager_name,
                    mgr.email AS assigned_manager_email,
                    (
                        SELECT COUNT(DISTINCT a.id)
                        FROM assets a
                        WHERE a.tenant_id = t.id
                    ) AS vehicle_count,
                    (
                        SELECT COUNT(DISTINCT u.id)
                        FROM users u
                        WHERE u.tenant_id = t.id
                          AND u.role NOT IN ('platform_admin', 'super_admin')
                    ) AS user_count
             FROM tenants t
             LEFT JOIN users mgr ON mgr.id = t.assigned_manager_id
             $where
             ORDER BY $orderBy
             LIMIT ? OFFSET ?",
            $listParams
        );

        $countRows = Database::query(
            "SELECT COUNT(*) AS total FROM tenants t $where",
            $params
        );

        $tenants = [];
        foreach ($rows as $row) {
            $mapped = self::mapTenant($row);
            $mapped['vehicleCount'] = (int) ($row['vehicle_count'] ?? 0);
            $mapped['userCount'] = (int) ($row['user_count'] ?? 0);
            $mapped['assignedManagerEmail'] = $row['assigned_manager_email'] ?? null;
            $tenants[] = $mapped;
        }

        Response::success([
            'tenants' => $tenants,
            'total' => (int) ($countRows[0]['total'] ?? 0),
            'page' => $page,
            'limit' => $limit,
        ]);
    }

    /** GET /admin/tenants/:id */
    public static function tenant(?string $id = null): void
    {
        self::currentUser();
        $tenantId = $id ?? ($_GET['id'] ?? '');
        if ($tenantId === '') {
            Response::error('Tenant id required', 400);
            return;
        }

        $rows = Database::query(
            'SELECT t.*, mgr.full_name AS assigned_manager_name, mgr.email AS assigned_manager_email
             FROM tenants t
             LEFT JOIN users mgr ON mgr.id = t.assigned_manager_id
             WHERE t.id = ?
             LIMIT 1',
            [$tenantId]
        );

        if (!$rows) {
            Response::error('Tenant not found', 404);
            return;
        }

        $usageRows = Database::query(
            'SELECT
                (SELECT COUNT(*) FROM assets WHERE tenant_id = ?) AS vehicles_used,
                (SELECT COUNT(*) FROM users WHERE tenant_id = ?) AS users_used',
            [$tenantId, $tenantId]
        );

        $detail = self::mapTenant($rows[0]);
        $detail['assignedManagerEmail'] = $rows[0]['assigned_manager_email'] ?? null;
        $detail['usage'] = [
            'vehiclesUsed' => (int) ($usageRows[0]['vehicles_used'] ?? 0),
            'usersUsed' => (int) ($usageRows[0]['users_used'] ?? 0),
        ];

        Response::success($detail);
    }

    /** GET /admin/users */
    public static function users(): void
    {
        $user = self::currentUser();
        $search = trim((string) ($_GET['search'] ?? ''));
        $tenantFilter = trim((string) ($_GET['tenant'] ?? ''));
        $roleFilter = trim((string) ($_GET['role'] ?? ''));

        $params = [];
        $where = "WHERE u.tenant_id IS NOT NULL AND u.role NOT IN ('platform_admin', 'super_admin')";

        if (($user['role'] ?? '') === 'platform_admin' && !empty($user['id'])) {
            $where .= ' AND u.tenant_id IN (SELECT id FROM tenants WHERE assigned_manager_id = ?)';
            $params[] = (string) $user['id'];
        }

        if ($search !== '') {
            $where .= ' AND (LOWER(u.email) LIKE LOWER(?) OR LOWER(u.full_name) LIKE LOWER(?))';
            $like = '%' . $search . '%';
            $params[] = $like;
            $params[] = $like;
        }

        if ($tenantFilter !== '' && $tenantFilter !== 'all') {
            $where .= ' AND u.tenant_id = ?';
            $params[] = $tenantFilter;
        }

        if ($roleFilter !== '' && $roleFilter !== 'all') {
            $where .= ' AND u.role = ?';
            $params[] = $roleFilter;
        }

        $rows = Database::query(
            "SELECT u.id, u.email, u.full_name, u.role, u.is_active, u.last_login_at, u.created_at,
                    u.tenant_id, t.name AS tenant_name, t.slug AS tenant_slug
             FROM users u
             LEFT JOIN tenants t ON t.id = u.tenant_id
             $where
             ORDER BY u.created_at DESC
             LIMIT 200",
            $params
        );

        $result = [];
        foreach ($rows as $row) {
            $mapped = self::camelCase($row);
            $mapped['fullName'] = $row['full_name'] ?? null;
            $mapped['isActive'] = (bool) ((int) ($row['is_active'] ?? 0));
            $mapped['lastLoginAt'] = $row['last_login_at'] ?? null;
            $mapped['createdAt'] = $row['created_at'] ?? null;
            $mapped['tenantId'] = $row['tenant_id'] ?? null;
            $mapped['tenantName'] = $row['tenant_name'] ?? null;
            $mapped['tenantSlug'] = $row['tenant_slug'] ?? null;
            $result[] = $mapped;
        }

        Response::success($result);
    }

    /** GET /admin/system/health */
    public static function systemHealth(): void
    {
        self::currentUser();

        $dbOk = false;
        try {
            Database::query('SELECT 1');
            $dbOk = true;
        } catch (Throwable $e) {
            error_log('AdminController systemHealth: ' . $e->getMessage());
        }

        Response::success([
            'overall' => $dbOk ? 'operational' : 'degraded',
            'database' => [
                'status' => $dbOk ? 'ok' : 'error',
            ],
            'api' => [
                'status' => 'ok',
            ],
        ]);
    }
}
