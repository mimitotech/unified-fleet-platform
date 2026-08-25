import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../config/logger.js';
import type { SmtpConfig } from './EmailService.js';

export type PhpMailPayload = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  verify?: boolean;
};

function resolveMailRelayRoot(): string {
  const fromEnv = String(process.env.MAIL_RELAY_DIR || '').trim();
  if (fromEnv && fs.existsSync(path.join(fromEnv, 'send-mail.php'))) {
    return path.resolve(fromEnv);
  }

  const servicesDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(servicesDir, '../../../mail-relay'),
    path.resolve(servicesDir, '../../../../mail-relay'),
    path.resolve(process.cwd(), 'mail-relay'),
    path.resolve(process.cwd(), 'platform/mail-relay'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'send-mail.php'))) return dir;
  }
  return candidates[0];
}

const mailRelayRoot = resolveMailRelayRoot();
const sendScript = path.join(mailRelayRoot, 'send-mail.php');
const vendorAutoload = path.join(mailRelayRoot, 'vendor/autoload.php');

export function getMailRelayRoot(): string {
  return mailRelayRoot;
}

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

function parseRelayResponse(
  stdout: string,
  stderr: string,
  exitCode: number | null,
): { ok: boolean; message?: string; via?: string } {
  const out = stdout.trim();
  if (out) {
    try {
      const parsed = JSON.parse(out) as { ok?: boolean; error?: string; via?: string };
      if (parsed.ok) return { ok: true, via: parsed.via || 'phpmailer' };
      if (parsed.error) return { ok: false, message: parsed.error };
    } catch {
      if (exitCode === 0) return { ok: true, via: 'phpmailer' };
      return { ok: false, message: out };
    }
  }

  const errText = stderr.trim();
  if (errText) {
    try {
      const parsed = JSON.parse(errText) as { ok?: boolean; error?: string };
      if (parsed.error) return { ok: false, message: parsed.error };
    } catch {
      return { ok: false, message: errText };
    }
  }

  if (exitCode !== 0 && exitCode != null) {
    return { ok: false, message: stderr.trim() || `PHPMailer exited with code ${exitCode}` };
  }
  return { ok: false, message: 'PHPMailer relay returned empty response' };
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
      message: `PHPMailer relay not installed at ${mailRelayRoot} (run platform/scripts/install-mail-relay.mjs)`,
    };
  }

  try {
    const { stdout, stderr, code } = await runPhpProcess(cfg, payload);
    return parseRelayResponse(String(stdout || ''), String(stderr || ''), code);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'ENOENT') {
      return {
        ok: false,
        message: `PHP CLI not found (${String(process.env.PHP_BIN || 'php')}). Set PHP_BIN in env or install PHP.`,
      };
    }
    logger.error('[mail] PHPMailer exec failed', { err: e.message, relay: mailRelayRoot });
    return { ok: false, message: e.message || 'PHPMailer exec failed' };
  }
}
