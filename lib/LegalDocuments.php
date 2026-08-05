<?php
/**
 * Legal document content — synced from platform/frontend/src/lib/termsOfUse.ts
 */
final class LegalDocuments
{
    private static ?array $cache = null;

    public static function version(): string
    {
        return self::data()['version'] ?? '2026-02-24';
    }

    /** @return list<array<string, mixed>> */
    public static function all(): array
    {
        return self::data()['documents'] ?? [];
    }

    public static function find(string $id): ?array
    {
        foreach (self::all() as $doc) {
            if (($doc['id'] ?? '') === $id) {
                return $doc;
            }
        }
        return null;
    }

    /** @return array{version: string, documents: list<array<string, mixed>>} */
    private static function data(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }
        $path = SITE_ROOT . '/lib/legal_documents.json';
        if (!is_file($path)) {
            self::$cache = ['version' => '2026-02-24', 'documents' => []];
            return self::$cache;
        }
        $json = json_decode((string) file_get_contents($path), true);
        self::$cache = is_array($json) ? $json : ['version' => '2026-02-24', 'documents' => []];
        return self::$cache;
    }

    public static function renderDocument(array $doc, bool $compact = false): string
    {
        $h = static fn(string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
        $out = '<article class="legal-doc' . ($compact ? ' legal-doc--compact' : '') . '">';
        $out .= '<header class="legal-doc-head">';
        $out .= '<h1>' . $h((string) ($doc['title'] ?? '')) . '</h1>';
        $out .= '<p class="legal-doc-updated">Last updated: ' . $h((string) ($doc['lastUpdated'] ?? '')) . '</p>';
        $out .= '</header><div class="legal-doc-body">';

        foreach ($doc['intro'] ?? [] as $para) {
            $out .= '<p class="legal-intro">' . $h((string) $para) . '</p>';
        }

        foreach ($doc['sections'] ?? [] as $section) {
            $out .= '<section class="legal-section">';
            $num = $section['number'] ?? '';
            $title = (string) ($section['title'] ?? '');
            $out .= '<h2>' . ($num !== '' ? $h($num) . '. ' : '') . $h($title) . '</h2>';
            foreach ($section['paragraphs'] ?? [] as $para) {
                $out .= '<p>' . $h((string) $para) . '</p>';
            }
            if (!empty($section['bullets']) && is_array($section['bullets'])) {
                $out .= '<ul>';
                foreach ($section['bullets'] as $bullet) {
                    $out .= '<li>' . $h((string) $bullet) . '</li>';
                }
                $out .= '</ul>';
            }
            if (!empty($section['note'])) {
                $out .= '<p class="legal-note">' . $h((string) $section['note']) . '</p>';
            }
            $out .= '</section>';
        }

        $out .= '</div></article>';
        return $out;
    }

    public static function renderFooterLinks(): string
    {
        return '<div class="legal-footer-links">'
            . '<a href="/terms-of-use">Terms of Use</a>'
            . '<a href="/privacy-policy">Privacy Policy</a>'
            . '<a href="/auth/login" class="legal-footer-signin">Sign In</a>'
            . '</div>';
    }
}
