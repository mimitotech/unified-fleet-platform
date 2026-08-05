<?php
/**
 * File-backed live stream + HLS segment token cache (parity with wialonStreamCache.ts).
 * In-process maps alone fail across PHP-FPM workers.
 */
final class WialonStreamCache
{
    private const TTL = 300; // seconds

    private static function storePath(): string
    {
        $dir = sys_get_temp_dir() . '/mams_wialon_streams';
        if (!is_dir($dir)) {
            @mkdir($dir, 0700, true);
        }
        return $dir . '/cache.json';
    }

    /** @return array{streams:array,byToken:array,proxy:array} */
    private static function load(): array
    {
        $path = self::storePath();
        if (!is_file($path)) {
            return ['streams' => [], 'byToken' => [], 'proxy' => []];
        }
        $raw = @file_get_contents($path);
        $data = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($data)) {
            return ['streams' => [], 'byToken' => [], 'proxy' => []];
        }
        $now = time();
        foreach (['streams', 'byToken', 'proxy'] as $bucket) {
            if (!isset($data[$bucket]) || !is_array($data[$bucket])) {
                $data[$bucket] = [];
                continue;
            }
            foreach ($data[$bucket] as $k => $entry) {
                if (!is_array($entry) || (int) ($entry['expiresAt'] ?? 0) < $now) {
                    unset($data[$bucket][$k]);
                }
            }
        }
        return [
            'streams' => $data['streams'],
            'byToken' => $data['byToken'],
            'proxy' => $data['proxy'],
        ];
    }

    /** @param array{streams:array,byToken:array,proxy:array} $data */
    private static function save(array $data): void
    {
        $path = self::storePath();
        $fp = @fopen($path, 'c+');
        if (!$fp) {
            return;
        }
        try {
            flock($fp, LOCK_EX);
            ftruncate($fp, 0);
            rewind($fp);
            fwrite($fp, json_encode($data, JSON_UNESCAPED_SLASHES));
            fflush($fp);
            flock($fp, LOCK_UN);
        } finally {
            fclose($fp);
        }
    }

    private static function key(string $tenantId, int $unitId, int $channel): string
    {
        return $tenantId . ':' . $unitId . ':' . $channel;
    }

    public static function setStreamUpstream(
        string $tenantId,
        int $unitId,
        int $channel,
        string $upstreamUrl,
        ?string $contentType = null
    ): string {
        $data = self::load();
        $key = self::key($tenantId, $unitId, $channel);
        $token = bin2hex(random_bytes(16));
        $expires = time() + self::TTL;
        // Drop previous token for this stream key
        if (isset($data['streams'][$key]['accessToken'])) {
            unset($data['byToken'][$data['streams'][$key]['accessToken']]);
        }
        $data['streams'][$key] = [
            'tenantId' => $tenantId,
            'unitId' => $unitId,
            'channel' => $channel,
            'upstreamUrl' => $upstreamUrl,
            'contentType' => $contentType,
            'expiresAt' => $expires,
            'accessToken' => $token,
        ];
        $data['byToken'][$token] = ['key' => $key, 'expiresAt' => $expires];
        self::save($data);
        return $token;
    }

    /** @return array<string, mixed>|null */
    public static function getStreamUpstream(string $tenantId, int $unitId, int $channel): ?array
    {
        $data = self::load();
        $key = self::key($tenantId, $unitId, $channel);
        $entry = $data['streams'][$key] ?? null;
        return is_array($entry) ? $entry : null;
    }

    /** @return array<string, mixed>|null */
    public static function getStreamByAccessToken(string $token): ?array
    {
        $data = self::load();
        $ref = $data['byToken'][$token] ?? null;
        if (!is_array($ref)) {
            return null;
        }
        $entry = $data['streams'][$ref['key'] ?? ''] ?? null;
        return is_array($entry) ? $entry : null;
    }

    public static function registerProxyUrl(string $url): string
    {
        $data = self::load();
        $token = bin2hex(random_bytes(12));
        $data['proxy'][$token] = ['url' => $url, 'expiresAt' => time() + self::TTL];
        self::save($data);
        return $token;
    }

    public static function resolveProxyToken(string $token): ?string
    {
        $data = self::load();
        $entry = $data['proxy'][$token] ?? null;
        if (!is_array($entry)) {
            return null;
        }
        return isset($entry['url']) ? (string) $entry['url'] : null;
    }

    public static function rewriteM3u8Playlist(string $playlistText, string $baseUrl, string $segmentProxyPrefix): string
    {
        $lines = explode("\n", $playlistText);
        $out = [];
        foreach ($lines as $line) {
            $trimmed = trim($line);
            if ($trimmed === '') {
                $out[] = $line;
                continue;
            }
            if (str_starts_with($trimmed, '#')) {
                $out[] = preg_replace_callback('/URI="([^"]+)"/', static function (array $m) use ($baseUrl, $segmentProxyPrefix): string {
                    $abs = self::resolveAgainst($baseUrl, $m[1]);
                    $token = self::registerProxyUrl($abs);
                    return 'URI="' . $segmentProxyPrefix . $token . '"';
                }, $trimmed) ?? $trimmed;
                continue;
            }
            $abs = self::resolveAgainst($baseUrl, $trimmed);
            $token = self::registerProxyUrl($abs);
            $out[] = $segmentProxyPrefix . $token;
        }
        return implode("\n", $out);
    }

    public static function resolveAgainst(string $base, string $ref): string
    {
        if (preg_match('#^https?://#i', $ref)) {
            return $ref;
        }
        if (str_starts_with($ref, '//')) {
            return 'https:' . $ref;
        }
        $parts = parse_url($base);
        if (!$parts || empty($parts['scheme']) || empty($parts['host'])) {
            return $ref;
        }
        $port = isset($parts['port']) ? (':' . $parts['port']) : '';
        if (str_starts_with($ref, '/')) {
            return $parts['scheme'] . '://' . $parts['host'] . $port . $ref;
        }
        $path = $parts['path'] ?? '/';
        $dir = preg_replace('#/[^/]*$#', '/', $path) ?: '/';
        return $parts['scheme'] . '://' . $parts['host'] . $port . $dir . $ref;
    }

    /**
     * @return array{body:string,contentType:string,status:int}
     */
    public static function fetchUpstream(string $url, ?string $range = null): array
    {
        if (!function_exists('curl_init')) {
            $ctx = stream_context_create([
                'http' => [
                    'method' => 'GET',
                    'timeout' => 30,
                    'header' => $range ? ("Range: {$range}\r\n") : '',
                ],
            ]);
            $body = @file_get_contents($url, false, $ctx);
            if ($body === false) {
                throw new RuntimeException('Upstream fetch failed');
            }
            return ['body' => $body, 'contentType' => 'application/octet-stream', 'status' => 200];
        }

        $ch = curl_init($url);
        $headers = [];
        if ($range) {
            $headers[] = 'Range: ' . $range;
        }
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 45,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_USERAGENT => 'MAMS-PHP-HLSProxy/1.0',
            CURLOPT_HEADER => true,
        ]);
        $raw = curl_exec($ch);
        $err = curl_error($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        curl_close($ch);
        if ($raw === false) {
            throw new RuntimeException('Upstream fetch failed: ' . ($err ?: 'unknown'));
        }
        $headerBlob = substr($raw, 0, $headerSize);
        $body = substr($raw, $headerSize);
        $contentType = 'application/octet-stream';
        if (preg_match('/^Content-Type:\s*(.+)$/mi', $headerBlob, $m)) {
            $contentType = trim($m[1]);
        }
        return ['body' => $body, 'contentType' => $contentType, 'status' => $status > 0 ? $status : 200];
    }
}
