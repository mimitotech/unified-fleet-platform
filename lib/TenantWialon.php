<?php
/**
 * Resolve Wialon credentials for a tenant (mother account + scoped resource).
 */
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/Crypto.php';

final class TenantWialon
{
    /**
     * @return array<string, mixed>|null
     */
    public static function getRow(string $tenantId): ?array
    {
        $rows = Database::query(
            "SELECT wialon_resource_id, wialon_operate_as, wialon_account_name, wialon_mother_account_id,
                    wialon_session_meta, connection_verified_at, last_sync_at, last_error,
                    preview_asset_count, is_active, inherits_platform_credentials,
                    credentials_encrypted
             FROM data_sources
             WHERE tenant_id = ? AND source_type = 'wialon'
             LIMIT 1",
            [$tenantId]
        );
        return $rows[0] ?? null;
    }

    public static function isConnected(?array $row): bool
    {
        if (!$row) {
            return false;
        }
        return (int) ($row['is_active'] ?? 0) === 1
            && !empty($row['connection_verified_at'])
            && (int) ($row['wialon_resource_id'] ?? 0) > 0;
    }

    /**
     * @return array{token:string,baseUrl:?string,operateAs:?string,accountId:?string}
     */
    public static function loadCreds(string $tenantId): array
    {
        $row = self::getRow($tenantId);
        if (!$row) {
            throw new RuntimeException('Wialon integration not configured for this tenant');
        }

        $stored = [];
        try {
            if (!empty($row['credentials_encrypted'])) {
                $stored = Crypto::decrypt((string) $row['credentials_encrypted']);
            }
        } catch (Throwable $e) {
            $stored = [];
        }

        $accountId = null;
        if (!empty($stored['accountId'])) {
            $accountId = (string) $stored['accountId'];
        } elseif (!empty($row['wialon_resource_id'])) {
            $accountId = (string) ((int) $row['wialon_resource_id']);
        }

        $operateAs = null;
        if (isset($stored['operateAs']) && $stored['operateAs'] !== '' && $stored['operateAs'] !== null) {
            $operateAs = (string) $stored['operateAs'];
        } elseif (!empty($row['wialon_operate_as'])) {
            $operateAs = (string) $row['wialon_operate_as'];
        }

        $inherits = (int) ($row['inherits_platform_credentials'] ?? 0) === 1
            || !empty($row['wialon_mother_account_id']);

        if ($inherits || empty(trim((string) ($stored['token'] ?? '')))) {
            $motherId = (string) ($row['wialon_mother_account_id'] ?? '');
            if ($motherId === '') {
                $defaults = Database::query(
                    'SELECT id FROM wialon_mother_accounts WHERE is_active = 1 ORDER BY created_at ASC LIMIT 1'
                );
                $motherId = (string) ($defaults[0]['id'] ?? '');
            }
            if ($motherId === '') {
                throw new RuntimeException(
                    'Wialon is not configured. Add a mother account in Admin → Wialon Center and link this tenant.'
                );
            }
            $mother = Database::query(
                'SELECT credentials_encrypted, base_url, is_active FROM wialon_mother_accounts WHERE id = ? LIMIT 1',
                [$motherId]
            );
            if (!$mother || !(int) ($mother[0]['is_active'] ?? 0)) {
                throw new RuntimeException('Wialon mother account is missing or inactive');
            }
            $motherCreds = Crypto::decrypt((string) ($mother[0]['credentials_encrypted'] ?? ''));
            $token = trim((string) ($motherCreds['token'] ?? ''));
            if ($token === '') {
                throw new RuntimeException('Wialon mother account token is missing');
            }
            $baseUrl = $mother[0]['base_url']
                ?? ($motherCreds['baseUrl'] ?? null);

            return [
                'token' => $token,
                'baseUrl' => is_string($baseUrl) && $baseUrl !== '' ? $baseUrl : null,
                'operateAs' => $operateAs,
                'accountId' => $accountId,
            ];
        }

        $token = trim((string) ($stored['token'] ?? ''));
        if ($token === '') {
            throw new RuntimeException('Wialon token is missing for this tenant');
        }
        $baseUrl = $stored['baseUrl'] ?? null;

        return [
            'token' => $token,
            'baseUrl' => is_string($baseUrl) && $baseUrl !== '' ? $baseUrl : null,
            'operateAs' => $operateAs,
            'accountId' => $accountId,
        ];
    }
}
