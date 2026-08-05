<?php
/**
 * Public video clip share links.
 * Parity: VideoShareLinkService + GET /public/video/:token
 */
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/Env.php';

final class VideoShare
{
    public static function ensureTable(): void
    {
        try {
            Database::execute(
                "CREATE TABLE IF NOT EXISTS video_share_links (
                   token VARCHAR(64) NOT NULL PRIMARY KEY,
                   tenant_id CHAR(36) NOT NULL,
                   clip_ref JSON NOT NULL,
                   label VARCHAR(255) NULL,
                   expires_at DATETIME(3) NOT NULL,
                   created_by CHAR(36) NULL,
                   created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                   INDEX idx_vsl_tenant (tenant_id),
                   INDEX idx_vsl_exp (expires_at)
                 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
            );
        } catch (Throwable $e) {
        }
    }

    /**
     * @param array{unitId:int|string,source:string,path?:string,storageType?:int,messageId?:int|string} $clipRef
     * @return array{token:string,shareUrl:string,expiresAt:string,label:?string,clipRef:array}
     */
    public static function create(
        string $tenantId,
        array $clipRef,
        ?string $label = null,
        int $expiresInHours = 72,
        ?string $createdBy = null
    ): array {
        self::ensureTable();
        $token = bin2hex(random_bytes(24));
        $hours = max(1, min(720, $expiresInHours));
        $expiresAt = gmdate('Y-m-d H:i:s', time() + $hours * 3600);
        Database::execute(
            'INSERT INTO video_share_links (token, tenant_id, clip_ref, label, expires_at, created_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW(3))',
            [
                $token,
                $tenantId,
                json_encode($clipRef, JSON_UNESCAPED_SLASHES),
                $label,
                $expiresAt,
                $createdBy,
            ]
        );
        $base = rtrim((string) (Env::get('PUBLIC_BASE_URL', '') ?: self::detectBase()), '/');
        $shareUrl = $base . '/api/public/video/' . $token;
        return [
            'token' => $token,
            'tenantId' => $tenantId,
            'clipRef' => $clipRef,
            'label' => $label,
            'expiresAt' => gmdate('c', strtotime($expiresAt . ' UTC') ?: time()),
            'shareUrl' => $shareUrl,
        ];
    }

    /** @return array{tenantId:string,clipRef:array,label:?string}|null */
    public static function resolve(string $token): ?array
    {
        self::ensureTable();
        $rows = Database::query(
            'SELECT tenant_id, clip_ref, label, expires_at FROM video_share_links WHERE token = ? LIMIT 1',
            [$token]
        );
        if (!$rows) {
            return null;
        }
        $exp = strtotime((string) $rows[0]['expires_at'] . ' UTC');
        if ($exp && $exp < time()) {
            return null;
        }
        $ref = $rows[0]['clip_ref'];
        if (is_string($ref)) {
            $ref = json_decode($ref, true);
        }
        if (!is_array($ref)) {
            return null;
        }
        return [
            'tenantId' => (string) $rows[0]['tenant_id'],
            'clipRef' => $ref,
            'label' => $rows[0]['label'] ?? null,
        ];
    }

    private static function detectBase(): string
    {
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443);
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        return ($https ? 'https://' : 'http://') . $host;
    }
}
