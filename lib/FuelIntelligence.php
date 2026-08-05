<?php
/**
 * DB-backed fuel intelligence — same response shape as React WialonFuelIntelligenceService.
 */
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/WialonFleet.php';

final class FuelIntelligence
{
    /**
     * @return array<string, mixed>
     */
    public static function fromDb(string $tenantId, int $fromTs, int $toTs, ?int $unitId = null): array
    {
        $params = [$tenantId, $fromTs, $toTs];
        $sql = 'SELECT unit_id, unit_name, section, filled, fuel_used,
                       COALESCE(sudden_fuel_drop, 0) AS sudden_fuel_drop,
                       mileage, timestamp, COALESCE(asset_category, \'\') AS asset_category,
                       initial_level, final_level
                FROM fuel_transactions
                WHERE tenant_id = ?
                  AND timestamp >= ? AND timestamp <= ?
                  AND COALESCE(sensor, \'\') NOT LIKE \'wialon_group_summary%\'
                  AND COALESCE(sensor, \'\') <> \'balance\'';
        if ($unitId !== null && $unitId > 0) {
            $sql .= ' AND unit_id = ?';
            $params[] = (string) $unitId;
        }
        $sql .= ' ORDER BY timestamp ASC';

        try {
            $rows = Database::query($sql, $params);
        } catch (Throwable $e) {
            error_log('FuelIntelligence::fromDb: ' . $e->getMessage());
            $rows = [];
        }

        $assetsMap = [];
        $dailyMap = [];
        $totals = ['consumed' => 0.0, 'filled' => 0.0, 'theft' => 0.0, 'mileage' => 0.0, 'events' => 0];

        foreach ($rows as $row) {
            $uid = (int) ($row['unit_id'] ?? 0);
            if ($uid <= 0) {
                continue;
            }
            $section = (string) ($row['section'] ?? '');
            $filled = self::effectiveFilled($section, (float) ($row['filled'] ?? 0), (float) ($row['initial_level'] ?? 0), (float) ($row['final_level'] ?? 0));
            $consumed = self::effectiveConsumed($section, (float) ($row['fuel_used'] ?? 0), (float) ($row['initial_level'] ?? 0), (float) ($row['final_level'] ?? 0));
            $theft = self::effectiveTheft($section, (float) ($row['sudden_fuel_drop'] ?? 0), (float) ($row['initial_level'] ?? 0), (float) ($row['final_level'] ?? 0));
            $mileage = $section === 'consumption' ? (float) ($row['mileage'] ?? 0) : 0.0;
            $cat = (string) ($row['asset_category'] ?? '');
            if ($cat === '' || !in_array($cat, ['vehicle', 'generator', 'machinery'], true)) {
                $cat = WialonFleet::classifyAsset(['name' => (string) ($row['unit_name'] ?? '')]);
            }

            if (!isset($assetsMap[$uid])) {
                $assetsMap[$uid] = [
                    'unitId' => $uid,
                    'unitName' => (string) ($row['unit_name'] ?? ('Unit ' . $uid)),
                    'assetCategory' => $cat,
                    'consumed' => 0.0,
                    'filled' => 0.0,
                    'theft' => 0.0,
                    'mileage' => 0.0,
                    'runtimeHours' => 0.0,
                    'avgConsumption' => 0.0,
                    'efficiencyScore' => 0.0,
                    'events' => 0,
                ];
            }
            $assetsMap[$uid]['consumed'] += $consumed;
            $assetsMap[$uid]['filled'] += $filled;
            $assetsMap[$uid]['theft'] += $theft;
            $assetsMap[$uid]['mileage'] += $mileage;
            $assetsMap[$uid]['events']++;

            $day = gmdate('Y-m-d', (int) ($row['timestamp'] ?? 0));
            if (!isset($dailyMap[$day])) {
                $dailyMap[$day] = ['date' => $day, 'consumed' => 0.0, 'filled' => 0.0, 'theft' => 0.0, 'mileage' => 0.0, 'runtimeHours' => 0.0];
            }
            $dailyMap[$day]['consumed'] += $consumed;
            $dailyMap[$day]['filled'] += $filled;
            $dailyMap[$day]['theft'] += $theft;
            $dailyMap[$day]['mileage'] += $mileage;

            $totals['consumed'] += $consumed;
            $totals['filled'] += $filled;
            $totals['theft'] += $theft;
            $totals['mileage'] += $mileage;
            $totals['events']++;
        }

        $assets = [];
        foreach ($assetsMap as $row) {
            $row['consumed'] = round($row['consumed'], 2);
            $row['filled'] = round($row['filled'], 2);
            $row['theft'] = round($row['theft'], 2);
            $row['mileage'] = round($row['mileage'], 2);
            $row['avgConsumption'] = $row['mileage'] > 0
                ? round(($row['consumed'] / $row['mileage']) * 100, 2)
                : 0.0;
            $row['efficiencyScore'] = self::efficiencyScore($row['avgConsumption'], $row['theft'], $row['consumed']);
            $assets[] = $row;
        }
        usort($assets, static fn(array $a, array $b): int => $b['consumed'] <=> $a['consumed']);

        $groups = self::buildGroups($assets);
        ksort($dailyMap);
        $daily = array_values(array_map(static function (array $d): array {
            $d['consumed'] = round($d['consumed'], 2);
            $d['filled'] = round($d['filled'], 2);
            $d['theft'] = round($d['theft'], 2);
            $d['mileage'] = round($d['mileage'], 2);
            return $d;
        }, $dailyMap));

        $unitDetail = null;
        if ($unitId !== null && $unitId > 0 && isset($assetsMap[$unitId])) {
            $unitDetail = $assetsMap[$unitId];
        }

        return [
            'from' => gmdate('Y-m-d', $fromTs),
            'to' => gmdate('Y-m-d', $toTs),
            'totals' => [
                'consumed' => round($totals['consumed'], 2),
                'filled' => round($totals['filled'], 2),
                'theft' => round($totals['theft'], 2),
                'mileage' => round($totals['mileage'], 2),
                'events' => $totals['events'],
                'avgConsumption' => $totals['mileage'] > 0
                    ? round(($totals['consumed'] / $totals['mileage']) * 100, 2)
                    : 0.0,
                'assets' => count($assets),
            ],
            'groups' => $groups,
            'assets' => $assets,
            'daily' => $daily,
            'unitDetail' => $unitDetail,
            'source' => 'db',
            'fetchedAt' => gmdate('c'),
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public static function eventsFromDb(string $tenantId, int $limit = 50): array
    {
        $limit = max(1, min(200, $limit));
        try {
            $rows = Database::query(
                'SELECT unit_id, unit_name, section, filled, fuel_used,
                        COALESCE(sudden_fuel_drop, 0) AS sudden_fuel_drop,
                        timestamp, location, time_str
                 FROM fuel_transactions
                 WHERE tenant_id = ?
                   AND section IN (\'filling\', \'theft\')
                   AND COALESCE(sensor, \'\') NOT LIKE \'wialon_group_summary%\'
                 ORDER BY timestamp DESC
                 LIMIT ' . $limit,
                [$tenantId]
            );
        } catch (Throwable $e) {
            return [];
        }
        $out = [];
        foreach ($rows as $row) {
            $section = (string) ($row['section'] ?? '');
            $volume = $section === 'filling'
                ? (float) ($row['filled'] ?? 0)
                : (float) ($row['sudden_fuel_drop'] ?? $row['fuel_used'] ?? 0);
            $out[] = [
                'unitId' => (int) ($row['unit_id'] ?? 0),
                'unitName' => (string) ($row['unit_name'] ?? ''),
                'type' => $section === 'filling' ? 'fill' : 'theft',
                'section' => $section,
                'volume' => round($volume, 2),
                'timestamp' => (int) ($row['timestamp'] ?? 0),
                'timeStr' => (string) ($row['time_str'] ?? ''),
                'location' => $row['location'] ?? null,
            ];
        }
        return $out;
    }

    private static function effectiveFilled(string $section, float $filled, float $initial, float $final): float
    {
        if ($section !== 'filling') {
            return 0.0;
        }
        if ($filled > 0) {
            return $filled;
        }
        if ($initial > 0 && $final > $initial) {
            return $final - $initial;
        }
        return $filled;
    }

    private static function effectiveConsumed(string $section, float $used, float $initial, float $final): float
    {
        if ($section !== 'consumption') {
            return 0.0;
        }
        if ($used > 0) {
            return $used;
        }
        if ($initial > 0 && $final >= 0 && $initial > $final) {
            return $initial - $final;
        }
        return $used;
    }

    private static function effectiveTheft(string $section, float $drop, float $initial, float $final): float
    {
        if ($section !== 'theft') {
            return 0.0;
        }
        if ($drop > 0) {
            return $drop;
        }
        if ($initial > 0 && $final >= 0 && $initial > $final) {
            return $initial - $final;
        }
        return $drop;
    }

    private static function efficiencyScore(float $avgL100, float $theft, float $consumed): float
    {
        $score = 100.0;
        if ($avgL100 > 40) {
            $score -= min(40, ($avgL100 - 40) * 0.8);
        }
        if ($consumed > 0 && $theft > 0) {
            $score -= min(40, ($theft / $consumed) * 100);
        }
        return round(max(0, min(100, $score)), 1);
    }

    /**
     * @param array<int, array<string, mixed>> $assets
     * @return array<int, array<string, mixed>>
     */
    private static function buildGroups(array $assets): array
    {
        $keys = ['all', 'vehicle', 'generator', 'machinery'];
        $labels = [
            'all' => 'All Assets',
            'vehicle' => 'Vehicles',
            'generator' => 'Generators',
            'machinery' => 'Machinery',
        ];
        $groups = [];
        foreach ($keys as $key) {
            $subset = $key === 'all'
                ? $assets
                : array_values(array_filter($assets, static fn(array $a): bool => ($a['assetCategory'] ?? '') === $key));
            $consumed = 0.0;
            $filled = 0.0;
            $theft = 0.0;
            $mileage = 0.0;
            foreach ($subset as $a) {
                $consumed += (float) $a['consumed'];
                $filled += (float) $a['filled'];
                $theft += (float) $a['theft'];
                $mileage += (float) $a['mileage'];
            }
            $groups[] = [
                'key' => $key,
                'label' => $labels[$key],
                'consumed' => round($consumed, 2),
                'filled' => round($filled, 2),
                'theft' => round($theft, 2),
                'mileage' => round($mileage, 2),
                'runtimeHours' => 0.0,
                'avgConsumption' => $mileage > 0 ? round(($consumed / $mileage) * 100, 2) : 0.0,
                'assets' => count($subset),
            ];
        }
        return $groups;
    }
}
