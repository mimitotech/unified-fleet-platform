<?php
/**
 * Inbound LocoNav / TrackSolid webhooks → alerts table.
 * Parity: platform/backend WebhookHandler.ts
 */
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/Env.php';

final class WebhookHandler
{
    public static function verifySignature(string $signature, string $secret, string $rawBody): bool
    {
        if ($secret === '') {
            return true; // secret not configured — accept (dev / optional)
        }
        if ($signature === '') {
            return false;
        }
        $expected = hash_hmac('sha256', $rawBody, $secret);
        return hash_equals($expected, $signature);
    }

    public static function tenantIdBySlug(string $slug): ?string
    {
        $rows = Database::query('SELECT id FROM tenants WHERE slug = ? LIMIT 1', [$slug]);
        return isset($rows[0]['id']) ? (string) $rows[0]['id'] : null;
    }

    /** @param array<string, mixed> $body */
    public static function handleLocoNav(string $tenantId, array $body): array
    {
        $kind = (string) ($body['kind'] ?? $body['event_key'] ?? $body['alert_type'] ?? 'camera');
        $map = [
            'ignition' => ['type' => 'power', 'severity' => 'info', 'title' => 'Ignition event'],
            'idling' => ['type' => 'engine', 'severity' => 'warning', 'title' => 'Idling'],
            'fatigue' => ['type' => 'driving', 'severity' => 'warning', 'title' => 'Driver fatigue'],
            'overrev' => ['type' => 'engine', 'severity' => 'warning', 'title' => 'Over-rev'],
            'anti_theft' => ['type' => 'sensors', 'severity' => 'critical', 'title' => 'Anti-theft'],
            'camera' => ['type' => 'notification', 'severity' => 'info', 'title' => 'Camera event'],
        ];
        $meta = $map[$kind] ?? ['type' => 'notification', 'severity' => 'info', 'title' => ucfirst(str_replace('_', ' ', $kind))];
        $title = (string) ($body['title'] ?? $body['message'] ?? $meta['title']);
        $externalId = (string) ($body['id'] ?? $body['event_id'] ?? ('ln:' . md5(json_encode($body))));
        $assetId = self::resolveAsset($tenantId, $body);
        $ts = self::parseTs($body['timestamp'] ?? $body['time'] ?? null);
        $id = self::insertAlert(
            $tenantId,
            $assetId,
            'loconav',
            $externalId,
            $meta['type'],
            $meta['severity'],
            $title,
            isset($body['description']) ? (string) $body['description'] : null,
            isset($body['latitude']) ? (float) $body['latitude'] : (isset($body['lat']) ? (float) $body['lat'] : null),
            isset($body['longitude']) ? (float) $body['longitude'] : (isset($body['lng']) ? (float) $body['lng'] : null),
            isset($body['video_url']) ? (string) $body['video_url'] : (isset($body['videoUrl']) ? (string) $body['videoUrl'] : null),
            $ts
        );
        return ['received' => true, 'alertId' => $id];
    }

    /** @param array<string, mixed> $body */
    public static function handleTrackSolid(string $tenantId, array $body): array
    {
        $type = (string) ($body['type'] ?? 'notification');
        $severity = (string) ($body['severity'] ?? 'info');
        $title = (string) ($body['title'] ?? $body['message'] ?? 'TrackSolid alert');
        $externalId = (string) ($body['id'] ?? ('ts:' . md5(json_encode($body))));
        $assetId = null;
        if (!empty($body['asset_id'])) {
            $assetId = (string) $body['asset_id'];
        } else {
            $assetId = self::resolveAsset($tenantId, $body);
        }
        $ts = self::parseTs($body['timestamp'] ?? null);
        $id = self::insertAlert(
            $tenantId,
            $assetId,
            'tracksolid',
            $externalId,
            $type,
            $severity,
            $title,
            isset($body['description']) ? (string) $body['description'] : null,
            isset($body['latitude']) ? (float) $body['latitude'] : null,
            isset($body['longitude']) ? (float) $body['longitude'] : null,
            isset($body['video_url']) ? (string) $body['video_url'] : null,
            $ts
        );
        return ['received' => true, 'alertId' => $id];
    }

    private static function insertAlert(
        string $tenantId,
        ?string $assetId,
        string $sourceType,
        string $externalId,
        string $type,
        string $severity,
        string $title,
        ?string $description,
        ?float $lat,
        ?float $lng,
        ?string $videoUrl,
        string $occurredAt
    ): ?string {
        // Dedupe
        try {
            $exists = Database::query(
                'SELECT id FROM alerts WHERE tenant_id = ? AND source_type = ? AND external_id = ? LIMIT 1',
                [$tenantId, $sourceType, $externalId]
            );
            if ($exists) {
                return (string) $exists[0]['id'];
            }
        } catch (Throwable $e) {
        }

        $id = self::uuid();
        $cols = 'id, tenant_id, asset_id, source_type, external_id, type, severity, title, description, latitude, longitude, occurred_at, acknowledged, created_at';
        $vals = '?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW(3)';
        $params = [$id, $tenantId, $assetId, $sourceType, $externalId, $type, $severity, $title, $description, $lat, $lng, $occurredAt];
        try {
            $hasVideo = Database::query(
                "SELECT 1 FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'alerts' AND column_name = 'video_url' LIMIT 1"
            );
            if ($hasVideo) {
                $cols .= ', video_url';
                $vals .= ', ?';
                $params[] = $videoUrl;
            }
            Database::execute("INSERT INTO alerts ({$cols}) VALUES ({$vals})", $params);
            return $id;
        } catch (Throwable $e) {
            error_log('WebhookHandler insertAlert: ' . $e->getMessage());
            return null;
        }
    }

    /** @param array<string, mixed> $body */
    private static function resolveAsset(string $tenantId, array $body): ?string
    {
        $ext = (string) ($body['device_id'] ?? $body['imei'] ?? $body['unit_id'] ?? $body['asset_external_id'] ?? '');
        $name = (string) ($body['vehicle_name'] ?? $body['plate'] ?? $body['registration'] ?? '');
        try {
            if ($ext !== '') {
                $rows = Database::query(
                    "SELECT am.asset_id FROM asset_mappings am
                     INNER JOIN assets a ON a.id = am.asset_id
                     WHERE a.tenant_id = ? AND am.external_id = ? LIMIT 1",
                    [$tenantId, $ext]
                );
                if ($rows) {
                    return (string) $rows[0]['asset_id'];
                }
            }
            if ($name !== '') {
                $rows = Database::query(
                    'SELECT id FROM assets WHERE tenant_id = ? AND (name LIKE ? OR registration_plate LIKE ?) LIMIT 1',
                    [$tenantId, '%' . $name . '%', '%' . $name . '%']
                );
                if ($rows) {
                    return (string) $rows[0]['id'];
                }
            }
        } catch (Throwable $e) {
        }
        return null;
    }

    private static function parseTs(mixed $v): string
    {
        if ($v === null || $v === '') {
            return gmdate('Y-m-d H:i:s');
        }
        if (is_numeric($v)) {
            $n = (int) $v;
            if ($n > 20000000000) {
                $n = (int) floor($n / 1000);
            }
            return gmdate('Y-m-d H:i:s', $n);
        }
        $ts = strtotime((string) $v);
        return $ts ? gmdate('Y-m-d H:i:s', $ts) : gmdate('Y-m-d H:i:s');
    }

    private static function uuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }
}
