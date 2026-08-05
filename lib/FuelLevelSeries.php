<?php
/**
 * Continuous fuel-level series from Wialon unit messages (level-series parity).
 */
require_once __DIR__ . '/WialonClient.php';
require_once __DIR__ . '/TenantWialon.php';

final class FuelLevelSeries
{
    private const BATCH = 500;
    private const MAX_MESSAGES = 15000;

    /**
     * @return array<string, mixed>
     */
    public static function getSeries(string $tenantId, int $unitId, int $from, int $to): array
    {
        if ($unitId <= 0 || $from >= $to) {
            throw new InvalidArgumentException('Valid unitId and from/to required');
        }

        $creds = TenantWialon::loadCreds($tenantId);
        $client = new WialonClient($creds['baseUrl']);
        try {
            $client->login($creds['token'], $creds['operateAs']);
            $detail = $client->call('core/search_item', [
                'id' => $unitId,
                'flags' => 4097, // base + sensors
            ]);
            $item = is_array($detail['item'] ?? null) ? $detail['item'] : null;
            if (!$item) {
                throw new RuntimeException('Unit not found');
            }
            $unitName = (string) ($item['nm'] ?? ('Unit ' . $unitId));
            $sensors = self::fuelSensorsFromItem($item);

            $fillThreshold = 5.0;
            $drainThreshold = 5.0;
            try {
                $settings = $client->call('unit/get_fuel_settings', ['itemId' => $unitId]);
                $fillings = is_array($settings['fillings'] ?? null) ? $settings['fillings'] : [];
                $thefts = is_array($settings['thefts'] ?? null) ? $settings['thefts'] : [];
                if (isset($fillings['minFillingsVolume']) && is_numeric($fillings['minFillingsVolume'])) {
                    $fillThreshold = max(1.0, (float) $fillings['minFillingsVolume']);
                }
                if (isset($thefts['minTheftVolume']) && is_numeric($thefts['minTheftVolume'])) {
                    $drainThreshold = max(1.0, (float) $thefts['minTheftVolume']);
                }
            } catch (Throwable $e) {
            }

            $messages = self::loadMessages($client, $unitId, $from, $to);
            $points = self::buildSeries($messages, $sensors, $fillThreshold, $drainThreshold);
            $fillCount = 0;
            $drainCount = 0;
            foreach ($points as $p) {
                if (($p['event'] ?? '') === 'refill') {
                    $fillCount++;
                } elseif (($p['event'] ?? '') === 'drain') {
                    $drainCount++;
                }
            }

            // Downsample for UI if huge
            $sample = $points;
            if (count($sample) > 2000) {
                $step = (int) ceil(count($sample) / 2000);
                $sample = [];
                foreach ($points as $i => $p) {
                    if ($i % $step === 0 || ($p['event'] ?? 'level') !== 'level') {
                        $sample[] = $p;
                    }
                }
            }

            return [
                'unitId' => $unitId,
                'unitName' => $unitName,
                'from' => $from,
                'to' => $to,
                'pointCount' => count($points),
                'fillCount' => $fillCount,
                'drainCount' => $drainCount,
                'points' => $sample,
                'fetchedAt' => gmdate('c'),
            ];
        } finally {
            $client->logout();
        }
    }

    /**
     * @param array<string, mixed> $item
     * @return array<int, array{id:int,name:string,param:string,tank:string,tbl:array}>
     */
    private static function fuelSensorsFromItem(array $item): array
    {
        $sens = is_array($item['sens'] ?? null) ? $item['sens'] : [];
        $defs = [];
        foreach ($sens as $id => $sensor) {
            if (!is_array($sensor) || empty($sensor['n']) || empty($sensor['p'])) {
                continue;
            }
            $name = (string) $sensor['n'];
            $type = (string) ($sensor['t'] ?? '');
            if (!self::isFuelLevelSensor($name, $type)) {
                continue;
            }
            $tank = 'main';
            if (preg_match('/reserve|secondary|aux|backup|tank\s*2|tank\s*b\b/i', $name)) {
                $tank = 'reserve';
            } elseif (preg_match('/\bmain\b|primary|tank\s*1|tank\s*a\b/i', $name)) {
                $tank = 'main';
            } elseif ($defs) {
                $hasMain = false;
                foreach ($defs as $d) {
                    if ($d['tank'] === 'main') {
                        $hasMain = true;
                        break;
                    }
                }
                $tank = $hasMain ? 'reserve' : 'main';
            }
            $defs[] = [
                'id' => (int) $id,
                'name' => $name,
                'param' => (string) $sensor['p'],
                'tank' => $tank,
                'tbl' => self::parseTbl($sensor['tbl'] ?? null),
            ];
        }
        if (count($defs) === 1) {
            $defs[0]['tank'] = 'main';
        }
        return $defs;
    }

    private static function isFuelLevelSensor(string $name, string $type): bool
    {
        $hay = strtolower($name . ' ' . $type);
        foreach (['fuel level', 'fuel', 'fls', 'lls', 'tank'] as $p) {
            if (str_contains($hay, $p)) {
                return true;
            }
        }
        return false;
    }

    /**
     * @return array<int, array{x:float,a:float,b:float}>
     */
    private static function parseTbl(mixed $tbl): array
    {
        if (!is_array($tbl)) {
            return [];
        }
        $out = [];
        foreach ($tbl as $row) {
            if (!is_array($row) || !isset($row['x'], $row['a'], $row['b'])) {
                continue;
            }
            $out[] = [
                'x' => (float) $row['x'],
                'a' => (float) $row['a'],
                'b' => (float) $row['b'],
            ];
        }
        usort($out, static fn(array $a, array $b): int => $a['x'] <=> $b['x']);
        return $out;
    }

    /**
     * @param array<int, array{x:float,a:float,b:float}> $tbl
     */
    private static function calculateSensorValue(float $raw, array $tbl): float
    {
        if (!$tbl) {
            return $raw;
        }
        if ($raw <= $tbl[0]['x']) {
            return $tbl[0]['a'] * $raw + $tbl[0]['b'];
        }
        $last = $tbl[count($tbl) - 1];
        if ($raw >= $last['x']) {
            return $last['a'] * $raw + $last['b'];
        }
        for ($i = 0; $i < count($tbl) - 1; $i++) {
            if ($raw >= $tbl[$i]['x'] && $raw < $tbl[$i + 1]['x']) {
                return $tbl[$i]['a'] * $raw + $tbl[$i]['b'];
            }
        }
        return $raw;
    }

    /**
     * @return array<int, array{t:int,p:?array}>
     */
    private static function loadMessages(WialonClient $client, int $unitId, int $from, int $to): array
    {
        try {
            $load = $client->call('messages/load_interval', [
                'itemId' => $unitId,
                'timeFrom' => $from,
                'timeTo' => $to,
                'flags' => 1,
                'flagsMask' => 65281,
                'loadCount' => self::BATCH,
            ]);
            $total = min((int) ($load['count'] ?? 0), self::MAX_MESSAGES);
            if ($total <= 0) {
                try {
                    $client->call('messages/unload', []);
                } catch (Throwable $e) {
                }
                return [];
            }
            $out = [];
            $indexFrom = 0;
            while ($indexFrom < $total) {
                $indexTo = min($indexFrom + self::BATCH - 1, $total - 1);
                $batch = $client->call('messages/get_messages', [
                    'indexFrom' => $indexFrom,
                    'indexTo' => $indexTo,
                ]);
                foreach ($batch['messages'] ?? [] as $msg) {
                    if (!is_array($msg) || !isset($msg['t'])) {
                        continue;
                    }
                    $out[] = [
                        't' => (int) $msg['t'],
                        'p' => is_array($msg['p'] ?? null) ? $msg['p'] : null,
                    ];
                }
                $indexFrom = $indexTo + 1;
            }
            try {
                $client->call('messages/unload', []);
            } catch (Throwable $e) {
            }
            usort($out, static fn(array $a, array $b): int => $a['t'] <=> $b['t']);
            return $out;
        } catch (Throwable $e) {
            try {
                $client->call('messages/unload', []);
            } catch (Throwable $e2) {
            }
            if (stripos($e->getMessage(), '1001') !== false || stripos($e->getMessage(), 'No messages') !== false) {
                return [];
            }
            throw $e;
        }
    }

    /**
     * @param array<int, array{t:int,p:?array}> $messages
     * @param array<int, array{id:int,name:string,param:string,tank:string,tbl:array}> $sensors
     * @return array<int, array<string, mixed>>
     */
    private static function buildSeries(array $messages, array $sensors, float $fillThreshold, float $drainThreshold): array
    {
        $draft = [];
        foreach ($messages as $msg) {
            $liters = self::litersFromParams($msg['p'] ?? null, $sensors);
            if ($liters === null) {
                continue;
            }
            $draft[] = ['t' => $msg['t'], 'liters' => $liters];
        }
        if (!$draft) {
            return [];
        }

        $values = array_column($draft, 'liters');
        $win = min(21, max(3, (int) (count($draft) / 100) | 1));
        if ($win % 2 === 0) {
            $win++;
        }
        $processed = self::medianFilter($values, $win);

        $out = [];
        $prev = null;
        foreach ($draft as $i => $d) {
            $proc = $processed[$i];
            $delta = $prev === null ? 0.0 : ($proc - $prev);
            $event = 'level';
            if ($prev !== null) {
                if ($delta >= $fillThreshold) {
                    $event = 'refill';
                } elseif ($delta <= -$drainThreshold) {
                    $event = 'drain';
                }
            }
            $out[] = [
                't' => $d['t'],
                'liters' => round($d['liters'], 1),
                'processed' => round($proc, 2),
                'event' => $event,
                'delta' => round($delta, 1),
            ];
            $prev = $proc;
        }
        return $out;
    }

    /**
     * @param array<string, mixed>|null $params
     * @param array<int, array{id:int,name:string,param:string,tank:string,tbl:array}> $sensors
     */
    private static function litersFromParams(?array $params, array $sensors): ?float
    {
        if (!$params) {
            return null;
        }
        $main = null;
        $reserve = null;
        foreach ($sensors as $s) {
            if (!isset($params[$s['param']])) {
                continue;
            }
            $raw = $params[$s['param']];
            $n = is_numeric($raw) ? (float) $raw : (float) preg_replace('/[^\d.-]/', '', (string) $raw);
            if (!is_finite($n)) {
                continue;
            }
            $liters = round(self::calculateSensorValue($n, $s['tbl']) * 10) / 10;
            if (!($liters > 0 && $liters < 50000)) {
                continue;
            }
            if ($s['tank'] === 'reserve') {
                $reserve = $liters;
            } else {
                $main = $liters;
            }
        }
        if ($main !== null || $reserve !== null) {
            return round((($main ?? 0) + ($reserve ?? 0)) * 10) / 10;
        }

        foreach (['fuel', 'fuel_level', 'fuel1', 'lls', 'lls1', 'can_fuel', 'tank'] as $key) {
            if (!isset($params[$key])) {
                continue;
            }
            $raw = $params[$key];
            $n = is_numeric($raw) ? (float) $raw : (float) preg_replace('/[^\d.-]/', '', (string) $raw);
            if (is_finite($n) && $n > 0 && $n < 50000) {
                return round($n * 10) / 10;
            }
        }
        foreach ($params as $key => $val) {
            if (!preg_match('/fuel|lls|tank/i', (string) $key)) {
                continue;
            }
            $n = is_numeric($val) ? (float) $val : (float) preg_replace('/[^\d.-]/', '', (string) $val);
            if (is_finite($n) && $n > 0 && $n < 50000) {
                return round($n * 10) / 10;
            }
        }
        return null;
    }

    /**
     * @param array<int, float> $values
     * @return array<int, float>
     */
    private static function medianFilter(array $values, int $window): array
    {
        if ($window < 3 || count($values) < 3) {
            return $values;
        }
        $half = (int) floor($window / 2);
        $out = [];
        $n = count($values);
        for ($i = 0; $i < $n; $i++) {
            $from = max(0, $i - $half);
            $to = min($n, $i + $half + 1);
            $slice = array_slice($values, $from, $to - $from);
            sort($slice);
            $out[] = $slice[(int) floor(count($slice) / 2)];
        }
        return $out;
    }
}
