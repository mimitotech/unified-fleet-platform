<?php
/**
 * Harvest fired Wialon events into MySQL alerts (Inbox).
 * Parity: platform/backend services/wialonAlertHarvest.ts (simplified).
 *
 * Paths:
 *  - Triggered notification messages (flag 0x4000)
 *  - Unit event messages (flag 0x0600)
 */
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/TenantWialon.php';
require_once __DIR__ . '/WialonClient.php';
require_once __DIR__ . '/WialonFleet.php';

final class AlertHarvest
{
    private const FLAG_EVENT = 0x0600;
    private const FLAG_TRIGGERED_NF = 0x4000;
    private const FLAG_TYPE_MASK = 0xFF00;
    private const UNIT_BATCH = 35;
    private const LOOKBACK_SEC = 7200;

    /** @return array{tenants:int,inserted:int,errors:int} */
    public static function harvestAllConnected(): array
    {
        $tenants = 0;
        $inserted = 0;
        $errors = 0;
        try {
            $rows = Database::query(
                "SELECT DISTINCT tenant_id FROM data_sources
                 WHERE source_type = 'wialon' AND is_active = 1
                   AND connection_verified_at IS NOT NULL
                   AND wialon_resource_id IS NOT NULL AND wialon_resource_id > 0"
            );
        } catch (Throwable $e) {
            error_log('AlertHarvest list tenants: ' . $e->getMessage());
            return ['tenants' => 0, 'inserted' => 0, 'errors' => 1];
        }

        foreach ($rows as $row) {
            $tid = (string) ($row['tenant_id'] ?? '');
            if ($tid === '') {
                continue;
            }
            $tenants++;
            try {
                $inserted += self::harvestTenant($tid);
            } catch (Throwable $e) {
                $errors++;
                error_log("AlertHarvest tenant {$tid}: " . $e->getMessage());
            }
        }
        return ['tenants' => $tenants, 'inserted' => $inserted, 'errors' => $errors];
    }

    public static function harvestTenant(string $tenantId): int
    {
        $creds = TenantWialon::loadCreds($tenantId);
        $live = WialonFleet::tryLiveSnapshot($tenantId);
        $units = [];
        if ($live && !empty($live['units'])) {
            foreach ($live['units'] as $u) {
                $id = (int) ($u['wialonId'] ?? $u['id'] ?? 0);
                if ($id > 0) {
                    $units[] = [
                        'id' => $id,
                        'name' => (string) ($u['name'] ?? ('Unit ' . $id)),
                    ];
                }
            }
        }
        if (!$units) {
            return 0;
        }

        // Rotate through units so cron cycles cover the fleet
        $cursorFile = sys_get_temp_dir() . '/mams_alert_cursor_' . md5($tenantId) . '.txt';
        $offset = is_file($cursorFile) ? (int) @file_get_contents($cursorFile) : 0;
        if ($offset < 0 || $offset >= count($units)) {
            $offset = 0;
        }
        $batch = array_slice($units, $offset, self::UNIT_BATCH);
        if (count($batch) < self::UNIT_BATCH && $offset > 0) {
            $batch = array_merge($batch, array_slice($units, 0, self::UNIT_BATCH - count($batch)));
        }
        $next = ($offset + self::UNIT_BATCH) % max(1, count($units));
        @file_put_contents($cursorFile, (string) $next);

        $to = time();
        $from = $to - self::LOOKBACK_SEC;
        $client = new WialonClient($creds['baseUrl'] ?? null);
        $inserted = 0;
        try {
            $client->login($creds['token'], $creds['operateAs'] ?? null);
            foreach ($batch as $unit) {
                $inserted += self::scanUnit($tenantId, $client, $unit['id'], $unit['name'], $from, $to);
            }
        } finally {
            $client->logout();
        }
        return $inserted;
    }

    /**
     * @return int inserted count
     */
    private static function scanUnit(
        string $tenantId,
        WialonClient $client,
        int $unitId,
        string $unitName,
        int $from,
        int $to
    ): int {
        $inserted = 0;
        foreach ([self::FLAG_TRIGGERED_NF, self::FLAG_EVENT] as $flags) {
            try {
                $client->call('messages/load_interval', [
                    'itemId' => $unitId,
                    'timeFrom' => $from,
                    'timeTo' => $to,
                    'flags' => $flags,
                    'flagsMask' => self::FLAG_TYPE_MASK,
                    'loadCount' => 100,
                ]);
                $res = $client->call('messages/get_messages', [
                    'indexFrom' => 0,
                    'indexTo' => 99,
                ]);
                $msgs = is_array($res['messages'] ?? null) ? $res['messages'] : (is_array($res) ? $res : []);
                foreach ($msgs as $msg) {
                    if (!is_array($msg)) {
                        continue;
                    }
                    if (self::insertFromMessage($tenantId, $unitId, $unitName, $msg, $flags)) {
                        $inserted++;
                    }
                }
            } catch (Throwable $e) {
                // unit may lack history rights — skip
            }
        }
        return $inserted;
    }

    /**
     * @param array<string, mixed> $msg
     */
    private static function insertFromMessage(
        string $tenantId,
        int $unitId,
        string $unitName,
        array $msg,
        int $flags
    ): bool {
        $t = (int) ($msg['t'] ?? 0);
        if ($t <= 0) {
            return false;
        }
        $p = is_array($msg['p'] ?? null) ? $msg['p'] : [];
        $text = (string) ($p['text'] ?? $p['et'] ?? $msg['et'] ?? '');
        $n = (string) ($p['n'] ?? $msg['n'] ?? '');
        $title = trim($n !== '' ? $n : ($text !== '' ? $text : 'Unit event'));
        if ($title === '' || self::isNoise($title)) {
            return false;
        }
        $type = self::classifyType($title . ' ' . $text);
        $severity = self::severityFor($type);
        $externalId = 'wialon:' . $unitId . ':' . $t . ':' . substr(md5($title . $flags), 0, 8);

        try {
            $exists = Database::query(
                'SELECT id FROM alerts WHERE tenant_id = ? AND external_id = ? LIMIT 1',
                [$tenantId, $externalId]
            );
            if ($exists) {
                return false;
            }
        } catch (Throwable $e) {
            return false;
        }

        $lat = isset($msg['pos']['y']) ? (float) $msg['pos']['y'] : (isset($p['y']) ? (float) $p['y'] : null);
        $lng = isset($msg['pos']['x']) ? (float) $msg['pos']['x'] : (isset($p['x']) ? (float) $p['x'] : null);
        $desc = $text !== '' && $text !== $title ? $text : ('Unit: ' . $unitName);
        $id = self::uuid();
        $occurred = gmdate('Y-m-d H:i:s', $t);

        try {
            Database::execute(
                'INSERT INTO alerts
                   (id, tenant_id, asset_id, source_type, external_id, type, severity, title, description,
                    latitude, longitude, acknowledged, occurred_at, created_at)
                 VALUES (?, ?, NULL, \'wialon\', ?, ?, ?, ?, ?, ?, ?, 0, ?, NOW())',
                [$id, $tenantId, $externalId, $type, $severity, $title, $desc, $lat, $lng, $occurred]
            );
            return true;
        } catch (Throwable $e) {
            error_log('AlertHarvest insert: ' . $e->getMessage());
            return false;
        }
    }

    private static function isNoise(string $title): bool
    {
        $t = strtolower($title);
        return (bool) preg_match('/\b(ping|keepalive|test message|debug)\b/', $t);
    }

    private static function classifyType(string $raw): string
    {
        $t = strtolower($raw);
        if (preg_match('/fuel|fill|drain|theft|tank/', $t)) {
            return 'fuel';
        }
        if (preg_match('/geofence|zone|route/', $t)) {
            return 'geofence';
        }
        if (preg_match('/speed|harsh|eco|oversped/', $t)) {
            return 'driving';
        }
        if (preg_match('/battery|power|voltage|ignition/', $t)) {
            return 'power';
        }
        if (preg_match('/engine|rpm/', $t)) {
            return 'engine';
        }
        if (preg_match('/sensor|temp|door/', $t)) {
            return 'sensors';
        }
        return 'notification';
    }

    private static function severityFor(string $type): string
    {
        return match ($type) {
            'fuel', 'power' => 'warning',
            'driving', 'geofence' => 'warning',
            'engine' => 'critical',
            default => 'info',
        };
    }

    private static function uuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }
}
