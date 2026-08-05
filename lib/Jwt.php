<?php
/** Minimal HS256 JWT (no Composer). */
final class Jwt
{
    public static function encode(array $payload, int $ttlSeconds = 604800): string
    {
        $header = ['typ' => 'JWT', 'alg' => 'HS256'];
        $now = time();
        $payload = array_merge($payload, [
            'iat' => $now,
            'exp' => $now + $ttlSeconds,
        ]);
        $segments = [
            self::b64(json_encode($header, JSON_UNESCAPED_SLASHES)),
            self::b64(json_encode($payload, JSON_UNESCAPED_SLASHES)),
        ];
        $signing = implode('.', $segments);
        $segments[] = self::b64(hash_hmac('sha256', $signing, self::secret(), true));
        return implode('.', $segments);
    }

    public static function decode(string $token): array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            throw new RuntimeException('Invalid token');
        }
        [$h, $p, $s] = $parts;
        $check = self::b64(hash_hmac('sha256', "$h.$p", self::secret(), true));
        if (!hash_equals($check, $s)) {
            throw new RuntimeException('Invalid token signature');
        }
        $payload = json_decode(self::ub64($p), true);
        if (!is_array($payload)) {
            throw new RuntimeException('Invalid token payload');
        }
        if (($payload['exp'] ?? 0) < time()) {
            throw new RuntimeException('Token expired');
        }
        return $payload;
    }

    private static function secret(): string
    {
        $s = Env::get('JWT_SECRET');
        if (!$s) {
            throw new RuntimeException('JWT_SECRET not set');
        }
        return $s;
    }

    private static function b64(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function ub64(string $data): string
    {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $data .= str_repeat('=', 4 - $remainder);
        }
        return base64_decode(strtr($data, '-_', '+/'), true) ?: '';
    }
}
