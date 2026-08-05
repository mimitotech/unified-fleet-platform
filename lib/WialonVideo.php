<?php
/**
 * Wialon video unit discovery + live stream start (MVP).
 */
require_once __DIR__ . '/WialonClient.php';
require_once __DIR__ . '/TenantWialon.php';
require_once __DIR__ . '/WialonLive.php';
require_once __DIR__ . '/WialonFleet.php';
require_once __DIR__ . '/WialonStreamCache.php';

final class WialonVideo
{
    private const LIVE_CMD = '/live|stream|qlv|video.?on|camera.?on|start.?video|open.?video|real.?time|preview/i';

    /**
     * @return array<int, array<string, mixed>>
     */
    public static function listVideoUnits(string $tenantId): array
    {
        $creds = TenantWialon::loadCreds($tenantId);
        $client = new WialonClient($creds['baseUrl']);
        try {
            $client->login($creds['token'], $creds['operateAs']);

            // Prefer hosting user/get_video_units
            try {
                $raw = $client->call('user/get_video_units', []);
                $local = self::parseLocalVideoUnits($raw);
                if ($local) {
                    return $local;
                }
            } catch (Throwable $e) {
            }

            // Enrich fleet heuristics with get_video_settings where possible
            $live = WialonFleet::tryLiveSnapshot($tenantId);
            $out = [];
            $candidates = [];
            if ($live) {
                foreach ($live['units'] ?? [] as $u) {
                    if (WialonFleet::looksLikeVideoUnit($u)) {
                        $candidates[] = $u;
                    }
                }
                // Also probe a capped set of online units for video settings
                if (count($candidates) < 5) {
                    foreach (array_slice($live['units'] ?? [], 0, 40) as $u) {
                        $candidates[] = $u;
                    }
                }
            }

            $seen = [];
            foreach ($candidates as $u) {
                $id = (int) ($u['wialonId'] ?? $u['id'] ?? 0);
                if ($id <= 0 || isset($seen[$id])) {
                    continue;
                }
                $seen[$id] = true;
                $settings = null;
                try {
                    $settings = $client->call('unit/get_video_settings', ['itemId' => $id]);
                } catch (Throwable $e) {
                    if (!WialonFleet::looksLikeVideoUnit($u)) {
                        continue;
                    }
                }
                $cameras = self::parseCamerasFromSettings($settings, true);
                $active = array_values(array_filter($cameras, static fn(array $c): bool => !empty($c['active'])));
                if (!$cameras && !WialonFleet::looksLikeVideoUnit($u)) {
                    continue;
                }
                if (!$cameras) {
                    $cameras = [[
                        'index' => 0,
                        'channel' => 1,
                        'name' => 'Camera',
                        'flags' => 1,
                        'active' => true,
                        'autoSave' => false,
                    ]];
                    $active = $cameras;
                }
                $out[] = [
                    'id' => $id,
                    'wialonId' => $id,
                    'name' => (string) ($u['name'] ?? ('Unit ' . $id)),
                    'plate' => $u['plate'] ?? null,
                    'hwType' => $u['hwName'] ?? null,
                    'status' => $u['status'] ?? null,
                    'connected' => ($u['status'] ?? '') !== 'offline',
                    'cameraCount' => count($active ?: $cameras),
                    'cameras' => $active ?: $cameras,
                    'position' => $u['position'] ?? null,
                    'streamAvailable' => true,
                    'source' => 'wialon_hosting',
                ];
                if (count($out) >= 80) {
                    break;
                }
            }
            return $out;
        } finally {
            $client->logout();
        }
    }

    /**
     * @return array<string, mixed>
     */
    public static function getUnitDetail(string $tenantId, int $unitId): array
    {
        $creds = TenantWialon::loadCreds($tenantId);
        $client = new WialonClient($creds['baseUrl']);
        try {
            $client->login($creds['token'], $creds['operateAs']);

            try {
                $raw = $client->call('user/get_video_units', []);
                foreach (self::parseLocalVideoUnits($raw) as $u) {
                    if ((int) $u['id'] === $unitId) {
                        $cmds = WialonLive::getUnitCommands($tenantId, $unitId);
                        $u['commands'] = array_values(array_filter(
                            $cmds,
                            static fn(array $c): bool => (bool) preg_match('/video|camera|stream|playback|qlv|qpb|qtm|photo|mdvr|dvr|live/i', $c['name'] . ' ' . $c['label'])
                        ));
                        $u['allCameras'] = $u['cameras'];
                        return $u;
                    }
                }
            } catch (Throwable $e) {
            }

            $settings = null;
            try {
                $settings = $client->call('unit/get_video_settings', ['itemId' => $unitId]);
            } catch (Throwable $e) {
            }
            $cameras = self::parseCamerasFromSettings($settings, true);
            if (!$cameras) {
                $cameras = [[
                    'index' => 0,
                    'channel' => 1,
                    'name' => 'Camera 1',
                    'flags' => 1,
                    'active' => true,
                    'autoSave' => false,
                ]];
            }
            $active = array_values(array_filter($cameras, static fn(array $c): bool => !empty($c['active'])));
            $commands = WialonLive::getUnitCommands($tenantId, $unitId);
            $name = 'Unit ' . $unitId;
            $live = WialonFleet::tryLiveSnapshot($tenantId);
            if ($live) {
                foreach ($live['units'] ?? [] as $u) {
                    if ((int) ($u['wialonId'] ?? $u['id'] ?? 0) === $unitId) {
                        $name = (string) ($u['name'] ?? $name);
                        break;
                    }
                }
            }
            return [
                'id' => $unitId,
                'wialonId' => $unitId,
                'name' => $name,
                'cameras' => $active ?: $cameras,
                'allCameras' => $cameras,
                'cameraCount' => count($active ?: $cameras),
                'commands' => array_values(array_filter(
                    $commands,
                    static fn(array $c): bool => (bool) preg_match('/video|camera|stream|playback|qlv|qpb|qtm|photo|mdvr|dvr|live/i', $c['name'] . ' ' . $c['label'])
                )),
                'settings' => $settings,
                'streamAvailable' => true,
                'source' => 'wialon_hosting',
            ];
        } finally {
            $client->logout();
        }
    }

    /**
     * @return array{streamType:string,playbackUrl:string,channel:int,unitId:int,startedAt:string}
     */
    public static function startLiveStream(string $tenantId, int $unitId, int $channel): array
    {
        $ch = $channel > 0 ? $channel : 1;
        $upstream = self::resolveUpstreamUrl($tenantId, $unitId, $ch);
        $streamType = self::isHlsUrl($upstream) ? 'hls' : 'progressive';
        $token = WialonStreamCache::setStreamUpstream($tenantId, $unitId, $ch, $upstream);
        $suffix = $streamType === 'hls' ? 'playlist.m3u8' : 'stream';
        $path = "/api/client/surveillance/units/{$unitId}/cameras/{$ch}/live/{$suffix}";
        return [
            'streamType' => $streamType,
            'playbackUrl' => $path . '?streamToken=' . $token,
            'channel' => $ch,
            'unitId' => $unitId,
            'startedAt' => gmdate('c'),
        ];
    }

    private static function resolveUpstreamUrl(string $tenantId, int $unitId, int $channel): string
    {
        $creds = TenantWialon::loadCreds($tenantId);
        $client = new WialonClient($creds['baseUrl']);
        try {
            $login = $client->login($creds['token'], $creds['operateAs']);
            $commands = WialonLive::getUnitCommands($tenantId, $unitId);
            $liveCmd = self::pickLiveCommand($commands);
            if ($liveCmd) {
                try {
                    $client->call('unit/exec_cmd', [
                        'itemId' => $unitId,
                        'commandName' => $liveCmd['name'],
                        'linkType' => $liveCmd['linkType'] ?? '',
                        'param' => self::buildLiveCommandParam($liveCmd, $channel),
                        'timeout' => 60,
                        'flags' => 0,
                    ]);
                } catch (Throwable $e) {
                }
            }

            try {
                $raw = $client->call('user/get_video_units', []);
                $items = is_array($raw) ? (isset($raw['units']) && is_array($raw['units']) ? $raw['units'] : (array_is_list($raw) ? $raw : [])) : [];
                foreach ($items as $u) {
                    if (!is_array($u) || (int) ($u['id'] ?? 0) !== $unitId) {
                        continue;
                    }
                    $uri = (string) ($u['video_uri'] ?? '');
                    if ($uri !== '') {
                        return self::appendChannelToVideoUri($uri, $channel);
                    }
                }
            } catch (Throwable $e) {
            }

            for ($i = 0; $i < 6; $i++) {
                $fromMsg = self::findVideoUriInMessages($client, $unitId, $channel);
                if ($fromMsg) {
                    return $fromMsg;
                }
                if ($i < 5) {
                    usleep(1200000);
                }
            }

            $videoServiceUrl = $client->videoServiceUrl();
            $sid = $client->sid();
            if ($videoServiceUrl && $sid) {
                $candidates = self::buildVideoServiceLiveUrls($videoServiceUrl, $sid, $unitId, $channel);
                foreach ($candidates as $url) {
                    if (self::probeStreamUrl($url)) {
                        return $url;
                    }
                }
                return $candidates[0];
            }

            throw new RuntimeException(
                'Could not resolve a live stream URL from Wialon. Confirm video billing, camera flags, and that the unit is online.'
            );
        } finally {
            $client->logout();
        }
    }

    /**
     * @param array<int, array{name:string,label:string,type:?string,linkType:string,params:?string}> $commands
     * @return array{name:string,label:string,type:?string,linkType:string,params:?string}|null
     */
    private static function pickLiveCommand(array $commands): ?array
    {
        foreach ($commands as $c) {
            $hay = ($c['name'] ?? '') . ' ' . ($c['label'] ?? '') . ' ' . ($c['type'] ?? '');
            if (preg_match(self::LIVE_CMD, $hay)) {
                return $c;
            }
        }
        return null;
    }

    /** @param array{name:string,label:string,type:?string,linkType:string,params:?string} $command */
    private static function buildLiveCommandParam(array $command, int $channel): string
    {
        $base = trim((string) ($command['params'] ?? ''));
        $ch = (string) ($channel > 0 ? $channel : 1);
        if (str_contains($base, '{camera}')) {
            return str_ireplace('{camera}', $ch, $base);
        }
        if (str_contains($base, ',')) {
            return explode(',', $base)[0] . ',' . $ch;
        }
        if ($base !== '' && ctype_digit($base)) {
            return $ch;
        }
        if ($base !== '') {
            return $base . ',' . $ch;
        }
        return $ch;
    }

    private static function appendChannelToVideoUri(string $videoUri, int $channel): string
    {
        if ($videoUri === '' || $channel <= 0) {
            return $videoUri;
        }
        if (preg_match('/channel[=\/]|ch[=\/]/i', $videoUri)) {
            return $videoUri;
        }
        $sep = str_contains($videoUri, '?') ? '&' : '?';
        return $videoUri . $sep . 'channel=' . $channel;
    }

    /**
     * @return array<int, string>
     */
    private static function buildVideoServiceLiveUrls(string $videoServiceUrl, string $sid, int $unitId, int $channel): array
    {
        $base = rtrim($videoServiceUrl, '/');
        $q = 'sid=' . rawurlencode($sid) . '&itemId=' . $unitId . '&channel=' . $channel;
        return [
            "{$base}/live?{$q}",
            "{$base}/live/{$unitId}/{$channel}?sid=" . rawurlencode($sid),
            "{$base}/hls/{$unitId}/{$channel}/index.m3u8?sid=" . rawurlencode($sid),
            "{$base}/api/live?{$q}",
            "{$base}/stream?{$q}",
        ];
    }

    private static function findVideoUriInMessages(WialonClient $client, int $unitId, int $channel): ?string
    {
        try {
            $client->call('messages/load_last', [
                'itemId' => $unitId,
                'flags' => 0,
                'flagsMask' => 0,
                'loadCount' => 80,
            ]);
            $res = $client->call('messages/get_messages', ['indexFrom' => 0, 'indexTo' => 79]);
            $messages = is_array($res['messages'] ?? null) ? $res['messages'] : [];
            foreach ($messages as $m) {
                if (!is_array($m) || !is_array($m['p'] ?? null)) {
                    continue;
                }
                $uri = self::extractVideoUriFromParams($m['p'], $channel);
                if ($uri) {
                    return $uri;
                }
            }
        } catch (Throwable $e) {
        } finally {
            try {
                $client->call('messages/unload', []);
            } catch (Throwable $e) {
            }
        }
        return null;
    }

    /**
     * @param array<string, mixed> $params
     */
    private static function extractVideoUriFromParams(array $params, ?int $channel = null): ?string
    {
        $chRaw = $params['cha_n'] ?? $params['channel'] ?? $params['ch'] ?? $params['camera'] ?? $params['cam'] ?? null;
        $ch = is_numeric($chRaw) ? (int) $chRaw : 0;
        if ($channel !== null && $ch > 0 && $ch !== $channel) {
            return null;
        }
        foreach (['video_uri', 'video uri', 'video_url', 'video url', 'url', 'hls', 'm3u8', 'stream_url', 'stream url'] as $k) {
            if (!empty($params[$k]) && is_scalar($params[$k])) {
                $uri = trim((string) $params[$k]);
                if ($uri !== '' && (preg_match('#^https?://#i', $uri) || str_starts_with($uri, '//') || str_starts_with($uri, '/'))) {
                    return $uri;
                }
            }
        }
        return null;
    }

    private static function probeStreamUrl(string $url): bool
    {
        try {
            $res = WialonStreamCache::fetchUpstream($url, 'bytes=0-1');
            return $res['status'] === 200 || $res['status'] === 206;
        } catch (Throwable $e) {
            return false;
        }
    }

    private static function isHlsUrl(string $url): bool
    {
        return (bool) preg_match('/\.m3u8(\?|$)/i', $url) || str_contains($url, 'application/vnd.apple.mpegurl');
    }

    /**
     * @param mixed $raw
     * @return array<int, array<string, mixed>>
     */
    private static function parseLocalVideoUnits(mixed $raw): array
    {
        $items = [];
        if (is_array($raw)) {
            if (isset($raw['units']) && is_array($raw['units'])) {
                $items = $raw['units'];
            } elseif (array_is_list($raw)) {
                $items = $raw;
            }
        }
        $out = [];
        foreach ($items as $u) {
            if (!is_array($u)) {
                continue;
            }
            $id = (int) ($u['id'] ?? 0);
            if ($id <= 0) {
                continue;
            }
            $camCount = (int) ($u['cameras'] ?? 0);
            $hasUri = !empty($u['video_uri']);
            $n = max($camCount, $hasUri ? 1 : 0);
            if ($n <= 0) {
                continue;
            }
            $cameras = [];
            for ($i = 0; $i < $n; $i++) {
                $cameras[] = [
                    'index' => $i,
                    'channel' => $i + 1,
                    'name' => $n > 1 ? ('Camera ' . ($i + 1)) : 'Camera',
                    'flags' => 1,
                    'active' => true,
                    'autoSave' => false,
                ];
            }
            $out[] = [
                'id' => $id,
                'wialonId' => $id,
                'name' => (string) ($u['name'] ?? ('Unit ' . $id)),
                'uniqueId' => $u['unique_id'] ?? null,
                'hwType' => $u['hw_type'] ?? null,
                'connected' => ((int) ($u['connected'] ?? 0)) === 1,
                'cameraCount' => count($cameras),
                'cameras' => $cameras,
                'videoUri' => $u['video_uri'] ?? null,
                'streamAvailable' => true,
                'source' => 'wialon_local',
            ];
        }
        return $out;
    }

    /**
     * @param mixed $raw
     * @return array<int, array<string, mixed>>
     */
    private static function parseCamerasFromSettings(mixed $raw, bool $includeInactive = false): array
    {
        $settings = is_array($raw['settings'] ?? null) ? $raw['settings'] : [];
        if (!$settings) {
            return [];
        }
        $cameras = [];
        foreach (array_values($settings) as $i => $s) {
            if (!is_array($s)) {
                continue;
            }
            $channel = (int) ($s['channel'] ?? ($i + 1));
            $flags = (int) ($s['flags'] ?? 0);
            $cameras[] = [
                'index' => $channel - 1,
                'channel' => $channel,
                'name' => (string) ($s['name'] ?? ('Camera ' . $channel)),
                'flags' => $flags,
                'active' => ($flags & 1) === 1,
                'autoSave' => ($flags & 2) === 2,
            ];
        }
        if ($includeInactive) {
            return $cameras;
        }
        return array_values(array_filter($cameras, static fn(array $c): bool => !empty($c['active'])));
    }
}
