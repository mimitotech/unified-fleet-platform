import nodemailer, { type Transporter } from 'nodemailer';
import { query } from '../config/database.js';
import { logger } from '../config/logger.js';
import { getPublicBaseUrl } from '../utils/publicUrl.js';
import { isValidEmail, normalizeEmail } from './UserCreateService.js';
import { invokePhpMailer, isPhpMailerRelayInstalled } from './PhpMailerTransport.js';
import { isPhpCliAvailable } from './phpCliAvailable.js';

export type MailTransportMode = 'auto' | 'nodemailer' | 'phpmailer';

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
};

let transporter: Transporter | null = null;
let cachedKey = '';

function strip(value: string | undefined): string {
  return String(value || '').trim();
}

/** Prefer env (Hostinger) so mail keeps working even if admin UI settings are empty. */
export function readSmtpConfigFromEnv(): SmtpConfig | null {
  const host = strip(process.env.SMTP_HOST);
  const user = strip(process.env.SMTP_USER || process.env.SMTP_FROM_EMAIL);
  const password = strip(process.env.SMTP_PASSWORD);
  const fromEmail = strip(process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER);
  if (!host || !user || !password || !fromEmail) return null;

  const port = parseInt(process.env.SMTP_PORT || '465', 10) || 465;
  const secureEnv = strip(process.env.SMTP_SECURE).toLowerCase();
  const secure =
    secureEnv === '1' ||
    secureEnv === 'true' ||
    secureEnv === 'yes' ||
    (secureEnv === '' && port === 465);

  return {
    host,
    port,
    secure,
    user,
    password,
    fromEmail,
    fromName: strip(process.env.SMTP_FROM_NAME) || 'MAMS',
  };
}

async function readSmtpConfigFromDb(): Promise<Partial<SmtpConfig> | null> {
  try {
    const { rows } = await query<{ value: unknown }>(
      `SELECT value FROM system_settings WHERE \`key\` = 'email' LIMIT 1`,
    );
    const raw = rows[0]?.value;
    const v =
      typeof raw === 'string'
        ? (JSON.parse(raw) as Record<string, unknown>)
        : ((raw || {}) as Record<string, unknown>);
    return {
      host: strip(String(v.smtpHost || '')),
      port: Number(v.smtpPort || 0) || undefined,
      secure: Boolean(v.smtpSecure),
      user: strip(String(v.smtpUser || v.fromEmail || '')),
      password: strip(String(v.smtpPassword || '')),
      fromEmail: strip(String(v.fromEmail || '')),
      fromName: strip(String(v.fromName || '')),
    };
  } catch {
    return null;
  }
}

export async function resolveSmtpConfig(): Promise<SmtpConfig | null> {
  const fromEnv = readSmtpConfigFromEnv();
  if (fromEnv) return fromEnv;

  const fromDb = await readSmtpConfigFromDb();
  const dbPassword = fromDb?.password || '';
  // Ignore masked / placeholder passwords written for Admin UI display.
  if (!fromDb?.host || !fromDb.user || !fromDb.fromEmail) return null;
  if (!dbPassword || /^\*+$/.test(dbPassword) || dbPassword === 'CHANGE_ME') return null;

  const port = fromDb.port || 465;
  return {
    host: fromDb.host,
    port,
    secure: fromDb.secure ?? port === 465,
    user: fromDb.user,
    password: dbPassword,
    fromEmail: fromDb.fromEmail,
    fromName: fromDb.fromName || 'MAMS',
  };
}

export function isSmtpConfigured(): boolean {
  // Prefer env (source of truth on Hostinger). DB-only SMTP is resolved at send time.
  return Boolean(readSmtpConfigFromEnv());
}

function buildTransport(cfg: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
    tls: { servername: cfg.host },
  });
}

/** Hostinger sometimes blocks 465 from Node apps — fall back to 587 STARTTLS. */
function alternateSmtpConfig(cfg: SmtpConfig): SmtpConfig | null {
  if (cfg.port === 465) {
    return { ...cfg, port: 587, secure: false };
  }
  if (cfg.port === 587) {
    return { ...cfg, port: 465, secure: true };
  }
  return null;
}

async function getTransporter(): Promise<{ transport: Transporter; cfg: SmtpConfig } | null> {
  const cfg = await resolveSmtpConfig();
  if (!cfg) return null;

  const key = `${cfg.host}|${cfg.port}|${cfg.user}|${cfg.password.length}`;
  if (!transporter || key !== cachedKey) {
    transporter = buildTransport(cfg);
    cachedKey = key;
  }
  return { transport: transporter, cfg };
}

function getMailTransportMode(): MailTransportMode {
  const mode = strip(process.env.MAIL_TRANSPORT).toLowerCase();
  if (mode === 'nodemailer' || mode === 'phpmailer') return mode;
  return 'auto';
}

function normalizeRecipient(to: string): string | null {
  const email = normalizeEmail(to);
  if (!isValidEmail(email)) return null;
  return email;
}

async function sendWithTransport(
  transport: Transporter,
  cfg: SmtpConfig,
  opts: { to: string; subject: string; text: string; html?: string },
): Promise<void> {
  await transport.sendMail({
    from: `"${cfg.fromName}" <${cfg.fromEmail}>`,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html || opts.text.replace(/\n/g, '<br/>'),
  });
}

async function sendViaNodemailer(
  cfg: SmtpConfig,
  opts: { to: string; subject: string; text: string; html?: string },
): Promise<{ ok: boolean; via: string }> {
  const ready = await getTransporter();
  if (!ready) {
    return { ok: false, via: 'nodemailer:not-configured' };
  }

  const { transport } = ready;
  try {
    await sendWithTransport(transport, cfg, opts);
    return { ok: true, via: `nodemailer:${cfg.host}:${cfg.port}` };
  } catch (primaryErr) {
    const alt = alternateSmtpConfig(cfg);
    if (!alt) throw primaryErr;
    logger.warn('[mail] nodemailer primary SMTP failed — trying alternate port', {
      from: `${cfg.host}:${cfg.port}`,
      to: `${alt.host}:${alt.port}`,
      err: (primaryErr as Error).message,
    });
    const altTransport = buildTransport(alt);
    await sendWithTransport(altTransport, alt, opts);
    transporter = altTransport;
    cachedKey = `${alt.host}|${alt.port}|${alt.user}|${alt.password.length}`;
    return { ok: true, via: `nodemailer:${alt.host}:${alt.port}` };
  }
}

async function sendViaPhpMailer(
  cfg: SmtpConfig,
  opts: { to: string; subject: string; text: string; html?: string },
): Promise<{ ok: boolean; via: string; message?: string }> {
  const result = await invokePhpMailer(cfg, opts);
  if (!result.ok) {
    return { ok: false, via: 'phpmailer', message: result.message };
  }
  return { ok: true, via: result.via || 'phpmailer' };
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<boolean> {
  const cfg = await resolveSmtpConfig();
  const recipient = normalizeRecipient(opts.to);
  if (!recipient) {
    logger.warn('[mail] invalid recipient — skip send', { to: opts.to, subject: opts.subject });
    return false;
  }
  if (!cfg) {
    logger.warn('[mail] SMTP not configured — skip send', {
      to: recipient,
      subject: opts.subject,
      envHost: Boolean(process.env.SMTP_HOST?.trim()),
      envUser: Boolean(process.env.SMTP_USER?.trim() || process.env.SMTP_FROM_EMAIL?.trim()),
      envPassLen: (process.env.SMTP_PASSWORD || '').length,
    });
    return false;
  }

  const payload = { ...opts, to: recipient };
  const mode = getMailTransportMode();
  let lastError: Error | undefined;

  const tryNodemailer = async (): Promise<boolean> => {
    try {
      const result = await sendViaNodemailer(cfg, payload);
      if (result.ok) {
        logger.info('[mail] sent', { to: recipient, subject: opts.subject, via: result.via });
        return true;
      }
      return false;
    } catch (err) {
      lastError = err as Error;
      logger.warn('[mail] nodemailer send failed', {
        to: recipient,
        subject: opts.subject,
        err: lastError.message,
      });
      return false;
    }
  };

  const tryPhpMailer = async (): Promise<boolean> => {
    const result = await sendViaPhpMailer(cfg, payload);
    if (result.ok) {
      logger.info('[mail] sent', { to: recipient, subject: opts.subject, via: result.via });
      return true;
    }
    logger.warn('[mail] PHPMailer send failed', {
      to: recipient,
      subject: opts.subject,
      err: result.message,
    });
    return false;
  };

  if (mode === 'phpmailer') {
    const ok = await tryPhpMailer();
    if (!ok && lastError) throw lastError;
    if (!ok) {
      const msg = (await sendViaPhpMailer(cfg, payload)).message || 'PHPMailer send failed';
      throw new Error(msg);
    }
    return true;
  }

  if (mode === 'nodemailer') {
    const ok = await tryNodemailer();
    if (!ok && lastError) throw lastError;
    if (!ok) return false;
    return true;
  }

  // auto: PHPMailer when PHP CLI exists, otherwise nodemailer (Hostinger Node)
  const phpReady = isPhpMailerRelayInstalled() && isPhpCliAvailable();
  if (phpReady && (await tryPhpMailer())) return true;
  if (await tryNodemailer()) return true;
  if (!phpReady && isPhpMailerRelayInstalled() && (await tryPhpMailer())) return true;
  if (lastError) throw lastError;
  return false;
}

function brandShell(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f6f5;font-family:Segoe UI,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5ebe8;">
        <tr><td style="background:#004225;color:#ffffff;padding:18px 24px;font-size:18px;font-weight:600;">MAMS</td></tr>
        <tr><td style="padding:24px;color:#1a1a1a;font-size:15px;line-height:1.55;">
          <h1 style="margin:0 0 12px;font-size:18px;color:#004225;">${title}</h1>
          ${bodyHtml}
          <p style="margin:24px 0 0;font-size:12px;color:#6b7280;">Mimito Asset Management System · mams.mimitotracking.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendPasswordResetEmail(to: string, resetToken: string): Promise<boolean> {
  const base = getPublicBaseUrl();
  const link = `${base}/auth/login?resetToken=${encodeURIComponent(resetToken)}`;
  const text = [
    'You requested a password reset for your MAMS account.',
    '',
    'Open this link within 15 minutes to set a new password:',
    link,
    '',
    'If you did not request this, ignore this email.',
  ].join('\n');

  return sendMail({
    to,
    subject: 'Reset your MAMS password',
    text,
    html: brandShell(
      'Reset your password',
      `<p>You requested a password reset for your MAMS account.</p>
       <p style="margin:20px 0;"><a href="${link}" style="display:inline-block;background:#004225;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:600;">Set new password</a></p>
       <p style="font-size:13px;color:#4b5563;">Or paste this link into your browser:<br/><span style="word-break:break-all;">${link}</span></p>
       <p style="font-size:13px;color:#6b7280;">This link expires in 15 minutes.</p>`,
    ),
  });
}

export async function sendAccountCredentialsEmail(opts: {
  to: string;
  fullName?: string;
  temporaryPassword: string;
  reason: 'created' | 'reset' | 'forgot';
}): Promise<boolean> {
  const base = getPublicBaseUrl();
  const loginUrl = `${base}/auth/login`;
  const title =
    opts.reason === 'created'
      ? 'Your MAMS account is ready'
      : opts.reason === 'forgot'
        ? 'Your temporary MAMS password'
        : 'Your MAMS password was reset';
  const lead =
    opts.reason === 'created'
      ? 'An administrator created a MAMS account for you.'
      : opts.reason === 'forgot'
        ? 'You requested a password reset for your MAMS account. Use this one-time temporary password to sign in, then change it immediately.'
        : 'An administrator reset your MAMS password.';
  const text = [
    lead,
    '',
    `Login: ${loginUrl}`,
    `Email: ${opts.to}`,
    `Temporary password: ${opts.temporaryPassword}`,
    '',
    'Sign in and change your password immediately.',
    'If you did not request this, contact your MIMITO MAMS administrator.',
  ].join('\n');

  return sendMail({
    to: opts.to,
    subject: title,
    text,
    html: brandShell(
      title,
      `<p>${escapeHtml(lead)}</p>
       <p><strong>Email:</strong> ${escapeHtml(opts.to)}</p>
       <p style="margin:16px 0 8px;font-size:13px;color:#4b5563;">Your one-time sign-in code:</p>
       <p style="margin:0 0 16px;padding:14px 18px;background:#f0fdf4;border:1px dashed #004225;border-radius:8px;font-family:Consolas,Monaco,monospace;font-size:20px;letter-spacing:0.08em;color:#004225;">${escapeHtml(opts.temporaryPassword)}</p>
       <p style="margin:20px 0;"><a href="${loginUrl}" style="display:inline-block;background:#004225;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:600;">Sign in to MAMS</a></p>
       <p style="font-size:13px;color:#6b7280;">Use this temporary password once, then change it immediately after signing in. If you did not request this, contact your MIMITO MAMS administrator.</p>`,
    ),
  });
}

/** Send account credentials / OTP-style temporary password to the user's registered email. */
export async function emailCredentialsToUser(opts: {
  to: string;
  fullName?: string;
  temporaryPassword: string;
  reason: 'created' | 'reset' | 'forgot';
}): Promise<{ sent: boolean; error?: string }> {
  const to = normalizeRecipient(opts.to);
  if (!to) {
    logger.warn('[mail] credentials email skipped — invalid recipient', { to: opts.to });
    return { sent: false, error: 'Invalid recipient email' };
  }
  try {
    const sent = await sendAccountCredentialsEmail({ ...opts, to });
    if (!sent) return { sent: false, error: 'Mail transport returned false' };
    return { sent: true };
  } catch (err) {
    const message = (err as Error).message || 'Mail send failed';
    logger.error('[mail] credentials email failed', { to, err: message });
    return { sent: false, error: message };
  }
}

/** Forgot-password OTP email — temporary sign-in code to the user's registered address. */
export async function sendForgotPasswordOtpEmail(opts: {
  to: string;
  fullName?: string;
  oneTimePassword: string;
}): Promise<{ sent: boolean; error?: string }> {
  return emailCredentialsToUser({
    to: opts.to,
    fullName: opts.fullName,
    temporaryPassword: opts.oneTimePassword,
    reason: 'forgot',
  });
}

/** Persist env SMTP into system_settings so Admin → Email UI shows live values (password masked). */
export async function syncEmailSettingsFromEnv(): Promise<void> {
  const cfg = readSmtpConfigFromEnv();
  if (!cfg) return;

  const value = {
    smtpHost: cfg.host,
    smtpPort: cfg.port,
    smtpSecure: cfg.secure,
    smtpUser: cfg.user,
    // Never persist real SMTP password in DB — env remains source of truth.
    smtpPassword: cfg.password ? '********' : '',
    fromEmail: cfg.fromEmail,
    fromName: cfg.fromName,
    imapHost: strip(process.env.IMAP_HOST) || 'imap.hostinger.com',
    imapPort: parseInt(process.env.IMAP_PORT || '993', 10) || 993,
  };

  await query(
    `INSERT INTO system_settings (\`key\`, value, updated_at) VALUES ('email', $1, NOW())
     ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW()`,
    [JSON.stringify(value)],
  );
  logger.info('[mail] system_settings.email synced from SMTP env', {
    host: cfg.host,
    port: cfg.port,
    from: cfg.fromEmail,
  });
}

export async function isSmtpConfiguredAsync(): Promise<boolean> {
  return Boolean(await resolveSmtpConfig());
}

export async function verifySmtpConnection(): Promise<{ ok: boolean; message: string }> {
  const cfg = await resolveSmtpConfig();
  if (!cfg) {
    return {
      ok: false,
      message: `SMTP not configured (env host=${Boolean(process.env.SMTP_HOST?.trim())} user=${Boolean(
        process.env.SMTP_USER?.trim() || process.env.SMTP_FROM_EMAIL?.trim(),
      )} passLen=${(process.env.SMTP_PASSWORD || '').length})`,
    };
  }

  const mode = getMailTransportMode();

  const verifyNodemailer = async (): Promise<{ ok: boolean; message: string } | null> => {
    const ready = await getTransporter();
    if (!ready) return null;
    try {
      await ready.transport.verify();
      return { ok: true, message: `SMTP OK (${ready.cfg.host}:${ready.cfg.port})` };
    } catch (err) {
      const alt = alternateSmtpConfig(ready.cfg);
      if (!alt) return { ok: false, message: (err as Error).message };
      try {
        const altTransport = buildTransport(alt);
        await altTransport.verify();
        transporter = altTransport;
        cachedKey = `${alt.host}|${alt.port}|${alt.user}|${alt.password.length}`;
        return { ok: true, message: `SMTP OK via fallback (${alt.host}:${alt.port})` };
      } catch (altErr) {
        return {
          ok: false,
          message: `${(err as Error).message} | fallback ${alt.port}: ${(altErr as Error).message}`,
        };
      }
    }
  };

  const verifyPhp = async (): Promise<{ ok: boolean; message: string } | null> => {
    if (!isPhpMailerRelayInstalled()) return null;
    const result = await invokePhpMailer(cfg, {
      to: cfg.fromEmail,
      subject: 'MAMS SMTP verify',
      text: 'verify',
      verify: true,
    });
    if (!result.ok) return { ok: false, message: result.message || 'PHPMailer verify failed' };
    return { ok: true, message: `SMTP OK (${result.via || 'phpmailer'})` };
  };

  if (mode === 'phpmailer') {
    const php = await verifyPhp();
    return php || { ok: false, message: 'PHPMailer relay not installed' };
  }

  if (mode === 'nodemailer') {
    const node = await verifyNodemailer();
    return node || { ok: false, message: 'Nodemailer transport unavailable' };
  }

  const phpReady = isPhpMailerRelayInstalled() && isPhpCliAvailable();
  if (phpReady) {
    const php = await verifyPhp();
    if (php?.ok) return php;
  }
  const node = await verifyNodemailer();
  if (node?.ok) return node;
  const php = await verifyPhp();
  if (php?.ok) return php;
  return {
    ok: false,
    message: [php?.message, node?.message].filter(Boolean).join(' | ') || 'SMTP verification failed',
  };
}

/** Attempt one outbound message (boot diagnostic). verify() alone can pass while hPanel blocks send. */
export async function probeSmtpSend(): Promise<{ ok: boolean; message: string }> {
  const cfg = await resolveSmtpConfig();
  if (!cfg) return { ok: false, message: 'SMTP not configured' };
  try {
    const sent = await sendMail({
      to: cfg.fromEmail,
      subject: 'MAMS SMTP send probe',
      text: 'MAMS outbound mail probe — ignore.',
    });
    return sent
      ? { ok: true, message: 'send probe ok' }
      : { ok: false, message: 'send probe returned false' };
  } catch (err) {
    return { ok: false, message: (err as Error).message || 'send probe failed' };
  }
}

/** Safe status for /health — never includes password. */
export async function getSmtpPublicStatus(): Promise<{
  configured: boolean;
  host: string | null;
  port: number | null;
  fromEmail: string | null;
  transport: MailTransportMode;
  phpmailerInstalled: boolean;
  phpCliAvailable: boolean;
}> {
  const cfg = await resolveSmtpConfig();
  if (!cfg) {
    return {
      configured: false,
      host: null,
      port: null,
      fromEmail: null,
      transport: getMailTransportMode(),
      phpmailerInstalled: isPhpMailerRelayInstalled(),
      phpCliAvailable: isPhpCliAvailable(),
    };
  }
  return {
    configured: true,
    host: cfg.host,
    port: cfg.port,
    fromEmail: cfg.fromEmail,
    transport: getMailTransportMode(),
    phpmailerInstalled: isPhpMailerRelayInstalled(),
    phpCliAvailable: isPhpCliAvailable(),
  };
}
