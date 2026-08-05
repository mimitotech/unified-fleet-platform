<?php
final class Auth
{
    private static ?array $user = null;

    public static function isSystemRole(?string $role): bool
    {
        return in_array($role, ['super_admin', 'platform_admin'], true);
    }

    public static function canAccessAdmin(?string $role): bool
    {
        return self::isSystemRole($role);
    }

    public static function bearerToken(): ?string
    {
        // Prefer Authorization header (what the SPA always sends).
        // Cookie is a fallback when cPanel/Apache strips Authorization on refresh/subrequests.
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if ($header === '') {
            $env = getenv('HTTP_AUTHORIZATION') ?: getenv('REDIRECT_HTTP_AUTHORIZATION');
            $header = is_string($env) ? $env : '';
        }
        if (preg_match('/Bearer\s+(\S+)/i', $header, $m)) {
            return $m[1];
        }

        $cookie = $_COOKIE['ufp_token'] ?? null;
        if (is_string($cookie) && $cookie !== '') {
            return $cookie;
        }

        return null;
    }

    public static function user(): ?array
    {
        if (self::$user !== null) {
            return self::$user;
        }
        $token = self::bearerToken();
        if (!$token) {
            return null;
        }
        try {
            $payload = Jwt::decode($token);
            $id = $payload['id'] ?? $payload['sub'] ?? null;
            if (!$id) {
                return null;
            }
            $rows = Database::query(
                'SELECT id, email, full_name, role, tenant_id, is_active, terms_accepted_at
                 FROM users WHERE id = ? LIMIT 1',
                [$id]
            );
            if (!$rows || !(int) ($rows[0]['is_active'] ?? 0)) {
                return null;
            }
            $u = $rows[0];
            self::$user = [
                'id' => $u['id'],
                'email' => $u['email'],
                'fullName' => $u['full_name'],
                'role' => $u['role'],
                'tenantId' => $u['tenant_id'],
                'isActive' => (bool) $u['is_active'],
                'termsAcceptedAt' => $u['terms_accepted_at'],
            ];
            return self::$user;
        } catch (Throwable $e) {
            return null;
        }
    }

    public static function requireAuth(): array
    {
        $u = self::user();
        if (!$u) {
            Response::error('Unauthorized', 401);
        }
        return $u;
    }

    public static function requireAdmin(): array
    {
        $u = self::requireAuth();
        if (!self::canAccessAdmin($u['role'] ?? null)) {
            Response::error('Forbidden', 403);
        }
        return $u;
    }

    public static function jsonBody(): array
    {
        $raw = file_get_contents('php://input') ?: '';
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }
}
