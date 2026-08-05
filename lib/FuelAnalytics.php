<?php
/**
 * Fuel analytics aggregate from MySQL ledger + live fleet.
 * Parity subset of WialonFuelAnalyticsService.getAnalytics
 */
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/WialonFleet.php';

final class FuelAnalytics
{
    /**
     * @return array<string, mixed>
     */
    public static function getAnalytics(
        string $tenantId,
        ?string $fromDate = null,
        ?string $toDate = null,
        ?string $unitId = null
    ): array {
        $toDate = $toDate ?: date('Y-m-d');
        $fromDate = $fromDate ?: date('Y-m-d', strtotime($toDate . ' -30 days'));
        $fromTs = strtotime($fromDate . ' 00:00:00 UTC') ?: (time() - 30 * 86400);
        $toTs = strtotime($toDate . ' 23:59:59 UTC') ?: time();

        $params = [$tenantId, $fromTs, $toTs];
        $unitFilter = '';
        if ($unitId !== null && $unitId !== '') {
            $unitFilter = ' AND unit_id = ?';
            $params[] = $unitId;
        }

        $rows = [];
        try {
            $rows = Database::query(
                "SELECT unit_id, unit_name, section, filled, fuel_used, drained, mileage, timestamp, sensor
                 FROM fuel_transactions
                 WHERE tenant_id = ?
                   AND timestamp >= ? AND timestamp <= ?
                   AND COALESCE(sensor, '') NOT LIKE 'wialon_group_summary%'
                   AND COALESCE(sensor, '') <> 'balance'
                   {$unitFilter}
                 ORDER BY timestamp ASC
                 LIMIT 5000",
                $params
            );
        } catch (Throwable $e) {
            $rows = [];
        }

        $totalFilled = 0.0;
        $totalConsumed = 0.0;
        $totalDrained = 0.0;
        $byDay = [];
        $byAsset = [];
        $sectionBreakdown = ['filling' => 0.0, 'consumption' => 0.0, 'theft' => 0.0, 'other' => 0.0];
        $ledger = [];

        foreach ($rows as $r) {
            $filled = (float) ($r['filled'] ?? 0);
            $used = (float) ($r['fuel_used'] ?? 0);
            $drained = (float) ($r['drained'] ?? 0);
            $section = (string) ($r['section'] ?? 'other');
            $totalFilled += $filled;
            $totalConsumed += $used;
            $totalDrained += $drained;
            if ($section === 'filling') {
                $sectionBreakdown['filling'] += $filled;
            } elseif ($section === 'consumption') {
                $sectionBreakdown['consumption'] += $used;
            } elseif ($section === 'theft') {
                $sectionBreakdown['theft'] += $drained ?: $used;
            } else {
                $sectionBreakdown['other'] += $filled + $used;
            }

            $day = gmdate('Y-m-d', (int) ($r['timestamp'] ?? 0));
            if (!isset($byDay[$day])) {
                $byDay[$day] = ['date' => $day, 'filled' => 0.0, 'consumed' => 0.0, 'drained' => 0.0];
            }
            $byDay[$day]['filled'] += $filled;
            $byDay[$day]['consumed'] += $used;
            $byDay[$day]['drained'] += $drained;

            $uid = (string) ($r['unit_id'] ?? '');
            $uname = (string) ($r['unit_name'] ?? $uid);
            if ($uid !== '') {
                if (!isset($byAsset[$uid])) {
                    $byAsset[$uid] = [
                        'unitId' => $uid,
                        'unitName' => $uname,
                        'filled' => 0.0,
                        'consumed' => 0.0,
                        'drained' => 0.0,
                        'events' => 0,
                    ];
                }
                $byAsset[$uid]['filled'] += $filled;
                $byAsset[$uid]['consumed'] += $used;
                $byAsset[$uid]['drained'] += $drained;
                $byAsset[$uid]['events']++;
            }

            if (count($ledger) < 200) {
                $ledger[] = [
                    'unitId' => $uid,
                    'unitName' => $uname,
                    'section' => $section,
                    'filled' => round($filled, 1),
                    'fuelUsed' => round($used, 1),
                    'drained' => round($drained, 1),
                    'mileage' => isset($r['mileage']) ? (float) $r['mileage'] : null,
                    'timestamp' => (int) ($r['timestamp'] ?? 0),
                    'occurredAt' => !empty($r['timestamp']) ? gmdate('c', (int) $r['timestamp']) : null,
                ];
            }
        }

        $timeSeries = array_values($byDay);
        usort($timeSeries, static fn($a, $b) => strcmp($a['date'], $b['date']));
        foreach ($timeSeries as &$d) {
            $d['filled'] = round($d['filled'], 1);
            $d['consumed'] = round($d['consumed'], 1);
            $d['drained'] = round($d['drained'], 1);
        }
        unset($d);

        $assets = array_values($byAsset);
        usort($assets, static fn($a, $b) => ($b['filled'] + $b['consumed']) <=> ($a['filled'] + $a['consumed']));
        foreach ($assets as &$a) {
            $a['filled'] = round($a['filled'], 1);
            $a['consumed'] = round($a['consumed'], 1);
            $a['drained'] = round($a['drained'], 1);
        }
        unset($a);

        $live = WialonFleet::tryLiveSnapshot($tenantId);
        $liveLevels = [];
        foreach ($live['units'] ?? [] as $u) {
            $liveLevels[] = [
                'unitId' => $u['wialonId'] ?? $u['id'] ?? null,
                'name' => $u['name'] ?? null,
                'fuelPercent' => $u['fuelLevel'] ?? null,
                'fuelLiters' => WialonFleet::extractFuelLiters($u),
                'assetType' => WialonFleet::classifyAsset($u),
            ];
        }

        $anomalies = array_values(array_filter($ledger, static function (array $e): bool {
            return ($e['section'] ?? '') === 'theft' || ($e['drained'] ?? 0) > 20;
        }));

        return [
            'from' => $fromDate,
            'to' => $toDate,
            'fromTs' => $fromTs,
            'toTs' => $toTs,
            'source' => 'mysql_ledger',
            'kpis' => [
                'totalFilled' => round($totalFilled, 1),
                'totalConsumed' => round($totalConsumed, 1),
                'totalDrained' => round($totalDrained, 1),
                'transactionCount' => count($rows),
                'assetCount' => count($assets),
                'netBalance' => round($totalFilled - $totalConsumed - $totalDrained, 1),
            ],
            'timeSeries' => $timeSeries,
            'byAsset' => array_slice($assets, 0, 80),
            'sectionBreakdown' => [
                'filling' => round($sectionBreakdown['filling'], 1),
                'consumption' => round($sectionBreakdown['consumption'], 1),
                'theft' => round($sectionBreakdown['theft'], 1),
                'other' => round($sectionBreakdown['other'], 1),
            ],
            'anomalies' => array_slice($anomalies, 0, 40),
            'ledger' => $ledger,
            'ledgerPreview' => array_slice($ledger, 0, 40),
            'dailySummaries' => $timeSeries,
            'liveLevels' => $liveLevels,
            'isWarming' => false,
            'fetchedAt' => gmdate('c'),
        ];
    }
}
