<?php
/**
 * Extra live Wialon lists: routes, notifications, report templates.
 */
require_once __DIR__ . '/WialonClient.php';
require_once __DIR__ . '/TenantWialon.php';

final class WialonLive
{
    /** Resource flags including notifications (unf) */
    private const RESOURCE_NF_FLAGS = 8193; // base + reports; notifications often need higher — use 0x2001 | notifications
    private const RESOURCE_FLAGS = 0x2001; // BASE | REPORTS — 8193
    private const RESOURCE_WITH_NF = 0x2001 | 0x1000; // include notifications where supported
    private const ROUTE_FLAGS = 257; // BASE | CONFIG

    /**
     * @return array{token:string,baseUrl:?string,operateAs:?string,accountId:?string}
     */
    private static function creds(string $tenantId): array
    {
        return TenantWialon::loadCreds($tenantId);
    }

    /** @return array<int, array<string, mixed>> */
    public static function listRoutes(string $tenantId, int $limit = 200): array
    {
        $creds = self::creds($tenantId);
        $client = new WialonClient($creds['baseUrl']);
        try {
            $client->login($creds['token'], $creds['operateAs']);
            $accountId = $creds['accountId'] ?? null;
            $items = self::searchAll($client, self::routeSpec($accountId), self::ROUTE_FLAGS);
            if (!$items && $accountId) {
                $items = self::searchAll($client, self::routeSpec(null), self::ROUTE_FLAGS);
                $aid = (int) $accountId;
                $items = array_values(array_filter(
                    $items,
                    static fn(array $r): bool => ((int) ($r['bact'] ?? 0)) === $aid
                ));
            }
            $out = [];
            foreach (array_slice($items, 0, $limit) as $r) {
                $out[] = [
                    'id' => (int) ($r['id'] ?? 0),
                    'name' => (string) ($r['nm'] ?? ''),
                    'accountId' => isset($r['bact']) ? (int) $r['bact'] : null,
                    'config' => $r['rcfg'] ?? null,
                ];
            }
            return $out;
        } finally {
            $client->logout();
        }
    }

    /** @return array<int, array<string, mixed>> */
    public static function listNotifications(string $tenantId, int $limit = 200): array
    {
        $creds = self::creds($tenantId);
        $client = new WialonClient($creds['baseUrl']);
        try {
            $client->login($creds['token'], $creds['operateAs']);
            $accountId = $creds['accountId'] ?? null;
            $resources = self::searchAll($client, self::resourceSpec($accountId), self::RESOURCE_WITH_NF);
            if (!$resources) {
                $resources = self::searchAll($client, self::resourceSpec(null), self::RESOURCE_WITH_NF);
            }

            $out = [];
            $seen = [];
            $now = time();
            foreach ($resources as $resource) {
                $rid = (int) ($resource['id'] ?? 0);
                $rname = (string) ($resource['nm'] ?? '');
                $unf = is_array($resource['unf'] ?? null) ? $resource['unf'] : [];
                try {
                    $detail = $client->call('core/search_item', [
                        'id' => $rid,
                        'flags' => self::RESOURCE_WITH_NF,
                    ]);
                    if (is_array($detail['item']['unf'] ?? null)) {
                        $unf = $detail['item']['unf'];
                    }
                } catch (Throwable $e) {
                    // keep list unf
                }

                foreach ($unf as $nf) {
                    if (!is_array($nf) || empty($nf['id']) || empty($nf['n'])) {
                        continue;
                    }
                    $key = $rid . ':' . $nf['id'];
                    if (isset($seen[$key])) {
                        continue;
                    }
                    $seen[$key] = true;
                    $fl = (int) ($nf['fl'] ?? 0);
                    $disabledByFlag = ($fl & 0x2) === 0x2;
                    $td = (int) ($nf['td'] ?? 0);
                    $deactivated = $td > 0 && $td <= $now;
                    $trg = $nf['trg'] ?? null;
                    $controlType = is_string($trg) ? $trg : (is_array($trg) ? ($trg['t'] ?? null) : null);

                    $out[] = [
                        'resourceId' => $rid,
                        'resourceName' => $rname,
                        'id' => (int) $nf['id'],
                        'name' => (string) $nf['n'],
                        'triggers' => isset($nf['ac']) ? (int) $nf['ac'] : null,
                        'active' => !$disabledByFlag && !$deactivated,
                        'unitCount' => is_array($nf['un'] ?? null) ? count($nf['un']) : null,
                        'controlType' => $controlType,
                    ];
                    if (count($out) >= $limit) {
                        return $out;
                    }
                }
            }
            return $out;
        } finally {
            $client->logout();
        }
    }

    /** @return array<int, array<string, mixed>> */
    public static function listReportTemplates(string $tenantId, int $limit = 400): array
    {
        $creds = self::creds($tenantId);
        $client = new WialonClient($creds['baseUrl']);
        try {
            $client->login($creds['token'], $creds['operateAs']);
            $accountId = $creds['accountId'] ?? null;
            $resources = self::searchAll($client, self::resourceSpec($accountId), self::RESOURCE_FLAGS);
            if (!$resources && $accountId) {
                $resources = self::searchAll($client, self::resourceSpec(null), self::RESOURCE_FLAGS);
            }

            $templates = [];
            foreach ($resources as $res) {
                $rep = is_array($res['rep'] ?? null) ? $res['rep'] : [];
                foreach ($rep as $tpl) {
                    if (!is_array($tpl) || empty($tpl['id'])) {
                        continue;
                    }
                    $templates[] = [
                        'resourceId' => (int) ($res['id'] ?? 0),
                        'resourceName' => (string) ($res['nm'] ?? ''),
                        'id' => (int) $tpl['id'],
                        'name' => (string) ($tpl['n'] ?? ''),
                        'type' => $tpl['ct'] ?? null,
                    ];
                    if (count($templates) >= $limit) {
                        return $templates;
                    }
                }
            }
            return $templates;
        } finally {
            $client->logout();
        }
    }

    /** @return array<string, mixed> */
    private static function routeSpec(?string $accountId): array
    {
        if ($accountId) {
            return [
                'itemsType' => 'avl_route',
                'propName' => 'sys_billing_account_guid',
                'propValueMask' => $accountId,
                'sortType' => 'sys_name',
                'propType' => 'property',
            ];
        }
        return [
            'itemsType' => 'avl_route',
            'propName' => 'sys_name',
            'propValueMask' => '*',
            'sortType' => 'sys_name',
        ];
    }

    /** @return array<string, mixed> */
    private static function resourceSpec(?string $accountId): array
    {
        if ($accountId) {
            return [
                'itemsType' => 'avl_resource',
                'propName' => 'sys_billing_account_guid',
                'propValueMask' => $accountId,
                'sortType' => 'sys_name',
                'propType' => 'property',
            ];
        }
        return [
            'itemsType' => 'avl_resource',
            'propName' => 'sys_name',
            'propValueMask' => '*',
            'sortType' => 'sys_name',
        ];
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

    /** Geofence zones from linked account resources. @return array<int, array<string, mixed>> */
    public static function listGeofences(string $tenantId, int $limit = 200): array
    {
        $creds = self::creds($tenantId);
        $client = new WialonClient($creds['baseUrl']);
        $flags = 0x1001; // BASE | ZONES
        try {
            $client->login($creds['token'], $creds['operateAs']);
            $accountId = $creds['accountId'] ?? null;
            $resources = self::searchAll($client, self::resourceSpec($accountId), $flags);
            if (!$resources) {
                $resources = self::searchAll($client, self::resourceSpec(null), $flags);
            }
            $zones = [];
            foreach ($resources as $resource) {
                $rid = (int) ($resource['id'] ?? 0);
                $rname = (string) ($resource['nm'] ?? '');
                $zl = is_array($resource['zl'] ?? null) ? $resource['zl'] : [];
                try {
                    $detail = $client->call('core/search_item', ['id' => $rid, 'flags' => $flags]);
                    if (is_array($detail['item']['zl'] ?? null)) {
                        $zl = $detail['item']['zl'];
                    }
                } catch (Throwable $e) {
                    // keep list zl
                }
                foreach ($zl as $z) {
                    if (!is_array($z) || empty($z['id'])) {
                        continue;
                    }
                    $t = (int) ($z['t'] ?? 0);
                    $center = null;
                    if (is_array($z['b'] ?? null) && isset($z['b']['cen_y'], $z['b']['cen_x'])) {
                        $center = ['lat' => (float) $z['b']['cen_y'], 'lng' => (float) $z['b']['cen_x']];
                    }
                    $zones[] = [
                        'resourceId' => $rid,
                        'resourceName' => $rname,
                        'id' => (int) $z['id'],
                        'name' => (string) ($z['n'] ?? ''),
                        'type' => $t === 3 ? 'circle' : ($t === 2 ? 'polygon' : 'unknown'),
                        'radius' => isset($z['w']) ? (float) $z['w'] : null,
                        'center' => $center,
                    ];
                    if (count($zones) >= $limit) {
                        return $zones;
                    }
                }
            }
            return $zones;
        } finally {
            $client->logout();
        }
    }

    /** @return array<int, array<string, mixed>> */
    public static function unitSensors(string $tenantId, int $unitId): array
    {
        $creds = self::creds($tenantId);
        $client = new WialonClient($creds['baseUrl']);
        try {
            $client->login($creds['token'], $creds['operateAs']);
            $data = $client->call('unit/calc_last_message', [
                'unitId' => $unitId,
                'sensors' => [],
                'flags' => 1,
            ]);
            $sensors = is_array($data['sensors'] ?? null) ? $data['sensors'] : [];
            $out = [];
            foreach ($sensors as $s) {
                if (!is_array($s)) {
                    continue;
                }
                $out[] = [
                    'name' => (string) ($s['n'] ?? ''),
                    'value' => $s['v'] ?? null,
                    'unit' => $s['u'] ?? null,
                    'type' => $s['t'] ?? null,
                ];
            }
            return $out;
        } finally {
            $client->logout();
        }
    }

    /** @return array<int, array<string, mixed>> */
    public static function unitTrips(string $tenantId, int $unitId, int $from, int $to): array
    {
        $creds = self::creds($tenantId);
        $client = new WialonClient($creds['baseUrl']);
        try {
            $client->login($creds['token'], $creds['operateAs']);
            $loadCount = 0;
            try {
                $load = $client->call('messages/load_interval', [
                    'itemId' => $unitId,
                    'timeFrom' => $from,
                    'timeTo' => $to,
                    'flags' => 1,
                    'flagsMask' => 65281,
                    'loadCount' => 1,
                ]);
                $loadCount = (int) ($load['count'] ?? 0);
            } catch (Throwable $e) {
                if (stripos($e->getMessage(), '1001') !== false || stripos($e->getMessage(), 'No messages') !== false) {
                    return [];
                }
                throw $e;
            }
            if ($loadCount <= 0) {
                try {
                    $client->call('messages/unload', []);
                } catch (Throwable $e) {
                }
                return [];
            }
            try {
                $result = $client->call('unit/get_trips', [
                    'itemId' => $unitId,
                    'timeFrom' => $from,
                    'timeTo' => $to,
                    'msgsSource' => 1,
                ]);
                $raw = [];
                if (isset($result[0]) || $result === []) {
                    // numeric array wrapped oddly — Wialon sometimes returns list at top
                }
                if (isset($result['trips']) && is_array($result['trips'])) {
                    $raw = $result['trips'];
                } elseif (array_is_list($result)) {
                    $raw = $result;
                }
                $out = [];
                foreach ($raw as $trip) {
                    if (!is_array($trip)) {
                        continue;
                    }
                    $fromBlock = is_array($trip['from'] ?? null) ? $trip['from'] : [];
                    $toBlock = is_array($trip['to'] ?? null) ? $trip['to'] : [];
                    $t1 = (int) ($fromBlock['t'] ?? $trip['t1'] ?? $trip['tm'] ?? $trip['begin'] ?? 0);
                    $t2 = (int) ($toBlock['t'] ?? $trip['t2'] ?? $trip['end'] ?? 0);
                    $meters = (float) ($trip['m'] ?? $trip['distance'] ?? $trip['mileage'] ?? 0);
                    $mileageKm = $meters > 0 ? ($meters > 500 ? $meters / 1000 : $meters) : 0;
                    $out[] = [
                        't1' => $t1,
                        't2' => $t2,
                        'mileage' => round($mileageKm, 2),
                        'from' => $fromBlock,
                        'to' => $toBlock,
                    ];
                }
                return $out;
            } finally {
                try {
                    $client->call('messages/unload', []);
                } catch (Throwable $e) {
                }
            }
        } finally {
            $client->logout();
        }
    }

    /**
     * Simplified report exec — sync first, then poll briefly; return tables + sample rows.
     * @return array<string, mixed>
     */
    public static function execReport(
        string $tenantId,
        int $reportResourceId,
        int $reportTemplateId,
        int $reportObjectId,
        int $from,
        int $to,
        int $maxRows = 200
    ): array {
        $creds = self::creds($tenantId);
        $client = new WialonClient($creds['baseUrl']);
        try {
            $client->login($creds['token'], $creds['operateAs']);
            try {
                $client->call('report/cleanup_result', []);
            } catch (Throwable $e) {
            }

            $execParams = [
                'reportResourceId' => $reportResourceId,
                'reportTemplateId' => $reportTemplateId,
                'reportObjectId' => $reportObjectId,
                'reportObjectSecId' => 0,
                'interval' => ['from' => $from, 'to' => $to, 'flags' => 0],
            ];

            $ready = false;
            $result = [];
            try {
                $result = $client->call('report/exec_report', array_merge($execParams, ['remoteExec' => 0]));
                $tables = $result['reportResult']['tables'] ?? ($result['tables'] ?? []);
                if (is_array($tables) && ($tables || isset($result['reportResult']))) {
                    $ready = true;
                }
            } catch (Throwable $e) {
                $ready = false;
            }

            if (!$ready) {
                try {
                    $client->call('report/cleanup_result', []);
                } catch (Throwable $e) {
                }
                $client->call('report/exec_report', array_merge($execParams, ['remoteExec' => 1]));
                for ($attempt = 0; $attempt < 40; $attempt++) {
                    $statusRes = $client->call('report/get_report_status', []);
                    $code = (int) ($statusRes['status'] ?? 0);
                    if ($code === 4) {
                        $ready = true;
                        break;
                    }
                    if ($code === 8 || $code === 16) {
                        throw new RuntimeException($statusRes['error'] ?? ('Wialon report failed (status ' . $code . ')'));
                    }
                    usleep($attempt < 10 ? 200000 : 400000);
                }
                if (!$ready) {
                    throw new RuntimeException('Wialon report timed out before completion');
                }
                $result = $client->call('report/apply_report_result', []);
            }

            $tables = $result['reportResult']['tables'] ?? ($result['tables'] ?? []);
            if (!is_array($tables) || !$tables) {
                try {
                    $applied = $client->call('report/apply_report_result', []);
                    $tables = $applied['reportResult']['tables'] ?? ($applied['tables'] ?? []);
                } catch (Throwable $e) {
                    $tables = [];
                }
            }

            $outTables = [];
            foreach (array_values($tables) as $tableIndex => $meta) {
                if (!is_array($meta)) {
                    continue;
                }
                $totalRows = (int) ($meta['rows'] ?? 0);
                $fetchTo = min($totalRows, $maxRows);
                $rows = [];
                if ($fetchTo > 0) {
                    try {
                        $rowData = $client->call('report/get_result_rows', [
                            'tableIndex' => $tableIndex,
                            'indexFrom' => 0,
                            'indexTo' => $fetchTo - 1,
                        ]);
                        if (is_array($rowData)) {
                            $rows = isset($rowData['rows']) && is_array($rowData['rows'])
                                ? $rowData['rows']
                                : (array_is_list($rowData) ? $rowData : []);
                        }
                    } catch (Throwable $e) {
                        $rows = [];
                    }
                }
                $outTables[] = [
                    'index' => $tableIndex,
                    'name' => (string) ($meta['name'] ?? $meta['label'] ?? ('Table ' . $tableIndex)),
                    'rows' => $totalRows,
                    'header' => $meta['header'] ?? ($meta['columns'] ?? null),
                    'sample' => array_slice($rows, 0, $maxRows),
                ];
            }

            try {
                $client->call('report/cleanup_result', []);
            } catch (Throwable $e) {
            }

            return [
                'tables' => $outTables,
                'tableCount' => count($outTables),
                'from' => $from,
                'to' => $to,
            ];
        } finally {
            $client->logout();
        }
    }

    private const UNIT_FLAG_COMMANDS = 0x00080000;
    private const UNIT_FLAG_COMMANDS_AVAILABLE = 0x00000200;

    /**
     * Commands configured / available on a Wialon unit (cml / cmds / definitions).
     * @return array<int, array{name:string,label:string,type:?string,linkType:string,params:?string}>
     */
    public static function getUnitCommands(string $tenantId, int $unitId): array
    {
        $creds = self::creds($tenantId);
        $client = new WialonClient($creds['baseUrl']);
        try {
            $client->login($creds['token'], $creds['operateAs']);
            $commandIds = [];

            try {
                $configured = $client->call('core/search_item', [
                    'id' => $unitId,
                    'flags' => self::UNIT_FLAG_COMMANDS,
                ]);
                $cml = is_array($configured['item']['cml'] ?? null) ? $configured['item']['cml'] : [];
                $fromCml = self::parseCommandList($cml);
                if ($fromCml) {
                    return $fromCml;
                }
                foreach ($cml as $c) {
                    if (!is_array($c)) {
                        continue;
                    }
                    $cid = (int) ($c['id'] ?? 0);
                    if ($cid > 0) {
                        $commandIds[] = $cid;
                    }
                }
            } catch (Throwable $e) {
            }

            try {
                $available = $client->call('core/search_item', [
                    'id' => $unitId,
                    'flags' => self::UNIT_FLAG_COMMANDS_AVAILABLE,
                ]);
                $cmds = is_array($available['item']['cmds'] ?? null) ? $available['item']['cmds'] : [];
                $fromAvailable = self::parseAvailableCommands($cmds);
                if ($fromAvailable) {
                    return $fromAvailable;
                }
            } catch (Throwable $e) {
            }

            try {
                $params = ['itemId' => $unitId];
                if ($commandIds) {
                    $params['col'] = $commandIds;
                }
                $result = $client->call('unit/get_command_definition_data', $params);
                return self::parseCommandDefinitionData($result);
            } catch (Throwable $e) {
                return [];
            }
        } finally {
            $client->logout();
        }
    }

    /**
     * Template catalog grouped by module keywords (lighter than React resolver).
     * @return array<string, mixed>
     */
    public static function reportCatalog(string $tenantId): array
    {
        $templates = self::listReportTemplates($tenantId, 500);
        $enriched = [];
        $byModule = [];
        foreach ($templates as $t) {
            $module = self::classifyTemplateModule((string) ($t['name'] ?? ''));
            $row = array_merge($t, ['module' => $module]);
            $enriched[] = $row;
            if (!isset($byModule[$module])) {
                $byModule[$module] = [];
            }
            $byModule[$module][] = $row;
        }
        $modules = [];
        foreach ($byModule as $module => $items) {
            $modules[] = [
                'module' => $module,
                'count' => count($items),
                'templates' => $items,
            ];
        }
        usort($modules, static fn(array $a, array $b): int => $b['count'] <=> $a['count']);

        return [
            'templates' => $enriched,
            'modules' => $modules,
            'groups' => [],
            'users' => [],
            'count' => count($enriched),
            'fetchedAt' => gmdate('c'),
        ];
    }

    public static function classifyTemplateModule(string $name): string
    {
        $n = strtolower(trim($name));
        if ($n === '') {
            return 'events';
        }
        if (str_contains($n, 'fuel') || str_contains($n, 'fill') || str_contains($n, 'theft') || str_contains($n, 'drain')) {
            return 'fuel';
        }
        if (str_contains($n, 'engine hour') || str_contains($n, 'engine_hours') || str_contains($n, 'moto hour') || preg_match('/\beh\b/', $n)) {
            return 'engineHours';
        }
        if (str_contains($n, 'trip') || str_contains($n, 'journey') || str_contains($n, 'mileage') || str_contains($n, 'distance')) {
            return 'trips';
        }
        if (str_contains($n, 'geofence') || str_contains($n, 'geo-fence') || str_contains($n, 'zone')) {
            return 'geofence';
        }
        if (str_contains($n, 'driver') || str_contains($n, 'eco') || str_contains($n, 'speeding')) {
            return 'driver';
        }
        if (str_contains($n, 'emission') || str_contains($n, 'co2') || str_contains($n, 'carbon')) {
            return 'emissions';
        }
        return 'events';
    }

    /**
     * @param array<string|int, mixed> $cml
     * @return array<int, array{name:string,label:string,type:?string,linkType:string,params:?string}>
     */
    private static function parseCommandList(array $cml): array
    {
        $out = [];
        foreach ($cml as $c) {
            if (!is_array($c)) {
                continue;
            }
            $mapped = self::mapCmd($c);
            if ($mapped['name'] !== '') {
                $out[] = $mapped;
            }
        }
        return $out;
    }

    /**
     * @param array<int, mixed> $cmds
     * @return array<int, array{name:string,label:string,type:?string,linkType:string,params:?string}>
     */
    private static function parseAvailableCommands(array $cmds): array
    {
        $out = [];
        foreach ($cmds as $c) {
            if (!is_array($c)) {
                continue;
            }
            $name = (string) ($c['n'] ?? $c['name'] ?? '');
            if ($name === '') {
                continue;
            }
            $out[] = [
                'name' => $name,
                'label' => $name,
                'type' => isset($c['c']) ? (string) $c['c'] : (isset($c['type']) ? (string) $c['type'] : null),
                'linkType' => (string) ($c['t'] ?? $c['l'] ?? $c['linkType'] ?? ''),
                'params' => isset($c['p']) ? (string) $c['p'] : (isset($c['params']) ? (string) $c['params'] : null),
            ];
        }
        return $out;
    }

    /**
     * @return array<int, array{name:string,label:string,type:?string,linkType:string,params:?string}>
     */
    private static function parseCommandDefinitionData(mixed $raw): array
    {
        if ($raw === null) {
            return [];
        }
        if (is_array($raw) && isset($raw['commands']) && is_array($raw['commands'])) {
            $out = [];
            foreach ($raw['commands'] as $c) {
                if (!is_array($c)) {
                    continue;
                }
                $mapped = self::mapCmd($c);
                if ($mapped['name'] !== '') {
                    $out[] = $mapped;
                }
            }
            return $out;
        }
        if (is_array($raw) && isset($raw['cml']) && is_array($raw['cml'])) {
            return self::parseCommandList($raw['cml']);
        }
        if (!is_array($raw)) {
            return [];
        }
        $out = [];
        foreach ($raw as $item) {
            if (!is_array($item)) {
                continue;
            }
            $mapped = self::mapCmd($item);
            if ($mapped['name'] !== '') {
                $out[] = $mapped;
            }
        }
        if ($out) {
            return $out;
        }
        // Alternating [id, cmd, id, cmd, ...]
        for ($i = 0; $i < count($raw) - 1; $i += 2) {
            $cmd = $raw[$i + 1] ?? null;
            if (!is_array($cmd)) {
                continue;
            }
            $mapped = self::mapCmd($cmd);
            if ($mapped['name'] !== '') {
                $out[] = $mapped;
            }
        }
        return $out;
    }

    /**
     * @param array<string, mixed> $c
     * @return array{name:string,label:string,type:?string,linkType:string,params:?string}
     */
    private static function mapCmd(array $c): array
    {
        $name = (string) ($c['n'] ?? $c['name'] ?? '');
        return [
            'name' => $name,
            'label' => $name,
            'type' => isset($c['c']) ? (string) $c['c'] : (isset($c['type']) ? (string) $c['type'] : null),
            'linkType' => (string) ($c['l'] ?? $c['t'] ?? $c['linkType'] ?? ''),
            'params' => isset($c['p']) ? (string) $c['p'] : (isset($c['params']) ? (string) $c['params'] : null),
        ];
    }
}
