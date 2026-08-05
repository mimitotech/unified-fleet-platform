<?php
/**
 * Wialon hierarchy probe — minimal parity with WialonHierarchyService.probe()
 */
require_once __DIR__ . '/WialonClient.php';

final class WialonHierarchy
{
    private const RESOURCE_ACCOUNT_FLAGS = 5;
    private const USER_FLAGS = 261;
    private const UNIT_FLAGS = 0x401; // base + advanced (counts + bact)

    /**
     * @return array<string, mixed>
     */
    public static function probe(string $token, ?string $baseUrl = null, ?string $operateAs = null): array
    {
        $client = new WialonClient($baseUrl);
        try {
            $login = $client->login($token, $operateAs);
            $user = $login['user'];

            $dealerRights = false;
            $currentAccount = null;
            try {
                $acct = $client->call('core/get_account_data', ['type' => 1]);
                $dealerRights = ((int) ($acct['dealerRights'] ?? 0)) === 1;
                if (is_array($acct)) {
                    $currentAccount = [
                        'plan' => $acct['plan'] ?? null,
                        'balance' => $acct['balance'] ?? null,
                        'parentAccountId' => isset($acct['parentAccountId']) ? (int) $acct['parentAccountId'] : null,
                    ];
                }
            } catch (Throwable $e) {
                // optional
            }

            $accounts = self::searchAll($client, [
                'itemsType' => 'avl_resource',
                'propName' => 'rel_is_account',
                'propValueMask' => '1',
                'sortType' => 'sys_name',
                'propType' => 'property',
            ], self::RESOURCE_ACCOUNT_FLAGS);

            $units = self::searchAll($client, [
                'itemsType' => 'avl_unit',
                'propName' => 'sys_name',
                'propValueMask' => '*',
                'sortType' => 'sys_name',
            ], self::UNIT_FLAGS);

            $users = [];
            try {
                $users = self::searchAll($client, [
                    'itemsType' => 'user',
                    'propName' => 'sys_user_creator',
                    'propValueMask' => '*',
                    'sortType' => 'sys_name',
                    'propType' => 'creatortree',
                ], self::USER_FLAGS);
            } catch (Throwable $e) {
                $users = [];
            }

            $unitCountByAccount = [];
            foreach ($units as $u) {
                $bact = isset($u['bact']) ? (int) $u['bact'] : 0;
                if ($bact > 0) {
                    $unitCountByAccount[$bact] = ($unitCountByAccount[$bact] ?? 0) + 1;
                }
            }

            $userCountByAccount = [];
            foreach ($users as $u) {
                $bact = isset($u['bact']) ? (int) $u['bact'] : (isset($u['crt']) ? (int) $u['crt'] : 0);
                if ($bact > 0) {
                    $userCountByAccount[$bact] = ($userCountByAccount[$bact] ?? 0) + 1;
                }
            }

            $accountRows = [];
            foreach ($accounts as $a) {
                $id = (int) ($a['id'] ?? 0);
                if ($id <= 0) {
                    continue;
                }
                $accountRows[] = [
                    'id' => (string) $id,
                    'name' => (string) ($a['nm'] ?? ('Account ' . $id)),
                    'isAccount' => true,
                    'parentAccountId' => isset($a['bpact']) ? (string) $a['bpact'] : null,
                    'unitCount' => $unitCountByAccount[$id] ?? 0,
                    'userCount' => $userCountByAccount[$id] ?? 0,
                    'enabled' => true,
                ];
            }

            usort($accountRows, static fn(array $x, array $y): int => strcasecmp($x['name'], $y['name']));

            $userRows = [];
            foreach ($users as $u) {
                $id = (int) ($u['id'] ?? 0);
                if ($id <= 0) {
                    continue;
                }
                $prp = is_array($u['prp'] ?? null) ? $u['prp'] : [];
                $userRows[] = [
                    'id' => (string) $id,
                    'name' => (string) ($u['nm'] ?? ('User ' . $id)),
                    'accountId' => isset($u['bact']) ? (string) $u['bact'] : null,
                    'creatorId' => isset($u['crt']) ? (string) $u['crt'] : null,
                    'lastLogin' => isset($u['ld']) ? (int) $u['ld'] : null,
                    'email' => isset($prp['email']) ? (string) $prp['email'] : null,
                ];
            }

            $accountCount = count($accountRows);
            $accountTier = 'user';
            if ($dealerRights || $accountCount > 5) {
                $accountTier = 'mother';
            } elseif ($accountCount > 1) {
                $accountTier = 'dealer';
            } elseif ($accountCount === 1) {
                $accountTier = 'admin';
            }

            return [
                'sessionUser' => [
                    'id' => isset($user['id']) ? (string) $user['id'] : null,
                    'nm' => $user['nm'] ?? null,
                    'bact' => isset($user['bact']) ? (string) $user['bact'] : null,
                ],
                'accountTier' => $accountTier,
                'dealerRights' => $dealerRights,
                'counts' => [
                    'units' => count($units),
                    'accounts' => $accountCount,
                    'users' => count($userRows),
                    'resources' => 0,
                    'routes' => 0,
                    'unitGroups' => 0,
                ],
                'accounts' => $accountRows,
                'users' => $userRows,
                'currentAccount' => $currentAccount,
            ];
        } finally {
            $client->logout();
        }
    }

    /**
     * Units for a billing account.
     * @return array<int, array<string, mixed>>
     */
    public static function unitsForAccount(string $token, string $accountId, ?string $baseUrl = null): array
    {
        $client = new WialonClient($baseUrl);
        try {
            $client->login($token);
            $items = [];
            try {
                $items = self::searchAll($client, [
                    'itemsType' => 'avl_unit',
                    'propName' => 'sys_billing_account_guid',
                    'propValueMask' => $accountId,
                    'sortType' => 'sys_name',
                    'propType' => 'property',
                ], self::UNIT_FLAGS);
            } catch (Throwable $e) {
                // fallback: all units filtered by bact
                $all = self::searchAll($client, [
                    'itemsType' => 'avl_unit',
                    'propName' => 'sys_name',
                    'propValueMask' => '*',
                    'sortType' => 'sys_name',
                ], self::UNIT_FLAGS);
                $aid = (int) $accountId;
                $items = array_values(array_filter($all, static fn(array $u): bool => ((int) ($u['bact'] ?? 0)) === $aid));
            }

            $out = [];
            foreach ($items as $u) {
                $out[] = [
                    'id' => (string) ($u['id'] ?? ''),
                    'name' => (string) ($u['nm'] ?? ''),
                    'accountId' => isset($u['bact']) ? (string) $u['bact'] : $accountId,
                ];
            }
            return $out;
        } finally {
            $client->logout();
        }
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
            if ($total === null) {
                $total = isset($data['totalItemsCount']) ? (int) $data['totalItemsCount'] : count($items);
            }
            $from += $page;
            if (count($items) === 0) {
                break;
            }
        } while (count($all) < $total);

        return $all;
    }
}
