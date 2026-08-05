<?php
final class AuthController
{
    public static function login(): void
    {
        $body = Auth::jsonBody();
        $email = strtolower(trim((string) ($body['email'] ?? '')));
        $password = (string) ($body['password'] ?? '');
        if ($email === '' || $password === '') {
            Response::error('Email and password required');
        }

        $rows = Database::query('SELECT * FROM users WHERE email = ? LIMIT 1', [$email]);
        $user = $rows[0] ?? null;
        if (!$user || !(int) ($user['is_active'] ?? 0)) {
            self::audit(null, $email, null, 'auth.login_failed', ['reason' => 'invalid_credentials']);
            Response::error('Invalid credentials', 401);
        }

        $hash = (string) ($user['password_hash'] ?? '');
        if (!self::verifyPassword($password, $hash)) {
            self::audit($user['id'], $user['email'], $user['tenant_id'] ?? null, 'auth.login_failed', ['reason' => 'wrong_password']);
            Response::error('Invalid credentials', 401);
        }

        $tenantSlug = null;
        $tenantName = null;
        $role = (string) $user['role'];
        if (!empty($user['tenant_id']) && !Auth::isSystemRole($role)) {
            $tenants = Database::query(
                'SELECT status, is_active, name, slug FROM tenants WHERE id = ? LIMIT 1',
                [$user['tenant_id']]
            );
            $tenant = $tenants[0] ?? null;
            if (!$tenant || !(int) ($tenant['is_active'] ?? 0) || ($tenant['status'] ?? '') === 'draft') {
                Response::error(
                    'Your organization is not yet active. Please contact your MAMS administrator to complete setup.',
                    403
                );
            }
            $tenantSlug = $tenant['slug'];
            $tenantName = $tenant['name'];
        }

        Database::execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [$user['id']]);
        self::audit($user['id'], $user['email'], $user['tenant_id'] ?? null, 'auth.login_success');

        $token = Jwt::encode([
            'sub' => $user['id'],
            'id' => $user['id'],
            'email' => $user['email'],
            'fullName' => $user['full_name'],
            'role' => $user['role'],
            'tenantId' => $user['tenant_id'],
            'isActive' => (bool) $user['is_active'],
        ]);

        Response::success([
            'token' => $token,
            'user' => [
                'id' => $user['id'],
                'email' => $user['email'],
                'fullName' => $user['full_name'],
                'role' => $user['role'],
                'tenantId' => $user['tenant_id'],
                'isActive' => (bool) $user['is_active'],
                'termsAcceptedAt' => $user['terms_accepted_at'],
            ],
            'tenantSlug' => $tenantSlug,
            'tenantName' => $tenantName,
        ]);
    }

    public static function me(): void
    {
        $u = Auth::requireAuth();
        Response::success(['user' => $u]);
    }

    public static function changePassword(): void
    {
        $u = Auth::requireAuth();
        $body = Auth::jsonBody();
        $current = (string) ($body['currentPassword'] ?? '');
        $next = (string) ($body['newPassword'] ?? '');
        if (strlen($next) < 8) {
            Response::error('Password must be at least 8 characters');
        }
        $rows = Database::query('SELECT password_hash FROM users WHERE id = ?', [$u['id']]);
        $hash = (string) ($rows[0]['password_hash'] ?? '');
        if (!self::verifyPassword($current, $hash)) {
            Response::error('Current password is incorrect', 401);
        }
        $newHash = password_hash($next, PASSWORD_BCRYPT);
        Database::execute('UPDATE users SET password_hash = ? WHERE id = ?', [$newHash, $u['id']]);
        Response::success(['ok' => true]);
    }

    public static function acceptTerms(): void
    {
        $u = Auth::requireAuth();
        Database::execute('UPDATE users SET terms_accepted_at = NOW() WHERE id = ?', [$u['id']]);
        Response::success(['ok' => true, 'termsAcceptedAt' => date('c')]);
    }

    public static function forgotPassword(): void
    {
        $body = Auth::jsonBody();
        $email = strtolower(trim((string) ($body['email'] ?? '')));
        if ($email === '') {
            Response::error('Email required');
        }
        $rows = Database::query('SELECT id, email FROM users WHERE email = ? AND is_active = 1', [$email]);
        if (!$rows) {
            Response::success(['ok' => true, 'message' => 'If the account exists, a reset token was issued.']);
        }
        $token = Jwt::encode([
            'purpose' => 'password_reset',
            'id' => $rows[0]['id'],
            'email' => $rows[0]['email'],
        ], 900);
        Response::success([
            'ok' => true,
            'resetToken' => $token,
            'message' => 'Password reset token issued (deliver via email in production).',
        ]);
    }

    public static function resetPassword(): void
    {
        $body = Auth::jsonBody();
        $token = (string) ($body['token'] ?? '');
        $next = (string) ($body['newPassword'] ?? '');
        if (strlen($next) < 8) {
            Response::error('Password must be at least 8 characters');
        }
        try {
            $payload = Jwt::decode($token);
        } catch (Throwable $e) {
            Response::error('Invalid or expired reset token', 401);
        }
        if (($payload['purpose'] ?? '') !== 'password_reset') {
            Response::error('Invalid reset token', 401);
        }
        $id = $payload['id'] ?? null;
        if (!$id) {
            Response::error('Invalid reset token', 401);
        }
        $hash = password_hash($next, PASSWORD_BCRYPT);
        Database::execute('UPDATE users SET password_hash = ? WHERE id = ?', [$hash, $id]);
        Response::success(['ok' => true]);
    }

    /**
     * Node bcryptjs stores $2a$ / $2b$ hashes. PHP password_verify reliably accepts $2y$/$2a$;
     * normalize $2b$ → $2y$ (and try sibling prefixes) so Hostinger/live dumps authenticate.
     */
    private static function verifyPassword(string $password, string $hash): bool
    {
        if ($password === '' || $hash === '') {
            return false;
        }
        if (password_verify($password, $hash)) {
            return true;
        }
        $variants = array_unique([
            $hash,
            preg_replace('/^\$2b\$/', '$2y$', $hash) ?: $hash,
            preg_replace('/^\$2b\$/', '$2a$', $hash) ?: $hash,
            preg_replace('/^\$2a\$/', '$2y$', $hash) ?: $hash,
            preg_replace('/^\$2y\$/', '$2a$', $hash) ?: $hash,
        ]);
        foreach ($variants as $candidate) {
            if (is_string($candidate) && $candidate !== '' && @password_verify($password, $candidate)) {
                return true;
            }
        }
        return false;
    }

    private static function audit(?string $userId, string $email, ?string $tenantId, string $action, array $details = []): void
    {
        try {
            Database::execute(
                'INSERT INTO audit_logs (id, user_id, user_email, tenant_id, action, resource_type, resource_id, details, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())',
                [
                    self::uuid(),
                    $userId,
                    $email,
                    $tenantId,
                    $action,
                    'user',
                    $userId,
                    $details ? json_encode($details) : null,
                ]
            );
        } catch (Throwable $e) {
            // non-fatal
        }
    }

    private static function uuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
}
