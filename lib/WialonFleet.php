<?php
/**
 * Live Wialon fleet snapshot — parity with WialonFleetService + unit mapper (simplified).
 */
require_once __DIR__ . '/WialonClient.php';
require_once __DIR__ . '/TenantWialon.php';

final class WialonFleet
{
    /** Fleet list flags: base + props + fields + image + advanced + last msg + sensors + counters + trip/fuel + msg params + connection */
    public const UNIT_FLAGS = 0x32351B;

    private const CACHE_TTL_SEC = 8;
    private const OFFLINE_SEC = 600;
    private const MIN_MOVING_SPEED = 5;

    /** @var array<string, array{data:array,expires:int}> */
    private static array $memory = [];

    /**
     * @return array<string, mixed>|null live snapshot or null if not available
     */
    public static function tryLiveSnapshot(string $tenantId): ?array
    {
        $row = TenantWialon::getRow($tenantId);
        if (!TenantWialon::isConnected($row)) {
            return null;
        }
        try {
            return self::getCachedLiveFleet($tenantId);
        } catch (Throwable $e) {
            error_log('WialonFleet tryLiveSnapshot: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * @return array<string, mixed>
     */
    public static function getCachedLiveFleet(string $tenantId, int $limit = 10000): array
    {
        $now = time();
        $mem = self::$memory[$tenantId] ?? null;
        if ($mem && $mem['expires'] > $now) {
            return $mem['data'];
        }

        $cacheFile = sys_get_temp_dir() . '/mams_fleet_' . md5($tenantId) . '.json';
        if (is_file($cacheFile) && (filemtime($cacheFile) + self::CACHE_TTL_SEC) > $now) {
            $raw = @file_get_contents($cacheFile);
            $decoded = is_string($raw) ? json_decode($raw, true) : null;
            if (is_array($decoded)) {
                self::$memory[$tenantId] = ['data' => $decoded, 'expires' => $now + self::CACHE_TTL_SEC];
                return $decoded;
            }
        }

        $data = self::fetchLiveFleet($tenantId, $limit);
        self::$memory[$tenantId] = ['data' => $data, 'expires' => time() + self::CACHE_TTL_SEC];
        @file_put_contents($cacheFile, json_encode($data));
        return $data;
    }

    /**
     * @return array<string, mixed>
     */
    private static function fetchLiveFleet(string $tenantId, int $limit): array
    {
        $row = TenantWialon::getRow($tenantId);
        if (!$row || empty($row['wialon_resource_id'])) {
            throw new RuntimeException('No Wialon account linked for this tenant');
        }

        $creds = TenantWialon::loadCreds($tenantId);
        $accountId = (string) ((int) $row['wialon_resource_id']);
        if (!empty($creds['accountId'])) {
            $accountId = (string) $creds['accountId'];
        }

        $client = new WialonClient($creds['baseUrl']);
        try {
            $client->login($creds['token'], $creds['operateAs']);
            $items = self::searchUnits($client, $accountId);
            $items = array_slice($items, 0, $limit);

            $units = [];
            foreach ($items as $item) {
                if (!self::isActiveUnit($item)) {
                    continue;
                }
                $units[] = self::mapUnit($item);
            }

            $byHw = [];
            $byStatus = ['moving' => 0, 'idle' => 0, 'stopped' => 0, 'offline' => 0];
            $withPos = 0;
            foreach ($units as $u) {
                $st = (string) ($u['status'] ?? 'offline');
                if (isset($byStatus[$st])) {
                    $byStatus[$st]++;
                } else {
                    $byStatus['offline']++;
                }
                if (!empty($u['position'])) {
                    $withPos++;
                }
                $hw = (string) ($u['hwName'] ?? 'Unknown');
                $byHw[$hw] = ($byHw[$hw] ?? 0) + 1;
            }

            return [
                'live' => true,
                'stale' => false,
                'fetchedAt' => gmdate('c'),
                'accountId' => (int) $accountId,
                'accountName' => $row['wialon_account_name'] ?? null,
                'units' => $units,
                'counts' => [
                    'total' => count($units),
                    'moving' => $byStatus['moving'],
                    'idle' => $byStatus['idle'],
                    'stopped' => $byStatus['stopped'],
                    'offline' => $byStatus['offline'],
                    'withPosition' => $withPos,
                    'byHwName' => $byHw,
                    'byKind' => ['tracker' => count($units)],
                ],
                'assetCount' => count($units),
            ];
        } finally {
            $client->logout();
        }
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private static function searchUnits(WialonClient $client, string $accountId): array
    {
        $specs = [
            [
                'itemsType' => 'avl_unit',
                'propName' => 'sys_billing_account_guid',
                'propValueMask' => $accountId,
                'sortType' => 'sys_name',
                'propType' => 'property',
            ],
            [
                'itemsType' => 'avl_unit',
                'propName' => 'sys_billing_account_guid',
                'propValueMask' => '*' . $accountId . '*',
                'sortType' => 'sys_name',
                'propType' => 'property',
            ],
        ];

        foreach ($specs as $spec) {
            try {
                $items = self::searchAll($client, $spec, self::UNIT_FLAGS);
                if ($items) {
                    return $items;
                }
            } catch (Throwable $e) {
                // try next
            }
        }

        // Fallback: all units filtered by bact
        $all = self::searchAll($client, [
            'itemsType' => 'avl_unit',
            'propName' => 'sys_name',
            'propValueMask' => '*',
            'sortType' => 'sys_name',
        ], self::UNIT_FLAGS);
        $aid = (int) $accountId;
        return array_values(array_filter(
            $all,
            static fn(array $u): bool => ((int) ($u['bact'] ?? 0)) === $aid
        ));
    }

    /**
     * @param array<string, mixed> $spec
     * @return array<int, array<string, mixed>>
     */
    private static function searchAll(WialonClient $client, array $spec, int $flags): array
    {
        $page = 500;
        $from = 0;
        $all = [];
        $total = null;
        do {
            $data = $client->call('core/search_items', [
                'spec' => $spec,
                'force' => 1,
                'flags' => $flags,
                'from' => $from,
                'to' => $from + $page - 1,
            ]);
            $items = is_array($data['items'] ?? null) ? $data['items'] : [];
            foreach ($items as $item) {
                if (is_array($item)) {
                    $all[] = $item;
                }
            }
            $total = isset($data['totalItemsCount']) ? (int) $data['totalItemsCount'] : count($all);
            $from += $page;
            if (!$items) {
                break;
            }
        } while (count($all) < $total && $from < 20000);

        return $all;
    }

    /** @param array<string, mixed> $item */
    private static function isActiveUnit(array $item): bool
    {
        if (isset($item['act']) && (int) $item['act'] === 0) {
            return false;
        }
        if (!empty($item['dactt']) && (int) $item['dactt'] > 0) {
            $deact = (int) $item['dactt'];
            if ($deact > 0 && $deact < time()) {
                return false;
            }
        }
        return true;
    }

    /**
     * @param array<string, mixed> $item
     * @return array<string, mixed>
     */
    private static function mapUnit(array $item): array
    {
        $prp = is_array($item['prp'] ?? null) ? $item['prp'] : [];
        $plate = (string) ($prp['registration_plate'] ?? $prp['plate'] ?? '');
        if ($plate === '') {
            $plate = self::extractPlate((string) ($item['nm'] ?? ''));
        }

        $prms = self::mapPrms($item);
        $lmsg = self::mapLmsg($item);
        $sens = self::mapSens($item);
        $flds = self::mapFlds($item);
        $statusInfo = self::deriveStatus($item);
        $fuelLevel = self::extractFuelPercent($prp, $prms, $lmsg['params'] ?? null);

        $pos = is_array($item['pos'] ?? null) ? $item['pos'] : null;
        $position = null;
        if ($pos && isset($pos['y'], $pos['x'])) {
            $position = [
                'lat' => (float) $pos['y'],
                'lng' => (float) $pos['x'],
                'speed' => (float) ($pos['s'] ?? 0),
                'time' => (int) ($pos['t'] ?? time()),
                'course' => isset($pos['c']) ? (float) $pos['c'] : null,
            ];
        }

        $id = (int) ($item['id'] ?? 0);
        $mileage = isset($item['cnm']) ? (float) $item['cnm'] : null;
        $engineHours = isset($item['cneh']) ? (float) $item['cneh'] : null;

        return [
            'id' => (string) $id,
            'wialonId' => $id,
            'name' => (string) ($item['nm'] ?? ('Unit ' . $id)),
            'plate' => $plate !== '' ? $plate : null,
            'hw' => isset($item['hw']) ? (int) $item['hw'] : null,
            'hwName' => $prp['hw_type'] ?? 'Unknown',
            'uid' => $item['uid'] ?? ($prp['uid'] ?? null),
            'ph' => $item['ph'] ?? ($prp['phone'] ?? null),
            'netconn' => isset($item['netconn']) ? (bool) $item['netconn'] : null,
            'motionState' => $statusInfo['motionState'] ?? null,
            'status' => $statusInfo['status'],
            'kind' => 'tracker',
            'modules' => [],
            'hardware' => $prp['hw_type'] ?? null,
            'fuelLevel' => $fuelLevel,
            'prp' => $prp,
            'flds' => $flds,
            'sens' => $sens,
            'prms' => $prms,
            'position' => $position,
            'lmsg' => $lmsg,
            'mileage' => $mileage,
            'engineHours' => $engineHours,
            'iconUgi' => isset($item['ugi']) ? (int) $item['ugi'] : 1,
            'iconUri' => $item['uri'] ?? null,
        ];
    }

    /** @param array<string, mixed> $item */
    private static function mapPrms(array $item): array
    {
        if (!is_array($item['prms'] ?? null)) {
            return [];
        }
        $out = [];
        foreach ($item['prms'] as $key => $p) {
            if (!is_array($p)) {
                continue;
            }
            $out[] = [
                'key' => (string) $key,
                'value' => (string) ($p['v'] ?? ''),
                'calcTime' => $p['ct'] ?? null,
                'actualTime' => $p['at'] ?? null,
            ];
        }
        return $out;
    }

    /** @param array<string, mixed> $item @return array{time?:int,params?:array<string,mixed>}|null */
    private static function mapLmsg(array $item): ?array
    {
        if (!is_array($item['lmsg'] ?? null)) {
            return null;
        }
        $lmsg = $item['lmsg'];
        $params = [];
        if (is_array($lmsg['p'] ?? null)) {
            foreach ($lmsg['p'] as $k => $v) {
                if (is_bool($v)) {
                    $params[(string) $k] = $v ? 1 : 0;
                } elseif (is_scalar($v)) {
                    $params[(string) $k] = $v;
                }
            }
        }
        return [
            'time' => isset($lmsg['t']) ? (int) $lmsg['t'] : null,
            'params' => $params ?: null,
        ];
    }

    /** @param array<string, mixed> $item */
    private static function mapSens(array $item): array
    {
        if (!is_array($item['sens'] ?? null)) {
            return [];
        }
        $out = [];
        foreach ($item['sens'] as $id => $s) {
            if (!is_array($s) || empty($s['n'])) {
                continue;
            }
            $out[] = [
                'id' => (int) $id,
                'name' => (string) $s['n'],
                'type' => (string) ($s['t'] ?? ''),
                'param' => $s['p'] ?? null,
                'unit' => $s['u'] ?? null,
            ];
        }
        return $out;
    }

    /** @param array<string, mixed> $item */
    private static function mapFlds(array $item): array
    {
        if (!is_array($item['flds'] ?? null)) {
            return [];
        }
        $out = [];
        foreach ($item['flds'] as $f) {
            if (!is_array($f) || empty($f['n'])) {
                continue;
            }
            $out[] = [
                'id' => (int) ($f['id'] ?? 0),
                'name' => (string) $f['n'],
                'value' => (string) ($f['v'] ?? ''),
            ];
        }
        return $out;
    }

    /**
     * @param array<string, mixed> $item
     * @return array{status:string,motionState:?string}
     */
    private static function deriveStatus(array $item): array
    {
        $motionState = null;
        if (isset($item['netconn']) && $item['netconn'] === false) {
            return ['status' => 'offline', 'motionState' => $motionState];
        }

        $now = time();
        $t = isset($item['lmsg']['t']) ? (int) $item['lmsg']['t'] : (isset($item['pos']['t']) ? (int) $item['pos']['t'] : null);
        if ($t === null || ($now - $t) > self::OFFLINE_SEC) {
            return ['status' => 'offline', 'motionState' => $motionState];
        }

        $speed = isset($item['pos']['s']) ? (float) $item['pos']['s'] : 0.0;
        $minSpeed = self::MIN_MOVING_SPEED;
        if (isset($item['rtd']['minMovingSpeed'])) {
            $minSpeed = (float) $item['rtd']['minMovingSpeed'];
        }
        if ($speed > $minSpeed) {
            return ['status' => 'moving', 'motionState' => $motionState];
        }

        $ign = self::ignitionFromItem($item);
        if ($ign === true) {
            return ['status' => 'idle', 'motionState' => $motionState];
        }
        if ($ign === false) {
            return ['status' => 'stopped', 'motionState' => $motionState];
        }
        return ['status' => 'stopped', 'motionState' => $motionState];
    }

    /** @param array<string, mixed> $item */
    private static function ignitionFromItem(array $item): ?bool
    {
        $lmsg = is_array($item['lmsg']['p'] ?? null) ? $item['lmsg']['p'] : [];
        foreach (['ignition', 'ign', 'engine_status', 'acc', 'io_1', 'din1'] as $key) {
            if (array_key_exists($key, $lmsg)) {
                $val = $lmsg[$key];
                return $val === 1 || $val === '1' || $val === true;
            }
        }
        if (is_array($item['prms'] ?? null)) {
            foreach (['ignition', 'ign', 'engine_status', 'acc'] as $key) {
                if (isset($item['prms'][$key]['v'])) {
                    $val = $item['prms'][$key]['v'];
                    return $val === 1 || $val === '1' || $val === true;
                }
            }
        }
        return null;
    }

    /**
     * @param array<string, string> $prp
     * @param array<int, array<string, mixed>> $prms
     * @param array<string, mixed>|null $lmsgParams
     */
    private static function extractFuelPercent(array $prp, array $prms, ?array $lmsgParams): ?float
    {
        $prmMap = [];
        foreach ($prms as $p) {
            $prmMap[(string) ($p['key'] ?? '')] = $p['value'] ?? '';
        }
        foreach (['fuel_percent', 'fuel_level_percent', 'fuel_pct', 'fuel%'] as $key) {
            $raw = $prp[$key] ?? ($prmMap[$key] ?? ($lmsgParams[$key] ?? null));
            $n = self::parseNumeric($raw);
            if ($n !== null && $n >= 0 && $n <= 100) {
                return (float) round($n);
            }
        }
        foreach (['fuel_level', 'can_fuel'] as $key) {
            $raw = $prp[$key] ?? ($prmMap[$key] ?? ($lmsgParams[$key] ?? null));
            $n = self::parseNumeric($raw);
            if ($n !== null && $n >= 0 && $n <= 100) {
                return (float) round($n);
            }
        }
        return null;
    }

    private static function parseNumeric(mixed $raw): ?float
    {
        if ($raw === null || $raw === '') {
            return null;
        }
        $n = (float) preg_replace('/[^\d.-]/', '', (string) $raw);
        return is_finite($n) ? $n : null;
    }

    private static function extractPlate(string $name): string
    {
        if (preg_match('/\b([A-Z]{1,3}[\s-]?\d{2,4}[A-Z]{0,3})\b/i', $name, $m)) {
            return strtoupper(preg_replace('/\s+/', ' ', $m[1]));
        }
        return '';
    }

    /**
     * Read a unit param (battery / voltage) — mirrors frontend unitParam.
     * @param array<string, mixed> $unit
     */
    public static function unitParam(array $unit, string ...$keys): ?float
    {
        $lmsg = is_array($unit['lmsg']['params'] ?? null) ? $unit['lmsg']['params'] : [];
        $prms = [];
        foreach ($unit['prms'] ?? [] as $p) {
            if (is_array($p) && isset($p['key'])) {
                $prms[(string) $p['key']] = $p['value'] ?? null;
            }
        }
        foreach ($keys as $key) {
            if (isset($lmsg[$key]) && is_numeric($lmsg[$key])) {
                return (float) $lmsg[$key];
            }
            if (isset($prms[$key]) && is_numeric($prms[$key])) {
                return (float) $prms[$key];
            }
        }
        foreach ($unit['sens'] ?? [] as $s) {
            if (!is_array($s)) {
                continue;
            }
            $name = strtolower((string) ($s['name'] ?? ''));
            $type = strtolower((string) ($s['type'] ?? ''));
            $param = (string) ($s['param'] ?? '');
            foreach ($keys as $key) {
                $k = strtolower($key);
                if (str_contains($name, $k) || str_contains($type, $k) || strtolower($param) === $k) {
                    if ($param !== '' && isset($lmsg[$param]) && is_numeric($lmsg[$param])) {
                        return (float) $lmsg[$param];
                    }
                    if ($param !== '' && isset($prms[$param]) && is_numeric($prms[$param])) {
                        return (float) $prms[$param];
                    }
                }
            }
        }
        return null;
    }
}
