<?php

require_once __DIR__ . '/../../lib/Database.php';
require_once __DIR__ . '/../../lib/Auth.php';
require_once __DIR__ . '/../../lib/Response.php';

class ClientController
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

    /** @return array<string, mixed> */
    private static function jsonInput(): array
    {
        $raw = file_get_contents('php://input');
        if ($raw === false || $raw === '') {
            return [];
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
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

    /** @return array<string, mixed> */
    private static function currentUser(): array
    {
        Auth::requireAuth();
        $user = Auth::user();
        return is_array($user) ? $user : [];
    }

    private static function tenantId(): ?string
    {
        $user = self::currentUser();
        $tenantId = $user['tenant_id'] ?? $user['tenantId'] ?? null;
        return $tenantId !== null && $tenantId !== '' ? (string) $tenantId : null;
    }

    private static function requireTenantId(): string
    {
        $tenantId = self::tenantId();
        if ($tenantId === null) {
            Response::error('Tenant context required', 403);
            exit;
        }
        return $tenantId;
    }

    private static function uuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }

    private static function safeScalar(string $sql, array $params, string $label, int $default = 0): int
    {
        try {
            $rows = Database::query($sql, $params);
            if (!$rows) {
                return $default;
            }
            $row = $rows[0];
            $value = reset($row);
            return is_numeric($value) ? (int) $value : $default;
        } catch (Throwable $e) {
            error_log("ClientController query failed ($label): " . $e->getMessage());
            return $default;
        }
    }

    /** GET /client/tenant */
    public static function tenant(): void
    {
        $tenantId = self::requireTenantId();
        $rows = Database::query('SELECT * FROM tenants WHERE id = ? LIMIT 1', [$tenantId]);
        if (!$rows) {
            Response::error('Tenant not found', 404);
            return;
        }
        $t = $rows[0];
        Response::success([
            'id' => $t['id'],
            'name' => $t['name'],
            'slug' => $t['slug'],
            'primaryColor' => $t['primary_color'] ?? null,
            'secondaryColor' => $t['secondary_color'] ?? null,
            'accentColor' => $t['accent_color'] ?? null,
            'logoUrl' => self::normalizeUploadPath(isset($t['logo_url']) ? (string) $t['logo_url'] : null),
            'faviconUrl' => self::normalizeUploadPath(isset($t['favicon_url']) ? (string) $t['favicon_url'] : null),
            'customCss' => $t['custom_css'] ?? null,
            'contactEmail' => $t['contact_email'] ?? null,
            'phone' => $t['phone'] ?? null,
            'timezone' => $t['timezone'] ?? null,
        ]);
    }

    /** GET /client/modules */
    public static function modules(): void
    {
        $tenantId = self::requireTenantId();
        $user = self::currentUser();
        $role = (string) ($user['role'] ?? 'viewer');
        $userId = (string) ($user['id'] ?? '');

        $connectedSources = Database::query(
            'SELECT source_type FROM data_sources
             WHERE tenant_id = ? AND is_active = 1 AND connection_verified_at IS NOT NULL',
            [$tenantId]
        );
        $connected = [];
        foreach ($connectedSources as $src) {
            $connected[(string) $src['source_type']] = true;
        }

        $rows = Database::query(
            'SELECT md.`key` AS module_key, md.label, md.icon, md.sources, md.sort_order,
                    tm.is_enabled, COALESCE(tm.is_visible, 1) AS is_visible
             FROM tenant_modules tm
             JOIN module_definitions md ON md.`key` = tm.module_key
             WHERE tm.tenant_id = ? AND tm.is_enabled = 1
             ORDER BY md.sort_order',
            [$tenantId]
        );

        $allowedAll = in_array($role, ['platform_admin', 'super_admin', 'tenant_admin'], true);
        $userModuleKeys = null;
        if ($userId !== '' && !$allowedAll) {
            $userMods = Database::query(
                'SELECT module_key, is_enabled FROM user_modules WHERE user_id = ?',
                [$userId]
            );
            if ($userMods) {
                $userModuleKeys = [];
                foreach ($userMods as $mod) {
                    if ((int) ($mod['is_enabled'] ?? 0) === 1) {
                        $userModuleKeys[(string) $mod['module_key']] = true;
                    }
                }
            }
        }

        $result = [];
        foreach ($rows as $row) {
            $moduleKey = (string) $row['module_key'];
            if ($userModuleKeys !== null && !isset($userModuleKeys[$moduleKey])) {
                continue;
            }

            $sources = [];
            if (!empty($row['sources'])) {
                $decoded = is_string($row['sources']) ? json_decode($row['sources'], true) : $row['sources'];
                if (is_array($decoded)) {
                    $sources = $decoded;
                }
            }

            $integrationReady = count($sources) === 0;
            if (!$integrationReady) {
                foreach ($sources as $source) {
                    if (isset($connected[(string) $source])) {
                        $integrationReady = true;
                        break;
                    }
                }
            }

            $result[] = [
                'moduleKey' => $moduleKey,
                'label' => $row['label'] ?? $moduleKey,
                'icon' => $row['icon'] ?? null,
                'sources' => $sources,
                'sortOrder' => (int) ($row['sort_order'] ?? 0),
                'isEnabled' => (bool) ((int) ($row['is_enabled'] ?? 0)),
                'isVisible' => (bool) ((int) ($row['is_visible'] ?? 1)),
                'integrationReady' => $integrationReady,
            ];
        }

        Response::success($result);
    }

    /** GET /client/dashboard/kpis */
    public static function dashboardKpis(): void
    {
        $tenantId = self::requireTenantId();

        $totalAssets = self::safeScalar(
            'SELECT COUNT(*) AS c FROM assets WHERE tenant_id = ?',
            [$tenantId],
            'assets'
        );

        $unackAlerts = self::safeScalar(
            'SELECT COUNT(*) AS c FROM alerts WHERE tenant_id = ? AND acknowledged = 0',
            [$tenantId],
            'alerts_unack'
        );

        $criticalAlerts = self::safeScalar(
            "SELECT COUNT(*) AS c FROM alerts
             WHERE tenant_id = ? AND acknowledged = 0
               AND severity IN ('critical', 'emergency')",
            [$tenantId],
            'alerts_critical'
        );

        $totalDrivers = self::safeScalar(
            'SELECT COUNT(*) AS c FROM drivers WHERE tenant_id = ? AND deleted_at IS NULL',
            [$tenantId],
            'drivers'
        );

        $activeDrivers = self::safeScalar(
            "SELECT COUNT(*) AS c FROM drivers
             WHERE tenant_id = ? AND deleted_at IS NULL AND status = 'driving'",
            [$tenantId],
            'drivers_active'
        );

        $fuelTransactions30d = self::safeScalar(
            'SELECT COUNT(*) AS c FROM fuel_transactions
             WHERE tenant_id = ?
               AND timestamp >= UNIX_TIMESTAMP(DATE_SUB(NOW(), INTERVAL 30 DAY))',
            [$tenantId],
            'fuel_transactions_30d'
        );

        $statusCounts = ['moving' => 0, 'idle' => 0, 'stopped' => 0, 'offline' => 0];
        try {
            $statusRows = Database::query(
                'SELECT COALESCE(latest.status, \'offline\') AS status, COUNT(*) AS c
                 FROM assets a
                 LEFT JOIN (
                     SELECT s1.asset_id, s1.status
                     FROM asset_status s1
                     INNER JOIN (
                         SELECT asset_id, MAX(recorded_at) AS max_recorded_at
                         FROM asset_status
                         GROUP BY asset_id
                     ) s2 ON s2.asset_id = s1.asset_id AND s2.max_recorded_at = s1.recorded_at
                 ) latest ON latest.asset_id = a.id
                 WHERE a.tenant_id = ?
                 GROUP BY COALESCE(latest.status, \'offline\')',
                [$tenantId]
            );
            foreach ($statusRows as $row) {
                $status = (string) ($row['status'] ?? 'offline');
                if (array_key_exists($status, $statusCounts)) {
                    $statusCounts[$status] = (int) ($row['c'] ?? 0);
                } else {
                    $statusCounts['offline'] += (int) ($row['c'] ?? 0);
                }
            }
        } catch (Throwable $e) {
            error_log('ClientController dashboardKpis status counts: ' . $e->getMessage());
        }

        $moving = $statusCounts['moving'];
        $idle = $statusCounts['idle'];
        $stopped = $statusCounts['stopped'];
        $offline = $statusCounts['offline'];

        Response::success([
            'totalVehicles' => $totalAssets,
            'moving' => $moving,
            'idle' => $idle,
            'stopped' => $stopped,
            'offline' => $offline,
            'activeVehicles' => $moving + $idle + $stopped,
            'criticalAlerts' => $criticalAlerts,
            'unacknowledgedAlerts' => $unackAlerts,
            'totalDrivers' => $totalDrivers,
            'activeDrivers' => $activeDrivers,
            'fuelTransactions30d' => $fuelTransactions30d,
            'liveFromWialon' => false,
        ]);
    }

    /** GET /client/fleet/snapshot */
    public static function fleetSnapshot(): void
    {
        $tenantId = self::requireTenantId();

        require_once __DIR__ . '/../../lib/WialonFleet.php';
        $live = WialonFleet::tryLiveSnapshot($tenantId);
        if (is_array($live) && !empty($live['units'])) {
            Response::success($live);
            return;
        }

        $rows = Database::query(
            'SELECT a.id AS asset_id, a.name, a.registration_plate,
                    ast.status, ast.latitude, ast.longitude, ast.speed, ast.fuel_level,
                    ast.recorded_at, am.source_type, am.external_id
             FROM assets a
             LEFT JOIN asset_mappings am ON am.asset_id = a.id
             LEFT JOIN asset_status ast ON ast.asset_id = a.id
               AND ast.recorded_at = (
                   SELECT MAX(s2.recorded_at) FROM asset_status s2 WHERE s2.asset_id = a.id
               )
             WHERE a.tenant_id = ?
             ORDER BY a.name',
            [$tenantId]
        );

        $byAsset = [];
        foreach ($rows as $row) {
            $assetId = (string) $row['asset_id'];
            if (!isset($byAsset[$assetId])) {
                $byAsset[$assetId] = [
                    'row' => $row,
                    'sources' => [],
                ];
            }
            if (!empty($row['source_type']) && !empty($row['external_id'])) {
                $byAsset[$assetId]['sources'][] = [
                    'type' => (string) $row['source_type'],
                    'id' => (string) $row['external_id'],
                ];
            }
        }

        $units = [];
        $byStatus = ['moving' => 0, 'idle' => 0, 'stopped' => 0, 'offline' => 0];
        $byKind = [];
        $byHwName = [];
        $withPosition = 0;
        $latestRecordedAt = null;

        foreach ($byAsset as $assetId => $entry) {
            $row = $entry['row'];
            $status = (string) ($row['status'] ?? 'offline');
            if (!array_key_exists($status, $byStatus)) {
                $status = 'offline';
            }
            $byStatus[$status]++;

            $kind = 'tracker';
            $byKind[$kind] = ($byKind[$kind] ?? 0) + 1;
            $hwLabel = 'Unknown';
            $byHwName[$hwLabel] = ($byHwName[$hwLabel] ?? 0) + 1;

            $lat = isset($row['latitude']) ? (float) $row['latitude'] : null;
            $lng = isset($row['longitude']) ? (float) $row['longitude'] : null;
            $hasPos = $lat !== null && $lng !== null && !($lat == 0.0 && $lng == 0.0);
            if ($hasPos) {
                $withPosition++;
            }

            $wialonId = null;
            foreach ($entry['sources'] as $source) {
                if ($source['type'] === 'wialon' && ctype_digit($source['id'])) {
                    $wialonId = (int) $source['id'];
                    break;
                }
            }

            $recordedAt = $row['recorded_at'] ?? null;
            if ($recordedAt !== null) {
                $ts = strtotime((string) $recordedAt);
                if ($ts !== false && ($latestRecordedAt === null || $ts > $latestRecordedAt)) {
                    $latestRecordedAt = $ts;
                }
            }

            $unit = [
                'id' => $wialonId !== null ? (string) $wialonId : $assetId,
                'assetId' => $assetId,
                'wialonId' => $wialonId,
                'name' => (string) ($row['name'] ?? ('Unit ' . $assetId)),
                'plate' => $row['registration_plate'] ?? null,
                'kind' => $kind,
                'hwName' => $hwLabel,
                'modules' => [],
                'hardware' => null,
                'status' => $status,
                'fuelLevel' => isset($row['fuel_level']) ? (float) $row['fuel_level'] : null,
                'mileage' => 0,
            ];

            if ($hasPos) {
                $unit['position'] = [
                    'lat' => $lat,
                    'lng' => $lng,
                    'speed' => isset($row['speed']) ? (float) $row['speed'] : 0,
                    'time' => $recordedAt ? strtotime((string) $recordedAt) : time(),
                ];
            }

            $units[] = $unit;
        }

        // Aggregate trip mileage per asset (parity with live Wialon odometer when trips exist)
        try {
            $mileageRows = Database::query(
                'SELECT asset_id, COALESCE(SUM(mileage), 0) AS mileage
                 FROM trip_summaries
                 WHERE tenant_id = ? AND asset_id IS NOT NULL
                 GROUP BY asset_id',
                [$tenantId]
            );
            $byMileage = [];
            foreach ($mileageRows as $mr) {
                $byMileage[(string) $mr['asset_id']] = (float) ($mr['mileage'] ?? 0);
            }
            foreach ($units as &$u) {
                $aid = (string) ($u['assetId'] ?? '');
                if ($aid !== '' && isset($byMileage[$aid])) {
                    $u['mileage'] = $byMileage[$aid];
                }
            }
            unset($u);
        } catch (Throwable $e) {
            error_log('ClientController fleetSnapshot mileage: ' . $e->getMessage());
        }

        Response::success([
            'live' => false,
            'stale' => false,
            'fetchedAt' => $latestRecordedAt
                ? gmdate('c', $latestRecordedAt)
                : gmdate('c'),
            'units' => $units,
            'counts' => [
                'total' => count($units),
                'moving' => $byStatus['moving'],
                'idle' => $byStatus['idle'],
                'stopped' => $byStatus['stopped'],
                'offline' => $byStatus['offline'],
                'withPosition' => $withPosition,
                'byKind' => $byKind,
                'byHwName' => $byHwName,
            ],
            'assetCount' => count($units),
        ]);
    }

    /** GET /client/assets */
    public static function assets(): void
    {
        $tenantId = self::requireTenantId();

        $rows = Database::query(
            'SELECT a.id, a.name, a.registration_plate, a.vin, a.make, a.model, a.year,
                    am.source_type, am.external_id
             FROM assets a
             JOIN asset_mappings am ON am.asset_id = a.id
             WHERE a.tenant_id = ?
             ORDER BY a.name',
            [$tenantId]
        );

        $byAsset = [];
        foreach ($rows as $row) {
            $assetId = (string) $row['id'];
            if (!isset($byAsset[$assetId])) {
                $byAsset[$assetId] = [
                    'id' => $assetId,
                    'name' => (string) ($row['name'] ?? $assetId),
                    'registrationPlate' => $row['registration_plate'] ?? null,
                    'vin' => $row['vin'] ?? null,
                    'make' => $row['make'] ?? null,
                    'model' => $row['model'] ?? null,
                    'year' => isset($row['year']) ? (int) $row['year'] : null,
                    'tenantId' => $tenantId,
                    'sources' => [],
                ];
            }
            $byAsset[$assetId]['sources'][] = [
                'type' => (string) ($row['source_type'] ?? ''),
                'id' => (string) ($row['external_id'] ?? ''),
            ];
        }

        if (!$byAsset) {
            $fallback = Database::query(
                'SELECT id, name, registration_plate, vin, make, model, year
                 FROM assets WHERE tenant_id = ? ORDER BY name',
                [$tenantId]
            );
            foreach ($fallback as $row) {
                $assetId = (string) $row['id'];
                $byAsset[$assetId] = [
                    'id' => $assetId,
                    'name' => (string) ($row['name'] ?? $assetId),
                    'registrationPlate' => $row['registration_plate'] ?? null,
                    'vin' => $row['vin'] ?? null,
                    'make' => $row['make'] ?? null,
                    'model' => $row['model'] ?? null,
                    'year' => isset($row['year']) ? (int) $row['year'] : null,
                    'tenantId' => $tenantId,
                    'sources' => [],
                ];
            }
        }

        Response::success(array_values($byAsset));
    }

    /** GET /client/alerts */
    public static function alerts(): void
    {
        $tenantId = self::requireTenantId();
        $limit = 100;
        if (isset($_GET['limit']) && is_numeric($_GET['limit'])) {
            $limit = max(1, min(500, (int) $_GET['limit']));
        }

        $params = [$tenantId];
        $sql = 'SELECT * FROM alerts WHERE tenant_id = ?';

        if (isset($_GET['acknowledged'])) {
            $ack = $_GET['acknowledged'] === 'true' ? 1 : 0;
            $sql .= ' AND acknowledged = ?';
            $params[] = $ack;
        }

        $sql .= ' ORDER BY COALESCE(occurred_at, created_at) DESC LIMIT ?';
        $params[] = $limit;

        $rows = Database::query($sql, $params);
        $alerts = [];
        foreach ($rows as $row) {
            $alerts[] = [
                'id' => (string) ($row['id'] ?? ''),
                'type' => (string) ($row['type'] ?? ''),
                'severity' => (string) ($row['severity'] ?? 'info'),
                'title' => (string) ($row['title'] ?? ''),
                'description' => $row['description'] ?? null,
                'latitude' => isset($row['latitude']) ? (float) $row['latitude'] : null,
                'longitude' => isset($row['longitude']) ? (float) $row['longitude'] : null,
                'timestamp' => $row['occurred_at'] ?? $row['created_at'] ?? null,
                'videoUrl' => $row['video_url'] ?? null,
                'sourceType' => $row['source_type'] ?? null,
                'externalId' => $row['external_id'] ?? null,
                'assetId' => $row['asset_id'] ?? null,
                'acknowledged' => (bool) ((int) ($row['acknowledged'] ?? 0)),
            ];
        }

        Response::success($alerts);
    }

    /** GET /client/preferences */
    public static function preferencesGet(): void
    {
        $user = self::currentUser();
        $userId = (string) ($user['id'] ?? '');
        if ($userId === '') {
            Response::error('Unauthorized', 401);
            return;
        }

        self::requireTenantId();

        try {
            $rows = Database::query(
                'SELECT * FROM user_preferences WHERE user_id = ? LIMIT 1',
                [$userId]
            );
            if ($rows) {
                Response::success(self::camelCase($rows[0]));
                return;
            }
        } catch (Throwable $e) {
            error_log('ClientController preferencesGet: ' . $e->getMessage());
        }

        Response::success([
            'language' => 'en',
            'timezone' => 'UTC',
            'dateFormat' => 'YYYY-MM-DD',
            'timeFormat' => '24h',
            'unitSystem' => 'metric',
            'emailNotifications' => true,
            'inAppNotifications' => true,
            'smsNotifications' => false,
        ]);
    }

    /** GET /client/wialon/context — status parity with React useWialonContext */
    public static function wialonContext(): void
    {
        $tenantId = self::requireTenantId();

        try {
            $rows = Database::query(
                'SELECT is_active, last_sync_at, last_error, connection_verified_at,
                        wialon_account_name, wialon_resource_id, wialon_operate_as, wialon_session_meta,
                        preview_asset_count
                 FROM data_sources
                 WHERE tenant_id = ? AND source_type = \'wialon\'
                 LIMIT 1',
                [$tenantId]
            );
        } catch (Throwable $e) {
            Response::success([
                'configured' => false,
                'connected' => false,
                'accountName' => null,
                'accountTier' => null,
                'unitCount' => 0,
                'accountCount' => 0,
                'lastError' => null,
                'lastSyncAt' => null,
            ]);
            return;
        }

        if (!$rows) {
            Response::success([
                'configured' => false,
                'connected' => false,
                'accountName' => null,
                'accountTier' => null,
                'unitCount' => 0,
                'accountCount' => 0,
                'lastError' => null,
                'lastSyncAt' => null,
            ]);
            return;
        }

        $row = $rows[0];
        $isActive = (bool) ((int) ($row['is_active'] ?? 0));
        $verified = !empty($row['connection_verified_at']);
        $resourceId = isset($row['wialon_resource_id']) ? (int) $row['wialon_resource_id'] : 0;
        $connected = $isActive && $verified && $resourceId > 0;

        $sessionMeta = null;
        if (!empty($row['wialon_session_meta'])) {
            $decoded = is_string($row['wialon_session_meta'])
                ? json_decode($row['wialon_session_meta'], true)
                : $row['wialon_session_meta'];
            $sessionMeta = is_array($decoded) ? $decoded : null;
        }

        $tier = null;
        if (is_array($sessionMeta)) {
            if (!empty($sessionMeta['scopedAccountId'])) {
                $tier = 'admin';
            } elseif (!empty($sessionMeta['accountTier'])) {
                $tier = (string) $sessionMeta['accountTier'];
            }
        }

        $unitCount = isset($row['preview_asset_count']) ? (int) $row['preview_asset_count'] : 0;
        if ($unitCount <= 0) {
            try {
                $countRows = Database::query(
                    'SELECT COUNT(DISTINCT am.asset_id) AS c
                     FROM asset_mappings am
                     JOIN assets a ON a.id = am.asset_id
                     WHERE a.tenant_id = ? AND am.source_type = \'wialon\'',
                    [$tenantId]
                );
                $unitCount = (int) ($countRows[0]['c'] ?? 0);
            } catch (Throwable $e) {
                $unitCount = 0;
            }
        }

        Response::success([
            'configured' => true,
            'connected' => $connected,
            'accountName' => $row['wialon_account_name'] ?? null,
            'accountTier' => $tier,
            'unitCount' => $unitCount,
            'accountCount' => $resourceId > 0 ? 1 : 0,
            'operateAs' => $row['wialon_operate_as'] ?? null,
            'lastError' => $row['last_error'] ?? null,
            'lastSyncAt' => $row['last_sync_at'] ?? null,
            'sessionMeta' => $sessionMeta,
        ]);
    }

    /** GET /client/wialon/units/:id — unit detail from live fleet cache */
    public static function wialonUnitDetail(?string $id = null): void
    {
        $tenantId = self::requireTenantId();
        $unitId = $id ?? '';
        if ($unitId === '') {
            Response::error('Unit id required', 400);
            return;
        }

        require_once __DIR__ . '/../../lib/WialonFleet.php';
        $live = WialonFleet::tryLiveSnapshot($tenantId);
        if (!$live) {
            Response::error('Live Wialon fleet unavailable', 404);
            return;
        }

        $found = null;
        foreach ($live['units'] ?? [] as $u) {
            if ((string) ($u['id'] ?? '') === (string) $unitId
                || (string) ($u['wialonId'] ?? '') === (string) $unitId) {
                $found = $u;
                break;
            }
        }
        if (!$found) {
            Response::error('Unit not found in live fleet', 404);
            return;
        }

        $battery = WialonFleet::unitParam($found, 'battery');
        $voltage = WialonFleet::unitParam(
            $found,
            'pwr_ext',
            'ext_voltage',
            'external_voltage',
            'battery_voltage',
            'pwr_int'
        );

        Response::success([
            'unit' => $found,
            'health' => [
                'battery' => $battery,
                'voltage' => $voltage,
                'mileage' => $found['mileage'] ?? null,
                'engineHours' => $found['engineHours'] ?? null,
                'fuelLevel' => $found['fuelLevel'] ?? null,
            ],
        ]);
    }

    /** GET /client/wialon/fleet — alias for live snapshot */
    public static function wialonFleet(): void
    {
        $tenantId = self::requireTenantId();
        require_once __DIR__ . '/../../lib/WialonFleet.php';
        $live = WialonFleet::tryLiveSnapshot($tenantId);
        if (!$live) {
            Response::error('Live Wialon fleet unavailable', 404);
            return;
        }
        Response::success($live);
    }

    /** GET /client/wialon/routes */
    public static function wialonRoutes(): void
    {
        $tenantId = self::requireTenantId();
        require_once __DIR__ . '/../../lib/WialonLive.php';
        try {
            $routes = WialonLive::listRoutes($tenantId);
            Response::success(['routes' => $routes, 'count' => count($routes)]);
        } catch (Throwable $e) {
            error_log('ClientController wialonRoutes: ' . $e->getMessage());
            Response::success(['routes' => [], 'count' => 0, 'error' => $e->getMessage()]);
        }
    }

    /** GET /client/wialon/notifications */
    public static function wialonNotifications(): void
    {
        $tenantId = self::requireTenantId();
        require_once __DIR__ . '/../../lib/WialonLive.php';
        try {
            $notifications = WialonLive::listNotifications($tenantId);
            Response::success(['notifications' => $notifications, 'count' => count($notifications)]);
        } catch (Throwable $e) {
            error_log('ClientController wialonNotifications: ' . $e->getMessage());
            Response::success(['notifications' => [], 'count' => 0, 'error' => $e->getMessage()]);
        }
    }

    /** GET /client/wialon/reports/templates */
    public static function wialonReportTemplates(): void
    {
        $tenantId = self::requireTenantId();
        require_once __DIR__ . '/../../lib/WialonLive.php';
        try {
            $templates = WialonLive::listReportTemplates($tenantId);
            Response::success(['templates' => $templates, 'count' => count($templates)]);
        } catch (Throwable $e) {
            error_log('ClientController wialonReportTemplates: ' . $e->getMessage());
            Response::success(['templates' => [], 'count' => 0, 'error' => $e->getMessage()]);
        }
    }

    /** GET /client/wialon/units/:id/track?from=&to= — message positions for map trail */
    public static function wialonUnitTrack(?string $id = null): void
    {
        $tenantId = self::requireTenantId();
        $unitId = (int) ($id ?? 0);
        if ($unitId <= 0) {
            Response::error('Unit id required', 400);
            return;
        }
        $from = (int) ($_GET['from'] ?? (time() - 86400));
        $to = (int) ($_GET['to'] ?? time());
        require_once __DIR__ . '/../../lib/TenantWialon.php';
        require_once __DIR__ . '/../../lib/WialonClient.php';
        try {
            $creds = TenantWialon::loadCreds($tenantId);
            $client = new WialonClient($creds['baseUrl']);
            $client->login($creds['token'], $creds['operateAs']);
            try {
                $data = $client->call('messages/load_interval', [
                    'itemId' => $unitId,
                    'timeFrom' => $from,
                    'timeTo' => $to,
                    'flags' => 1,
                    'flagsMask' => 65281,
                    'loadCount' => 5000,
                ]);
                $messages = is_array($data['messages'] ?? null) ? $data['messages'] : [];
                $points = [];
                foreach ($messages as $msg) {
                    if (!is_array($msg)) {
                        continue;
                    }
                    $pos = $msg['pos'] ?? null;
                    if (!is_array($pos) || !isset($pos['y'], $pos['x'])) {
                        continue;
                    }
                    $points[] = [
                        'lat' => (float) $pos['y'],
                        'lng' => (float) $pos['x'],
                        'speed' => (float) ($pos['s'] ?? 0),
                        'time' => (int) ($msg['t'] ?? $pos['t'] ?? 0),
                    ];
                }
                Response::success(['unitId' => $unitId, 'points' => $points, 'count' => count($points)]);
            } finally {
                $client->logout();
            }
        } catch (Throwable $e) {
            error_log('ClientController wialonUnitTrack: ' . $e->getMessage());
            Response::success(['unitId' => $unitId, 'points' => [], 'count' => 0, 'error' => $e->getMessage()]);
        }
    }

    /** POST /client/wialon/commands — send remote command (best-effort) */
    public static function wialonCommandSend(): void
    {
        $user = self::currentUser();
        $tenantId = self::requireTenantId();
        $body = Auth::jsonBody();
        $unitId = (int) ($body['unitId'] ?? $body['wialonId'] ?? 0);
        $command = trim((string) ($body['command'] ?? ''));
        $assetId = isset($body['assetId']) ? (string) $body['assetId'] : null;
        $assetName = isset($body['assetName']) ? (string) $body['assetName'] : null;
        $param = isset($body['param']) ? (string) $body['param'] : '';

        if ($unitId <= 0 || $command === '') {
            Response::error('unitId and command required', 400);
            return;
        }

        require_once __DIR__ . '/../../lib/TenantWialon.php';
        require_once __DIR__ . '/../../lib/WialonClient.php';

        $status = 'failed';
        $responsePayload = null;
        try {
            $creds = TenantWialon::loadCreds($tenantId);
            $client = new WialonClient($creds['baseUrl']);
            $client->login($creds['token'], $creds['operateAs']);
            try {
                $responsePayload = $client->call('unit/exec_cmd', [
                    'itemId' => $unitId,
                    'commandName' => $command,
                    'linkType' => '',
                    'param' => $param,
                    'timeout' => 60,
                    'flags' => 0,
                ]);
                $status = 'sent';
            } finally {
                $client->logout();
            }
        } catch (Throwable $e) {
            $responsePayload = ['error' => $e->getMessage()];
            error_log('ClientController wialonCommandSend: ' . $e->getMessage());
        }

        $logId = self::uuid();
        try {
            Database::execute(
                'INSERT INTO command_logs
                   (id, tenant_id, asset_id, external_asset_id, asset_name, command, params, status, response, source_type, created_by, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, \'wialon\', ?, NOW())',
                [
                    $logId,
                    $tenantId,
                    $assetId,
                    (string) $unitId,
                    $assetName,
                    $command,
                    json_encode(['param' => $param], JSON_UNESCAPED_SLASHES),
                    $status,
                    json_encode($responsePayload, JSON_UNESCAPED_SLASHES),
                    $user['id'] ?? null,
                ]
            );
        } catch (Throwable $e) {
            error_log('ClientController wialonCommandSend log: ' . $e->getMessage());
        }

        if ($status !== 'sent') {
            Response::error(is_array($responsePayload) ? (string) ($responsePayload['error'] ?? 'Command failed') : 'Command failed', 500);
            return;
        }
        Response::success(['id' => $logId, 'status' => $status, 'response' => $responsePayload]);
    }

    /** GET /client/wialon/geofences */
    public static function wialonGeofences(): void
    {
        $tenantId = self::requireTenantId();
        require_once __DIR__ . '/../../lib/WialonLive.php';
        try {
            $geofences = WialonLive::listGeofences($tenantId);
            Response::success(['geofences' => $geofences, 'count' => count($geofences)]);
        } catch (Throwable $e) {
            error_log('ClientController wialonGeofences: ' . $e->getMessage());
            Response::success(['geofences' => [], 'count' => 0, 'error' => $e->getMessage()]);
        }
    }

    /** GET /client/wialon/units/:id/sensors */
    public static function wialonUnitSensors(?string $id = null): void
    {
        $tenantId = self::requireTenantId();
        $unitId = (int) ($id ?? 0);
        if ($unitId <= 0) {
            Response::error('Unit id required', 400);
            return;
        }
        require_once __DIR__ . '/../../lib/WialonLive.php';
        try {
            $sensors = WialonLive::unitSensors($tenantId, $unitId);
            Response::success(['unitId' => $unitId, 'sensors' => $sensors]);
        } catch (Throwable $e) {
            error_log('ClientController wialonUnitSensors: ' . $e->getMessage());
            Response::success(['unitId' => $unitId, 'sensors' => [], 'error' => $e->getMessage()]);
        }
    }

    /** GET /client/wialon/units/:id/trips */
    public static function wialonUnitTrips(?string $id = null): void
    {
        $tenantId = self::requireTenantId();
        $unitId = (int) ($id ?? 0);
        if ($unitId <= 0) {
            Response::error('Unit id required', 400);
            return;
        }
        $from = (int) ($_GET['from'] ?? (time() - 86400));
        $to = (int) ($_GET['to'] ?? time());
        require_once __DIR__ . '/../../lib/WialonLive.php';
        try {
            $trips = WialonLive::unitTrips($tenantId, $unitId, $from, $to);
            Response::success([
                'unitId' => $unitId,
                'trips' => $trips,
                'count' => count($trips),
                'from' => $from,
                'to' => $to,
            ]);
        } catch (Throwable $e) {
            error_log('ClientController wialonUnitTrips: ' . $e->getMessage());
            Response::success(['unitId' => $unitId, 'trips' => [], 'count' => 0, 'error' => $e->getMessage()]);
        }
    }

    /** GET /client/wialon/fuel/live — live fuel levels from fleet snapshot */
    public static function wialonFuelLive(): void
    {
        $tenantId = self::requireTenantId();
        require_once __DIR__ . '/../../lib/WialonFleet.php';
        $live = WialonFleet::tryLiveSnapshot($tenantId);
        if (!$live) {
            Response::success(['units' => [], 'count' => 0, 'live' => false]);
            return;
        }
        $units = [];
        foreach ($live['units'] ?? [] as $u) {
            $units[] = [
                'id' => $u['id'] ?? null,
                'wialonId' => $u['wialonId'] ?? null,
                'unitId' => $u['wialonId'] ?? (isset($u['id']) ? (int) $u['id'] : null),
                'name' => $u['name'] ?? null,
                'unitName' => $u['name'] ?? null,
                'plate' => $u['plate'] ?? null,
                'status' => $u['status'] ?? null,
                'assetType' => WialonFleet::classifyAsset($u),
                'fuelLevel' => $u['fuelLevel'] ?? null,
                'fuelPercent' => $u['fuelLevel'] ?? null,
                'fuelLiters' => WialonFleet::extractFuelLiters($u),
                'mileage' => $u['mileage'] ?? null,
                'battery' => WialonFleet::unitParam($u, 'battery'),
                'voltage' => WialonFleet::unitParam($u, 'pwr_ext', 'ext_voltage', 'external_voltage', 'battery_voltage', 'pwr_int'),
                'sensorCount' => is_array($u['sens'] ?? null) ? count($u['sens']) : 0,
            ];
        }
        Response::success([
            'units' => $units,
            'count' => count($units),
            'live' => true,
            'fetchedAt' => $live['fetchedAt'] ?? gmdate('c'),
        ]);
    }

    /** GET /client/wialon/fuel/assets — classified live fleet for fuel tabs */
    public static function wialonFuelAssets(): void
    {
        $tenantId = self::requireTenantId();
        require_once __DIR__ . '/../../lib/WialonFleet.php';
        $live = WialonFleet::tryLiveSnapshot($tenantId);
        if (!$live) {
            Response::success([
                'assets' => [],
                'summary' => [
                    'total' => 0,
                    'vehicles' => 0,
                    'generators' => 0,
                    'machinery' => 0,
                    'withFuel' => 0,
                ],
                'live' => false,
                'fetchedAt' => gmdate('c'),
            ]);
            return;
        }
        $assets = [];
        $summary = ['total' => 0, 'vehicles' => 0, 'generators' => 0, 'machinery' => 0, 'withFuel' => 0];
        foreach ($live['units'] ?? [] as $u) {
            $type = WialonFleet::classifyAsset($u);
            $liters = WialonFleet::extractFuelLiters($u);
            $pct = $u['fuelLevel'] ?? null;
            $assets[] = [
                'unitId' => $u['wialonId'] ?? (isset($u['id']) ? (int) $u['id'] : null),
                'id' => $u['id'] ?? null,
                'name' => $u['name'] ?? null,
                'plate' => $u['plate'] ?? null,
                'assetType' => $type,
                'status' => $u['status'] ?? null,
                'fuelPercent' => $pct,
                'fuelLiters' => $liters,
                'mileage' => $u['mileage'] ?? null,
                'battery' => WialonFleet::unitParam($u, 'battery'),
                'voltage' => WialonFleet::unitParam($u, 'pwr_ext', 'ext_voltage', 'external_voltage', 'battery_voltage', 'pwr_int'),
            ];
            $summary['total']++;
            if ($type === 'generator') {
                $summary['generators']++;
            } elseif ($type === 'machinery') {
                $summary['machinery']++;
            } else {
                $summary['vehicles']++;
            }
            if ($pct !== null || $liters !== null) {
                $summary['withFuel']++;
            }
        }
        Response::success([
            'assets' => $assets,
            'summary' => $summary,
            'live' => true,
            'fetchedAt' => $live['fetchedAt'] ?? gmdate('c'),
        ]);
    }

    /** GET /client/wialon/fuel/overview — DB KPIs + live asset counts */
    public static function wialonFuelOverview(): void
    {
        $tenantId = self::requireTenantId();
        $fromTs = strtotime('-30 days');
        $toTs = time();
        $kpis = [
            'totalFilled' => 0.0,
            'totalConsumed' => 0.0,
            'avgConsumptionL100km' => 0,
            'transactionCount' => 0,
            'theftEvents' => 0,
        ];
        try {
            $rows = Database::query(
                'SELECT section, filled, fuel_used, mileage FROM fuel_transactions
                 WHERE tenant_id = ?
                   AND timestamp >= ? AND timestamp <= ?
                   AND COALESCE(sensor, \'\') NOT LIKE \'wialon_group_summary%\'
                   AND COALESCE(sensor, \'\') <> \'balance\'',
                [$tenantId, $fromTs, $toTs]
            );
            $filled = 0.0;
            $consumed = 0.0;
            $mileage = 0.0;
            foreach ($rows as $row) {
                $filled += (float) ($row['filled'] ?? 0);
                $consumed += (float) ($row['fuel_used'] ?? 0);
                $mileage += (float) ($row['mileage'] ?? 0);
            }
            $kpis = [
                'totalFilled' => round($filled, 1),
                'totalConsumed' => round($consumed, 1),
                'avgConsumptionL100km' => $mileage > 0 ? round(($consumed / $mileage) * 100, 2) : 0,
                'transactionCount' => count($rows),
                'theftEvents' => 0,
            ];
        } catch (Throwable $e) {
            error_log('ClientController wialonFuelOverview: ' . $e->getMessage());
        }

        $liveSummary = ['total' => 0, 'withFuel' => 0, 'vehicles' => 0, 'generators' => 0, 'machinery' => 0];
        require_once __DIR__ . '/../../lib/WialonFleet.php';
        $live = WialonFleet::tryLiveSnapshot($tenantId);
        if ($live) {
            foreach ($live['units'] ?? [] as $u) {
                $liveSummary['total']++;
                $type = WialonFleet::classifyAsset($u);
                if ($type === 'generator') {
                    $liveSummary['generators']++;
                } elseif ($type === 'machinery') {
                    $liveSummary['machinery']++;
                } else {
                    $liveSummary['vehicles']++;
                }
                if (($u['fuelLevel'] ?? null) !== null || WialonFleet::extractFuelLiters($u) !== null) {
                    $liveSummary['withFuel']++;
                }
            }
        }

        Response::success([
            'totalFilled' => $kpis['totalFilled'],
            'totalConsumed' => $kpis['totalConsumed'],
            'avgConsumptionL100km' => $kpis['avgConsumptionL100km'],
            'transactionCount' => $kpis['transactionCount'],
            'theftEvents' => $kpis['theftEvents'],
            'live' => (bool) $live,
            'assets' => $liveSummary,
            'from' => gmdate('Y-m-d', $fromTs),
            'to' => gmdate('Y-m-d', $toTs),
            'fetchedAt' => gmdate('c'),
        ]);
    }

    /** GET /client/wialon/reports/catalog */
    public static function wialonReportCatalog(): void
    {
        $tenantId = self::requireTenantId();
        require_once __DIR__ . '/../../lib/WialonLive.php';
        try {
            Response::success(WialonLive::reportCatalog($tenantId));
        } catch (Throwable $e) {
            error_log('ClientController wialonReportCatalog: ' . $e->getMessage());
            Response::success([
                'templates' => [],
                'modules' => [],
                'groups' => [],
                'users' => [],
                'count' => 0,
                'error' => $e->getMessage(),
                'fetchedAt' => gmdate('c'),
            ]);
        }
    }

    /** GET /client/wialon/units/:id/commands */
    public static function wialonUnitCommands(?string $id = null): void
    {
        $tenantId = self::requireTenantId();
        $unitId = (int) ($id ?? 0);
        if ($unitId <= 0) {
            Response::error('Unit id required', 400);
            return;
        }
        require_once __DIR__ . '/../../lib/WialonLive.php';
        try {
            $commands = WialonLive::getUnitCommands($tenantId, $unitId);
            Response::success(['unitId' => $unitId, 'commands' => $commands, 'count' => count($commands)]);
        } catch (Throwable $e) {
            error_log('ClientController wialonUnitCommands: ' . $e->getMessage());
            Response::success(['unitId' => $unitId, 'commands' => [], 'count' => 0, 'error' => $e->getMessage()]);
        }
    }

    /** GET /client/surveillance/units — video-capable fleet units with cameras */
    public static function surveillanceUnits(): void
    {
        $tenantId = self::requireTenantId();
        require_once __DIR__ . '/../../lib/WialonVideo.php';
        try {
            $units = WialonVideo::listVideoUnits($tenantId);
            Response::success([
                'units' => $units,
                'count' => count($units),
                'live' => true,
                'streaming' => true,
                'message' => 'Select a unit and camera, then Go Live for HLS playback.',
                'fetchedAt' => gmdate('c'),
            ]);
        } catch (Throwable $e) {
            error_log('ClientController surveillanceUnits: ' . $e->getMessage());
            // Fallback to heuristic discovery from earlier slice
            require_once __DIR__ . '/../../lib/WialonFleet.php';
            $live = WialonFleet::tryLiveSnapshot($tenantId);
            $units = [];
            if ($live) {
                foreach ($live['units'] ?? [] as $u) {
                    if (!WialonFleet::looksLikeVideoUnit($u)) {
                        continue;
                    }
                    $units[] = [
                        'id' => $u['wialonId'] ?? $u['id'] ?? null,
                        'wialonId' => $u['wialonId'] ?? null,
                        'name' => $u['name'] ?? null,
                        'plate' => $u['plate'] ?? null,
                        'status' => $u['status'] ?? null,
                        'hwType' => $u['hwName'] ?? null,
                        'cameras' => [['index' => 0, 'channel' => 1, 'name' => 'Camera', 'active' => true]],
                        'cameraCount' => 1,
                        'streamAvailable' => true,
                        'position' => $u['position'] ?? null,
                    ];
                }
            }
            Response::success([
                'units' => $units,
                'count' => count($units),
                'live' => (bool) $live,
                'streaming' => false,
                'message' => $e->getMessage(),
                'fetchedAt' => gmdate('c'),
            ]);
        }
    }

    /** GET /client/surveillance/units/:id */
    public static function surveillanceUnitDetail(?string $id = null): void
    {
        $tenantId = self::requireTenantId();
        $unitId = (int) ($id ?? 0);
        if ($unitId <= 0) {
            Response::error('Unit id required', 400);
            return;
        }
        require_once __DIR__ . '/../../lib/WialonVideo.php';
        try {
            Response::success(WialonVideo::getUnitDetail($tenantId, $unitId));
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 500);
        }
    }

    /** POST /client/surveillance/units/:id/cameras/:ch/live/start */
    public static function surveillanceLiveStart(?string $id = null, ?string $ch = null): void
    {
        $tenantId = self::requireTenantId();
        $unitId = (int) ($id ?? 0);
        $channel = (int) ($ch ?? 1);
        if ($unitId <= 0) {
            Response::error('Unit id required', 400);
            return;
        }
        require_once __DIR__ . '/../../lib/WialonVideo.php';
        try {
            Response::success(WialonVideo::startLiveStream($tenantId, $unitId, $channel));
        } catch (Throwable $e) {
            error_log('ClientController surveillanceLiveStart: ' . $e->getMessage());
            Response::error($e->getMessage(), 500);
        }
    }

    /** GET playlist.m3u8 — raw HLS (not JSON) */
    public static function surveillanceLivePlaylist(?string $id = null, ?string $ch = null): void
    {
        $unitId = (int) ($id ?? 0);
        $channel = (int) ($ch ?? 1);
        $token = (string) ($_GET['streamToken'] ?? '');
        require_once __DIR__ . '/../../lib/WialonStreamCache.php';

        $entry = null;
        if ($token !== '') {
            $entry = WialonStreamCache::getStreamByAccessToken($token);
        }
        if (!$entry) {
            // Fall back to auth + tenant stream lookup
            try {
                $tenantId = self::requireTenantId();
                $entry = WialonStreamCache::getStreamUpstream($tenantId, $unitId, $channel);
            } catch (Throwable $e) {
                $entry = null;
            }
        }
        if (!$entry || (int) ($entry['unitId'] ?? 0) !== $unitId) {
            http_response_code(404);
            header('Content-Type: text/plain');
            echo 'Live stream not started — click Go Live first';
            exit;
        }

        try {
            $upstream = WialonStreamCache::fetchUpstream((string) $entry['upstreamUrl']);
            $body = $upstream['body'];
            $isPlaylist = preg_match('/\.m3u8/i', (string) $entry['upstreamUrl'])
                || str_contains($upstream['contentType'], 'mpegurl')
                || str_contains(substr($body, 0, 20), '#EXTM3U');
            if (!$isPlaylist) {
                http_response_code($upstream['status']);
                header('Content-Type: ' . $upstream['contentType']);
                echo $body;
                exit;
            }
            $streamToken = $token !== '' ? $token : (string) ($entry['accessToken'] ?? '');
            $segmentPrefix = "/api/client/surveillance/proxy/segment/{$streamToken}/";
            $rewritten = WialonStreamCache::rewriteM3u8Playlist($body, (string) $entry['upstreamUrl'], $segmentPrefix);
            header('Content-Type: application/vnd.apple.mpegurl');
            header('Cache-Control: no-cache');
            echo $rewritten;
            exit;
        } catch (Throwable $e) {
            http_response_code(502);
            header('Content-Type: text/plain');
            echo $e->getMessage();
            exit;
        }
    }

    /** GET progressive stream proxy */
    public static function surveillanceLiveStream(?string $id = null, ?string $ch = null): void
    {
        $unitId = (int) ($id ?? 0);
        $channel = (int) ($ch ?? 1);
        $token = (string) ($_GET['streamToken'] ?? '');
        require_once __DIR__ . '/../../lib/WialonStreamCache.php';
        $entry = $token !== '' ? WialonStreamCache::getStreamByAccessToken($token) : null;
        if (!$entry) {
            try {
                $tenantId = self::requireTenantId();
                $entry = WialonStreamCache::getStreamUpstream($tenantId, $unitId, $channel);
            } catch (Throwable $e) {
                $entry = null;
            }
        }
        if (!$entry) {
            http_response_code(404);
            header('Content-Type: text/plain');
            echo 'Live stream not started';
            exit;
        }
        try {
            $range = $_SERVER['HTTP_RANGE'] ?? null;
            $upstream = WialonStreamCache::fetchUpstream((string) $entry['upstreamUrl'], is_string($range) ? $range : null);
            http_response_code($upstream['status'] === 206 ? 206 : 200);
            header('Content-Type: ' . $upstream['contentType']);
            if ($range) {
                header('Accept-Ranges: bytes');
            }
            echo $upstream['body'];
            exit;
        } catch (Throwable $e) {
            http_response_code(502);
            echo $e->getMessage();
            exit;
        }
    }

    /** GET /client/surveillance/proxy/segment/:streamToken/:segToken */
    public static function surveillanceProxySegment(?string $streamToken = null, ?string $segToken = null): void
    {
        require_once __DIR__ . '/../../lib/WialonStreamCache.php';
        $url = WialonStreamCache::resolveProxyToken((string) $segToken);
        if (!$url) {
            http_response_code(404);
            header('Content-Type: text/plain');
            echo 'Segment expired';
            exit;
        }
        // Validate stream token still exists (soft)
        if ($streamToken && !WialonStreamCache::getStreamByAccessToken((string) $streamToken)) {
            // still allow if segment token valid within TTL
        }
        try {
            $range = $_SERVER['HTTP_RANGE'] ?? null;
            $upstream = WialonStreamCache::fetchUpstream($url, is_string($range) ? $range : null);
            $body = $upstream['body'];
            $isPlaylist = preg_match('/\.m3u8/i', $url)
                || str_contains($upstream['contentType'], 'mpegurl')
                || str_contains(substr($body, 0, 20), '#EXTM3U');
            if ($isPlaylist) {
                $prefix = '/api/client/surveillance/proxy/segment/' . rawurlencode((string) $streamToken) . '/';
                $body = WialonStreamCache::rewriteM3u8Playlist($body, $url, $prefix);
                header('Content-Type: application/vnd.apple.mpegurl');
                header('Cache-Control: no-cache');
                echo $body;
                exit;
            }
            http_response_code($upstream['status'] === 206 ? 206 : 200);
            header('Content-Type: ' . $upstream['contentType']);
            echo $body;
            exit;
        } catch (Throwable $e) {
            http_response_code(502);
            echo $e->getMessage();
            exit;
        }
    }

    /** GET /client/wialon/fuel/intelligence */
    public static function wialonFuelIntelligence(): void
    {
        $tenantId = self::requireTenantId();
        $from = (string) ($_GET['from'] ?? gmdate('Y-m-d', strtotime('-30 days')));
        $to = (string) ($_GET['to'] ?? gmdate('Y-m-d'));
        $fromTs = strtotime($from . ' 00:00:00 UTC') ?: (time() - 86400 * 30);
        $toTs = strtotime($to . ' 23:59:59 UTC') ?: time();
        $unitId = isset($_GET['unitId']) && is_numeric($_GET['unitId']) ? (int) $_GET['unitId'] : null;
        require_once __DIR__ . '/../../lib/FuelIntelligence.php';
        Response::success(FuelIntelligence::fromDb($tenantId, $fromTs, $toTs, $unitId));
    }

    /** GET /client/wialon/fuel/events */
    public static function wialonFuelEvents(): void
    {
        $tenantId = self::requireTenantId();
        $limit = isset($_GET['limit']) && is_numeric($_GET['limit']) ? (int) $_GET['limit'] : 50;
        require_once __DIR__ . '/../../lib/FuelIntelligence.php';
        $events = FuelIntelligence::eventsFromDb($tenantId, $limit);
        Response::success(['events' => $events, 'count' => count($events), 'fetchedAt' => gmdate('c')]);
    }

    /** GET /client/wialon/fuel/trend */
    public static function wialonFuelTrend(): void
    {
        $tenantId = self::requireTenantId();
        try {
            $rows = Database::query(
                "SELECT DATE_FORMAT(FROM_UNIXTIME(timestamp), '%Y-%m') AS month,
                        COALESCE(SUM(CASE WHEN section = 'filling' THEN filled ELSE 0 END), 0) AS filled,
                        COALESCE(SUM(CASE WHEN section = 'consumption' THEN fuel_used ELSE 0 END), 0) AS consumed
                 FROM fuel_transactions
                 WHERE tenant_id = ?
                   AND timestamp >= UNIX_TIMESTAMP(DATE_SUB(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL 11 MONTH))
                   AND COALESCE(sensor, '') NOT LIKE 'wialon_group_summary%'
                   AND COALESCE(sensor, '') <> 'balance'
                 GROUP BY month
                 ORDER BY month ASC",
                [$tenantId]
            );
        } catch (Throwable $e) {
            $rows = [];
        }
        $trend = array_map(static fn(array $r): array => [
            'month' => (string) ($r['month'] ?? ''),
            'filled' => round((float) ($r['filled'] ?? 0), 1),
            'consumed' => round((float) ($r['consumed'] ?? 0), 1),
        ], $rows);
        Response::success(['trend' => $trend, 'fetchedAt' => gmdate('c')]);
    }

    /** POST /client/wialon/fuel/unit-report — exec fuel template + parse rows */
    public static function wialonFuelUnitReport(): void
    {
        $tenantId = self::requireTenantId();
        $body = Auth::jsonBody();
        $unitId = (int) ($body['unitId'] ?? $body['objectId'] ?? 0);
        $from = (int) ($body['from'] ?? (time() - 86400 * 7));
        $to = (int) ($body['to'] ?? time());
        $persist = !empty($body['persist']);
        if ($unitId <= 0) {
            Response::error('unitId required', 400);
            return;
        }
        require_once __DIR__ . '/../../lib/WialonLive.php';
        require_once __DIR__ . '/../../lib/FuelReportParser.php';
        require_once __DIR__ . '/../../lib/WialonFleet.php';

        $unitName = 'Unit ' . $unitId;
        $live = WialonFleet::tryLiveSnapshot($tenantId);
        if ($live) {
            foreach ($live['units'] ?? [] as $u) {
                if ((int) ($u['wialonId'] ?? $u['id'] ?? 0) === $unitId) {
                    $unitName = (string) ($u['name'] ?? $unitName);
                    break;
                }
            }
        }

        $resourceId = (int) ($body['resourceId'] ?? 0);
        $templateId = (int) ($body['templateId'] ?? 0);
        if ($resourceId <= 0 || $templateId <= 0) {
            $catalog = WialonLive::reportCatalog($tenantId);
            $picked = null;
            foreach ($catalog['templates'] ?? [] as $t) {
                if (($t['module'] ?? '') !== 'fuel') {
                    continue;
                }
                $name = strtolower((string) ($t['name'] ?? ''));
                if (str_contains($name, 'unit') || str_contains($name, 'fill')) {
                    $picked = $t;
                    break;
                }
                if ($picked === null) {
                    $picked = $t;
                }
            }
            if (!$picked) {
                Response::error('No fuel report template found on this Wialon account', 404);
                return;
            }
            $resourceId = (int) $picked['resourceId'];
            $templateId = (int) $picked['id'];
        }

        try {
            $raw = WialonLive::execReport($tenantId, $resourceId, $templateId, $unitId, $from, $to, 300);
            $txs = FuelReportParser::tablesToTransactions($raw['tables'] ?? [], $unitId, $unitName);
            $inserted = 0;
            if ($persist && $txs) {
                foreach ($txs as $tx) {
                    try {
                        $id = self::uuid();
                        Database::execute(
                            'INSERT INTO fuel_transactions
                               (id, tenant_id, unit_id, unit_name, section, tank, timestamp, time_str,
                                location, initial_level, final_level, filled, fuel_used, sudden_fuel_drop, mileage, sensor, created_at, updated_at)
                             VALUES (?, ?, ?, ?, ?, \'main\', ?, ?, ?, ?, ?, ?, ?, ?, ?, \'wialon_unit_report\', NOW(), NOW())
                             ON DUPLICATE KEY UPDATE updated_at = NOW()',
                            [
                                $id,
                                $tenantId,
                                (string) $unitId,
                                $unitName,
                                $tx['section'],
                                $tx['timestamp'],
                                $tx['timeStr'],
                                $tx['location'],
                                $tx['initialLevel'],
                                $tx['finalLevel'],
                                $tx['filled'],
                                $tx['fuelUsed'],
                                $tx['suddenFuelDrop'],
                                $tx['mileage'],
                            ]
                        );
                        $inserted++;
                    } catch (Throwable $e) {
                        // soft — schema may vary
                    }
                }
            }
            Response::success([
                'unitId' => $unitId,
                'unitName' => $unitName,
                'resourceId' => $resourceId,
                'templateId' => $templateId,
                'transactions' => $txs,
                'count' => count($txs),
                'inserted' => $inserted,
                'from' => $from,
                'to' => $to,
                'tableCount' => $raw['tableCount'] ?? count($raw['tables'] ?? []),
            ]);
        } catch (Throwable $e) {
            error_log('ClientController wialonFuelUnitReport: ' . $e->getMessage());
            Response::error($e->getMessage(), 500);
        }
    }

    /** POST /client/wialon/reports/exec */
    public static function wialonReportExec(): void
    {
        $tenantId = self::requireTenantId();
        $body = Auth::jsonBody();
        $resourceId = (int) ($body['reportResourceId'] ?? $body['resourceId'] ?? 0);
        $templateId = (int) ($body['reportTemplateId'] ?? $body['templateId'] ?? 0);
        $objectId = (int) ($body['reportObjectId'] ?? $body['objectId'] ?? 0);
        $from = (int) ($body['from'] ?? (time() - 86400));
        $to = (int) ($body['to'] ?? time());
        $maxRows = (int) ($body['maxRows'] ?? 200);
        if ($resourceId <= 0 || $templateId <= 0 || $objectId <= 0) {
            Response::error('reportResourceId, reportTemplateId, and reportObjectId required', 400);
            return;
        }
        require_once __DIR__ . '/../../lib/WialonLive.php';
        try {
            $result = WialonLive::execReport($tenantId, $resourceId, $templateId, $objectId, $from, $to, max(50, min(500, $maxRows)));
            Response::success($result);
        } catch (Throwable $e) {
            error_log('ClientController wialonReportExec: ' . $e->getMessage());
            Response::error($e->getMessage(), 500);
        }
    }

    /** GET /client/integrations/status */
    public static function integrationsStatus(): void
    {
        $tenantId = self::requireTenantId();

        try {
            $rows = Database::query(
                'SELECT source_type, is_active, last_sync_at, last_error, connection_verified_at,
                        wialon_account_name, wialon_resource_id, wialon_operate_as, wialon_session_meta,
                        preview_asset_count
                 FROM data_sources WHERE tenant_id = ?',
                [$tenantId]
            );
        } catch (Throwable $e) {
            error_log('ClientController integrationsStatus: ' . $e->getMessage());
            Response::success([]);
            return;
        }

        $result = [];
        foreach ($rows as $row) {
            $sourceType = (string) ($row['source_type'] ?? '');
            $isActive = (bool) ((int) ($row['is_active'] ?? 0));
            $verified = !empty($row['connection_verified_at']);
            $resourceId = isset($row['wialon_resource_id']) ? (int) $row['wialon_resource_id'] : null;

            $connected = $sourceType === 'wialon'
                ? ($isActive && $verified && $resourceId !== null && $resourceId > 0)
                : ($isActive && $verified && empty($row['last_error']));

            $sessionMeta = null;
            if (!empty($row['wialon_session_meta'])) {
                $decoded = is_string($row['wialon_session_meta'])
                    ? json_decode($row['wialon_session_meta'], true)
                    : $row['wialon_session_meta'];
                $sessionMeta = is_array($decoded) ? $decoded : null;
            }

            $result[] = [
                'sourceType' => $sourceType,
                'isActive' => $isActive,
                'lastSyncAt' => $row['last_sync_at'] ?? null,
                'lastError' => $row['last_error'] ?? null,
                'verified' => $verified,
                'connected' => $connected,
                'wialonAccountName' => $row['wialon_account_name'] ?? null,
                'wialonAccountId' => $resourceId,
                'wialonOperateAs' => $row['wialon_operate_as'] ?? null,
                'wialonMeta' => $sessionMeta,
                'previewAssetCount' => isset($row['preview_asset_count']) ? (int) $row['preview_asset_count'] : null,
            ];
        }

        Response::success($result);
    }

    /** POST /client/alerts/:id/acknowledge */
    public static function alertAcknowledge(?string $id = null): void
    {
        $tenantId = self::requireTenantId();
        $alertId = $id ?? '';
        if ($alertId === '') {
            Response::error('Alert id required', 400);
            return;
        }

        try {
            $updated = Database::execute(
                'UPDATE alerts SET acknowledged = 1 WHERE id = ? AND tenant_id = ?',
                [$alertId, $tenantId]
            );
            if ($updated === 0) {
                $exists = Database::query(
                    'SELECT id FROM alerts WHERE id = ? AND tenant_id = ? LIMIT 1',
                    [$alertId, $tenantId]
                );
                if (!$exists) {
                    Response::error('Alert not found', 404);
                    return;
                }
            }
            Response::success(['acknowledged' => true]);
        } catch (Throwable $e) {
            error_log('ClientController alertAcknowledge: ' . $e->getMessage());
            Response::error('Failed to acknowledge alert', 500);
        }
    }

    /** PUT /client/preferences */
    public static function preferencesPut(): void
    {
        $user = self::currentUser();
        $userId = (string) ($user['id'] ?? '');
        if ($userId === '') {
            Response::error('Unauthorized', 401);
            return;
        }

        self::requireTenantId();
        $body = self::jsonInput();

        $dashboardLayout = null;
        if (array_key_exists('dashboardLayout', $body)) {
            $dashboardLayout = $body['dashboardLayout'] !== null
                ? json_encode($body['dashboardLayout'])
                : null;
        }

        try {
            Database::query(
                'INSERT INTO user_preferences (
                    user_id, language, timezone, date_format, time_format, unit_system,
                    email_notifications, in_app_notifications, sms_notifications, dashboard_layout, updated_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE
                    language = COALESCE(VALUES(language), language),
                    timezone = COALESCE(VALUES(timezone), timezone),
                    date_format = COALESCE(VALUES(date_format), date_format),
                    time_format = COALESCE(VALUES(time_format), time_format),
                    unit_system = COALESCE(VALUES(unit_system), unit_system),
                    email_notifications = COALESCE(VALUES(email_notifications), email_notifications),
                    in_app_notifications = COALESCE(VALUES(in_app_notifications), in_app_notifications),
                    sms_notifications = COALESCE(VALUES(sms_notifications), sms_notifications),
                    dashboard_layout = COALESCE(VALUES(dashboard_layout), dashboard_layout),
                    updated_at = NOW()',
                [
                    $userId,
                    $body['language'] ?? null,
                    $body['timezone'] ?? null,
                    $body['dateFormat'] ?? null,
                    $body['timeFormat'] ?? null,
                    $body['unitSystem'] ?? null,
                    array_key_exists('emailNotifications', $body) ? (int) (bool) $body['emailNotifications'] : null,
                    array_key_exists('inAppNotifications', $body) ? (int) (bool) $body['inAppNotifications'] : null,
                    array_key_exists('smsNotifications', $body) ? (int) (bool) $body['smsNotifications'] : null,
                    $dashboardLayout,
                ]
            );

            $rows = Database::query(
                'SELECT * FROM user_preferences WHERE user_id = ? LIMIT 1',
                [$userId]
            );
            Response::success($rows ? self::camelCase($rows[0]) : null);
        } catch (Throwable $e) {
            error_log('ClientController preferencesPut: ' . $e->getMessage());
            Response::error('Failed to save preferences', 500);
        }
    }

    /** GET /client/users */
    public static function clientUsers(): void
    {
        $tenantId = self::requireTenantId();

        $rows = Database::query(
            "SELECT id, email, full_name, role, is_active, last_login_at, created_at
             FROM users
             WHERE tenant_id = ? AND role NOT IN ('platform_admin', 'super_admin')
             ORDER BY created_at DESC",
            [$tenantId]
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
            ];
        }

        Response::success($result);
    }

    /** POST /client/users */
    public static function clientUsersCreate(): void
    {
        $tenantId = self::requireTenantId();
        $body = Auth::jsonBody();

        $email = strtolower(trim((string) ($body['email'] ?? '')));
        $fullName = trim((string) ($body['fullName'] ?? ''));
        $role = trim((string) ($body['role'] ?? 'viewer'));
        $password = (string) ($body['password'] ?? '');

        if ($email === '' || $password === '') {
            Response::error('email and password are required', 400);
            return;
        }
        if (strlen($password) < 8) {
            Response::error('Password must be at least 8 characters', 400);
            return;
        }

        $allowedRoles = ['tenant_admin', 'manager', 'operator', 'viewer'];
        if (!in_array($role, $allowedRoles, true)) {
            $role = 'viewer';
        }

        $existing = Database::query('SELECT id FROM users WHERE email = ? LIMIT 1', [$email]);
        if ($existing) {
            Response::error('A user with this email already exists', 409);
            return;
        }

        $id = self::uuid();
        try {
            Database::execute(
                'INSERT INTO users (id, tenant_id, email, password_hash, full_name, role, is_active, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW())',
                [$id, $tenantId, $email, password_hash($password, PASSWORD_BCRYPT), $fullName, $role]
            );
        } catch (Throwable $e) {
            error_log('ClientController clientUsersCreate: ' . $e->getMessage());
            Response::error('Failed to create user', 500);
            return;
        }

        Response::success([
            'id' => $id,
            'email' => $email,
            'fullName' => $fullName,
            'role' => $role,
            'isActive' => true,
        ], 201);
    }

    /** PATCH /client/users/:id */
    public static function clientUsersPatch(?string $id = null): void
    {
        $tenantId = self::requireTenantId();
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
            $role = trim((string) $body['role']);
            $allowedRoles = ['tenant_admin', 'manager', 'operator', 'viewer'];
            if (in_array($role, $allowedRoles, true)) {
                $fields[] = 'role = ?';
                $params[] = $role;
            }
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
        $params[] = $tenantId;

        try {
            $updated = Database::execute(
                'UPDATE users SET ' . implode(', ', $fields) . ", updated_at = NOW()
                 WHERE id = ? AND tenant_id = ? AND role NOT IN ('platform_admin', 'super_admin')",
                $params
            );
        } catch (Throwable $e) {
            error_log('ClientController clientUsersPatch: ' . $e->getMessage());
            Response::error('Failed to update user', 500);
            return;
        }

        if ($updated === 0) {
            $exists = Database::query('SELECT id FROM users WHERE id = ? AND tenant_id = ? LIMIT 1', [$userId, $tenantId]);
            if (!$exists) {
                Response::error('User not found', 404);
                return;
            }
        }

        $rows = Database::query(
            'SELECT id, email, full_name, role, is_active, last_login_at, created_at FROM users WHERE id = ? LIMIT 1',
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
        ]);
    }

    /** POST /client/users/:id/reset-password */
    public static function clientUsersResetPassword(?string $id = null): void
    {
        $tenantId = self::requireTenantId();
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
                "UPDATE users SET password_hash = ?, updated_at = NOW()
                 WHERE id = ? AND tenant_id = ? AND role NOT IN ('platform_admin', 'super_admin')",
                [password_hash($password, PASSWORD_BCRYPT), $userId, $tenantId]
            );
        } catch (Throwable $e) {
            error_log('ClientController clientUsersResetPassword: ' . $e->getMessage());
            Response::error('Failed to reset password', 500);
            return;
        }

        if ($updated === 0) {
            $exists = Database::query('SELECT id FROM users WHERE id = ? AND tenant_id = ? LIMIT 1', [$userId, $tenantId]);
            if (!$exists) {
                Response::error('User not found', 404);
                return;
            }
        }

        Response::success(['ok' => true]);
    }
}
