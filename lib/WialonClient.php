<?php
/**
 * Minimal Wialon AJAX client — parity with platform/backend wialonClient.ts
 */
final class WialonClient
{
    private string $baseUrl;
    private ?string $sid = null;
    private ?array $user = null;

    public function __construct(?string $baseUrl = null)
    {
        $this->baseUrl = $baseUrl && $baseUrl !== ''
            ? rtrim($baseUrl, '?&')
            : 'https://hst-api.wialon.com/wialon/ajax.html';
    }

    public function sid(): ?string
    {
        return $this->sid;
    }

    /** @return array<string, mixed>|null */
    public function user(): ?array
    {
        return $this->user;
    }

    /**
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    public function call(string $svc, array $params = [], bool $withSid = true): array
    {
        $query = [
            'svc' => $svc,
            'params' => json_encode($params, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        ];
        if ($withSid && $this->sid) {
            $query['sid'] = $this->sid;
        }

        $url = $this->baseUrl . (str_contains($this->baseUrl, '?') ? '&' : '?') . http_build_query($query);
        $json = $this->httpGet($url);
        $data = json_decode($json, true);
        if (!is_array($data)) {
            throw new RuntimeException('Invalid Wialon response');
        }
        if (isset($data['error']) && (int) $data['error'] !== 0) {
            $code = (int) $data['error'];
            $reason = isset($data['reason']) ? (string) $data['reason'] : '';
            throw new RuntimeException($this->errorMessage($code, $reason));
        }
        return $data;
    }

    /** @return array{eid:string,user:array<string,mixed>} */
    public function login(string $token, ?string $operateAs = null): array
    {
        $params = ['token' => $token];
        if ($operateAs !== null && $operateAs !== '') {
            $params['operateAs'] = $operateAs;
        }
        $data = $this->call('token/login', $params, false);
        $eid = (string) ($data['eid'] ?? '');
        if ($eid === '') {
            throw new RuntimeException('Wialon login did not return a session id');
        }
        $this->sid = $eid;
        $this->user = is_array($data['user'] ?? null) ? $data['user'] : [];

        try {
            $this->call('core/set_session_property', [
                'prop_name' => 'skip_nonactive_items',
                'prop_value' => 1,
            ]);
        } catch (Throwable $e) {
            // optional
        }

        return ['eid' => $eid, 'user' => $this->user];
    }

    public function logout(): void
    {
        if (!$this->sid) {
            return;
        }
        try {
            $this->call('core/logout', []);
        } catch (Throwable $e) {
            // ignore
        }
        $this->sid = null;
        $this->user = null;
    }

    private function httpGet(string $url): string
    {
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 45,
                CURLOPT_CONNECTTIMEOUT => 15,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_USERAGENT => 'MAMS-PHP-WialonClient/1.0',
            ]);
            $body = curl_exec($ch);
            $err = curl_error($ch);
            $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            if ($body === false) {
                throw new RuntimeException('Wialon HTTP error: ' . ($err ?: 'request failed'));
            }
            if ($code >= 400) {
                throw new RuntimeException('Wialon HTTP status ' . $code);
            }
            return (string) $body;
        }

        $ctx = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => 45,
                'header' => "User-Agent: MAMS-PHP-WialonClient/1.0\r\n",
            ],
        ]);
        $body = @file_get_contents($url, false, $ctx);
        if ($body === false) {
            throw new RuntimeException('Wialon HTTP request failed (allow_url_fopen/curl unavailable)');
        }
        return $body;
    }

    private function errorMessage(int $code, string $reason): string
    {
        $map = [
            1 => 'Invalid session',
            2 => 'Invalid service',
            3 => 'Invalid result',
            4 => 'Invalid params',
            5 => 'Error performing request',
            6 => 'Unknown error',
            7 => 'Access denied',
            8 => 'Invalid user name or password / token',
            9 => 'Authorization server unavailable',
            1003 => 'No such item',
        ];
        $base = $map[$code] ?? ('Wialon error ' . $code);
        return $reason !== '' ? ($base . ': ' . $reason) : $base;
    }
}
