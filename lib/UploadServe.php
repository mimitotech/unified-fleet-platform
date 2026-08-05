<?php
/**
 * Serve /uploads/* — disk first, MySQL BLOB fallback (matches Node uploadsServe middleware).
 */
final class UploadServe
{
    private static string $root;

    public static function handle(string $relativePath): void
    {
        $relativePath = self::sanitize($relativePath);
        if ($relativePath === '') {
            self::notFound();
        }

        self::$root = SITE_ROOT . '/uploads';
        $diskPath = self::$root . '/' . $relativePath;

        if (is_file($diskPath) && is_readable($diskPath)) {
            self::sendFile($diskPath, self::mimeFromPath($diskPath));
            return;
        }

        $publicUrl = '/uploads/' . $relativePath;
        if (str_starts_with($relativePath, 'login-slides/')) {
            self::serveBlob('login_slides', $publicUrl, 'image/jpeg');
            return;
        }
        if (str_starts_with($relativePath, 'login-trust-logos/')) {
            self::serveBlob('login_trust_logos', $publicUrl, 'image/png');
            return;
        }
        if (str_starts_with($relativePath, 'tenants/')) {
            self::serveTenantFile($publicUrl, $relativePath);
            return;
        }

        self::notFound();
    }

    private static function sanitize(string $path): string
    {
        $path = str_replace(['\\', "\0"], '/', $path);
        $parts = [];
        foreach (explode('/', $path) as $seg) {
            if ($seg === '' || $seg === '.') {
                continue;
            }
            if ($seg === '..') {
                continue;
            }
            $parts[] = $seg;
        }
        return implode('/', $parts);
    }

    private static function serveBlob(string $table, string $publicUrl, string $defaultMime): void
    {
        $allowed = ['login_slides', 'login_trust_logos'];
        if (!in_array($table, $allowed, true)) {
            self::notFound();
        }

        $rows = Database::query(
            "SELECT image_content, mime_type, image_url FROM {$table} WHERE image_url = ? LIMIT 1",
            [$publicUrl]
        );
        $row = $rows[0] ?? null;
        if (!$row || empty($row['image_content'])) {
            self::notFound();
        }

        $content = $row['image_content'];
        if (!is_string($content)) {
            self::notFound();
        }

        $mime = !empty($row['mime_type']) ? (string) $row['mime_type'] : $defaultMime;
        $rel = ltrim(str_replace('/uploads/', '', (string) ($row['image_url'] ?? '')), '/');
        if ($rel !== '') {
            self::rehydrateToDisk($rel, $content);
        }

        self::sendBytes($content, $mime);
    }

    private static function serveTenantFile(string $publicUrl, string $relativePath): void
    {
        try {
            $rows = Database::query(
                'SELECT content, mime_type, file_path FROM tenant_files WHERE public_url = ? LIMIT 1',
                [$publicUrl]
            );
        } catch (Throwable $e) {
            self::notFound();
        }

        $row = $rows[0] ?? null;
        if (!$row || empty($row['content'])) {
            self::notFound();
        }

        $content = $row['content'];
        if (!is_string($content)) {
            self::notFound();
        }

        $mime = !empty($row['mime_type']) ? (string) $row['mime_type'] : self::mimeFromPath($relativePath);
        self::rehydrateToDisk($relativePath, $content);
        self::sendBytes($content, $mime);
    }

    private static function rehydrateToDisk(string $relativePath, string $content): void
    {
        $diskPath = self::$root . '/' . $relativePath;
        if (is_file($diskPath)) {
            return;
        }
        $dir = dirname($diskPath);
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        if (is_dir($dir) && is_writable($dir)) {
            @file_put_contents($diskPath, $content);
        }
    }

    private static function sendFile(string $path, string $mime): void
    {
        header('Content-Type: ' . $mime);
        header('Cache-Control: public, max-age=604800');
        header('Content-Length: ' . (string) filesize($path));
        readfile($path);
        exit;
    }

    private static function sendBytes(string $content, string $mime): void
    {
        header('Content-Type: ' . $mime);
        header('Cache-Control: public, max-age=604800');
        header('Content-Length: ' . (string) strlen($content));
        echo $content;
        exit;
    }

    private static function mimeFromPath(string $path): string
    {
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        return match ($ext) {
            'png' => 'image/png',
            'jpg', 'jpeg' => 'image/jpeg',
            'webp' => 'image/webp',
            'gif' => 'image/gif',
            'svg' => 'image/svg+xml',
            'ico' => 'image/x-icon',
            default => 'application/octet-stream',
        };
    }

    private static function notFound(): void
    {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Not found';
        exit;
    }
}
