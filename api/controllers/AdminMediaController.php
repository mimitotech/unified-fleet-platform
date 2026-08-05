<?php

require_once __DIR__ . '/../../lib/Database.php';
require_once __DIR__ . '/../../lib/Auth.php';
require_once __DIR__ . '/../../lib/Response.php';

/**
 * Admin login slides + trust logos CRUD — parity with LoginSlideService / LoginTrustLogoService.
 */
class AdminMediaController
{
    private static function uuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }

    /** @return array<string, mixed> */
    private static function body(): array
    {
        return Auth::jsonBody();
    }

    private static function decodeBase64Image(string $dataBase64, int $maxBytes): string
    {
        $raw = $dataBase64;
        if (str_contains($raw, ',')) {
            $parts = explode(',', $raw, 2);
            $raw = $parts[1] ?? '';
        }
        $bin = base64_decode($raw, true);
        if ($bin === false || $bin === '') {
            throw new RuntimeException('Empty image data');
        }
        if (strlen($bin) > $maxBytes) {
            throw new RuntimeException('Image exceeds size limit');
        }
        return $bin;
    }

    private static function mimeFromName(string $fileName, ?string $mime): string
    {
        $m = strtolower(trim((string) $mime));
        if ($m !== '' && $m !== 'application/octet-stream') {
            return $m;
        }
        $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        return match ($ext) {
            'png' => 'image/png',
            'jpg', 'jpeg' => 'image/jpeg',
            'webp' => 'image/webp',
            'gif' => 'image/gif',
            'svg' => 'image/svg+xml',
            default => 'image/jpeg',
        };
    }

    private static function saveUpload(string $subdir, string $id, string $fileName, ?string $mime, string $dataBase64, int $maxBytes): array
    {
        $content = self::decodeBase64Image($dataBase64, $maxBytes);
        $resolvedMime = self::mimeFromName($fileName, $mime);
        if (!str_starts_with($resolvedMime, 'image/')) {
            throw new RuntimeException('Only image uploads are allowed');
        }
        $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        $allowed = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'];
        $safeExt = in_array($ext, $allowed, true) ? '.' . $ext : ($subdir === 'login-trust-logos' ? '.png' : '.jpg');
        $dir = SITE_ROOT . '/uploads/' . $subdir;
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        $safeName = $id . $safeExt;
        $diskPath = $dir . '/' . $safeName;
        if (@file_put_contents($diskPath, $content) === false) {
            // Still store BLOB even if disk write fails
        }
        return [
            'imageUrl' => '/uploads/' . $subdir . '/' . $safeName,
            'mimeType' => $resolvedMime,
            'content' => $content,
        ];
    }

    /** @param array<string, mixed> $row */
    private static function mapSlide(array $row): array
    {
        return [
            'id' => (string) ($row['id'] ?? ''),
            'title' => (string) ($row['title'] ?? ''),
            'details' => $row['details'] ?? null,
            'eyebrow' => $row['eyebrow'] ?? null,
            'imageUrl' => $row['image_url'] ?? null,
            'mimeType' => $row['mime_type'] ?? null,
            'sortOrder' => (int) ($row['sort_order'] ?? 0),
            'isEnabled' => (bool) ((int) ($row['is_enabled'] ?? 1)),
            'createdAt' => $row['created_at'] ?? null,
            'updatedAt' => $row['updated_at'] ?? null,
        ];
    }

    /** @param array<string, mixed> $row */
    private static function mapLogo(array $row): array
    {
        return [
            'id' => (string) ($row['id'] ?? ''),
            'name' => (string) ($row['name'] ?? ''),
            'imageUrl' => $row['image_url'] ?? null,
            'mimeType' => $row['mime_type'] ?? null,
            'sortOrder' => (int) ($row['sort_order'] ?? 0),
            'isEnabled' => (bool) ((int) ($row['is_enabled'] ?? 1)),
            'createdAt' => $row['created_at'] ?? null,
            'updatedAt' => $row['updated_at'] ?? null,
        ];
    }

    /** GET /admin/login-slides */
    public static function loginSlidesList(): void
    {
        Auth::requireAdmin();
        try {
            $rows = Database::query(
                'SELECT id, title, details, eyebrow, image_url, mime_type, sort_order, is_enabled, created_at, updated_at
                 FROM login_slides ORDER BY sort_order ASC, created_at ASC'
            );
            Response::success(['slides' => array_map([self::class, 'mapSlide'], $rows)]);
        } catch (Throwable $e) {
            error_log('AdminMediaController loginSlidesList: ' . $e->getMessage());
            Response::success(['slides' => []]);
        }
    }

    /** POST /admin/login-slides */
    public static function loginSlidesCreate(): void
    {
        Auth::requireAdmin();
        $body = self::body();
        $title = trim((string) ($body['title'] ?? ''));
        if ($title === '') {
            Response::error('Title is required', 400);
            return;
        }
        $id = self::uuid();
        $imageUrl = null;
        $mimeType = null;
        $content = null;
        try {
            if (!empty($body['dataBase64']) && !empty($body['fileName'])) {
                $saved = self::saveUpload(
                    'login-slides',
                    $id,
                    (string) $body['fileName'],
                    isset($body['mimeType']) ? (string) $body['mimeType'] : null,
                    (string) $body['dataBase64'],
                    5 * 1024 * 1024
                );
                $imageUrl = $saved['imageUrl'];
                $mimeType = $saved['mimeType'];
                $content = $saved['content'];
            }
            $maxRows = Database::query('SELECT COALESCE(MAX(sort_order), -1) AS m FROM login_slides');
            $sortOrder = array_key_exists('sortOrder', $body) && is_numeric($body['sortOrder'])
                ? (int) $body['sortOrder']
                : ((int) ($maxRows[0]['m'] ?? -1) + 1);
            $isEnabled = array_key_exists('isEnabled', $body) ? (!empty($body['isEnabled']) ? 1 : 0) : 1;

            Database::execute(
                'INSERT INTO login_slides
                   (id, title, details, eyebrow, image_url, image_content, mime_type, sort_order, is_enabled)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    $id,
                    $title,
                    isset($body['details']) ? (trim((string) $body['details']) ?: null) : null,
                    isset($body['eyebrow']) ? (trim((string) $body['eyebrow']) ?: null) : null,
                    $imageUrl,
                    $content,
                    $mimeType,
                    $sortOrder,
                    $isEnabled,
                ]
            );
            $rows = Database::query(
                'SELECT id, title, details, eyebrow, image_url, mime_type, sort_order, is_enabled, created_at, updated_at
                 FROM login_slides WHERE id = ? LIMIT 1',
                [$id]
            );
            Response::success(self::mapSlide($rows[0] ?? ['id' => $id, 'title' => $title]), 201);
        } catch (Throwable $e) {
            error_log('AdminMediaController loginSlidesCreate: ' . $e->getMessage());
            Response::error($e->getMessage(), 500);
        }
    }

    /** PATCH /admin/login-slides/:id */
    public static function loginSlidesPatch(?string $id = null): void
    {
        Auth::requireAdmin();
        $slideId = $id ?? '';
        if ($slideId === '') {
            Response::error('Slide id required', 400);
            return;
        }
        $body = self::body();
        try {
            $existing = Database::query(
                'SELECT * FROM login_slides WHERE id = ? LIMIT 1',
                [$slideId]
            );
            if (!$existing) {
                Response::error('Slide not found', 404);
                return;
            }
            $row = $existing[0];
            $imageUrl = $row['image_url'] ?? null;
            $mimeType = $row['mime_type'] ?? null;
            $content = null;
            $updateContent = false;

            if (!empty($body['dataBase64']) && !empty($body['fileName'])) {
                $saved = self::saveUpload(
                    'login-slides',
                    $slideId,
                    (string) $body['fileName'],
                    isset($body['mimeType']) ? (string) $body['mimeType'] : null,
                    (string) $body['dataBase64'],
                    5 * 1024 * 1024
                );
                $imageUrl = $saved['imageUrl'];
                $mimeType = $saved['mimeType'];
                $content = $saved['content'];
                $updateContent = true;
            }

            $title = array_key_exists('title', $body) ? trim((string) $body['title']) : (string) ($row['title'] ?? '');
            if ($title === '') {
                Response::error('Title is required', 400);
                return;
            }
            $details = array_key_exists('details', $body)
                ? (trim((string) $body['details']) ?: null)
                : ($row['details'] ?? null);
            $eyebrow = array_key_exists('eyebrow', $body)
                ? (trim((string) $body['eyebrow']) ?: null)
                : ($row['eyebrow'] ?? null);
            $sortOrder = array_key_exists('sortOrder', $body) && is_numeric($body['sortOrder'])
                ? (int) $body['sortOrder']
                : (int) ($row['sort_order'] ?? 0);
            $isEnabled = array_key_exists('isEnabled', $body)
                ? (!empty($body['isEnabled']) ? 1 : 0)
                : (int) ($row['is_enabled'] ?? 1);

            if ($updateContent) {
                Database::execute(
                    'UPDATE login_slides SET title=?, details=?, eyebrow=?, image_url=?, mime_type=?, sort_order=?, is_enabled=?, image_content=?, updated_at=NOW()
                     WHERE id=?',
                    [$title, $details, $eyebrow, $imageUrl, $mimeType, $sortOrder, $isEnabled, $content, $slideId]
                );
            } else {
                Database::execute(
                    'UPDATE login_slides SET title=?, details=?, eyebrow=?, image_url=?, mime_type=?, sort_order=?, is_enabled=?, updated_at=NOW()
                     WHERE id=?',
                    [$title, $details, $eyebrow, $imageUrl, $mimeType, $sortOrder, $isEnabled, $slideId]
                );
            }

            $rows = Database::query(
                'SELECT id, title, details, eyebrow, image_url, mime_type, sort_order, is_enabled, created_at, updated_at
                 FROM login_slides WHERE id = ? LIMIT 1',
                [$slideId]
            );
            Response::success(self::mapSlide($rows[0] ?? []));
        } catch (Throwable $e) {
            error_log('AdminMediaController loginSlidesPatch: ' . $e->getMessage());
            Response::error($e->getMessage(), 500);
        }
    }

    /** DELETE /admin/login-slides/:id */
    public static function loginSlidesDelete(?string $id = null): void
    {
        Auth::requireAdmin();
        $slideId = $id ?? '';
        if ($slideId === '') {
            Response::error('Slide id required', 400);
            return;
        }
        try {
            $rows = Database::query('SELECT image_url FROM login_slides WHERE id = ? LIMIT 1', [$slideId]);
            if (!$rows) {
                Response::error('Slide not found', 404);
                return;
            }
            Database::execute('DELETE FROM login_slides WHERE id = ?', [$slideId]);
            $url = (string) ($rows[0]['image_url'] ?? '');
            if (str_starts_with($url, '/uploads/login-slides/')) {
                $disk = SITE_ROOT . $url;
                if (is_file($disk)) {
                    @unlink($disk);
                }
            }
            Response::success(['deleted' => true]);
        } catch (Throwable $e) {
            error_log('AdminMediaController loginSlidesDelete: ' . $e->getMessage());
            Response::error($e->getMessage(), 500);
        }
    }

    /** GET /admin/login-trust-logos */
    public static function trustLogosList(): void
    {
        Auth::requireAdmin();
        try {
            $rows = Database::query(
                'SELECT id, name, image_url, mime_type, sort_order, is_enabled, created_at, updated_at
                 FROM login_trust_logos ORDER BY sort_order ASC, created_at ASC'
            );
            Response::success(['logos' => array_map([self::class, 'mapLogo'], $rows)]);
        } catch (Throwable $e) {
            error_log('AdminMediaController trustLogosList: ' . $e->getMessage());
            Response::success(['logos' => []]);
        }
    }

    /** POST /admin/login-trust-logos */
    public static function trustLogosCreate(): void
    {
        Auth::requireAdmin();
        $body = self::body();
        $name = trim((string) ($body['name'] ?? ''));
        if ($name === '') {
            Response::error('Client name is required', 400);
            return;
        }
        if (empty($body['dataBase64']) || empty($body['fileName'])) {
            Response::error('Logo image is required', 400);
            return;
        }
        $id = self::uuid();
        try {
            $saved = self::saveUpload(
                'login-trust-logos',
                $id,
                (string) $body['fileName'],
                isset($body['mimeType']) ? (string) $body['mimeType'] : null,
                (string) $body['dataBase64'],
                2 * 1024 * 1024
            );
            $maxRows = Database::query('SELECT COALESCE(MAX(sort_order), -1) AS m FROM login_trust_logos');
            $sortOrder = array_key_exists('sortOrder', $body) && is_numeric($body['sortOrder'])
                ? (int) $body['sortOrder']
                : ((int) ($maxRows[0]['m'] ?? -1) + 1);
            $isEnabled = array_key_exists('isEnabled', $body) ? (!empty($body['isEnabled']) ? 1 : 0) : 1;

            Database::execute(
                'INSERT INTO login_trust_logos (id, name, image_url, image_content, mime_type, sort_order, is_enabled)
                 VALUES (?, ?, ?, ?, ?, ?, ?)',
                [$id, $name, $saved['imageUrl'], $saved['content'], $saved['mimeType'], $sortOrder, $isEnabled]
            );
            $rows = Database::query(
                'SELECT id, name, image_url, mime_type, sort_order, is_enabled, created_at, updated_at
                 FROM login_trust_logos WHERE id = ? LIMIT 1',
                [$id]
            );
            Response::success(self::mapLogo($rows[0] ?? ['id' => $id, 'name' => $name]), 201);
        } catch (Throwable $e) {
            error_log('AdminMediaController trustLogosCreate: ' . $e->getMessage());
            Response::error($e->getMessage(), 500);
        }
    }

    /** PATCH /admin/login-trust-logos/:id */
    public static function trustLogosPatch(?string $id = null): void
    {
        Auth::requireAdmin();
        $logoId = $id ?? '';
        if ($logoId === '') {
            Response::error('Logo id required', 400);
            return;
        }
        $body = self::body();
        try {
            $existing = Database::query('SELECT * FROM login_trust_logos WHERE id = ? LIMIT 1', [$logoId]);
            if (!$existing) {
                Response::error('Logo not found', 404);
                return;
            }
            $row = $existing[0];
            $imageUrl = $row['image_url'] ?? null;
            $mimeType = $row['mime_type'] ?? null;
            $content = null;
            $updateContent = false;

            if (!empty($body['dataBase64']) && !empty($body['fileName'])) {
                $saved = self::saveUpload(
                    'login-trust-logos',
                    $logoId,
                    (string) $body['fileName'],
                    isset($body['mimeType']) ? (string) $body['mimeType'] : null,
                    (string) $body['dataBase64'],
                    2 * 1024 * 1024
                );
                $imageUrl = $saved['imageUrl'];
                $mimeType = $saved['mimeType'];
                $content = $saved['content'];
                $updateContent = true;
            }

            $name = array_key_exists('name', $body) ? trim((string) $body['name']) : (string) ($row['name'] ?? '');
            if ($name === '') {
                Response::error('Client name is required', 400);
                return;
            }
            $sortOrder = array_key_exists('sortOrder', $body) && is_numeric($body['sortOrder'])
                ? (int) $body['sortOrder']
                : (int) ($row['sort_order'] ?? 0);
            $isEnabled = array_key_exists('isEnabled', $body)
                ? (!empty($body['isEnabled']) ? 1 : 0)
                : (int) ($row['is_enabled'] ?? 1);

            if ($updateContent) {
                Database::execute(
                    'UPDATE login_trust_logos SET name=?, image_url=?, mime_type=?, sort_order=?, is_enabled=?, image_content=?, updated_at=NOW() WHERE id=?',
                    [$name, $imageUrl, $mimeType, $sortOrder, $isEnabled, $content, $logoId]
                );
            } else {
                Database::execute(
                    'UPDATE login_trust_logos SET name=?, image_url=?, mime_type=?, sort_order=?, is_enabled=?, updated_at=NOW() WHERE id=?',
                    [$name, $imageUrl, $mimeType, $sortOrder, $isEnabled, $logoId]
                );
            }

            $rows = Database::query(
                'SELECT id, name, image_url, mime_type, sort_order, is_enabled, created_at, updated_at
                 FROM login_trust_logos WHERE id = ? LIMIT 1',
                [$logoId]
            );
            Response::success(self::mapLogo($rows[0] ?? []));
        } catch (Throwable $e) {
            error_log('AdminMediaController trustLogosPatch: ' . $e->getMessage());
            Response::error($e->getMessage(), 500);
        }
    }

    /** DELETE /admin/login-trust-logos/:id */
    public static function trustLogosDelete(?string $id = null): void
    {
        Auth::requireAdmin();
        $logoId = $id ?? '';
        if ($logoId === '') {
            Response::error('Logo id required', 400);
            return;
        }
        try {
            $rows = Database::query('SELECT image_url FROM login_trust_logos WHERE id = ? LIMIT 1', [$logoId]);
            if (!$rows) {
                Response::error('Logo not found', 404);
                return;
            }
            Database::execute('DELETE FROM login_trust_logos WHERE id = ?', [$logoId]);
            $url = (string) ($rows[0]['image_url'] ?? '');
            if (str_starts_with($url, '/uploads/login-trust-logos/')) {
                $disk = SITE_ROOT . $url;
                if (is_file($disk)) {
                    @unlink($disk);
                }
            }
            Response::success(['deleted' => true]);
        } catch (Throwable $e) {
            error_log('AdminMediaController trustLogosDelete: ' . $e->getMessage());
            Response::error($e->getMessage(), 500);
        }
    }
}
