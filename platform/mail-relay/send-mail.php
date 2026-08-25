#!/usr/bin/env php
<?php
/**
 * MAMS outbound mail relay — PHPMailer over Hostinger SMTP.
 * Invoked by the Node backend: echo JSON | php send-mail.php
 *
 * Env (same as Node): SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER,
 * SMTP_PASSWORD, SMTP_FROM_EMAIL, SMTP_FROM_NAME
 */
declare(strict_types=1);

$root = __DIR__;
$phpmailerSrc = $root . '/phpmailer/src';
$coreFiles = [
    $phpmailerSrc . '/Exception.php',
    $phpmailerSrc . '/PHPMailer.php',
    $phpmailerSrc . '/SMTP.php',
];
foreach ($coreFiles as $file) {
    if (!is_file($file)) {
        fwrite(STDERR, json_encode([
            'ok' => false,
            'error' => 'PHPMailer source missing in platform/mail-relay/phpmailer/src — commit bundled library files',
        ]));
        exit(1);
    }
}

require $coreFiles[0];
require $coreFiles[1];
require $coreFiles[2];

use PHPMailer\PHPMailer\Exception as MailException;
use PHPMailer\PHPMailer\PHPMailer;

function envTrim(string $key, string $default = ''): string
{
    $v = getenv($key);
    if ($v === false || $v === '') {
        return $default;
    }
    return trim((string) $v);
}

function envBool(string $key, bool $default = false): bool
{
    $v = strtolower(envTrim($key));
    if ($v === '') {
        return $default;
    }
    return in_array($v, ['1', 'true', 'yes', 'on'], true);
}

function readPayload(): array
{
    $raw = stream_get_contents(STDIN);
    if ($raw === false || trim($raw) === '') {
        throw new RuntimeException('Empty stdin payload');
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        throw new RuntimeException('Invalid JSON payload');
    }
    return $data;
}

function validateEmail(string $email): string
{
    $email = strtolower(trim($email));
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('Invalid recipient email');
    }
    return $email;
}

/** @return array{host:string,port:int,secure:bool,user:string,password:string,fromEmail:string,fromName:string} */
function smtpConfig(): array
{
    $host = envTrim('SMTP_HOST');
    $user = envTrim('SMTP_USER', envTrim('SMTP_FROM_EMAIL'));
    $password = envTrim('SMTP_PASSWORD');
    $fromEmail = envTrim('SMTP_FROM_EMAIL', $user);
    if ($host === '' || $user === '' || $password === '' || $fromEmail === '') {
        throw new RuntimeException('SMTP env not fully configured');
    }

    $port = (int) envTrim('SMTP_PORT', '465');
    if ($port <= 0) {
        $port = 465;
    }
    $secure = envBool('SMTP_SECURE', $port === 465);

    return [
        'host' => $host,
        'port' => $port,
        'secure' => $secure,
        'user' => $user,
        'password' => $password,
        'fromEmail' => $fromEmail,
        'fromName' => envTrim('SMTP_FROM_NAME', 'MAMS'),
    ];
}

function makeMailer(array $cfg): PHPMailer
{
    $mail = new PHPMailer(true);
    $mail->CharSet = PHPMailer::CHARSET_UTF8;
    $mail->isSMTP();
    $mail->Host = $cfg['host'];
    $mail->SMTPAuth = true;
    $mail->Username = $cfg['user'];
    $mail->Password = $cfg['password'];
    $mail->Port = $cfg['port'];
    $mail->Timeout = 20;
    $mail->SMTPKeepAlive = false;

    if ($cfg['secure'] || $cfg['port'] === 465) {
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
    } else {
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    }

    $mail->setFrom($cfg['fromEmail'], $cfg['fromName']);
    return $mail;
}

/** @return array{ok:bool,via:string} */
function verifySmtp(array $cfg): array
{
    $attempts = [
        ['port' => $cfg['port'], 'secure' => $cfg['secure']],
    ];
    if ($cfg['port'] === 465) {
        $attempts[] = ['port' => 587, 'secure' => false];
    } elseif ($cfg['port'] === 587) {
        $attempts[] = ['port' => 465, 'secure' => true];
    }

    $last = '';
    foreach ($attempts as $attempt) {
        $mail = makeMailer(array_merge($cfg, $attempt));
        try {
            if (!$mail->smtpConnect()) {
                $last = 'smtpConnect returned false';
                continue;
            }
            $mail->smtpClose();
            return [
                'ok' => true,
                'via' => sprintf('phpmailer:%s:%d', $cfg['host'], (int) $attempt['port']),
            ];
        } catch (MailException $e) {
            $last = $e->getMessage();
        }
    }

    throw new RuntimeException($last !== '' ? $last : 'SMTP verification failed');
}

/** @return array{ok:bool,via:string} */
function sendMessage(array $cfg, array $payload): array
{
    $to = validateEmail((string) ($payload['to'] ?? ''));
    $subject = trim((string) ($payload['subject'] ?? ''));
    $text = (string) ($payload['text'] ?? '');
    $html = isset($payload['html']) ? (string) $payload['html'] : '';

    if ($subject === '') {
        throw new RuntimeException('Subject is required');
    }
    if ($text === '' && $html === '') {
        throw new RuntimeException('Message body is required');
    }

    $attempts = [
        ['port' => $cfg['port'], 'secure' => $cfg['secure']],
    ];
    if ($cfg['port'] === 465) {
        $attempts[] = ['port' => 587, 'secure' => false];
    } elseif ($cfg['port'] === 587) {
        $attempts[] = ['port' => 465, 'secure' => true];
    }

    $last = '';
    foreach ($attempts as $attempt) {
        $mail = makeMailer(array_merge($cfg, $attempt));
        try {
            $mail->addAddress($to);
            $mail->Subject = $subject;
            $mail->isHTML($html !== '');
            if ($html !== '') {
                $mail->Body = $html;
                $mail->AltBody = $text !== '' ? $text : strip_tags(str_replace(['<br>', '<br/>', '<br />'], "\n", $html));
            } else {
                $mail->Body = $text;
            }
            $mail->send();
            return [
                'ok' => true,
                'via' => sprintf('phpmailer:%s:%d', $cfg['host'], (int) $attempt['port']),
            ];
        } catch (MailException $e) {
            $last = $e->getMessage();
            $mail->clearAddresses();
        }
    }

    throw new RuntimeException($last !== '' ? $last : 'PHPMailer send failed');
}

try {
    $cfg = smtpConfig();
    $payload = readPayload();

    if (!empty($payload['verify'])) {
        $result = verifySmtp($cfg);
    } else {
        $result = sendMessage($cfg, $payload);
    }

    echo json_encode($result, JSON_UNESCAPED_UNICODE);
    exit(0);
} catch (Throwable $e) {
    fwrite(STDERR, json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE));
    exit(1);
}
