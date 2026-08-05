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
}
