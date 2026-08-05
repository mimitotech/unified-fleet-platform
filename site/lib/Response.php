<?php
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
        self::json(['data' => $data, 'error' => null], $code);
    }

    public static function error(string $message, int $code = 400): void
    {
        self::json(['data' => null, 'error' => $message], $code);
    }
}
