<?php

require_once __DIR__ . '/../../lib/Database.php';
require_once __DIR__ . '/../../lib/Auth.php';
require_once __DIR__ . '/../../lib/Response.php';

class DomainController
{
    private const EMISSION_FACTOR = 2.68;

    /** @param array<string, mixed> $row */
    private static function camelCase(array $row): array
    {
        $out = [];
        foreach ($row as $key => $value) {
            $camel = preg_replace_callback('/_([a-z])/', static fn(array $m): string => strtoupper($m[1]), (string) $key);
            if (is_string($value) && self::looksLikeJson($value)) {
                $decoded = json_decode($value, true);
                $out[$camel] = json_last_error() === JSON_ERROR_NONE ? $decoded : $value;
            } else {
                $out[$camel] = $value;
            }
        }
        return $out;
    }

    /** @param array<int, array<string, mixed>> $rows */
    private static function camelRows(array $rows): array
    {
        return array_map([self::class, 'camelCase'], $rows);
    }

    private static function looksLikeJson(string $value): bool
    {
        $trimmed = ltrim($value);
        return $trimmed !== '' && ($trimmed[0] === '{' || $trimmed[0] === '[');
    }

    /** @return array<string, mixed> */
    private static function currentUser(): array
    {
        Auth::requireAuth();
        $user = Auth::user();
        return is_array($user) ? $user : [];
    }

    private static function requireTenantId(): string
    {
        $user = self::currentUser();
        $tenantId = $user['tenant_id'] ?? $user['tenantId'] ?? null;
        if ($tenantId === null || $tenantId === '') {
            Response::error('Tenant context required', 403);
            exit;
        }
        return (string) $tenantId;
    }

    /**
     * @param array<int, mixed> $params
     * @return array<int, array<string, mixed>>
     */
    private static function safeQuery(string $sql, array $params, string $label): array
    {
        try {
            return Database::query($sql, $params);
        } catch (Throwable $e) {
            error_log("DomainController query failed ($label): " . $e->getMessage());
            return [];
        }
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

    private static function monthStartIso(): string
    {
        return gmdate('Y-m-01');
    }

    private static function todayIso(): string
    {
        return gmdate('Y-m-d');
    }

    /** @return array{fromTs: int, toTs: int, fromDate: string, toDate: string} */
    private static function fuelDateRange(): array
    {
        $fromDate = trim((string) ($_GET['from'] ?? $_GET['startDate'] ?? self::monthStartIso()));
        $toDate = trim((string) ($_GET['to'] ?? $_GET['endDate'] ?? self::todayIso()));

        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fromDate)) {
            $fromDate = self::monthStartIso();
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $toDate)) {
            $toDate = self::todayIso();
        }

        return [
            'fromDate' => $fromDate,
            'toDate' => $toDate,
            'fromTs' => (int) strtotime($fromDate . ' 00:00:00 UTC'),
            'toTs' => (int) strtotime($toDate . ' 23:59:59 UTC'),
        ];
    }

    /** @param array<int, array<string, mixed>> $transactions */
    private static function computeFuelKpis(array $transactions, string $fromDate, string $toDate): array
    {
        $totalFilled = 0.0;
        $totalConsumed = 0.0;
        $totalMileage = 0.0;

        foreach ($transactions as $row) {
            $section = (string) ($row['section'] ?? '');
            if ($section === 'filling') {
                $totalFilled += (float) ($row['filled'] ?? 0);
            }
            if ($section === 'consumption') {
                $totalConsumed += (float) ($row['fuel_used'] ?? $row['fuelUsed'] ?? 0);
                $totalMileage += (float) ($row['mileage'] ?? 0);
            }
        }

        $avgConsumption = $totalMileage > 0 ? $totalConsumed / ($totalMileage / 100.0) : 0.0;

        return [
            'totalFilled' => round($totalFilled, 1),
            'totalConsumed' => round($totalConsumed, 1),
            'totalMileage' => round($totalMileage, 1),
            'transactionCount' => count($transactions),
            'avgConsumptionL100km' => round($avgConsumption, 2),
            'period' => ['from' => $fromDate, 'to' => $toDate],
        ];
    }

    /** GET /client/drivers */
    public static function drivers(): void
    {
        $tenantId = self::requireTenantId();

        $rows = self::safeQuery(
            'SELECT d.*, a.name AS assigned_asset_name, a.registration_plate AS assigned_asset_plate
             FROM drivers d
             LEFT JOIN assets a ON a.id = d.assigned_asset_id
             WHERE d.tenant_id = ? AND d.deleted_at IS NULL
             ORDER BY d.name',
            [$tenantId],
            'drivers'
        );

        Response::success(self::camelRows($rows));
    }

    /** GET /client/drivers/stats */
    public static function driversStats(): void
    {
        $tenantId = self::requireTenantId();

        $rows = self::safeQuery(
            'SELECT
               SUM(CASE WHEN status = \'available\' THEN 1 ELSE 0 END) AS available,
               SUM(CASE WHEN status = \'driving\' THEN 1 ELSE 0 END) AS driving,
               SUM(CASE WHEN status = \'off-duty\' THEN 1 ELSE 0 END) AS off_duty,
               COUNT(*) AS total
             FROM drivers
             WHERE tenant_id = ? AND deleted_at IS NULL',
            [$tenantId],
            'drivers_stats'
        );

        $stats = self::camelCase($rows[0] ?? []);
        Response::success([
            'total' => (int) ($stats['total'] ?? 0),
            'available' => (int) ($stats['available'] ?? 0),
            'driving' => (int) ($stats['driving'] ?? 0),
            'offDuty' => (int) ($stats['offDuty'] ?? 0),
        ]);
    }

    /** GET /client/routes */
    public static function routes(): void
    {
        $tenantId = self::requireTenantId();
        $status = trim((string) ($_GET['status'] ?? ''));

        $params = [$tenantId];
        $sql = 'SELECT * FROM fleet_routes WHERE tenant_id = ? AND deleted_at IS NULL';
        if ($status !== '') {
            $sql .= ' AND status = ?';
            $params[] = $status;
        }
        $sql .= ' ORDER BY start_time DESC';

        $rows = self::safeQuery($sql, $params, 'routes');
        Response::success(self::camelRows($rows));
    }

    /** GET /client/routes/stats */
    public static function routesStats(): void
    {
        $tenantId = self::requireTenantId();

        $rows = self::safeQuery(
            'SELECT
               COUNT(*) AS total,
               SUM(CASE WHEN status = \'scheduled\' THEN 1 ELSE 0 END) AS scheduled,
               SUM(CASE WHEN status = \'in-progress\' THEN 1 ELSE 0 END) AS in_progress,
               SUM(CASE WHEN status = \'completed\' THEN 1 ELSE 0 END) AS completed,
               COALESCE(SUM(distance), 0) AS total_distance
             FROM fleet_routes
             WHERE tenant_id = ? AND deleted_at IS NULL',
            [$tenantId],
            'routes_stats'
        );

        $stats = self::camelCase($rows[0] ?? []);
        Response::success([
            'total' => (int) ($stats['total'] ?? 0),
            'scheduled' => (int) ($stats['scheduled'] ?? 0),
            'inProgress' => (int) ($stats['inProgress'] ?? 0),
            'completed' => (int) ($stats['completed'] ?? 0),
            'totalDistance' => (float) ($stats['totalDistance'] ?? 0),
        ]);
    }

    /** GET /client/fuel/transactions */
    public static function fuelTransactions(): void
    {
        $tenantId = self::requireTenantId();
        $range = self::fuelDateRange();
        $limit = 500;
        if (isset($_GET['limit']) && is_numeric($_GET['limit'])) {
            $limit = max(1, min(2000, (int) $_GET['limit']));
        }

        $params = [$tenantId, $range['fromTs'], $range['toTs']];
        $sql = 'SELECT * FROM fuel_transactions
                WHERE tenant_id = ?
                  AND timestamp >= ? AND timestamp <= ?
                  AND COALESCE(sensor, \'\') NOT LIKE \'wialon_group_summary%\'
                  AND COALESCE(sensor, \'\') <> \'balance\'';

        if (isset($_GET['unitId']) && is_numeric($_GET['unitId'])) {
            $sql .= ' AND unit_id = ?';
            $params[] = (int) $_GET['unitId'];
        }

        $sql .= ' ORDER BY timestamp DESC LIMIT ?';
        $params[] = $limit;

        $rows = self::safeQuery($sql, $params, 'fuel_transactions');
        $transactions = self::camelRows($rows);
        $kpis = self::computeFuelKpis($rows, $range['fromDate'], $range['toDate']);

        Response::success([
            'transactions' => $transactions,
            'kpis' => $kpis,
            'from' => $range['fromDate'],
            'to' => $range['toDate'],
        ]);
    }

    /** GET /client/fuel/kpis */
    public static function fuelKpis(): void
    {
        $tenantId = self::requireTenantId();
        $range = self::fuelDateRange();

        $rows = self::safeQuery(
            'SELECT section, filled, fuel_used, mileage FROM fuel_transactions
             WHERE tenant_id = ?
               AND timestamp >= ? AND timestamp <= ?
               AND COALESCE(sensor, \'\') NOT LIKE \'wialon_group_summary%\'
               AND COALESCE(sensor, \'\') <> \'balance\'',
            [$tenantId, $range['fromTs'], $range['toTs']],
            'fuel_kpis'
        );

        Response::success(self::computeFuelKpis($rows, $range['fromDate'], $range['toDate']));
    }

    /** GET /client/workshop/kpis */
    public static function workshopKpis(): void
    {
        $tenantId = self::requireTenantId();

        if (!self::tableExists('maintenance_logs')) {
            Response::success([
                'pendingMaintenance' => 0,
                'completedThisMonth' => 0,
                'openBreakdowns' => 0,
                'inspectionsDue' => 0,
                'totalMaintenanceCost' => 0,
                'totalBreakdownCost' => 0,
                'vehiclesNeedingService' => 0,
                'activeMaintenanceJobs' => 0,
                'avgRepairTime' => 0,
                'inspectionPassRate' => 0,
                'fleetHealthScore' => 100,
            ]);
            return;
        }

        $rows = self::safeQuery(
            'SELECT
               (SELECT COUNT(*) FROM maintenance_logs
                WHERE tenant_id = ? AND deleted_at IS NULL AND status IN (\'pending\',\'in-progress\')) AS pending_maintenance,
               (SELECT COUNT(*) FROM maintenance_logs
                WHERE tenant_id = ? AND deleted_at IS NULL AND status = \'completed\'
                  AND start_date >= DATE_FORMAT(NOW(), \'%Y-%m-01\')) AS completed_this_month,
               (SELECT COUNT(*) FROM breakdown_reports
                WHERE tenant_id = ? AND deleted_at IS NULL AND resolution_time IS NULL) AS open_breakdowns,
               (SELECT COUNT(*) FROM vehicle_inspections
                WHERE tenant_id = ? AND deleted_at IS NULL
                  AND inspection_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                  AND overall_status = \'needs-attention\') AS inspections_due,
               (SELECT COALESCE(SUM(total_cost), 0) FROM maintenance_logs
                WHERE tenant_id = ? AND deleted_at IS NULL) AS total_maintenance_cost,
               (SELECT COALESCE(SUM(total_cost), 0) FROM breakdown_reports
                WHERE tenant_id = ? AND deleted_at IS NULL) AS total_breakdown_cost,
               (SELECT COUNT(DISTINCT vehicle_id) FROM maintenance_logs
                WHERE tenant_id = ? AND deleted_at IS NULL AND status IN (\'pending\',\'in-progress\')) AS vehicles_needing_service,
               (SELECT COUNT(*) FROM maintenance_logs
                WHERE tenant_id = ? AND deleted_at IS NULL AND status IN (\'pending\',\'in-progress\')) AS active_maintenance_jobs,
               (SELECT COALESCE(AVG(TIMESTAMPDIFF(HOUR, start_date, COALESCE(end_date, start_date))), 0)
                FROM maintenance_logs
                WHERE tenant_id = ? AND deleted_at IS NULL AND status = \'completed\') AS avg_repair_time,
               (SELECT CASE WHEN COUNT(*) = 0 THEN 0
                  ELSE ROUND(100.0 * SUM(CASE WHEN overall_status = \'pass\' THEN 1 ELSE 0 END) / COUNT(*))
                END
                FROM vehicle_inspections
                WHERE tenant_id = ? AND deleted_at IS NULL
                  AND inspection_date >= DATE_SUB(NOW(), INTERVAL 90 DAY)) AS inspection_pass_rate',
            array_fill(0, 10, $tenantId),
            'workshop_kpis'
        );

        $row = self::camelCase($rows[0] ?? []);
        $n = static fn(mixed $v): float => is_numeric($v) ? (float) $v : 0.0;

        $pendingMaintenance = (int) $n($row['pendingMaintenance'] ?? 0);
        $openBreakdowns = (int) $n($row['openBreakdowns'] ?? 0);

        $failInspections = 0;
        if (self::tableExists('vehicle_inspections')) {
            $failRows = self::safeQuery(
                'SELECT COUNT(*) AS c FROM vehicle_inspections
                 WHERE tenant_id = ? AND deleted_at IS NULL
                   AND overall_status = \'fail\'
                   AND inspection_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)',
                [$tenantId],
                'workshop_fail_inspections'
            );
            $failInspections = (int) ($failRows[0]['c'] ?? 0);
        }

        $fleetHealthScore = max(0, min(100, 100 - ($pendingMaintenance * 5) - ($openBreakdowns * 10) - ($failInspections * 8)));

        Response::success([
            'pendingMaintenance' => $pendingMaintenance,
            'completedThisMonth' => (int) $n($row['completedThisMonth'] ?? 0),
            'openBreakdowns' => $openBreakdowns,
            'inspectionsDue' => (int) $n($row['inspectionsDue'] ?? 0),
            'totalMaintenanceCost' => $n($row['totalMaintenanceCost'] ?? 0),
            'totalBreakdownCost' => $n($row['totalBreakdownCost'] ?? 0),
            'vehiclesNeedingService' => (int) $n($row['vehiclesNeedingService'] ?? 0),
            'activeMaintenanceJobs' => (int) $n($row['activeMaintenanceJobs'] ?? 0),
            'avgRepairTime' => $n($row['avgRepairTime'] ?? 0),
            'inspectionPassRate' => (int) $n($row['inspectionPassRate'] ?? 0),
            'fleetHealthScore' => $fleetHealthScore,
        ]);
    }

    /** GET /client/workshop/inspections */
    public static function workshopInspections(): void
    {
        $tenantId = self::requireTenantId();

        if (!self::tableExists('vehicle_inspections')) {
            Response::success([]);
            return;
        }

        $rows = self::safeQuery(
            'SELECT * FROM vehicle_inspections
             WHERE tenant_id = ? AND deleted_at IS NULL
             ORDER BY inspection_date DESC LIMIT 100',
            [$tenantId],
            'workshop_inspections'
        );

        Response::success(self::camelRows($rows));
    }

    /** GET /client/workshop/maintenance */
    public static function workshopMaintenance(): void
    {
        $tenantId = self::requireTenantId();

        if (!self::tableExists('maintenance_logs')) {
            Response::success([]);
            return;
        }

        $rows = self::safeQuery(
            'SELECT * FROM maintenance_logs
             WHERE tenant_id = ? AND deleted_at IS NULL
             ORDER BY start_date DESC LIMIT 100',
            [$tenantId],
            'workshop_maintenance'
        );

        Response::success(self::camelRows($rows));
    }

    /** GET /client/workshop/breakdowns */
    public static function workshopBreakdowns(): void
    {
        $tenantId = self::requireTenantId();

        if (!self::tableExists('breakdown_reports')) {
            Response::success([]);
            return;
        }

        $rows = self::safeQuery(
            'SELECT * FROM breakdown_reports
             WHERE tenant_id = ? AND deleted_at IS NULL
             ORDER BY breakdown_time DESC LIMIT 100',
            [$tenantId],
            'workshop_breakdowns'
        );

        Response::success(self::camelRows($rows));
    }

    /** GET /client/geofences */
    public static function geofences(): void
    {
        $tenantId = self::requireTenantId();

        $rows = self::safeQuery(
            'SELECT * FROM geofences
             WHERE tenant_id = ? AND deleted_at IS NULL
             ORDER BY name',
            [$tenantId],
            'geofences'
        );

        Response::success(self::camelRows($rows));
    }

    /** GET /client/emissions/violations */
    public static function emissionsViolations(): void
    {
        $tenantId = self::requireTenantId();
        $limit = 100;
        if (isset($_GET['limit']) && is_numeric($_GET['limit'])) {
            $limit = max(1, min(500, (int) $_GET['limit']));
        }

        if (!self::tableExists('eco_driving_violations')) {
            Response::success([]);
            return;
        }

        $rows = self::safeQuery(
            'SELECT * FROM eco_driving_violations
             WHERE tenant_id = ?
             ORDER BY occurred_at DESC LIMIT ?',
            [$tenantId, $limit],
            'emissions_violations'
        );

        Response::success(self::camelRows($rows));
    }

    /** GET /client/emissions/metrics */
    public static function emissionsMetrics(): void
    {
        $tenantId = self::requireTenantId();

        $tripFuel = 0.0;
        $tripMileage = 0.0;
        if (self::tableExists('trip_summaries')) {
            $tripRows = self::safeQuery(
                'SELECT COALESCE(SUM(mileage), 0) AS mileage, COALESCE(SUM(fuel_used), 0) AS fuel_used
                 FROM trip_summaries WHERE tenant_id = ?',
                [$tenantId],
                'emissions_trips'
            );
            $tripFuel = (float) ($tripRows[0]['fuel_used'] ?? 0);
            $tripMileage = (float) ($tripRows[0]['mileage'] ?? 0);
        }

        $fuelUsed = 0.0;
        $fuelMileage = 0.0;
        if (self::tableExists('fuel_transactions')) {
            $fuelRows = self::safeQuery(
                'SELECT COALESCE(SUM(fuel_used), 0) AS fuel_used, COALESCE(SUM(mileage), 0) AS mileage
                 FROM fuel_transactions
                 WHERE tenant_id = ? AND section = \'consumption\'',
                [$tenantId],
                'emissions_fuel'
            );
            $fuelUsed = (float) ($fuelRows[0]['fuel_used'] ?? 0);
            $fuelMileage = (float) ($fuelRows[0]['mileage'] ?? 0);
        }

        $violationCount = 0;
        if (self::tableExists('eco_driving_violations')) {
            $violationRows = self::safeQuery(
                'SELECT COUNT(*) AS c FROM eco_driving_violations WHERE tenant_id = ?',
                [$tenantId],
                'emissions_violation_count'
            );
            $violationCount = (int) ($violationRows[0]['c'] ?? 0);
        }

        $totalFuel = $tripFuel + $fuelUsed;
        $totalMileage = max($tripMileage, $fuelMileage);
        $co2Kg = $totalFuel * self::EMISSION_FACTOR;
        $co2PerKm = $totalMileage > 0 ? $co2Kg / $totalMileage : 0.0;

        Response::success([
            'totalFuelLiters' => round($totalFuel, 1),
            'totalMileageKm' => round($totalMileage, 1),
            'co2Kg' => (int) round($co2Kg),
            'co2PerKm' => round($co2PerKm, 2),
            'violationCount' => $violationCount,
            'emissionFactor' => self::EMISSION_FACTOR,
            'complianceStatus' => $co2PerKm < 0.25 ? 'good' : ($co2PerKm < 0.35 ? 'moderate' : 'poor'),
        ]);
    }

    /** GET /client/commands/history */
    public static function commandsHistory(): void
    {
        $tenantId = self::requireTenantId();

        if (!self::tableExists('command_logs')) {
            Response::success([]);
            return;
        }

        $rows = self::safeQuery(
            'SELECT * FROM command_logs
             WHERE tenant_id = ?
             ORDER BY created_at DESC LIMIT 100',
            [$tenantId],
            'commands_history'
        );

        Response::success(self::camelRows($rows));
    }

    /** GET /client/reports/types */
    public static function reportTypes(): void
    {
        self::requireTenantId();

        Response::success([
            ['id' => 'trips', 'label' => 'Trip Log', 'format' => 'csv'],
            ['id' => 'fuel', 'label' => 'Fuel Transactions', 'format' => 'csv'],
            ['id' => 'violations', 'label' => 'Eco-Driving Violations', 'format' => 'csv'],
            ['id' => 'drivers', 'label' => 'Driver Performance', 'format' => 'csv'],
            ['id' => 'workshop', 'label' => 'Maintenance Log', 'format' => 'csv'],
            ['id' => 'executive', 'label' => 'Executive Summary', 'format' => 'json'],
        ]);
    }

    /** GET /client/routes/trips */
    public static function routesTrips(): void
    {
        $tenantId = self::requireTenantId();

        $rows = self::safeQuery(
            'SELECT * FROM trip_summaries
             WHERE tenant_id = ?
             ORDER BY departure_time DESC
             LIMIT 200',
            [$tenantId],
            'routes_trips'
        );

        Response::success(self::camelRows($rows));
    }

    /** GET /client/fuel/monthly-trend */
    public static function fuelMonthlyTrend(): void
    {
        $tenantId = self::requireTenantId();

        $rows = self::safeQuery(
            "SELECT DATE_FORMAT(FROM_UNIXTIME(timestamp), '%Y-%m') AS month,
                    COALESCE(SUM(CASE WHEN section = 'filling' THEN filled ELSE 0 END), 0) AS filled,
                    COALESCE(SUM(CASE WHEN section = 'consumption' THEN fuel_used ELSE 0 END), 0) AS consumed
             FROM fuel_transactions
             WHERE tenant_id = ?
               AND timestamp >= UNIX_TIMESTAMP(DATE_SUB(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL 11 MONTH))
               AND COALESCE(sensor, '') NOT LIKE 'wialon_group_summary%'
               AND COALESCE(sensor, '') <> 'balance'
             GROUP BY month
             ORDER BY month",
            [$tenantId],
            'fuel_monthly_trend'
        );

        $result = [];
        foreach ($rows as $row) {
            $result[] = [
                'month' => $row['month'],
                'filled' => round((float) ($row['filled'] ?? 0), 1),
                'consumed' => round((float) ($row['consumed'] ?? 0), 1),
            ];
        }

        Response::success($result);
    }

    /** GET /client/fuel/sync-status */
    public static function fuelSyncStatus(): void
    {
        $tenantId = self::requireTenantId();

        if (!self::tableExists('fuel_sync_cursor')) {
            Response::success([]);
            return;
        }

        $rows = self::safeQuery(
            'SELECT * FROM fuel_sync_cursor WHERE tenant_id = ?',
            [$tenantId],
            'fuel_sync_status'
        );

        Response::success(self::camelRows($rows));
    }

    /** GET /client/reports/data/:type */
    public static function reportsData(?string $type = null): void
    {
        $tenantId = self::requireTenantId();
        $type = strtolower(trim((string) ($type ?? '')));

        $allowedTypes = ['trips', 'fuel', 'violations', 'drivers', 'workshop', 'executive'];
        if (!in_array($type, $allowedTypes, true)) {
            Response::error('Unknown report type', 400);
            return;
        }

        $rows = [];
        switch ($type) {
            case 'trips':
                $rows = self::camelRows(self::safeQuery(
                    'SELECT * FROM trip_summaries WHERE tenant_id = ? ORDER BY departure_time DESC LIMIT 500',
                    [$tenantId],
                    'report_trips'
                ));
                break;
            case 'fuel':
                $rows = self::camelRows(self::safeQuery(
                    'SELECT * FROM fuel_transactions WHERE tenant_id = ? ORDER BY timestamp DESC LIMIT 500',
                    [$tenantId],
                    'report_fuel'
                ));
                break;
            case 'violations':
                $rows = self::tableExists('eco_driving_violations')
                    ? self::camelRows(self::safeQuery(
                        'SELECT * FROM eco_driving_violations WHERE tenant_id = ? ORDER BY occurred_at DESC LIMIT 500',
                        [$tenantId],
                        'report_violations'
                    ))
                    : [];
                break;
            case 'drivers':
                $rows = self::camelRows(self::safeQuery(
                    'SELECT * FROM drivers WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY name',
                    [$tenantId],
                    'report_drivers'
                ));
                break;
            case 'workshop':
                $rows = self::tableExists('maintenance_logs')
                    ? self::camelRows(self::safeQuery(
                        'SELECT * FROM maintenance_logs WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY start_date DESC LIMIT 500',
                        [$tenantId],
                        'report_workshop'
                    ))
                    : [];
                break;
            case 'executive':
                $driverCount = self::safeQuery(
                    'SELECT COUNT(*) AS c FROM drivers WHERE tenant_id = ? AND deleted_at IS NULL',
                    [$tenantId],
                    'exec_drivers'
                );
                $tripCount = self::safeQuery(
                    'SELECT COUNT(*) AS c FROM trip_summaries WHERE tenant_id = ?',
                    [$tenantId],
                    'exec_trips'
                );
                $fuelSums = self::safeQuery(
                    "SELECT COALESCE(SUM(CASE WHEN section = 'filling' THEN filled ELSE 0 END), 0) AS filled,
                            COALESCE(SUM(CASE WHEN section = 'consumption' THEN fuel_used ELSE 0 END), 0) AS consumed
                     FROM fuel_transactions WHERE tenant_id = ?",
                    [$tenantId],
                    'exec_fuel'
                );
                $violationCount = self::tableExists('eco_driving_violations')
                    ? self::safeQuery(
                        'SELECT COUNT(*) AS c FROM eco_driving_violations WHERE tenant_id = ?',
                        [$tenantId],
                        'exec_violations'
                    )
                    : [['c' => 0]];

                $rows = [[
                    'totalDrivers' => (int) ($driverCount[0]['c'] ?? 0),
                    'totalTrips' => (int) ($tripCount[0]['c'] ?? 0),
                    'totalFuelFilled' => round((float) ($fuelSums[0]['filled'] ?? 0), 1),
                    'totalFuelConsumed' => round((float) ($fuelSums[0]['consumed'] ?? 0), 1),
                    'totalViolations' => (int) ($violationCount[0]['c'] ?? 0),
                    'generatedAt' => gmdate('c'),
                ]];
                break;
        }

        Response::success(['type' => $type, 'rows' => $rows]);
    }

    /** POST /client/drivers */
    public static function driversCreate(): void
    {
        $tenantId = self::requireTenantId();
        $body = Auth::jsonBody();

        $name = trim((string) ($body['name'] ?? ''));
        $phone = trim((string) ($body['phone'] ?? ''));
        $licenseNumber = trim((string) ($body['licenseNumber'] ?? ''));
        $status = trim((string) ($body['status'] ?? 'available'));
        $assignedAssetId = $body['assignedAssetId'] ?? null;

        if ($name === '' || $licenseNumber === '') {
            Response::error('name and licenseNumber are required', 400);
            return;
        }

        $allowedStatuses = ['available', 'driving', 'off-duty'];
        if (!in_array($status, $allowedStatuses, true)) {
            $status = 'available';
        }

        $id = self::uuid();
        try {
            Database::execute(
                'INSERT INTO drivers (id, tenant_id, name, license_number, phone, status, assigned_asset_id, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
                [$id, $tenantId, $name, $licenseNumber, $phone, $status, $assignedAssetId ?: null]
            );
        } catch (Throwable $e) {
            error_log('DomainController driversCreate: ' . $e->getMessage());
            Response::error('Failed to create driver', 500);
            return;
        }

        $rows = self::safeQuery('SELECT * FROM drivers WHERE id = ? LIMIT 1', [$id], 'driver_created');
        Response::success($rows ? self::camelCase($rows[0]) : ['id' => $id], 201);
    }

    /** PATCH /client/drivers/:id */
    public static function driversPatch(?string $id = null): void
    {
        $tenantId = self::requireTenantId();
        $driverId = $id ?? '';
        if ($driverId === '') {
            Response::error('Driver id required', 400);
            return;
        }

        $body = Auth::jsonBody();
        $columnMap = [
            'name' => 'name',
            'phone' => 'phone',
            'email' => 'email',
            'licenseNumber' => 'license_number',
            'status' => 'status',
            'assignedAssetId' => 'assigned_asset_id',
            'photoUrl' => 'photo_url',
        ];

        $fields = [];
        $params = [];
        foreach ($columnMap as $key => $column) {
            if (array_key_exists($key, $body)) {
                $fields[] = "$column = ?";
                $value = $body[$key];
                $params[] = ($value === '' ? null : $value);
            }
        }

        if (!$fields) {
            Response::error('No fields to update', 400);
            return;
        }

        $params[] = $driverId;
        $params[] = $tenantId;

        try {
            $updated = Database::execute(
                'UPDATE drivers SET ' . implode(', ', $fields) . ', updated_at = NOW()
                 WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
                $params
            );
        } catch (Throwable $e) {
            error_log('DomainController driversPatch: ' . $e->getMessage());
            Response::error('Failed to update driver', 500);
            return;
        }

        if ($updated === 0) {
            $exists = self::safeQuery(
                'SELECT id FROM drivers WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1',
                [$driverId, $tenantId],
                'driver_exists'
            );
            if (!$exists) {
                Response::error('Driver not found', 404);
                return;
            }
        }

        $rows = self::safeQuery('SELECT * FROM drivers WHERE id = ? LIMIT 1', [$driverId], 'driver_patched');
        Response::success($rows ? self::camelCase($rows[0]) : null);
    }

    /** DELETE /client/drivers/:id */
    public static function driversDelete(?string $id = null): void
    {
        $tenantId = self::requireTenantId();
        $driverId = $id ?? '';
        if ($driverId === '') {
            Response::error('Driver id required', 400);
            return;
        }

        try {
            $updated = Database::execute(
                'UPDATE drivers SET deleted_at = NOW(), updated_at = NOW()
                 WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
                [$driverId, $tenantId]
            );
        } catch (Throwable $e) {
            error_log('DomainController driversDelete: ' . $e->getMessage());
            Response::error('Failed to delete driver', 500);
            return;
        }

        if ($updated === 0) {
            Response::error('Driver not found', 404);
            return;
        }

        Response::success(['ok' => true]);
    }

    /** POST /client/geofences */
    public static function geofencesCreate(): void
    {
        $tenantId = self::requireTenantId();
        $body = Auth::jsonBody();

        $name = trim((string) ($body['name'] ?? ''));
        $type = trim((string) ($body['type'] ?? 'circle'));
        $geometry = $body['geometry'] ?? null;

        if ($name === '') {
            Response::error('name is required', 400);
            return;
        }
        if (!in_array($type, ['circle', 'polygon'], true)) {
            $type = 'circle';
        }

        $center = null;
        $points = null;
        $radius = isset($body['radius']) && is_numeric($body['radius']) ? (float) $body['radius'] : null;

        if ($type === 'circle') {
            $center = is_array($geometry) ? json_encode($geometry) : $geometry;
            if ($radius === null && is_array($geometry) && isset($geometry['radius']) && is_numeric($geometry['radius'])) {
                $radius = (float) $geometry['radius'];
            }
        } else {
            $points = is_array($geometry) ? json_encode($geometry) : $geometry;
        }

        $color = trim((string) ($body['color'] ?? '#3B82F6'));

        $id = self::uuid();
        try {
            Database::execute(
                'INSERT INTO geofences (id, tenant_id, name, type, center, radius, points, color, is_active, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())',
                [$id, $tenantId, $name, $type, $center, $radius, $points, $color]
            );
        } catch (Throwable $e) {
            error_log('DomainController geofencesCreate: ' . $e->getMessage());
            Response::error('Failed to create geofence', 500);
            return;
        }

        $rows = self::safeQuery('SELECT * FROM geofences WHERE id = ? LIMIT 1', [$id], 'geofence_created');
        Response::success($rows ? self::camelCase($rows[0]) : ['id' => $id], 201);
    }

    /** DELETE /client/geofences/:id */
    public static function geofencesDelete(?string $id = null): void
    {
        $tenantId = self::requireTenantId();
        $geofenceId = $id ?? '';
        if ($geofenceId === '') {
            Response::error('Geofence id required', 400);
            return;
        }

        try {
            $updated = Database::execute(
                'UPDATE geofences SET deleted_at = NOW(), updated_at = NOW()
                 WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
                [$geofenceId, $tenantId]
            );
        } catch (Throwable $e) {
            error_log('DomainController geofencesDelete: ' . $e->getMessage());
            Response::error('Failed to delete geofence', 500);
            return;
        }

        if ($updated === 0) {
            Response::error('Geofence not found', 404);
            return;
        }

        Response::success(['ok' => true]);
    }

    /** GET /client/workshop/mechanics */
    public static function workshopMechanics(): void
    {
        $tenantId = self::requireTenantId();

        if (!self::tableExists('mechanics')) {
            Response::success([]);
            return;
        }

        $rows = self::safeQuery(
            'SELECT * FROM mechanics
             WHERE tenant_id = ? AND deleted_at IS NULL
             ORDER BY name',
            [$tenantId],
            'workshop_mechanics'
        );

        Response::success(self::camelRows($rows));
    }
}
