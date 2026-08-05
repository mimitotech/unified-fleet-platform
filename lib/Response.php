<?php
/**
 * API response envelope — matches platform/backend utils/response.ts
 * { success: true, data } | { success: false, error, data: null }
 */
final class Response
{
    public static function json(mixed $data, int $code = 200): void
    {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        exit;
    }

    public static function success(mixed $data, int $code = 200): void
    {
        self::json(['success' => true, 'data' => $data, 'error' => null], $code);
    }

    public static function error(string $message, int $code = 400): void
    {
        self::json(['success' => false, 'data' => null, 'error' => $message], $code);
    }
}
