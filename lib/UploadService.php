<?php
/**
 * Tenant file uploads — parity with UploadService.ts
 */
require_once __DIR__ . '/Database.php';

final class UploadService
{
    private const MAX_BYTES = 5 * 1024 * 1024;

    private const ALLOWED = [
        'image/png', 'image/jpeg', 'image/jpg', 'image/webp',
        'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/gif',
    ];

    public static function resolveMime(string $fileName, ?string $mimeType = null): string
    {
        $raw = strtolower(trim((string) $mimeType));
        if ($raw !== '' && $raw !== 'application/octet-stream') {
            return $raw;
        }
        $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        return match ($ext) {
            'png' => 'image/png',
            'jpg', 'jpeg' => 'image/jpeg',
            'webp' => 'image/webp',
            'svg' => 'image/svg+xml',
            'ico' => 'image/x-icon',
            'gif' => 'image/gif',
            default => 'image/png',
        };
    }

    /**
     * @return array{url:string,publicUrl:string,fileName:string,mimeType:string,sizeBytes:int,fileType:string}
     */
    public static function saveTenantFile(
        string $tenantId,
        string $fileType,
        string $fileName,
        string $mime,
        string $binary
    ): array {
        $fileType = in_array($fileType, ['logo', 'favicon'], true) ? $fileType : 'logo';
        if (strlen($binary) === 0) {
            throw new RuntimeException('Empty file data');
        }
        if (strlen($binary) > self::MAX_BYTES) {
            throw new RuntimeException('File too large (max 5MB)');
        }
        $mime = self::resolveMime($fileName, $mime);
        if (!in_array($mime, self::ALLOWED, true) && !str_starts_with($mime, 'image/')) {
            throw new RuntimeException('Only image uploads are allowed');
        }

        $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        $allowedExt = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'ico'];
        $safeExt = in_array($ext, $allowedExt, true) ? $ext : 'png';
        $safeName = (string) (int) (microtime(true) * 1000) . '-' . bin2hex(random_bytes(6)) . '.' . $safeExt;

        $dir = SITE_ROOT . '/uploads/tenants/' . $tenantId;
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        $diskPath = $dir . '/' . $safeName;
        @file_put_contents($diskPath, $binary);

        $publicUrl = '/uploads/tenants/' . $tenantId . '/' . $safeName;
        $id = self::uuid();

        try {
            Database::execute(
                'INSERT INTO tenant_files
                   (id, tenant_id, file_type, file_name, mime_type, file_path, size_bytes, content, public_url, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))',
                [
                    $id,
                    $tenantId,
                    $fileType,
                    $fileName,
                    $mime,
                    $diskPath,
                    strlen($binary),
                    $binary,
                    $publicUrl,
                ]
            );
        } catch (Throwable $e) {
            // Soft — disk file still usable
            error_log('UploadService tenant_files: ' . $e->getMessage());
        }

        // Update tenant branding columns
        $col = $fileType === 'favicon' ? 'favicon_url' : 'logo_url';
        try {
            Database::execute(
                "UPDATE tenants SET `{$col}` = ?, updated_at = NOW(3) WHERE id = ?",
                [$publicUrl, $tenantId]
            );
        } catch (Throwable $e) {
            error_log('UploadService update tenant: ' . $e->getMessage());
        }

        return [
            'url' => $publicUrl,
            'publicUrl' => $publicUrl,
            'fileName' => $fileName,
            'mimeType' => $mime,
            'sizeBytes' => strlen($binary),
            'fileType' => $fileType,
        ];
    }

    private static function uuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }
}
