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

    /** Safe query helper — returns [] on missing table / SQL error */
    private static function safeRows(string $sql, array $params = []): array
    {
        try {
            return Database::query($sql, $params);
        } catch (Throwable $e) {
            error_log('AdminController safeRows: ' . $e->getMessage());
            return [];
        }
    }

    /** GET /admin/dashboard — parity with Node AdminOrchestrator.getDashboardStats */
    public static function dashboard(): void
    {
        self::currentUser();

        $tenantStats = self::safeRows(
            "SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'active' OR (status IS NULL AND is_active = 1) THEN 1 ELSE 0 END) AS active,
                SUM(CASE WHEN status = 'warning' THEN 1 ELSE 0 END) AS warning,
                SUM(CASE WHEN status IN ('inactive', 'suspended') OR is_active = 0 THEN 1 ELSE 0 END) AS inactive
             FROM tenants"
        )[0] ?? [];

        $vehicleStats = self::safeRows(
            "SELECT COUNT(*) AS total,
                    SUM(CASE WHEN (
                        SELECT s.status FROM asset_status s
                        WHERE s.asset_id = a.id
                        ORDER BY s.recorded_at DESC
                        LIMIT 1
                    ) IN ('moving', 'idle', 'stopped') THEN 1 ELSE 0 END) AS active
             FROM assets a"
        )[0] ?? [];

        $userStats = self::safeRows(
            "SELECT COUNT(*) AS total FROM users WHERE role NOT IN ('platform_admin', 'super_admin')"
        )[0] ?? [];

        $alertStats = self::safeRows(
            'SELECT COUNT(*) AS pending FROM alerts WHERE acknowledged = 0'
        )[0] ?? [];

        $integrationStats = self::safeRows(
            'SELECT COUNT(*) AS total,
                    SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active
             FROM data_sources'
        )[0] ?? [];

        $totalIntegrations = (int) ($integrationStats['total'] ?? 0);
        $activeIntegrations = (int) ($integrationStats['active'] ?? 0);
        $integrationHealth = $totalIntegrations > 0
            ? round(($activeIntegrations / $totalIntegrations) * 1000) / 10
            : 100.0;

        $assetStatusBreakdown = self::safeRows(
            "SELECT COALESCE((
                 SELECT s.status FROM asset_status s
                 WHERE s.asset_id = a.id
                 ORDER BY s.recorded_at DESC LIMIT 1
               ), 'offline') AS status,
               COUNT(DISTINCT a.id) AS count
             FROM assets a
             GROUP BY status"
        );

        $alertsTimeline = self::safeRows(
            "SELECT DATE_FORMAT(occurred_at, '%Y-%m-%d %H:00:00') AS hour,
                    SUM(CASE WHEN severity IN ('critical', 'emergency') THEN 1 ELSE 0 END) AS critical,
                    SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END) AS warning,
                    SUM(CASE WHEN severity = 'info' THEN 1 ELSE 0 END) AS info
             FROM alerts
             WHERE occurred_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
             GROUP BY hour
             ORDER BY hour"
        );

        $alertsBySeverity = self::safeRows(
            "SELECT severity, COUNT(*) AS count
             FROM alerts
             WHERE occurred_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
             GROUP BY severity
             ORDER BY count DESC"
        );

        $alertsVolume7d = self::safeRows(
            "SELECT DATE(occurred_at) AS day, COUNT(*) AS count
             FROM alerts
             WHERE occurred_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
             GROUP BY day
             ORDER BY day"
        );

        $syncTimeline = self::safeRows(
            "SELECT DATE(started_at) AS day,
                    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success,
                    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
             FROM integration_sync_logs
             WHERE started_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
             GROUP BY day
             ORDER BY day"
        );

        $healthHistory = self::safeRows(
            "SELECT DATE(started_at) AS day,
                    ROUND(AVG(CASE WHEN status = 'success' THEN 100 ELSE 0 END), 1) AS score
             FROM integration_sync_logs
             WHERE started_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
             GROUP BY day
             ORDER BY day"
        );

        $integrationsBySource = self::safeRows(
            "SELECT source_type,
                    COUNT(*) AS total,
                    SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active
             FROM data_sources
             GROUP BY source_type
             ORDER BY total DESC"
        );

        $tenantStatusBreakdown = self::safeRows(
            "SELECT COALESCE(status, CASE WHEN is_active = 1 THEN 'active' ELSE 'inactive' END) AS status,
                    COUNT(*) AS count
             FROM tenants
             GROUP BY status"
        );

        $growthHistory = self::safeRows(
            "SELECT DATE(created_at) AS day, COUNT(*) AS count
             FROM tenants
             WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
             GROUP BY day
             ORDER BY day"
        );

        $topTenants = self::safeRows(
            "SELECT t.id, t.name, t.slug, t.status,
                    (SELECT COUNT(*) FROM assets a WHERE a.tenant_id = t.id) AS vehicle_count,
                    (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS user_count
             FROM tenants t
             ORDER BY vehicle_count DESC
             LIMIT 5"
        );

        $recentSyncs = self::safeRows(
            "SELECT isl.source_type, isl.status, isl.vehicles_synced, isl.started_at, isl.message,
                    t.name AS tenant_name
             FROM integration_sync_logs isl
             JOIN tenants t ON t.id = isl.tenant_id
             ORDER BY isl.started_at DESC
             LIMIT 8"
        );

        $recentIncidents = self::safeRows(
            "SELECT isl.id, isl.source_type, isl.status, isl.message, isl.started_at,
                    t.name AS tenant_name
             FROM integration_sync_logs isl
             JOIN tenants t ON t.id = isl.tenant_id
             WHERE isl.status = 'failed'
             ORDER BY isl.started_at DESC
             LIMIT 5"
        );

        $recentActivity = self::safeRows(
            "SELECT af.*, t.name AS tenant_name
             FROM activity_feed af
             LEFT JOIN tenants t ON t.id = af.tenant_id
             ORDER BY af.created_at DESC
             LIMIT 10"
        );

        $loginStats = self::safeRows(
            "SELECT
                SUM(CASE WHEN last_login_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) AS logins24h,
                SUM(CASE WHEN last_login_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS activeUsers7d
             FROM users WHERE is_active = 1"
        )[0] ?? [];

        $webhookStats = self::safeRows(
            "SELECT COUNT(*) AS events24h FROM alerts
             WHERE source_type IN ('loconav', 'tracksolid')
               AND occurred_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)"
        )[0] ?? [];

        $syncStats24h = self::safeRows(
            "SELECT COUNT(*) AS total,
                    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success,
                    COALESCE(SUM(CASE WHEN status = 'success' THEN vehicles_synced ELSE 0 END), 0) AS assetsSynced
             FROM integration_sync_logs
             WHERE started_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)"
        )[0] ?? [];

        $lastSyncRows = self::safeRows('SELECT MAX(last_sync_at) AS last_sync FROM data_sources');
        $lastSync = $lastSyncRows[0]['last_sync'] ?? null;

        $totalTenants = (int) ($tenantStats['total'] ?? 0);
        $activeTenants = (int) ($tenantStats['active'] ?? 0);
        $totalVehicles = (int) ($vehicleStats['total'] ?? 0);
        $activeVehicles = (int) ($vehicleStats['active'] ?? 0);
        $syncs24h = (int) ($syncStats24h['total'] ?? 0);
        $syncSuccess24h = (int) ($syncStats24h['success'] ?? 0);

        $mapSeries = static function (array $rows, array $keys): array {
            $out = [];
            foreach ($rows as $row) {
                $item = [];
                foreach ($keys as $key) {
                    $val = $row[$key] ?? null;
                    if (is_numeric($val) && !str_contains((string) $key, 'name') && !str_contains((string) $key, 'slug')
                        && !str_contains((string) $key, 'status') && !str_contains((string) $key, 'type')
                        && !str_contains((string) $key, 'message') && !str_contains((string) $key, 'hour')
                        && !str_contains((string) $key, 'day') && !str_contains((string) $key, 'severity')
                        && $key !== 'id') {
                        $item[$key] = str_contains((string) $val, '.') ? (float) $val : (int) $val;
                    } else {
                        $item[$key] = $val;
                    }
                }
                $out[] = $item;
            }
            return $out;
        };

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
            'integrationHealth' => $integrationHealth,
            'healthScore' => $integrationHealth,
            'logins24h' => (int) ($loginStats['logins24h'] ?? 0),
            'activeUsers7d' => (int) ($loginStats['activeUsers7d'] ?? 0),
            'webhooks24h' => (int) ($webhookStats['events24h'] ?? 0),
            'syncs24h' => $syncs24h,
            'syncSuccess24h' => $syncSuccess24h,
            'syncRate24h' => $syncs24h > 0 ? (int) round(($syncSuccess24h / $syncs24h) * 100) : 100,
            'assetsSynced24h' => (int) ($syncStats24h['assetsSynced'] ?? 0),
            'lastSync' => $lastSync,
            'generatedAt' => gmdate('c'),
            'assetStatusBreakdown' => $mapSeries($assetStatusBreakdown, ['status', 'count']),
            'alertsTimeline' => $mapSeries($alertsTimeline, ['hour', 'critical', 'warning', 'info']),
            'alertsBySeverity' => $mapSeries($alertsBySeverity, ['severity', 'count']),
            'alertsVolume7d' => $mapSeries($alertsVolume7d, ['day', 'count']),
            'syncTimeline' => $mapSeries($syncTimeline, ['day', 'success', 'failed']),
            'healthHistory' => $mapSeries($healthHistory, ['day', 'score']),
            'integrationsBySource' => $mapSeries($integrationsBySource, ['source_type', 'total', 'active']),
            'tenantStatusBreakdown' => $mapSeries($tenantStatusBreakdown, ['status', 'count']),
            'growthHistory' => $mapSeries($growthHistory, ['day', 'count']),
            'topTenants' => array_map(static function (array $t): array {
                return [
                    'id' => $t['id'] ?? null,
                    'name' => $t['name'] ?? '',
                    'slug' => $t['slug'] ?? '',
                    'status' => $t['status'] ?? null,
                    'vehicleCount' => (int) ($t['vehicle_count'] ?? 0),
                    'userCount' => (int) ($t['user_count'] ?? 0),
                ];
            }, $topTenants),
            'recentSyncs' => array_map(static function (array $s): array {
                return [
                    'sourceType' => $s['source_type'] ?? null,
                    'status' => $s['status'] ?? null,
                    'vehiclesSynced' => isset($s['vehicles_synced']) ? (int) $s['vehicles_synced'] : 0,
                    'startedAt' => $s['started_at'] ?? null,
                    'message' => $s['message'] ?? null,
                    'tenantName' => $s['tenant_name'] ?? null,
                ];
            }, $recentSyncs),
            'recentIncidents' => array_map(static function (array $s): array {
                return [
                    'id' => $s['id'] ?? null,
                    'sourceType' => $s['source_type'] ?? null,
                    'status' => $s['status'] ?? null,
                    'message' => $s['message'] ?? null,
                    'startedAt' => $s['started_at'] ?? null,
                    'tenantName' => $s['tenant_name'] ?? null,
                ];
            }, $recentIncidents),
            'recentActivity' => array_map(static function (array $a): array {
                return [
                    'id' => $a['id'] ?? null,
                    'action' => $a['action'] ?? ($a['event_type'] ?? null),
                    'message' => $a['message'] ?? ($a['description'] ?? null),
                    'tenantName' => $a['tenant_name'] ?? null,
                    'createdAt' => $a['created_at'] ?? null,
                ];
            }, $recentActivity),
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

    /** POST /admin/system-users */
    public static function systemUsersCreate(): void
    {
        $actor = self::currentUser();
        if (($actor['role'] ?? '') !== 'super_admin') {
            Response::error('Super admin required', 403);
            return;
        }

        $body = Auth::jsonBody();
        $email = strtolower(trim((string) ($body['email'] ?? '')));
        $password = (string) ($body['password'] ?? '');
        $fullName = trim((string) ($body['fullName'] ?? ''));
        $role = (($body['role'] ?? '') === 'super_admin') ? 'super_admin' : 'platform_admin';

        if ($email === '' || $password === '') {
            Response::error('email and password required', 400);
            return;
        }
        if (strlen($password) < 8) {
            Response::error('Password must be at least 8 characters', 400);
            return;
        }

        $id = self::uuid();
        try {
            Database::execute(
                'INSERT INTO users (id, tenant_id, email, password_hash, full_name, role, is_active, created_at, updated_at)
                 VALUES (?, NULL, ?, ?, ?, ?, 1, NOW(), NOW())',
                [$id, $email, password_hash($password, PASSWORD_BCRYPT), $fullName !== '' ? $fullName : $email, $role]
            );
            Response::success([
                'id' => $id,
                'email' => $email,
                'fullName' => $fullName !== '' ? $fullName : $email,
                'role' => $role,
                'isActive' => true,
            ], 201);
        } catch (Throwable $e) {
            error_log('AdminController systemUsersCreate: ' . $e->getMessage());
            Response::error('Failed to create system user (email may already exist)', 500);
        }
    }

    /** PATCH /admin/system-users/:id */
    public static function systemUsersPatch(?string $id = null): void
    {
        $actor = self::currentUser();
        if (($actor['role'] ?? '') !== 'super_admin') {
            Response::error('Super admin required', 403);
            return;
        }
        $userId = $id ?? '';
        if ($userId === '') {
            Response::error('User id required', 400);
            return;
        }

        $body = Auth::jsonBody();
        $fields = [];
        $params = [];
        if (array_key_exists('isActive', $body)) {
            $fields[] = 'is_active = ?';
            $params[] = (bool) $body['isActive'] ? 1 : 0;
        }
        if (array_key_exists('fullName', $body)) {
            $fields[] = 'full_name = ?';
            $params[] = (string) $body['fullName'];
        }
        if (isset($body['role']) && in_array($body['role'], ['super_admin', 'platform_admin'], true)) {
            $fields[] = 'role = ?';
            $params[] = (string) $body['role'];
        }
        if (!$fields) {
            Response::error('No fields to update', 400);
            return;
        }
        $params[] = $userId;

        try {
            $updated = Database::execute(
                "UPDATE users SET " . implode(', ', $fields) . ", updated_at = NOW()
                 WHERE id = ? AND tenant_id IS NULL AND role IN ('super_admin', 'platform_admin')",
                $params
            );
            if ($updated === 0) {
                Response::error('System user not found', 404);
                return;
            }
            $rows = Database::query(
                'SELECT id, email, full_name, role, is_active FROM users WHERE id = ? LIMIT 1',
                [$userId]
            );
            $row = $rows[0] ?? [];
            Response::success([
                'id' => $row['id'] ?? $userId,
                'email' => $row['email'] ?? null,
                'fullName' => $row['full_name'] ?? null,
                'role' => $row['role'] ?? null,
                'isActive' => (bool) ((int) ($row['is_active'] ?? 0)),
            ]);
        } catch (Throwable $e) {
            error_log('AdminController systemUsersPatch: ' . $e->getMessage());
            Response::error('Failed to update system user', 500);
        }
    }

    /** POST /admin/system-users/:id/reset-password */
    public static function systemUsersResetPassword(?string $id = null): void
    {
        $actor = self::currentUser();
        if (($actor['role'] ?? '') !== 'super_admin') {
            Response::error('Super admin required', 403);
            return;
        }
        $userId = $id ?? '';
        if ($userId === '') {
            Response::error('User id required', 400);
            return;
        }
        $body = Auth::jsonBody();
        $password = trim((string) ($body['password'] ?? ''));
        if ($password === '') {
            $password = bin2hex(random_bytes(8));
        }
        if (strlen($password) < 8) {
            Response::error('Password must be at least 8 characters', 400);
            return;
        }
        try {
            $updated = Database::execute(
                "UPDATE users SET password_hash = ?, updated_at = NOW()
                 WHERE id = ? AND tenant_id IS NULL AND role IN ('super_admin', 'platform_admin')",
                [password_hash($password, PASSWORD_BCRYPT), $userId]
            );
            if ($updated === 0) {
                Response::error('System user not found', 404);
                return;
            }
            Response::success(['reset' => true, 'temporaryPassword' => $password]);
        } catch (Throwable $e) {
            error_log('AdminController systemUsersResetPassword: ' . $e->getMessage());
            Response::error('Failed to reset password', 500);
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

        $enabledValue = null;
        if (array_key_exists('isEnabledGlobally', $body)) {
            $enabledValue = (bool) $body['isEnabledGlobally'];
        } elseif (array_key_exists('enabled', $body)) {
            $enabledValue = (bool) $body['enabled'];
        }
        if ($enabledValue !== null && self::columnExists('marketplace_integrations', 'is_enabled_globally')) {
            $fields[] = 'is_enabled_globally = ?';
            $params[] = $enabledValue ? 1 : 0;
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

    /** GET /admin/centers/:source — LocoNav / TrackSolid rollup (IntegrationCenterService parity) */
    public static function integrationCenter(?string $source = null): void
    {
        self::currentUser();
        $sourceType = strtolower(trim((string) ($source ?? '')));
        if (!in_array($sourceType, ['loconav', 'tracksolid'], true)) {
            Response::error('Unsupported integration center', 400);
            return;
        }

        try {
            $rows = Database::query(
                "SELECT t.id AS tenant_id, t.name AS tenant_name, t.slug AS tenant_slug,
                        ds.is_active, ds.connection_verified_at, ds.last_sync_at, ds.last_error,
                        (SELECT COUNT(*) FROM asset_mappings am
                           JOIN assets a ON a.id = am.asset_id
                          WHERE a.tenant_id = t.id AND am.source_type = ?) AS asset_count,
                        (SELECT COUNT(*) FROM alerts al
                          WHERE al.tenant_id = t.id AND al.source_type = ?
                            AND al.occurred_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) AS alerts_24h
                 FROM data_sources ds
                 INNER JOIN tenants t ON t.id = ds.tenant_id
                 WHERE ds.source_type = ? AND (t.is_active = 1 OR t.status = 'active')
                 ORDER BY t.name",
                [$sourceType, $sourceType, $sourceType]
            );
        } catch (Throwable $e) {
            error_log('AdminController integrationCenter: ' . $e->getMessage());
            $rows = [];
        }

        $tenants = [];
        foreach ($rows as $row) {
            $verified = !empty($row['connection_verified_at']);
            $active = (bool) ((int) ($row['is_active'] ?? 0)) && $verified;
            $tenants[] = [
                'tenantId' => $row['tenant_id'],
                'tenantName' => $row['tenant_name'],
                'tenantSlug' => $row['tenant_slug'],
                'isActive' => $active,
                'verifiedAt' => $row['connection_verified_at'] ?? null,
                'lastSyncAt' => $row['last_sync_at'] ?? null,
                'lastError' => $row['last_error'] ?? null,
                'assetCount' => (int) ($row['asset_count'] ?? 0),
                'alerts24h' => (int) ($row['alerts_24h'] ?? 0),
            ];
        }

        $connectedTenants = count(array_filter($tenants, static fn(array $t): bool => !empty($t['isActive'])));
        $totalAssets = array_sum(array_map(static fn(array $t): int => (int) $t['assetCount'], $tenants));

        Response::success([
            'sourceType' => $sourceType,
            'configured' => count($tenants) > 0,
            'connected' => $connectedTenants > 0,
            'tenantCount' => count($tenants),
            'connectedTenants' => $connectedTenants,
            'totalAssets' => $totalAssets,
            'tenants' => $tenants,
            'webhookNote' => $sourceType === 'loconav'
                ? 'LocoNav camera and safety alerts are delivered via webhooks. Configure the webhook URL in each client integration.'
                : 'TrackSolid alarms sync on schedule and via webhooks when configured.',
        ]);
    }

    /** @param array<string, mixed> $row */
    private static function mapMother(array $row): array
    {
        $meta = [];
        if (!empty($row['session_meta'])) {
            $decoded = is_string($row['session_meta'])
                ? json_decode($row['session_meta'], true)
                : $row['session_meta'];
            $meta = is_array($decoded) ? $decoded : [];
        }
        $counts = isset($meta['counts']) && is_array($meta['counts']) ? $meta['counts'] : null;
        $isActive = (bool) ((int) ($row['is_active'] ?? 0));
        $verified = !empty($row['connection_verified_at']);
        $lastError = $row['last_error'] ?? null;

        return [
            'id' => $row['id'],
            'name' => $row['name'] ?? '',
            'baseUrl' => $row['base_url'] ?? null,
            'isActive' => $isActive,
            'connected' => $isActive && $verified && empty($lastError),
            'verifiedAt' => $row['connection_verified_at'] ?? null,
            'lastError' => $lastError,
            'meta' => $meta,
            'accountTier' => $row['account_tier'] ?? null,
            'linkedTenantCount' => (int) ($row['linked_tenant_count'] ?? 0),
            'counts' => $counts ? [
                'units' => isset($counts['units']) ? (int) $counts['units'] : null,
                'accounts' => isset($counts['accounts']) ? (int) $counts['accounts'] : null,
                'users' => isset($counts['users']) ? (int) $counts['users'] : null,
            ] : null,
        ];
    }

    /** GET /admin/centers/wialon */
    public static function wialonCenterStatus(): void
    {
        self::currentUser();
        require_once __DIR__ . '/../../lib/Crypto.php';

        $mothers = [];
        try {
            $rows = Database::query(
                "SELECT m.*,
                        (SELECT COUNT(*) FROM data_sources ds
                          WHERE ds.wialon_mother_account_id = m.id
                            AND ds.source_type = 'wialon' AND ds.is_active = 1) AS linked_tenant_count
                 FROM wialon_mother_accounts m
                 ORDER BY m.created_at ASC"
            );
            $mothers = array_map([self::class, 'mapMother'], $rows);
        } catch (Throwable $e) {
            error_log('AdminController wialonCenterStatus: ' . $e->getMessage());
        }

        $assigned = 0;
        try {
            $countRows = Database::query(
                "SELECT COUNT(*) AS c FROM data_sources
                 WHERE source_type = 'wialon' AND is_active = 1
                   AND wialon_resource_id IS NOT NULL AND wialon_resource_id > 0"
            );
            $assigned = (int) ($countRows[0]['c'] ?? 0);
        } catch (Throwable $e) {
            $assigned = 0;
        }

        $connected = count(array_filter($mothers, static fn(array $m): bool => !empty($m['connected'])));
        $first = $mothers[0] ?? null;

        Response::success([
            'configured' => count($mothers) > 0,
            'connected' => $connected > 0,
            'verifiedAt' => $first['verifiedAt'] ?? null,
            'lastError' => $first['lastError'] ?? null,
            'meta' => $first['meta'] ?? null,
            'motherAccounts' => $mothers,
            'motherAccountCount' => count($mothers),
            'assignedAccountCount' => $assigned,
        ]);
    }

    /** GET /admin/centers/wialon/mothers */
    public static function wialonMothersList(): void
    {
        self::currentUser();
        try {
            $rows = Database::query(
                "SELECT m.*,
                        (SELECT COUNT(*) FROM data_sources ds
                          WHERE ds.wialon_mother_account_id = m.id
                            AND ds.source_type = 'wialon' AND ds.is_active = 1) AS linked_tenant_count
                 FROM wialon_mother_accounts m
                 ORDER BY m.created_at ASC"
            );
            $mothers = array_map([self::class, 'mapMother'], $rows);
            Response::success(['mothers' => $mothers, 'count' => count($mothers)]);
        } catch (Throwable $e) {
            error_log('AdminController wialonMothersList: ' . $e->getMessage());
            Response::success(['mothers' => [], 'count' => 0]);
        }
    }

    /** POST /admin/centers/wialon/mothers */
    public static function wialonMothersCreate(): void
    {
        self::currentUser();
        require_once __DIR__ . '/../../lib/Crypto.php';
        $body = Auth::jsonBody();
        $creds = is_array($body['credentials'] ?? null) ? $body['credentials'] : $body;
        $name = trim((string) ($creds['name'] ?? $body['name'] ?? 'Mother account'));
        $token = trim((string) ($creds['token'] ?? ''));
        $baseUrl = trim((string) ($creds['baseUrl'] ?? $body['baseUrl'] ?? ''));

        if ($token === '') {
            Response::error('Wialon token is required', 400);
            return;
        }

        $id = self::uuid();
        try {
            $encrypted = Crypto::encrypt([
                'token' => $token,
                'baseUrl' => $baseUrl !== '' ? $baseUrl : null,
            ]);
            $meta = json_encode([
                'baseUrl' => $baseUrl !== '' ? $baseUrl : 'https://hst-api.wialon.com/wialon/ajax.html',
                'configuredAt' => gmdate('c'),
            ]);
            Database::execute(
                'INSERT INTO wialon_mother_accounts
                   (id, name, credentials_encrypted, base_url, is_active, connection_verified_at, last_error, session_meta, created_at, updated_at)
                 VALUES (?, ?, ?, ?, 1, NULL, NULL, ?, NOW(), NOW())',
                [$id, $name !== '' ? $name : 'Mother account', $encrypted, $baseUrl !== '' ? $baseUrl : null, $meta]
            );
            $rows = Database::query(
                "SELECT m.*, 0 AS linked_tenant_count FROM wialon_mother_accounts m WHERE m.id = ? LIMIT 1",
                [$id]
            );
            Response::success(['mother' => self::mapMother($rows[0] ?? ['id' => $id, 'name' => $name])], 201);
        } catch (Throwable $e) {
            error_log('AdminController wialonMothersCreate: ' . $e->getMessage());
            Response::error($e->getMessage(), 500);
        }
    }

    /** PUT /admin/centers/wialon/mothers/:id */
    public static function wialonMothersUpdate(?string $id = null): void
    {
        self::currentUser();
        require_once __DIR__ . '/../../lib/Crypto.php';
        $motherId = $id ?? '';
        if ($motherId === '') {
            Response::error('Mother id required', 400);
            return;
        }
        $body = Auth::jsonBody();
        $creds = is_array($body['credentials'] ?? null) ? $body['credentials'] : $body;

        try {
            $existing = Database::query('SELECT * FROM wialon_mother_accounts WHERE id = ? LIMIT 1', [$motherId]);
            if (!$existing) {
                Response::error('Mother account not found', 404);
                return;
            }

            $name = array_key_exists('name', $creds)
                ? trim((string) $creds['name'])
                : (string) ($existing[0]['name'] ?? '');
            $baseUrl = array_key_exists('baseUrl', $creds)
                ? trim((string) $creds['baseUrl'])
                : (string) ($existing[0]['base_url'] ?? '');
            $isActive = array_key_exists('isActive', $creds)
                ? (!empty($creds['isActive']) ? 1 : 0)
                : (int) ($existing[0]['is_active'] ?? 1);

            $encrypted = null;
            $token = trim((string) ($creds['token'] ?? ''));
            if ($token !== '') {
                $encrypted = Crypto::encrypt([
                    'token' => $token,
                    'baseUrl' => $baseUrl !== '' ? $baseUrl : null,
                ]);
            }

            if ($encrypted !== null) {
                Database::execute(
                    'UPDATE wialon_mother_accounts
                     SET name=?, base_url=?, is_active=?, credentials_encrypted=?, updated_at=NOW()
                     WHERE id=?',
                    [$name !== '' ? $name : 'Mother account', $baseUrl !== '' ? $baseUrl : null, $isActive, $encrypted, $motherId]
                );
            } else {
                Database::execute(
                    'UPDATE wialon_mother_accounts SET name=?, base_url=?, is_active=?, updated_at=NOW() WHERE id=?',
                    [$name !== '' ? $name : 'Mother account', $baseUrl !== '' ? $baseUrl : null, $isActive, $motherId]
                );
            }

            $rows = Database::query(
                "SELECT m.*,
                        (SELECT COUNT(*) FROM data_sources ds
                          WHERE ds.wialon_mother_account_id = m.id AND ds.source_type='wialon' AND ds.is_active=1) AS linked_tenant_count
                 FROM wialon_mother_accounts m WHERE m.id = ? LIMIT 1",
                [$motherId]
            );
            Response::success(['mother' => self::mapMother($rows[0] ?? [])]);
        } catch (Throwable $e) {
            error_log('AdminController wialonMothersUpdate: ' . $e->getMessage());
            Response::error($e->getMessage(), 500);
        }
    }

    /** DELETE /admin/centers/wialon/mothers/:id */
    public static function wialonMothersDelete(?string $id = null): void
    {
        self::currentUser();
        $motherId = $id ?? '';
        if ($motherId === '') {
            Response::error('Mother id required', 400);
            return;
        }
        try {
            $updated = Database::execute('DELETE FROM wialon_mother_accounts WHERE id = ?', [$motherId]);
            if ($updated === 0) {
                Response::error('Mother account not found', 404);
                return;
            }
            Response::success(['deleted' => true]);
        } catch (Throwable $e) {
            error_log('AdminController wialonMothersDelete: ' . $e->getMessage());
            Response::error($e->getMessage(), 500);
        }
    }

    /** POST /admin/centers/wialon/mothers/:id/test */
    public static function wialonMothersTest(?string $id = null): void
    {
        self::currentUser();
        require_once __DIR__ . '/../../lib/Crypto.php';
        require_once __DIR__ . '/../../lib/WialonHierarchy.php';
        $motherId = $id ?? '';
        if ($motherId === '') {
            Response::error('Mother id required', 400);
            return;
        }
        try {
            $rows = Database::query(
                'SELECT credentials_encrypted, base_url, is_active FROM wialon_mother_accounts WHERE id = ? LIMIT 1',
                [$motherId]
            );
            if (!$rows) {
                Response::error('Mother account not found', 404);
                return;
            }
            if (!(int) ($rows[0]['is_active'] ?? 0)) {
                Response::error('Mother account is inactive', 400);
                return;
            }
            $creds = Crypto::decrypt((string) ($rows[0]['credentials_encrypted'] ?? ''));
            $token = trim((string) ($creds['token'] ?? ''));
            if ($token === '') {
                Response::error('Mother account token is missing', 400);
                return;
            }
            $baseUrl = $rows[0]['base_url'] ?? ($creds['baseUrl'] ?? null);
            $probe = WialonHierarchy::probe($token, is_string($baseUrl) ? $baseUrl : null);

            $meta = json_encode([
                'baseUrl' => $baseUrl ?: 'https://hst-api.wialon.com/wialon/ajax.html',
                'counts' => $probe['counts'] ?? [],
                'accountTier' => $probe['accountTier'] ?? null,
                'probedAt' => gmdate('c'),
            ]);

            Database::execute(
                'UPDATE wialon_mother_accounts
                 SET connection_verified_at = NOW(), last_error = NULL, account_tier = ?, session_meta = ?, updated_at = NOW()
                 WHERE id = ?',
                [$probe['accountTier'] ?? null, $meta, $motherId]
            );

            Response::success([
                'connected' => true,
                'probe' => $probe,
            ]);
        } catch (Throwable $e) {
            try {
                Database::execute(
                    'UPDATE wialon_mother_accounts SET last_error = ?, updated_at = NOW() WHERE id = ?',
                    [$e->getMessage(), $motherId]
                );
            } catch (Throwable $ignored) {
            }
            error_log('AdminController wialonMothersTest: ' . $e->getMessage());
            Response::error($e->getMessage(), 500);
        }
    }

    /** @return array{token:string,baseUrl:?string} */
    private static function loadMotherCreds(string $motherId): array
    {
        require_once __DIR__ . '/../../lib/Crypto.php';
        $rows = Database::query(
            'SELECT credentials_encrypted, base_url, is_active FROM wialon_mother_accounts WHERE id = ? LIMIT 1',
            [$motherId]
        );
        if (!$rows) {
            throw new RuntimeException('Mother account not found');
        }
        if (!(int) ($rows[0]['is_active'] ?? 0)) {
            throw new RuntimeException('Mother account is inactive');
        }
        $creds = Crypto::decrypt((string) ($rows[0]['credentials_encrypted'] ?? ''));
        $token = trim((string) ($creds['token'] ?? ''));
        if ($token === '') {
            throw new RuntimeException('Mother account token is missing');
        }
        $baseUrl = $rows[0]['base_url'] ?? ($creds['baseUrl'] ?? null);
        return [
            'token' => $token,
            'baseUrl' => is_string($baseUrl) && $baseUrl !== '' ? $baseUrl : null,
        ];
    }

    /** GET /admin/centers/wialon/hierarchy?motherId= */
    public static function wialonHierarchy(): void
    {
        self::currentUser();
        require_once __DIR__ . '/../../lib/WialonHierarchy.php';

        $motherId = trim((string) ($_GET['motherId'] ?? ''));
        try {
            if ($motherId === '') {
                $defaults = Database::query(
                    'SELECT id FROM wialon_mother_accounts WHERE is_active = 1 ORDER BY created_at ASC LIMIT 1'
                );
                $motherId = (string) ($defaults[0]['id'] ?? '');
            }
            if ($motherId === '') {
                Response::error('No Wialon mother account configured', 400);
                return;
            }

            $creds = self::loadMotherCreds($motherId);
            $probe = WialonHierarchy::probe($creds['token'], $creds['baseUrl']);

            // Attach assigned tenant info when present
            $assignments = [];
            try {
                $rows = Database::query(
                    "SELECT ds.wialon_resource_id, t.id AS tenant_id, t.name AS tenant_name, t.slug AS tenant_slug
                     FROM data_sources ds
                     JOIN tenants t ON t.id = ds.tenant_id
                     WHERE ds.source_type = 'wialon' AND ds.wialon_mother_account_id = ?
                       AND ds.wialon_resource_id IS NOT NULL",
                    [$motherId]
                );
                foreach ($rows as $row) {
                    $rid = (string) ((int) ($row['wialon_resource_id'] ?? 0));
                    if ($rid !== '0') {
                        $assignments[$rid] = [
                            'id' => $row['tenant_id'],
                            'name' => $row['tenant_name'],
                            'slug' => $row['tenant_slug'],
                        ];
                    }
                }
            } catch (Throwable $e) {
                $assignments = [];
            }

            $accounts = [];
            foreach ($probe['accounts'] ?? [] as $acct) {
                $aid = (string) ($acct['id'] ?? '');
                $acct['assignedTenant'] = $assignments[$aid] ?? null;
                $accounts[] = $acct;
            }
            $probe['accounts'] = $accounts;
            $probe['motherAccountId'] = $motherId;

            Response::success($probe);
        } catch (Throwable $e) {
            error_log('AdminController wialonHierarchy: ' . $e->getMessage());
            Response::error($e->getMessage(), 500);
        }
    }

    /** GET /admin/centers/wialon/accounts/:accountId?motherId= */
    public static function wialonAccount(?string $accountId = null): void
    {
        self::currentUser();
        require_once __DIR__ . '/../../lib/WialonHierarchy.php';
        $aid = $accountId ?? '';
        if ($aid === '') {
            Response::error('Account id required', 400);
            return;
        }
        $motherId = trim((string) ($_GET['motherId'] ?? ''));
        try {
            if ($motherId === '') {
                $defaults = Database::query(
                    'SELECT id FROM wialon_mother_accounts WHERE is_active = 1 ORDER BY created_at ASC LIMIT 1'
                );
                $motherId = (string) ($defaults[0]['id'] ?? '');
            }
            if ($motherId === '') {
                Response::error('No Wialon mother account configured', 400);
                return;
            }
            $creds = self::loadMotherCreds($motherId);
            $units = WialonHierarchy::unitsForAccount($creds['token'], $aid, $creds['baseUrl']);
            $sample = array_slice($units, 0, 100);

            $assigned = null;
            try {
                $rows = Database::query(
                    "SELECT t.id, t.name, t.slug
                     FROM data_sources ds
                     JOIN tenants t ON t.id = ds.tenant_id
                     WHERE ds.source_type = 'wialon' AND ds.wialon_resource_id = ?
                     LIMIT 1",
                    [(int) $aid]
                );
                if ($rows) {
                    $assigned = [
                        'id' => $rows[0]['id'],
                        'name' => $rows[0]['name'],
                        'slug' => $rows[0]['slug'],
                    ];
                }
            } catch (Throwable $e) {
                $assigned = null;
            }

            Response::success([
                'accountId' => $aid,
                'accountName' => null,
                'motherAccountId' => $motherId,
                'unitCount' => count($units),
                'userCount' => 0,
                'units' => $units,
                'users' => [],
                'sampleUnits' => $sample,
                'assignedTenant' => $assigned,
            ]);
        } catch (Throwable $e) {
            error_log('AdminController wialonAccount: ' . $e->getMessage());
            Response::error($e->getMessage(), 500);
        }
    }
}
