import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../config/logger.js';
import type { SmtpConfig } from './EmailService.js';

const servicesDir = path.dirname(fileURLToPath(import.meta.url));
const mailRelayRoot = path.resolve(servicesDir, '../../../mail-relay');
const sendScript = path.join(mailRelayRoot, 'send-mail.php');
const vendorAutoload = path.join(mailRelayRoot, 'vendor/autoload.php');

export type PhpMailPayload = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  verify?: boolean;
};

export function isPhpMailerRelayInstalled(): boolean {
  return fs.existsSync(sendScript) && fs.existsSync(vendorAutoload);
}

function smtpEnv(cfg: SmtpConfig): NodeJS.ProcessEnv {
  return {
    ...process.env,
    SMTP_HOST: cfg.host,
    SMTP_PORT: String(cfg.port),
    SMTP_SECURE: cfg.secure ? '1' : '0',
    SMTP_USER: cfg.user,
    SMTP_PASSWORD: cfg.password,
    SMTP_FROM_EMAIL: cfg.fromEmail,
    SMTP_FROM_NAME: cfg.fromName,
  };
}

function parseRelayResponse(stdout: string, stderr: string): { ok: boolean; message?: string; via?: string } {
  const errText = stderr.trim();
  if (errText) {
    try {
      const parsed = JSON.parse(errText) as { ok?: boolean; error?: string };
      if (parsed.error) return { ok: false, message: parsed.error };
    } catch {
      return { ok: false, message: errText };
    }
  }

  const out = stdout.trim();
  if (!out) return { ok: false, message: 'PHPMailer relay returned empty response' };

  try {
    const parsed = JSON.parse(out) as { ok?: boolean; error?: string; via?: string };
    if (!parsed.ok) return { ok: false, message: parsed.error || 'PHPMailer relay failed' };
    return { ok: true, via: parsed.via || 'phpmailer' };
  } catch {
    return { ok: false, message: out };
  }
}

function runPhpProcess(
  cfg: SmtpConfig,
  payload: PhpMailPayload,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const phpBin = String(process.env.PHP_BIN || 'php').trim() || 'php';
  return new Promise((resolve, reject) => {
    const child = spawn(phpBin, [sendScript], {
      env: smtpEnv(cfg),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, code }));

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

export async function invokePhpMailer(
  cfg: SmtpConfig,
  payload: PhpMailPayload,
): Promise<{ ok: boolean; message?: string; via?: string }> {
  if (!isPhpMailerRelayInstalled()) {
    return {
      ok: false,
      message: 'PHPMailer relay not installed (composer install in platform/mail-relay)',
    };
  }

  try {
    const { stdout, stderr, code } = await runPhpProcess(cfg, payload);
    const parsed = parseRelayResponse(String(stdout || ''), String(stderr || ''));
    if (!parsed.ok && code !== 0 && !parsed.message) {
      return { ok: false, message: stderr.trim() || `PHPMailer exited with code ${code}` };
    }
    return parsed;
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'ENOENT') {
      return {
        ok: false,
        message: `PHP CLI not found (${String(process.env.PHP_BIN || 'php')}). Set PHP_BIN in env or install PHP.`,
      };
    }
    logger.error('[mail] PHPMailer exec failed', { err: e.message });
    return { ok: false, message: e.message || 'PHPMailer exec failed' };
  }
}
