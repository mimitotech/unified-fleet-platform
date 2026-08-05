<?php
/**
 * Domain sync — trips → trip_summaries, eco reports → eco_driving_violations.
 * Parity: platform/backend DomainSyncService.ts (MySQL).
 */
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/WialonFleet.php';
require_once __DIR__ . '/WialonLive.php';
require_once __DIR__ . '/TenantWialon.php';
require_once __DIR__ . '/WialonClient.php';

final class DomainSync
{
    private const TRIP_WINDOW_DAYS = 7;
    private const ECO_WINDOW_DAYS = 7;
    private const TRIP_SYNC_INTERVAL_SEC = 1800;
    private const MAX_UNITS_TRIPS = 40;
    private const MAX_UNITS_ECO = 16;

    /** @return array{tenants:int,trips:int,eco:int,errors:int} */
    public static function syncAllConnected(): array
    {
        $tenants = 0;
        $trips = 0;
        $eco = 0;
        $errors = 0;
        try {
            $rows = Database::query(
                "SELECT DISTINCT tenant_id FROM data_sources
                 WHERE source_type = 'wialon' AND is_active = 1
                   AND connection_verified_at IS NOT NULL
                   AND wialon_resource_id IS NOT NULL AND wialon_resource_id > 0"
            );
        } catch (Throwable $e) {
            return ['tenants' => 0, 'trips' => 0, 'eco' => 0, 'errors' => 1];
        }
        foreach ($rows as $r) {
            $tid = (string) ($r['tenant_id'] ?? '');
            if ($tid === '') {
                continue;
            }
            $tenants++;
            try {
                $res = self::syncTenant($tid);
                $trips += $res['trips'];
                $eco += $res['eco'];
            } catch (Throwable $e) {
                $errors++;
                error_log("DomainSync tenant {$tid}: " . $e->getMessage());
            }
        }
        return compact('tenants', 'trips', 'eco', 'errors');
    }

    /** @return array{trips:int,eco:int} */
    public static function syncTenant(string $tenantId): array
    {
        $trips = self::syncTenantTrips($tenantId);
        $eco = self::syncTenantEcoViolations($tenantId);
        return ['trips' => $trips, 'eco' => $eco];
    }

    public static function syncTenantTrips(string $tenantId): int
    {
        if (!self::tableExists('trip_summaries')) {
            return 0;
        }
        $cursorKey = 'domain:trips:' . self::TRIP_WINDOW_DAYS . 'd';
        if (self::cursorFresh($tenantId, $cursorKey, self::TRIP_SYNC_INTERVAL_SEC)) {
            return 0;
        }

        $live = WialonFleet::tryLiveSnapshot($tenantId);
        $units = [];
        foreach ($live['units'] ?? [] as $u) {
            $id = (int) ($u['wialonId'] ?? $u['id'] ?? 0);
            if ($id > 0) {
                $units[] = [
                    'id' => $id,
                    'name' => (string) ($u['name'] ?? ('Unit ' . $id)),
                ];
            }
            if (count($units) >= self::MAX_UNITS_TRIPS) {
                break;
            }
        }
        if (!$units) {
            self::touchCursor($tenantId, $cursorKey, 0, null);
            return 0;
        }

        $to = time();
        $from = $to - self::TRIP_WINDOW_DAYS * 86400;
        $upserted = 0;
        foreach ($units as $u) {
            try {
                $trips = WialonLive::unitTrips($tenantId, $u['id'], $from, $to);
            } catch (Throwable $e) {
                continue;
            }
            foreach ($trips as $trip) {
                $t1 = (int) ($trip['t1'] ?? 0);
                $t2 = (int) ($trip['t2'] ?? $t1);
                if ($t1 <= 0) {
                    continue;
                }
                $departure = gmdate('Y-m-d H:i:s', $t1);
                $arrival = gmdate('Y-m-d H:i:s', $t2 > 0 ? $t2 : $t1);
                $mileage = (float) ($trip['mileage'] ?? 0);
                $duration = max(0, $t2 - $t1);
                $tripId = $u['id'] . ':' . gmdate('c', $t1);
                $assetId = self::resolveAssetId($tenantId, (string) $u['id']);
                try {
                    Database::execute(
                        'INSERT INTO trip_summaries
                           (id, tenant_id, trip_id, asset_id, unit_id, unit_name,
                            departure_time, arrival_time, mileage, duration, fuel_used,
                            avg_speed, max_speed, created_at, updated_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, NOW(3), NOW(3))
                         ON DUPLICATE KEY UPDATE
                           trip_id = VALUES(trip_id),
                           asset_id = COALESCE(VALUES(asset_id), asset_id),
                           unit_name = VALUES(unit_name),
                           arrival_time = VALUES(arrival_time),
                           mileage = VALUES(mileage),
                           duration = VALUES(duration),
                           updated_at = NOW(3)',
                        [
                            self::uuid(),
                            $tenantId,
                            $tripId,
                            $assetId,
                            (string) $u['id'],
                            $u['name'],
                            $departure,
                            $arrival,
                            $mileage,
                            $duration,
                        ]
                    );
                    $upserted++;
                } catch (Throwable $e) {
                    // skip row
                }
            }
        }
        self::touchCursor($tenantId, $cursorKey, $upserted, null);
        return $upserted;
    }

    public static function syncTenantEcoViolations(string $tenantId): int
    {
        if (!self::tableExists('eco_driving_violations')) {
            return 0;
        }
        $live = WialonFleet::tryLiveSnapshot($tenantId);
        $units = [];
        $nameById = [];
        foreach ($live['units'] ?? [] as $u) {
            $id = (int) ($u['wialonId'] ?? $u['id'] ?? 0);
            if ($id <= 0) {
                continue;
            }
            $name = (string) ($u['name'] ?? ('Unit ' . $id));
            $nameById[$id] = $name;
            $units[] = $id;
        }
        if (!$units) {
            return 0;
        }

        // Rotate sample of units
        $cursorFile = sys_get_temp_dir() . '/mams_eco_cursor_' . md5($tenantId) . '.txt';
        $offset = is_file($cursorFile) ? (int) @file_get_contents($cursorFile) : 0;
        if ($offset < 0 || $offset >= count($units)) {
            $offset = 0;
        }
        $sample = [];
        for ($i = 0; $i < self::MAX_UNITS_ECO && $i < count($units); $i++) {
            $sample[] = $units[($offset + $i) % count($units)];
        }
        @file_put_contents($cursorFile, (string) (($offset + self::MAX_UNITS_ECO) % max(1, count($units))));

        $to = time();
        $from = $to - self::ECO_WINDOW_DAYS * 86400;
        $tpl = self::findEcoTemplate($tenantId);
        if (!$tpl) {
            // Fallback: harvest event messages as driving violations
            return self::ecoFromAlertMessages($tenantId, $sample, $nameById, $from, $to);
        }

        $upserted = 0;
        foreach ($sample as $unitId) {
            try {
                $result = WialonLive::execReport(
                    $tenantId,
                    $tpl['resourceId'],
                    $tpl['templateId'],
                    $unitId,
                    $from,
                    $to,
                    100
                );
            } catch (Throwable $e) {
                continue;
            }
            foreach ($result['tables'] ?? [] as $table) {
                foreach ($table['sample'] ?? [] as $rowIdx => $row) {
                    $cells = self::rowCells($row);
                    if (!$cells) {
                        continue;
                    }
                    $type = (string) ($cells[0] ?? $cells['type'] ?? 'eco_event');
                    if ($type === '') {
                        $type = 'eco_event';
                    }
                    $extId = 'eco:' . $unitId . ':' . md5($tpl['templateId'] . '|' . $rowIdx . '|' . json_encode($cells));
                    $occurred = self::parseOccurred($cells) ?: gmdate('Y-m-d H:i:s');
                    $severity = self::mapSeverity($type);
                    $assetId = self::resolveAssetId($tenantId, (string) $unitId);
                    try {
                        Database::execute(
                            'INSERT INTO eco_driving_violations
                               (id, tenant_id, asset_id, unit_id, unit_name, violation_type, severity,
                                occurred_at, latitude, longitude, driver_name, external_id, created_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NOW(3))
                             ON DUPLICATE KEY UPDATE
                               violation_type = VALUES(violation_type),
                               severity = VALUES(severity),
                               occurred_at = VALUES(occurred_at),
                               unit_name = VALUES(unit_name),
                               asset_id = COALESCE(VALUES(asset_id), asset_id)',
                            [
                                self::uuid(),
                                $tenantId,
                                $assetId,
                                (string) $unitId,
                                $nameById[$unitId] ?? (string) $unitId,
                                substr($type, 0, 120),
                                $severity,
                                $occurred,
                                $extId,
                            ]
                        );
                        $upserted++;
                    } catch (Throwable $e) {
                        // MySQL without unique on external_id — try plain insert ignore via select
                        try {
                            $exists = Database::query(
                                'SELECT id FROM eco_driving_violations WHERE tenant_id = ? AND external_id = ? LIMIT 1',
                                [$tenantId, $extId]
                            );
                            if (!$exists) {
                                Database::execute(
                                    'INSERT INTO eco_driving_violations
                                       (id, tenant_id, asset_id, unit_id, unit_name, violation_type, severity,
                                        occurred_at, external_id, created_at)
                                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))',
                                    [
                                        self::uuid(),
                                        $tenantId,
                                        $assetId,
                                        (string) $unitId,
                                        $nameById[$unitId] ?? (string) $unitId,
                                        substr($type, 0, 120),
                                        $severity,
                                        $occurred,
                                        $extId,
                                    ]
                                );
                                $upserted++;
                            }
                        } catch (Throwable $e2) {
                        }
                    }
                }
            }
        }
        return $upserted;
    }

    /** @param list<int> $unitIds @param array<int,string> $nameById */
    private static function ecoFromAlertMessages(
        string $tenantId,
        array $unitIds,
        array $nameById,
        int $from,
        int $to
    ): int {
        // Pull recent driving-ish alerts already in MySQL as eco seed
        $upserted = 0;
        try {
            $rows = Database::query(
                "SELECT id, type, severity, title, occurred_at, latitude, longitude
                 FROM alerts
                 WHERE tenant_id = ?
                   AND occurred_at >= FROM_UNIXTIME(?)
                   AND occurred_at <= FROM_UNIXTIME(?)
                   AND (type IN ('driving','geofence') OR title REGEXP 'harsh|speeding|eco|brake|accel')
                 ORDER BY occurred_at DESC LIMIT 80",
                [$tenantId, $from, $to]
            );
        } catch (Throwable $e) {
            return 0;
        }
        foreach ($rows as $r) {
            $extId = 'alert:' . ($r['id'] ?? '');
            if ($extId === 'alert:') {
                continue;
            }
            try {
                $exists = Database::query(
                    'SELECT id FROM eco_driving_violations WHERE tenant_id = ? AND external_id = ? LIMIT 1',
                    [$tenantId, $extId]
                );
                if ($exists) {
                    continue;
                }
                Database::execute(
                    'INSERT INTO eco_driving_violations
                       (id, tenant_id, unit_id, unit_name, violation_type, severity,
                        occurred_at, latitude, longitude, external_id, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))',
                    [
                        self::uuid(),
                        $tenantId,
                        '0',
                        'Fleet',
                        (string) ($r['type'] ?? $r['title'] ?? 'eco'),
                        self::mapSeverity((string) ($r['severity'] ?? $r['type'] ?? '')),
                        $r['occurred_at'] ?? gmdate('Y-m-d H:i:s'),
                        $r['latitude'] ?? null,
                        $r['longitude'] ?? null,
                        $extId,
                    ]
                );
                $upserted++;
            } catch (Throwable $e) {
            }
        }
        return $upserted;
    }

    /** @return array{resourceId:int,templateId:int}|null */
    private static function findEcoTemplate(string $tenantId): ?array
    {
        try {
            $list = WialonLive::listReportTemplates($tenantId, 400);
            foreach ($list as $t) {
                $name = (string) ($t['name'] ?? $t['n'] ?? '');
                if (preg_match('/eco\s*driv|violation|harsh|events?\s*report|safety/i', $name)) {
                    $rid = (int) ($t['resourceId'] ?? $t['reportResourceId'] ?? 0);
                    $tid = (int) ($t['id'] ?? $t['templateId'] ?? 0);
                    if ($rid > 0 && $tid > 0) {
                        return ['resourceId' => $rid, 'templateId' => $tid];
                    }
                }
            }
        } catch (Throwable $e) {
        }
        return null;
    }

    /** @return list<mixed>|array<string,mixed> */
    private static function rowCells(mixed $row): array
    {
        if (!is_array($row)) {
            return [];
        }
        if (isset($row['c']) && is_array($row['c'])) {
            return $row['c'];
        }
        return $row;
    }

    private static function parseOccurred(array $cells): ?string
    {
        foreach ($cells as $c) {
            if (is_numeric($c) && (int) $c > 1000000000) {
                return gmdate('Y-m-d H:i:s', (int) $c);
            }
            if (is_string($c) && strtotime($c)) {
                return gmdate('Y-m-d H:i:s', strtotime($c));
            }
        }
        return null;
    }

    private static function mapSeverity(string $raw): string
    {
        $t = strtolower($raw);
        if (preg_match('/critical|emergency/', $t)) {
            return 'critical';
        }
        if (preg_match('/warning|high|harsh/', $t)) {
            return 'high';
        }
        if (preg_match('/low|info/', $t)) {
            return 'low';
        }
        return 'medium';
    }

    private static function resolveAssetId(string $tenantId, string $unitId): ?string
    {
        try {
            $rows = Database::query(
                "SELECT am.asset_id FROM asset_mappings am
                 INNER JOIN assets a ON a.id = am.asset_id
                 WHERE a.tenant_id = ? AND am.source_type = 'wialon' AND am.external_id = ?
                 LIMIT 1",
                [$tenantId, $unitId]
            );
            return isset($rows[0]['asset_id']) ? (string) $rows[0]['asset_id'] : null;
        } catch (Throwable $e) {
            return null;
        }
    }

    private static function cursorFresh(string $tenantId, string $key, int $intervalSec): bool
    {
        if (!self::tableExists('fuel_sync_cursor')) {
            return false;
        }
        try {
            $rows = Database::query(
                'SELECT last_success_at FROM fuel_sync_cursor WHERE tenant_id = ? AND cursor_key = ? LIMIT 1',
                [$tenantId, $key]
            );
            if (!$rows || empty($rows[0]['last_success_at'])) {
                return false;
            }
            $ts = strtotime((string) $rows[0]['last_success_at']);
            return $ts && (time() - $ts) < $intervalSec;
        } catch (Throwable $e) {
            return false;
        }
    }

    private static function touchCursor(string $tenantId, string $key, int $rowCount, ?string $error): void
    {
        if (!self::tableExists('fuel_sync_cursor')) {
            return;
        }
        try {
            Database::execute(
                'INSERT INTO fuel_sync_cursor (tenant_id, cursor_key, last_synced_at, last_success_at, row_count, last_error)
                 VALUES (?, ?, NOW(3), NOW(3), ?, ?)
                 ON DUPLICATE KEY UPDATE
                   last_synced_at = NOW(3),
                   last_success_at = IF(? IS NULL, NOW(3), last_success_at),
                   row_count = VALUES(row_count),
                   last_error = VALUES(last_error)',
                [$tenantId, $key, $rowCount, $error, $error]
            );
        } catch (Throwable $e) {
        }
    }

    private static function tableExists(string $table): bool
    {
        try {
            $rows = Database::query(
                'SELECT 1 FROM information_schema.tables
                 WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1',
                [$table]
            );
            return (bool) $rows;
        } catch (Throwable $e) {
            return false;
        }
    }

    private static function uuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }
}
