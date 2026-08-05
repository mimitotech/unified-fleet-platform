<?php
/**
 * AES-256-GCM credential encryption — parity with platform/backend encryption.ts
 */
final class Crypto
{
    private static function key(): string
    {
        $raw = Env::get('ENCRYPTION_KEY', 'dev-encryption-key-32chars!!!!!!');
        return hash('sha256', (string) $raw, true);
    }

    /** @param array<string, mixed> $data */
    public static function encrypt(array $data): string
    {
        $iv = random_bytes(12);
        $tag = '';
        $json = json_encode($data, JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw new RuntimeException('Failed to encode credentials');
        }
        $enc = openssl_encrypt($json, 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag, '', 16);
        if ($enc === false) {
            throw new RuntimeException('Failed to encrypt credentials');
        }
        return base64_encode($iv . $tag . $enc);
    }

    /** @return array<string, mixed> */
    public static function decrypt(string $encrypted): array
    {
        if ($encrypted === '') {
            return [];
        }
        $buf = base64_decode($encrypted, true);
        if ($buf === false || strlen($buf) < 28) {
            throw new RuntimeException('Stored credentials could not be decrypted — ENCRYPTION_KEY may have changed.');
        }
        $iv = substr($buf, 0, 12);
        $tag = substr($buf, 12, 16);
        $data = substr($buf, 28);
        $dec = openssl_decrypt($data, 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag);
        if ($dec === false) {
            throw new RuntimeException(
                'Stored credentials could not be decrypted — ENCRYPTION_KEY may have changed. Re-save integrations in Admin.'
            );
        }
        $parsed = json_decode($dec, true);
        return is_array($parsed) ? $parsed : [];
    }
}
