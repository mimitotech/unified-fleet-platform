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
}
