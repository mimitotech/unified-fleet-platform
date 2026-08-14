import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { success, error } from '../utils/response.js';
import { isSystemRole } from '../utils/systemRoles.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { AuditService } from '../services/AuditService.js';
import { getJwtSecret } from '../config/env.js';
import { assertStrongPassword, generateStrongPassword } from '../utils/passwordPolicy.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return error(res, 'Email and password required');

  const { rows } = await query<{
    id: string;
    email: string;
    full_name: string;
    role: string;
    tenant_id: string | null;
    password_hash: string;
    is_active: boolean;
    terms_accepted_at: string | null;
  }>(`SELECT * FROM users WHERE email = $1`, [email.toLowerCase().trim()]);

  const user = rows[0];
  if (!user || !user.is_active) {
    await AuditService.log({
      userEmail: email.toLowerCase().trim(),
      action: 'auth.login_failed',
      resourceType: 'user',
      details: { reason: 'invalid_credentials' },
    });
    return error(res, 'Invalid credentials', 401);
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    await AuditService.log({
      userId: user.id,
      userEmail: user.email,
      tenantId: user.tenant_id || undefined,
      action: 'auth.login_failed',
      resourceType: 'user',
      resourceId: user.id,
      details: { reason: 'wrong_password' },
    });
    return error(res, 'Invalid credentials', 401);
  }

  let tenantSlug: string | null = null;
  let tenantName: string | null = null;

  if (user.tenant_id && !isSystemRole(user.role)) {
    const { rows: tenants } = await query<{ status: string; is_active: boolean; name: string; slug: string }>(
      `SELECT status, is_active, name, slug FROM tenants WHERE id = $1`,
      [user.tenant_id]
    );
    const tenant = tenants[0];
    if (!tenant?.is_active || tenant.status === 'draft') {
      return error(
        res,
        'Your organization is not yet active. Please contact your MAMS administrator to complete setup.',
        403
      );
    }
    tenantSlug = tenant.slug;
    tenantName = tenant.name;
  }

  await query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);

  await AuditService.log({
    userId: user.id,
    userEmail: user.email,
    tenantId: user.tenant_id || undefined,
    action: 'auth.login_success',
    resourceType: 'user',
    resourceId: user.id,
  });

  const token = jwt.sign(
    {
      sub: user.id,
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      tenantId: user.tenant_id,
      isActive: user.is_active,
    },
    getJwtSecret(),
    { expiresIn: '24h', algorithm: 'HS256' }
  );

  return success(res, {
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      tenantId: user.tenant_id,
      isActive: user.is_active,
      termsAcceptedAt: user.terms_accepted_at,
    },
    tenantSlug,
    tenantName,
  });
});

router.get('/me', async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return error(res, 'Unauthorized', 401);
  try {
    const payload = jwt.verify(header.slice(7), getJwtSecret(), { algorithms: ['HS256'] }) as { id: string };
    const { rows } = await query(
      `SELECT u.id, u.email, u.full_name, u.role, u.tenant_id, u.is_active, u.terms_accepted_at,
              t.slug as tenant_slug, t.name as tenant_name
       FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id WHERE u.id = $1`,
      [payload.id]
    );
    if (!rows[0]) return error(res, 'User not found', 404);
    const u = rows[0] as Record<string, unknown>;
    return success(res, {
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      role: u.role,
      tenantId: u.tenant_id,
      isActive: u.is_active,
      termsAcceptedAt: u.terms_accepted_at,
      tenantSlug: u.tenant_slug,
      tenantName: u.tenant_name,
    });
  } catch {
    return error(res, 'Invalid token', 401);
  }
});

router.post('/change-password', authMiddleware, async (req: AuthRequest, res) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!currentPassword || !newPassword) {
    return error(res, 'Current password and new password are required');
  }

  try {
    assertStrongPassword(newPassword);
  } catch (e) {
    return error(res, (e as Error).message);
  }

  if (currentPassword === newPassword) {
    return error(res, 'New password must be different from your current password');
  }

  const userId = req.user!.id;

  const { rows } = await query<{ password_hash: string; email: string; tenant_id: string | null }>(
    `SELECT password_hash, email, tenant_id FROM users WHERE id = $1 AND is_active = true`,
    [userId]
  );

  const user = rows[0];
  if (!user) return error(res, 'User not found', 404);

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) return error(res, 'Current password is incorrect', 401);

  const hash = await bcrypt.hash(newPassword, 10);
  await query(
    `UPDATE users SET password_hash = $2, force_password_change = false, updated_at = NOW() WHERE id = $1`,
    [userId, hash]
  );

  await AuditService.log({
    tenantId: user.tenant_id || undefined,
    userId,
    userEmail: user.email,
    action: 'user.change_password',
    resourceType: 'user',
    resourceId: userId,
  });

  return success(res, { changed: true });
});

router.post('/accept-terms', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;

  const { rows } = await query<{ terms_accepted_at: string | null; email: string; tenant_id: string | null }>(
    `SELECT terms_accepted_at, email, tenant_id FROM users WHERE id = $1 AND is_active = true`,
    [userId]
  );

  const user = rows[0];
  if (!user) return error(res, 'User not found', 404);

  if (user.terms_accepted_at) {
    return success(res, { termsAcceptedAt: user.terms_accepted_at });
  }

  const { rows: updated } = await query<{ terms_accepted_at: string }>(
    `UPDATE users SET terms_accepted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING terms_accepted_at`,
    [userId]
  );

  await AuditService.log({
    tenantId: user.tenant_id || undefined,
    userId,
    userEmail: user.email,
    action: 'user.accept_terms',
    resourceType: 'user',
    resourceId: userId,
  });

  return success(res, { termsAcceptedAt: updated[0]?.terms_accepted_at });
});

/**
 * Forgot password — generate a temporary password, email it, then commit the hash.
 * If email cannot be sent, the password is NOT changed (fail closed).
 */
router.post('/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '')
    .toLowerCase()
    .trim();
  if (!email) return error(res, 'Email is required');

  const { rows } = await query<{
    id: string;
    email: string;
    full_name: string | null;
    is_active: boolean;
    tenant_id: string | null;
  }>(`SELECT id, email, full_name, is_active, tenant_id FROM users WHERE email = $1`, [email]);

  const user = rows[0];
  if (!user || !user.is_active) {
    await AuditService.log({
      userEmail: email,
      action: 'auth.forgot_password_failed',
      resourceType: 'user',
      details: { reason: 'email_not_found' },
    });
    return error(res, 'No account found with that email', 404);
  }

  const { isSmtpConfiguredAsync, sendAccountCredentialsEmail } = await import('../services/EmailService.js');
  const smtpReady = await isSmtpConfiguredAsync();
  if (!smtpReady) {
    await AuditService.log({
      userId: user.id,
      userEmail: user.email,
      tenantId: user.tenant_id || undefined,
      action: 'auth.forgot_password_email_failed',
      resourceType: 'user',
      resourceId: user.id,
      details: { reason: 'smtp_not_configured' },
    });
    return error(
      res,
      'Password reset email could not be sent. Please contact your MIMITO MAMS administrator for assistance.',
      503
    );
  }

  const temporaryPassword = generateStrongPassword({ length: 14 });
  let emailed = false;
  let emailError: string | undefined;
  try {
    emailed = await sendAccountCredentialsEmail({
      to: user.email,
      fullName: user.full_name || undefined,
      temporaryPassword,
      reason: 'forgot',
    });
    if (!emailed) emailError = 'SMTP send returned false';
  } catch (err) {
    emailError = (err as Error).message;
  }

  if (!emailed) {
    await AuditService.log({
      userId: user.id,
      userEmail: user.email,
      tenantId: user.tenant_id || undefined,
      action: 'auth.forgot_password_email_failed',
      resourceType: 'user',
      resourceId: user.id,
      details: { reason: emailError || 'send_failed' },
    });
    // Keep user-facing text safe; include a short technical hint for admins reading Network tab.
    const hint =
      emailError && /timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|ESOCKET/i.test(emailError)
        ? ' (SMTP connection blocked or timed out from the server)'
        : emailError && /auth|invalid login|535|534/i.test(emailError)
          ? ' (SMTP authentication failed — check mailbox password)'
          : '';
    return error(
      res,
      `Password reset email could not be sent. Please contact your MIMITO MAMS administrator for assistance.${hint}`,
      503
    );
  }

  const hash = await bcrypt.hash(temporaryPassword, 10);
  await query(
    `UPDATE users SET password_hash = $2, force_password_change = true, updated_at = NOW() WHERE id = $1`,
    [user.id, hash]
  );

  await AuditService.log({
    userId: user.id,
    userEmail: user.email,
    tenantId: user.tenant_id || undefined,
    action: 'auth.forgot_password_ok',
    resourceType: 'user',
    resourceId: user.id,
    details: { emailed: true, method: 'temporary_password' },
  });

  return success(res, {
    emailed: true,
    email: user.email,
    message: 'A temporary password was sent to your email. Sign in and change it immediately.',
  });
});

/**
 * Step 2 — set a new password using the reset token from /forgot-password.
 */
router.post('/reset-password', async (req, res) => {
  const resetToken = String(req.body?.resetToken || '').trim();
  const newPassword = String(req.body?.newPassword || '');
  const confirmPassword = String(req.body?.confirmPassword || '');

  if (!resetToken) return error(res, 'Reset session expired. Start again with your email.');
  if (!newPassword || !confirmPassword) {
    return error(res, 'New password and confirmation are required');
  }
  try {
    assertStrongPassword(newPassword);
  } catch (e) {
    return error(res, (e as Error).message);
  }
  if (newPassword !== confirmPassword) {
    return error(res, 'Passwords do not match');
  }

  let payload: { id?: string; sub?: string; email?: string; purpose?: string };
  try {
    payload = jwt.verify(resetToken, getJwtSecret(), { algorithms: ['HS256'] }) as typeof payload;
  } catch {
    return error(res, 'Reset link expired. Request a new password reset.', 401);
  }

  if (payload.purpose !== 'password_reset') {
    return error(res, 'Invalid reset token', 401);
  }

  const userId = payload.id || payload.sub;
  if (!userId) return error(res, 'Invalid reset token', 401);

  const { rows } = await query<{ id: string; email: string; tenant_id: string | null; is_active: boolean }>(
    `SELECT id, email, tenant_id, is_active FROM users WHERE id = $1`,
    [userId],
  );
  const user = rows[0];
  if (!user || !user.is_active) return error(res, 'Account not found or inactive', 404);

  const hash = await bcrypt.hash(newPassword, 10);
  await query(
    `UPDATE users SET password_hash = $2, force_password_change = false, updated_at = NOW() WHERE id = $1`,
    [user.id, hash],
  );

  await AuditService.log({
    tenantId: user.tenant_id || undefined,
    userId: user.id,
    userEmail: user.email,
    action: 'auth.reset_password',
    resourceType: 'user',
    resourceId: user.id,
  });

  return success(res, { reset: true });
});

export default router;
