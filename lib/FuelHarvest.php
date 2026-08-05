<?php
/**
 * Fuel report harvest → MySQL fuel_transactions.
 * Used by cron (15 min) and POST /client/wialon/fuel/harvest.
 */
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/WialonLive.php';
require_once __DIR__ . '/WialonFleet.php';
require_once __DIR__ . '/FuelReportParser.php';

final class FuelHarvest
{
    /** @return array{tenants:int,inserted:int,errors:int} */
    public static function harvestAllConnected(int $cap = 20): array
    {
        $tenants = 0;
        $inserted = 0;
        $errors = 0;
        try {
            $rows = Database::query(
                "SELECT DISTINCT tenant_id FROM data_sources
                 WHERE source_type = 'wialon' AND is_active = 1
                   AND connection_verified_at IS NOT NULL
                   AND wialon_resource_id IS NOT NULL AND wialon_resource_id > 0"
            );
        } catch (Throwable $e) {
            return ['tenants' => 0, 'inserted' => 0, 'errors' => 1];
        }

        $to = time();
        $from = $to - 86400 * 7;
        foreach ($rows as $row) {
            $tid = (string) ($row['tenant_id'] ?? '');
            if ($tid === '') {
                continue;
            }
            $tenants++;
            try {
                $r = self::harvestTenant($tid, $from, $to, $cap, true);
                $inserted += (int) ($r['inserted'] ?? 0);
            } catch (Throwable $e) {
                $errors++;
                error_log("FuelHarvest tenant {$tid}: " . $e->getMessage());
            }
        }
        return ['tenants' => $tenants, 'inserted' => $inserted, 'errors' => $errors];
    }

    /**
     * @return array{ok:int,failed:int,inserted:int,attempted:int,results:array}
     */
    public static function harvestTenant(
        string $tenantId,
        int $from,
        int $to,
        int $cap = 20,
        bool $persist = true,
        ?int $resourceId = null,
        ?int $templateId = null
    ): array {
        @set_time_limit(300);
        $cap = max(1, min(20, $cap));

        if (!$resourceId || !$templateId) {
            require_once __DIR__ . '/FuelModuleConfig.php';
            try {
                $cfg = FuelModuleConfig::get($tenantId);
                foreach ($cfg['selectedReports'] ?? [] as $r) {
                    $name = strtolower((string) ($r['templateName'] ?? ''));
                    if (!empty($r['isGroupReport'])) {
                        continue;
                    }
                    if (preg_match('/group|gensets?\b/', $name) && !str_contains($name, 'unit')) {
                        continue;
                    }
                    $resourceId = (int) ($r['resourceId'] ?? 0);
                    $templateId = (int) ($r['templateId'] ?? 0);
                    if ($resourceId > 0 && $templateId > 0) {
                        break;
                    }
                }
            } catch (Throwable $e) {
                // fall through to auto-pick
            }
        }
        if (!$resourceId || !$templateId) {
            $picked = self::pickFuelUnitTemplate($tenantId);
            if (!$picked) {
                throw new RuntimeException('No fuel unit report template found on this account');
            }
            $resourceId = (int) $picked['resourceId'];
            $templateId = (int) $picked['id'];
        }

        $nameById = [];
        $live = WialonFleet::tryLiveSnapshot($tenantId);
        if ($live) {
            foreach ($live['units'] ?? [] as $u) {
                $id = (int) ($u['wialonId'] ?? $u['id'] ?? 0);
                if ($id > 0) {
                    $nameById[$id] = (string) ($u['name'] ?? ('Unit ' . $id));
                }
            }
        }
        $unitIds = array_slice(array_keys($nameById), 0, $cap);
        if (!$unitIds) {
            throw new RuntimeException('No units available to harvest');
        }

        $results = [];
        $ok = 0;
        $failed = 0;
        $insertedTotal = 0;
        foreach ($unitIds as $unitId) {
            $unitName = $nameById[$unitId] ?? ('Unit ' . $unitId);
            try {
                $raw = WialonLive::execReport($tenantId, $resourceId, $templateId, $unitId, $from, $to, 300);
                $txs = FuelReportParser::tablesToTransactions($raw['tables'] ?? [], $unitId, $unitName);
                $inserted = 0;
                if ($persist && $txs) {
                    $inserted = self::persistTransactions($tenantId, $unitId, $unitName, $txs);
                }
                $insertedTotal += $inserted;
                $ok++;
                $results[] = [
                    'unitId' => $unitId,
                    'unitName' => $unitName,
                    'count' => count($txs),
                    'inserted' => $inserted,
                ];
            } catch (Throwable $e) {
                $failed++;
                $results[] = [
                    'unitId' => $unitId,
                    'unitName' => $unitName,
                    'error' => $e->getMessage(),
                ];
            }
        }

        return [
            'ok' => $ok,
            'failed' => $failed,
            'inserted' => $insertedTotal,
            'attempted' => count($unitIds),
            'templateId' => $templateId,
            'resourceId' => $resourceId,
            'results' => $results,
        ];
    }

    /** @return array{resourceId:int,id:int,name?:string}|null */
    public static function pickFuelUnitTemplate(string $tenantId): ?array
    {
        $catalog = WialonLive::reportCatalog($tenantId);
        $picked = null;
        foreach ($catalog['templates'] ?? [] as $t) {
            if (($t['module'] ?? '') !== 'fuel') {
                continue;
            }
            $name = strtolower((string) ($t['name'] ?? ''));
            if (preg_match('/group|gensets?\b/', $name) && !str_contains($name, 'unit')) {
                continue;
            }
            if (str_contains($name, 'unit') || str_contains($name, 'fill')) {
                return $t;
            }
            if ($picked === null) {
                $picked = $t;
            }
        }
        return $picked;
    }

    /**
     * @param array<int, array<string, mixed>> $txs
     */
    public static function persistTransactions(string $tenantId, int $unitId, string $unitName, array $txs): int
    {
        $inserted = 0;
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
            }
        }
        return $inserted;
    }

    private static function uuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }
}
