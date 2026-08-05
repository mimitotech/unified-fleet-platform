<?php

require_once __DIR__ . '/../../lib/Database.php';
require_once __DIR__ . '/../../lib/Response.php';

class PublicController
{
    /** GET /public/login-slides */
    public static function loginSlides(): void
    {
        try {
            $rows = Database::query(
                'SELECT id, title, details, eyebrow, image_url, sort_order
                 FROM login_slides
                 WHERE is_enabled = 1
                 ORDER BY sort_order ASC, created_at ASC'
            );

            $slides = [];
            foreach ($rows as $row) {
                $slides[] = [
                    'id' => (string) ($row['id'] ?? ''),
                    'title' => (string) ($row['title'] ?? ''),
                    'details' => $row['details'] ?? null,
                    'eyebrow' => $row['eyebrow'] ?? null,
                    'imageUrl' => $row['image_url'] ?? null,
                    'sortOrder' => (int) ($row['sort_order'] ?? 0),
                ];
            }

            Response::success(['slides' => $slides]);
        } catch (Throwable $e) {
            error_log('PublicController loginSlides: ' . $e->getMessage());
            Response::error($e->getMessage(), 500);
        }
    }

    /** GET /public/login-trust-logos */
    public static function loginTrustLogos(): void
    {
        try {
            $rows = Database::query(
                'SELECT id, name, image_url, sort_order
                 FROM login_trust_logos
                 WHERE is_enabled = 1
                 ORDER BY sort_order ASC, created_at ASC'
            );

            $logos = [];
            foreach ($rows as $row) {
                $logos[] = [
                    'id' => (string) ($row['id'] ?? ''),
                    'name' => (string) ($row['name'] ?? ''),
                    'imageUrl' => $row['image_url'] ?? null,
                    'sortOrder' => (int) ($row['sort_order'] ?? 0),
                ];
            }

            Response::success(['logos' => $logos]);
        } catch (Throwable $e) {
            error_log('PublicController loginTrustLogos: ' . $e->getMessage());
            Response::error($e->getMessage(), 500);
        }
    }

    /** GET /public/video/:token — stream shared surveillance clip (no auth) */
    public static function videoShare(?string $token = null): void
    {
        $token = trim((string) ($token ?? ''));
        if ($token === '') {
            http_response_code(400);
            header('Content-Type: text/plain');
            echo 'token required';
            exit;
        }
        require_once __DIR__ . '/../../lib/VideoShare.php';
        require_once __DIR__ . '/../../lib/WialonVideo.php';
        $link = VideoShare::resolve($token);
        if (!$link) {
            http_response_code(404);
            header('Content-Type: text/plain');
            echo 'Link expired or not found';
            exit;
        }
        $ref = $link['clipRef'];
        $tenantId = $link['tenantId'];
        $unitId = (int) ($ref['unitId'] ?? 0);
        try {
            if (($ref['source'] ?? '') === 'message') {
                $mid = (int) ($ref['messageId'] ?? 0);
                $file = WialonVideo::readMessageVideoFile($tenantId, $unitId, $mid);
            } else {
                $path = (string) ($ref['path'] ?? '');
                $storage = (int) ($ref['storageType'] ?? 2);
                $file = WialonVideo::readStorageFile($tenantId, $unitId, $storage, $path);
            }
            http_response_code(200);
            header('Content-Type: ' . ($file['contentType'] ?? 'video/mp4'));
            header('Content-Length: ' . strlen($file['data']));
            header('Cache-Control: private, max-age=60');
            header('Content-Disposition: inline; filename="' . str_replace('"', '', $file['fileName'] ?? 'clip.mp4') . '"');
            echo $file['data'];
            exit;
        } catch (Throwable $e) {
            http_response_code(502);
            header('Content-Type: text/plain');
            echo $e->getMessage();
            exit;
        }
    }
}
