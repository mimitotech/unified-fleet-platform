import nodemailer, { type Transporter } from 'nodemailer';
import { query } from '../config/database.js';
import { logger } from '../config/logger.js';
import { getPublicBaseUrl } from '../utils/publicUrl.js';

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

async function getTransporter(): Promise<{ transport: Transporter; cfg: SmtpConfig } | null> {
  const cfg = await resolveSmtpConfig();
  if (!cfg) return null;

  const key = `${cfg.host}|${cfg.port}|${cfg.user}|${cfg.password.length}`;
  if (!transporter || key !== cachedKey) {
    transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.password },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 20_000,
    });
    cachedKey = key;
  }
  return { transport: transporter, cfg };
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<boolean> {
  const ready = await getTransporter();
  if (!ready) {
    logger.warn('[mail] SMTP not configured — skip send', { to: opts.to, subject: opts.subject });
    return false;
  }

  const { transport, cfg } = ready;
  try {
    await transport.sendMail({
      from: `"${cfg.fromName}" <${cfg.fromEmail}>`,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html || opts.text.replace(/\n/g, '<br/>'),
    });
    logger.info('[mail] sent', { to: opts.to, subject: opts.subject });
    return true;
  } catch (err) {
    logger.error('[mail] send failed', { to: opts.to, subject: opts.subject, err: (err as Error).message });
    throw err;
  }
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
  reason: 'created' | 'reset';
}): Promise<boolean> {
  const base = getPublicBaseUrl();
  const loginUrl = `${base}/auth/login`;
  const title = opts.reason === 'created' ? 'Your MAMS account is ready' : 'Your MAMS password was reset';
  const lead =
    opts.reason === 'created'
      ? 'An administrator created a MAMS account for you.'
      : 'An administrator reset your MAMS password.';
  const text = [
    lead,
    '',
    `Login: ${loginUrl}`,
    `Email: ${opts.to}`,
    `Temporary password: ${opts.temporaryPassword}`,
    '',
    'Sign in and change your password immediately.',
  ].join('\n');

  return sendMail({
    to: opts.to,
    subject: title,
    text,
    html: brandShell(
      title,
      `<p>${lead}</p>
       <p><strong>Email:</strong> ${opts.to}<br/><strong>Temporary password:</strong> ${opts.temporaryPassword}</p>
       <p style="margin:20px 0;"><a href="${loginUrl}" style="display:inline-block;background:#004225;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:600;">Sign in to MAMS</a></p>
       <p style="font-size:13px;color:#6b7280;">Change your password after signing in.</p>`,
    ),
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
  const ready = await getTransporter();
  if (!ready) return { ok: false, message: 'SMTP not configured' };
  try {
    await ready.transport.verify();
    return { ok: true, message: `SMTP OK (${ready.cfg.host}:${ready.cfg.port})` };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
