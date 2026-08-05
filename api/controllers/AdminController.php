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

    private static function uuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }

    private static function tableExists(string $table): bool
    {
        try {
            $rows = Database::query(
                'SELECT 1 FROM information_schema.tables
                 WHERE table_schema = DATABASE() AND table_name = ?
                 LIMIT 1',
                [$table]
            );
            return (bool) $rows;
        } catch (Throwable $e) {
            return false;
        }
    }

    private static function columnExists(string $table, string $column): bool
    {
        try {
            $rows = Database::query(
                'SELECT 1 FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
                 LIMIT 1',
                [$table, $column]
            );
            return (bool) $rows;
        } catch (Throwable $e) {
            return false;
        }
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

    /** PATCH /admin/tenants/:id */
    public static function tenantPatch(?string $id = null): void
    {
        self::currentUser();
        $tenantId = $id ?? '';
        if ($tenantId === '') {
            Response::error('Tenant id required', 400);
            return;
        }

        $body = Auth::jsonBody();
        $status = isset($body['status']) ? trim((string) $body['status']) : null;
        $isActive = array_key_exists('isActive', $body) ? (bool) $body['isActive'] : null;

        if ($status === null && $isActive === null) {
            Response::error('status or isActive required', 400);
            return;
        }

        if ($status !== null && $isActive === null) {
            $isActive = in_array($status, ['active', 'warning'], true);
        }
        if ($isActive !== null && $status === null) {
            $status = $isActive ? 'active' : 'inactive';
        }

        $updated = Database::execute(
            'UPDATE tenants SET status = ?, is_active = ?, updated_at = NOW() WHERE id = ?',
            [$status, $isActive ? 1 : 0, $tenantId]
        );

        if ($updated === 0) {
            $exists = Database::query('SELECT id FROM tenants WHERE id = ? LIMIT 1', [$tenantId]);
            if (!$exists) {
                Response::error('Tenant not found', 404);
                return;
            }
        }

        $rows = Database::query(
            'SELECT t.*, mgr.full_name AS assigned_manager_name
             FROM tenants t
             LEFT JOIN users mgr ON mgr.id = t.assigned_manager_id
             WHERE t.id = ? LIMIT 1',
            [$tenantId]
        );

        Response::success(self::mapTenant($rows[0] ?? []));
    }

    /** GET /admin/system/settings */
    public static function systemSettings(): void
    {
        self::currentUser();

        try {
            $rows = Database::query('SELECT `key`, value FROM system_settings ORDER BY `key`');
            $list = [];
            $map = [];
            foreach ($rows as $row) {
                $value = $row['value'] ?? null;
                if (is_string($value)) {
                    $decoded = json_decode($value, true);
                    $value = json_last_error() === JSON_ERROR_NONE ? $decoded : $value;
                }
                $key = (string) $row['key'];
                $list[] = ['key' => $key, 'value' => $value];
                $map[$key] = $value;
            }
            Response::success(['settings' => $list, 'map' => $map]);
        } catch (Throwable $e) {
            error_log('AdminController systemSettings: ' . $e->getMessage());
            Response::success(['settings' => [], 'map' => []]);
        }
    }

    /** GET /admin/marketplace */
    public static function marketplace(): void
    {
        self::currentUser();

        try {
            $rows = Database::query('SELECT * FROM marketplace_integrations ORDER BY name');
            Response::success(self::camelRows($rows));
        } catch (Throwable $e) {
            error_log('AdminController marketplace: ' . $e->getMessage());
            Response::success([]);
        }
    }

    /** GET /admin/audit */
    public static function auditLog(): void
    {
        self::currentUser();

        try {
            $rows = Database::query(
                'SELECT al.*, t.name AS tenant_name
                 FROM audit_logs al
                 LEFT JOIN tenants t ON t.id = al.tenant_id
                 ORDER BY al.created_at DESC
                 LIMIT 200'
            );
            $result = [];
            foreach ($rows as $row) {
                $mapped = self::camelCase($row);
                $mapped['tenantName'] = $row['tenant_name'] ?? null;
                $result[] = $mapped;
            }
            Response::success($result);
        } catch (Throwable $e) {
            error_log('AdminController auditLog: ' . $e->getMessage());
            Response::success([]);
        }
    }

    /** GET /admin/system-users */
    public static function systemUsers(): void
    {
        self::currentUser();

        try {
            $rows = Database::query(
                "SELECT u.id, u.email, u.full_name, u.role, u.is_active, u.last_login_at, u.created_at,
                        (SELECT COUNT(*) FROM tenants t WHERE t.assigned_manager_id = u.id) AS assigned_tenant_count
                 FROM users u
                 WHERE u.role IN ('super_admin', 'platform_admin')
                 ORDER BY u.role DESC, u.full_name ASC"
            );

            $result = [];
            foreach ($rows as $row) {
                $result[] = [
                    'id' => $row['id'],
                    'email' => $row['email'],
                    'fullName' => $row['full_name'] ?? null,
                    'role' => $row['role'],
                    'isActive' => (bool) ((int) ($row['is_active'] ?? 0)),
                    'lastLoginAt' => $row['last_login_at'] ?? null,
                    'createdAt' => $row['created_at'] ?? null,
                    'assignedTenantCount' => (int) ($row['assigned_tenant_count'] ?? 0),
                ];
            }
            Response::success($result);
        } catch (Throwable $e) {
            error_log('AdminController systemUsers: ' . $e->getMessage());
            Response::success([]);
        }
    }

    /** GET /admin/tenants/:id/modules */
    public static function tenantModules(?string $id = null): void
    {
        self::currentUser();
        $tenantId = $id ?? '';
        if ($tenantId === '') {
            Response::error('Tenant id required', 400);
            return;
        }

        if (!self::tableExists('module_definitions')) {
            Response::success([]);
            return;
        }

        $rows = Database::query(
            'SELECT md.`key` AS module_key, md.label, md.icon, md.sort_order, md.default_enabled,
                    tm.is_enabled, COALESCE(tm.is_visible, 1) AS is_visible
             FROM module_definitions md
             LEFT JOIN tenant_modules tm ON tm.module_key = md.`key` AND tm.tenant_id = ?
             ORDER BY md.sort_order',
            [$tenantId]
        );

        $result = [];
        foreach ($rows as $row) {
            $result[] = [
                'moduleKey' => $row['module_key'],
                'label' => $row['label'] ?? $row['module_key'],
                'icon' => $row['icon'] ?? null,
                'sortOrder' => (int) ($row['sort_order'] ?? 0),
                'isEnabled' => $row['is_enabled'] !== null
                    ? (bool) ((int) $row['is_enabled'])
                    : (bool) ((int) ($row['default_enabled'] ?? 0)),
                'isVisible' => (bool) ((int) ($row['is_visible'] ?? 1)),
            ];
        }

        Response::success($result);
    }

    /** PUT /admin/tenants/:id/modules */
    public static function tenantModulesPut(?string $id = null): void
    {
        self::currentUser();
        $tenantId = $id ?? '';
        if ($tenantId === '') {
            Response::error('Tenant id required', 400);
            return;
        }

        $body = Auth::jsonBody();
        $modules = $body['modules'] ?? null;
        if (!is_array($modules)) {
            Response::error('modules array required', 400);
            return;
        }

        try {
            foreach ($modules as $mod) {
                if (!is_array($mod) || empty($mod['moduleKey'])) {
                    continue;
                }
                $moduleKey = (string) $mod['moduleKey'];
                $enabled = !empty($mod['enabled']) ? 1 : 0;
                Database::execute(
                    'INSERT INTO tenant_modules (id, tenant_id, module_key, is_enabled)
                     VALUES (?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled)',
                    [self::uuid(), $tenantId, $moduleKey, $enabled]
                );
            }
        } catch (Throwable $e) {
            error_log('AdminController tenantModulesPut: ' . $e->getMessage());
            Response::error('Failed to update modules', 500);
            return;
        }

        self::tenantModules($tenantId);
    }

    /** GET /admin/tenants/:id/integrations */
    public static function tenantIntegrations(?string $id = null): void
    {
        self::currentUser();
        $tenantId = $id ?? '';
        if ($tenantId === '') {
            Response::error('Tenant id required', 400);
            return;
        }

        try {
            $rows = Database::query(
                'SELECT source_type, is_active, last_sync_at, last_error, connection_verified_at,
                        credentials_encrypted, webhook_secret, sync_interval_minutes,
                        wialon_account_name, wialon_resource_id, wialon_operate_as
                 FROM data_sources WHERE tenant_id = ?',
                [$tenantId]
            );
        } catch (Throwable $e) {
            error_log('AdminController tenantIntegrations: ' . $e->getMessage());
            Response::success([]);
            return;
        }

        $result = [];
        foreach ($rows as $row) {
            $result[] = [
                'sourceType' => $row['source_type'],
                'isActive' => (bool) ((int) ($row['is_active'] ?? 0)),
                'lastSyncAt' => $row['last_sync_at'] ?? null,
                'lastError' => $row['last_error'] ?? null,
                'verified' => !empty($row['connection_verified_at']),
                'hasCredentials' => !empty($row['credentials_encrypted']),
                'hasWebhookSecret' => !empty($row['webhook_secret']),
                'syncIntervalMinutes' => isset($row['sync_interval_minutes']) ? (int) $row['sync_interval_minutes'] : null,
                'wialonAccountName' => $row['wialon_account_name'] ?? null,
                'wialonResourceId' => isset($row['wialon_resource_id']) ? (int) $row['wialon_resource_id'] : null,
                'wialonOperateAs' => $row['wialon_operate_as'] ?? null,
            ];
        }

        Response::success($result);
    }

    /** PATCH /admin/users/:id */
    public static function userPatch(?string $id = null): void
    {
        self::currentUser();
        $userId = $id ?? '';
        if ($userId === '') {
            Response::error('User id required', 400);
            return;
        }

        $body = Auth::jsonBody();
        $fields = [];
        $params = [];

        if (array_key_exists('fullName', $body)) {
            $fields[] = 'full_name = ?';
            $params[] = (string) $body['fullName'];
        }
        if (array_key_exists('role', $body)) {
            $fields[] = 'role = ?';
            $params[] = (string) $body['role'];
        }
        if (array_key_exists('isActive', $body)) {
            $fields[] = 'is_active = ?';
            $params[] = (bool) $body['isActive'] ? 1 : 0;
        }

        if (!$fields) {
            Response::error('No fields to update', 400);
            return;
        }

        $params[] = $userId;

        try {
            $updated = Database::execute(
                'UPDATE users SET ' . implode(', ', $fields) . ', updated_at = NOW() WHERE id = ?',
                $params
            );
        } catch (Throwable $e) {
            error_log('AdminController userPatch: ' . $e->getMessage());
            Response::error('Failed to update user', 500);
            return;
        }

        if ($updated === 0) {
            $exists = Database::query('SELECT id FROM users WHERE id = ? LIMIT 1', [$userId]);
            if (!$exists) {
                Response::error('User not found', 404);
                return;
            }
        }

        $rows = Database::query(
            'SELECT id, email, full_name, role, is_active, last_login_at, created_at, tenant_id
             FROM users WHERE id = ? LIMIT 1',
            [$userId]
        );
        $row = $rows[0] ?? [];
        Response::success([
            'id' => $row['id'] ?? $userId,
            'email' => $row['email'] ?? null,
            'fullName' => $row['full_name'] ?? null,
            'role' => $row['role'] ?? null,
            'isActive' => (bool) ((int) ($row['is_active'] ?? 0)),
            'lastLoginAt' => $row['last_login_at'] ?? null,
            'createdAt' => $row['created_at'] ?? null,
            'tenantId' => $row['tenant_id'] ?? null,
        ]);
    }

    /** POST /admin/users/:id/reset-password */
    public static function userResetPassword(?string $id = null): void
    {
        self::currentUser();
        $userId = $id ?? '';
        if ($userId === '') {
            Response::error('User id required', 400);
            return;
        }

        $body = Auth::jsonBody();
        $password = (string) ($body['password'] ?? '');
        if (strlen($password) < 8) {
            Response::error('Password must be at least 8 characters', 400);
            return;
        }

        try {
            $updated = Database::execute(
                'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?',
                [password_hash($password, PASSWORD_BCRYPT), $userId]
            );
        } catch (Throwable $e) {
            error_log('AdminController userResetPassword: ' . $e->getMessage());
            Response::error('Failed to reset password', 500);
            return;
        }

        if ($updated === 0) {
            $exists = Database::query('SELECT id FROM users WHERE id = ? LIMIT 1', [$userId]);
            if (!$exists) {
                Response::error('User not found', 404);
                return;
            }
        }

        Response::success(['ok' => true]);
    }

    /** PUT /admin/system/settings/:key */
    public static function systemSettingPut(?string $key = null): void
    {
        self::currentUser();
        $settingKey = $key ?? '';
        if ($settingKey === '') {
            Response::error('Setting key required', 400);
            return;
        }

        $body = Auth::jsonBody();
        $value = array_key_exists('value', $body) ? $body['value'] : $body;

        try {
            Database::execute(
                'INSERT INTO system_settings (`key`, value, updated_at) VALUES (?, ?, NOW())
                 ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW()',
                [$settingKey, json_encode($value)]
            );
        } catch (Throwable $e) {
            error_log('AdminController systemSettingPut: ' . $e->getMessage());
            Response::error('Failed to update setting', 500);
            return;
        }

        Response::success(['key' => $settingKey, 'value' => $value]);
    }

    /** PATCH /admin/marketplace/:key */
    public static function marketplacePatch(?string $key = null): void
    {
        self::currentUser();
        $marketplaceKey = $key ?? '';
        if ($marketplaceKey === '') {
            Response::error('Marketplace key required', 400);
            return;
        }

        $body = Auth::jsonBody();
        $fields = [];
        $params = [];

        if (array_key_exists('enabled', $body) && self::columnExists('marketplace_integrations', 'is_enabled_globally')) {
            $fields[] = 'is_enabled_globally = ?';
            $params[] = (bool) $body['enabled'] ? 1 : 0;
        }
        if (array_key_exists('status', $body) && self::columnExists('marketplace_integrations', 'status')) {
            $fields[] = 'status = ?';
            $params[] = (string) $body['status'];
        }

        if (!$fields) {
            Response::error('No updatable fields provided', 400);
            return;
        }

        $params[] = $marketplaceKey;

        try {
            $updated = Database::execute(
                'UPDATE marketplace_integrations SET ' . implode(', ', $fields) . ' WHERE `key` = ?',
                $params
            );
        } catch (Throwable $e) {
            error_log('AdminController marketplacePatch: ' . $e->getMessage());
            Response::error('Failed to update marketplace integration', 500);
            return;
        }

        if ($updated === 0) {
            $exists = Database::query('SELECT `key` FROM marketplace_integrations WHERE `key` = ? LIMIT 1', [$marketplaceKey]);
            if (!$exists) {
                Response::error('Marketplace integration not found', 404);
                return;
            }
        }

        $rows = Database::query('SELECT * FROM marketplace_integrations WHERE `key` = ? LIMIT 1', [$marketplaceKey]);
        Response::success($rows ? self::camelCase($rows[0]) : null);
    }

    /** POST /admin/tenants */
    public static function tenantCreate(): void
    {
        self::currentUser();
        $body = Auth::jsonBody();

        $name = trim((string) ($body['name'] ?? ''));
        $slug = trim((string) ($body['slug'] ?? ''));
        $contactEmail = trim((string) ($body['contactEmail'] ?? ''));

        if ($name === '' || $slug === '') {
            Response::error('name and slug are required', 400);
            return;
        }

        $slug = strtolower((string) preg_replace('/[^a-z0-9-]+/', '-', $slug));
        $slug = trim($slug, '-');
        if ($slug === '') {
            Response::error('A valid slug is required', 400);
            return;
        }

        $existing = Database::query('SELECT id FROM tenants WHERE slug = ? LIMIT 1', [$slug]);
        if ($existing) {
            Response::error('A tenant with this slug already exists', 409);
            return;
        }

        $id = self::uuid();
        try {
            Database::execute(
                "INSERT INTO tenants (id, name, slug, contact_email, is_active, status, created_at, updated_at)
                 VALUES (?, ?, ?, ?, 1, 'active', NOW(), NOW())",
                [$id, $name, $slug, $contactEmail !== '' ? $contactEmail : null]
            );
        } catch (Throwable $e) {
            error_log('AdminController tenantCreate: ' . $e->getMessage());
            Response::error('Failed to create tenant', 500);
            return;
        }

        if (self::tableExists('module_definitions')) {
            try {
                Database::execute(
                    'INSERT INTO tenant_modules (id, tenant_id, module_key, is_enabled)
                     SELECT UUID(), ?, `key`, default_enabled FROM module_definitions',
                    [$id]
                );
            } catch (Throwable $e) {
                error_log('AdminController tenantCreate seed modules: ' . $e->getMessage());
            }
        }

        $rows = Database::query('SELECT * FROM tenants WHERE id = ? LIMIT 1', [$id]);
        Response::success($rows ? self::mapTenant($rows[0]) : ['id' => $id, 'name' => $name, 'slug' => $slug], 201);
    }
}
