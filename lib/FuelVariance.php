<?php
/**
 * FLS (fuel_transactions fills) vs petrol-station sheet variance.
 * Parity with FuelVarianceService.ts
 */
require_once __DIR__ . '/Database.php';

final class FuelVariance
{
    public static function normalizePlateKey(string $value): string
    {
        return strtoupper(preg_replace('/[^A-Z0-9]/i', '', $value) ?? '');
    }

    /** Extract plate-like token from unit names (e.g. "TK UBA 123A GENERATOR"). */
    public static function extractPlateFromName(string $name): string
    {
        if (preg_match('/\b([A-Z]{1,3}[\s\-]?[A-Z0-9]{2,4}[\s\-]?\d{2,4}[A-Z]?)\b/i', $name, $m)) {
            return $m[1];
        }
        if (preg_match('/\b(U[A-Z]{2}\s?\d{3}[A-Z])\b/i', $name, $m)) {
            return $m[1];
        }
        return '';
    }

    /** @return list<string> */
    public static function unitMatchKeys(string $unitName, ?string $plate = null): array
    {
        $keys = [];
        $p = self::normalizePlateKey((string) $plate);
        if ($p !== '') {
            $keys[$p] = true;
        }
        $fromName = self::normalizePlateKey(self::extractPlateFromName($unitName));
        if ($fromName !== '') {
            $keys[$fromName] = true;
        }
        $nameKey = self::normalizePlateKey($unitName);
        if ($nameKey !== '') {
            $keys[$nameKey] = true;
        }
        return array_keys($keys);
    }

    /**
     * @return array{
     *   configured:bool,fromDate:string,toDate:string,
     *   summary:array,assets:list,details:list,rows:list
     * }
     */
    public static function report(string $tenantId, ?string $fromDate = null, ?string $toDate = null): array
    {
        if (!self::tableExists('fuel_station_fills')) {
            return [
                'configured' => false,
                'fromDate' => $fromDate ?: date('Y-m-d', strtotime('-30 days')),
                'toDate' => $toDate ?: date('Y-m-d'),
                'summary' => ['stationLiters' => 0, 'flsLiters' => 0, 'variance' => 0, 'assets' => 0, 'stationFills' => 0],
                'assets' => [],
                'details' => [],
                'rows' => [],
            ];
        }

        $toDate = $toDate ?: date('Y-m-d');
        $fromDate = $fromDate ?: date('Y-m-d', strtotime($toDate . ' -30 days'));
        $fromTs = strtotime($fromDate . ' 00:00:00 UTC');
        $toTs = strtotime($toDate . ' 23:59:59 UTC');
        if (!$fromTs || !$toTs) {
            $fromTs = time() - 30 * 86400;
            $toTs = time();
            $fromDate = gmdate('Y-m-d', $fromTs);
            $toDate = gmdate('Y-m-d', $toTs);
        }

        $stationByKey = self::stationTotals($tenantId, $fromDate, $toDate);
        $flsTotals = self::flsTotals($tenantId, $fromTs, $toTs);

        $flsByUnit = [];
        foreach ($flsTotals as $t) {
            $name = $t['unitName'];
            if (!isset($flsByUnit[$name])) {
                $flsByUnit[$name] = [
                    'liters' => 0.0,
                    'count' => 0,
                    'unitId' => $t['unitId'],
                    'keys' => self::unitMatchKeys($name),
                ];
            }
            $flsByUnit[$name]['liters'] += $t['flsLiters'];
            $flsByUnit[$name]['count'] += $t['flsFills'];
        }

        $usedStationKeys = [];
        $assets = [];
        foreach ($flsByUnit as $unitName => $fls) {
            $stationLiters = 0.0;
            $stationFills = 0;
            $registration = '';
            foreach ($fls['keys'] as $key) {
                if (!isset($stationByKey[$key])) {
                    continue;
                }
                $st = $stationByKey[$key];
                $stationLiters += $st['stationLiters'];
                $stationFills += $st['fillCount'];
                $registration = $registration !== '' ? $registration : $st['registration'];
                $usedStationKeys[$key] = true;
            }
            if ($stationLiters <= 0) {
                continue;
            }
            $assets[] = [
                'key' => $fls['keys'][0] ?? self::normalizePlateKey($unitName),
                'registration' => $registration !== '' ? $registration : $unitName,
                'unitId' => $fls['unitId'],
                'unitName' => $unitName,
                'stationLiters' => self::round1($stationLiters),
                'flsLiters' => self::round1($fls['liters']),
                'telematicsLiters' => self::round1($fls['liters']),
                'variance' => self::round1($fls['liters'] - $stationLiters),
                'stationFills' => $stationFills,
                'flsFills' => $fls['count'],
            ];
        }

        foreach ($stationByKey as $key => $st) {
            if (isset($usedStationKeys[$key])) {
                continue;
            }
            $assets[] = [
                'key' => $key,
                'registration' => $st['registration'],
                'unitId' => $st['unitId'],
                'unitName' => $st['unitName'] ?: $st['registration'],
                'stationLiters' => $st['stationLiters'],
                'flsLiters' => 0.0,
                'telematicsLiters' => 0.0,
                'variance' => self::round1(0 - $st['stationLiters']),
                'stationFills' => $st['fillCount'],
                'flsFills' => 0,
            ];
        }

        usort($assets, static fn($a, $b) => abs($b['variance']) <=> abs($a['variance']));

        $details = self::stationDetails($tenantId, $fromDate, $toDate);

        $sumStation = 0.0;
        $sumFls = 0.0;
        $sumFills = 0;
        foreach ($assets as $a) {
            $sumStation += $a['stationLiters'];
            $sumFls += $a['flsLiters'];
            $sumFills += $a['stationFills'];
        }

        return [
            'configured' => true,
            'fromDate' => $fromDate,
            'toDate' => $toDate,
            'summary' => [
                'stationLiters' => self::round1($sumStation),
                'flsLiters' => self::round1($sumFls),
                'variance' => self::round1($sumFls - $sumStation),
                'assets' => count($assets),
                'stationFills' => $sumFills,
            ],
            'assets' => $assets,
            'details' => $details,
            // Alias used by Fuel UI Variance tab
            'rows' => array_map(static function (array $a): array {
                return [
                    'station' => $a['registration'],
                    'name' => $a['unitName'],
                    'sheetLiters' => $a['stationLiters'],
                    'stationLiters' => $a['stationLiters'],
                    'telematicsLiters' => $a['flsLiters'],
                    'flsLiters' => $a['flsLiters'],
                    'variance' => $a['variance'],
                    'diff' => $a['variance'],
                ];
            }, $assets),
        ];
    }

    /** @return array<string, array<string, mixed>> */
    private static function stationTotals(string $tenantId, string $fromDate, string $toDate): array
    {
        $rows = Database::query(
            "SELECT registration_key AS k,
                    MAX(registration) AS registration,
                    MAX(unit_id) AS unit_id,
                    MAX(unit_name) AS unit_name,
                    COALESCE(SUM(quantity), 0) AS station_liters,
                    COUNT(*) AS fill_count
             FROM fuel_station_fills
             WHERE tenant_id = ?
               AND filled_at >= ?
               AND filled_at < DATE_ADD(?, INTERVAL 1 DAY)
               AND registration_key <> ''
             GROUP BY registration_key",
            [$tenantId, $fromDate, $toDate]
        );
        $map = [];
        foreach ($rows as $r) {
            $key = (string) ($r['k'] ?? '');
            if ($key === '') {
                continue;
            }
            // Re-normalize in case older imports used weaker keys
            $norm = self::normalizePlateKey($key) ?: $key;
            $map[$norm] = [
                'registration' => (string) ($r['registration'] ?? ''),
                'unitId' => isset($r['unit_id']) ? (string) $r['unit_id'] : null,
                'unitName' => isset($r['unit_name']) ? (string) $r['unit_name'] : null,
                'stationLiters' => self::round1((float) ($r['station_liters'] ?? 0)),
                'fillCount' => (int) ($r['fill_count'] ?? 0),
            ];
        }
        return $map;
    }

    /** @return list<array{unitId:string,unitName:string,flsLiters:float,flsFills:int}> */
    private static function flsTotals(string $tenantId, int $fromTs, int $toTs): array
    {
        if (!self::tableExists('fuel_transactions')) {
            return [];
        }
        $rows = Database::query(
            "SELECT unit_id, unit_name,
                    COALESCE(SUM(filled), 0) AS fls_liters,
                    COUNT(*) AS fls_fills
             FROM fuel_transactions
             WHERE tenant_id = ?
               AND section = 'filling'
               AND timestamp >= ? AND timestamp <= ?
               AND COALESCE(filled, 0) > 0
               AND COALESCE(sensor, '') NOT LIKE 'wialon_group_summary%'
               AND COALESCE(sensor, '') <> 'balance'
             GROUP BY unit_id, unit_name",
            [$tenantId, $fromTs, $toTs]
        );
        $out = [];
        foreach ($rows as $r) {
            $out[] = [
                'unitId' => (string) ($r['unit_id'] ?? ''),
                'unitName' => (string) ($r['unit_name'] ?? ''),
                'flsLiters' => self::round1((float) ($r['fls_liters'] ?? 0)),
                'flsFills' => (int) ($r['fls_fills'] ?? 0),
            ];
        }
        return $out;
    }

    /** @return list<array<string, mixed>> */
    private static function stationDetails(string $tenantId, string $fromDate, string $toDate): array
    {
        $rows = Database::query(
            "SELECT id, filled_at, registration, unit_name, product, quantity, unit_price, amount,
                    card_number, receipt_number
             FROM fuel_station_fills
             WHERE tenant_id = ?
               AND filled_at >= ?
               AND filled_at < DATE_ADD(?, INTERVAL 1 DAY)
             ORDER BY filled_at DESC
             LIMIT 300",
            [$tenantId, $fromDate, $toDate]
        );
        $out = [];
        foreach ($rows as $r) {
            $out[] = [
                'id' => $r['id'],
                'filledAt' => $r['filled_at'],
                'registration' => $r['registration'],
                'unitName' => $r['unit_name'],
                'product' => $r['product'],
                'stationLiters' => self::round1((float) ($r['quantity'] ?? 0)),
                'unitPrice' => isset($r['unit_price']) ? (float) $r['unit_price'] : null,
                'amount' => isset($r['amount']) ? (float) $r['amount'] : null,
                'cardNumber' => $r['card_number'],
                'receiptNumber' => $r['receipt_number'],
            ];
        }
        return $out;
    }

    private static function round1(float $n): float
    {
        return round($n * 10) / 10;
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
}
