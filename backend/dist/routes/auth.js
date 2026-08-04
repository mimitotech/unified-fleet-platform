import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { success, error } from '../utils/response.js';
import { isSystemRole } from '../utils/systemRoles.js';
import { authMiddleware } from '../middleware/auth.js';
import { AuditService } from '../services/AuditService.js';
import { getJwtSecret } from '../config/env.js';
const router = Router();
const MIN_PASSWORD_LENGTH = 8;
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
        return error(res, 'Email and password required');
    const { rows } = await query(`SELECT * FROM users WHERE email = $1`, [email.toLowerCase().trim()]);
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
    let tenantSlug = null;
    let tenantName = null;
    if (user.tenant_id && !isSystemRole(user.role)) {
        const { rows: tenants } = await query(`SELECT status, is_active, name, slug FROM tenants WHERE id = $1`, [user.tenant_id]);
        const tenant = tenants[0];
        if (!tenant?.is_active || tenant.status === 'draft') {
            return error(res, 'Your organization is not yet active. Please contact your MAMS administrator to complete setup.', 403);
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
    const token = jwt.sign({
        sub: user.id,
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        tenantId: user.tenant_id,
        isActive: user.is_active,
    }, getJwtSecret(), { expiresIn: '24h', algorithm: 'HS256' });
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
    if (!header?.startsWith('Bearer '))
        return error(res, 'Unauthorized', 401);
    try {
        const payload = jwt.verify(header.slice(7), getJwtSecret(), { algorithms: ['HS256'] });
        const { rows } = await query(`SELECT u.id, u.email, u.full_name, u.role, u.tenant_id, u.is_active, u.terms_accepted_at,
              t.slug as tenant_slug, t.name as tenant_name
       FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id WHERE u.id = $1`, [payload.id]);
        if (!rows[0])
            return error(res, 'User not found', 404);
        const u = rows[0];
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
    }
    catch {
        return error(res, 'Invalid token', 401);
    }
});
router.post('/change-password', authMiddleware, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return error(res, 'Current password and new password are required');
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
        return error(res, `New password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    if (currentPassword === newPassword) {
        return error(res, 'New password must be different from your current password');
    }
    const userId = req.user.id;
    const { rows } = await query(`SELECT password_hash, email, tenant_id FROM users WHERE id = $1 AND is_active = true`, [userId]);
    const user = rows[0];
    if (!user)
        return error(res, 'User not found', 404);
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid)
        return error(res, 'Current password is incorrect', 401);
    const hash = await bcrypt.hash(newPassword, 10);
    await query(`UPDATE users SET password_hash = $2, force_password_change = false, updated_at = NOW() WHERE id = $1`, [userId, hash]);
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
router.post('/accept-terms', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { rows } = await query(`SELECT terms_accepted_at, email, tenant_id FROM users WHERE id = $1 AND is_active = true`, [userId]);
    const user = rows[0];
    if (!user)
        return error(res, 'User not found', 404);
    if (user.terms_accepted_at) {
        return success(res, { termsAcceptedAt: user.terms_accepted_at });
    }
    const { rows: updated } = await query(`UPDATE users SET terms_accepted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING terms_accepted_at`, [userId]);
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
 * Step 1 — verify email exists for an active user, then issue a short-lived reset token.
 */
router.post('/forgot-password', async (req, res) => {
    const email = String(req.body?.email || '')
        .toLowerCase()
        .trim();
    if (!email)
        return error(res, 'Email is required');
    const { rows } = await query(`SELECT id, email, is_active, tenant_id FROM users WHERE email = $1`, [email]);
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
    const resetToken = jwt.sign({ sub: user.id, id: user.id, email: user.email, purpose: 'password_reset' }, getJwtSecret(), { expiresIn: '15m', algorithm: 'HS256' });
    await AuditService.log({
        userId: user.id,
        userEmail: user.email,
        tenantId: user.tenant_id || undefined,
        action: 'auth.forgot_password_ok',
        resourceType: 'user',
        resourceId: user.id,
    });
    return success(res, { resetToken, email: user.email, expiresInMinutes: 15 });
});
/**
 * Step 2 — set a new password using the reset token from /forgot-password.
 */
router.post('/reset-password', async (req, res) => {
    const resetToken = String(req.body?.resetToken || '').trim();
    const newPassword = String(req.body?.newPassword || '');
    const confirmPassword = String(req.body?.confirmPassword || '');
    if (!resetToken)
        return error(res, 'Reset session expired. Start again with your email.');
    if (!newPassword || !confirmPassword) {
        return error(res, 'New password and confirmation are required');
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
        return error(res, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    if (newPassword !== confirmPassword) {
        return error(res, 'Passwords do not match');
    }
    let payload;
    try {
        payload = jwt.verify(resetToken, getJwtSecret(), { algorithms: ['HS256'] });
    }
    catch {
        return error(res, 'Reset link expired. Request a new password reset.', 401);
    }
    if (payload.purpose !== 'password_reset') {
        return error(res, 'Invalid reset token', 401);
    }
    const userId = payload.id || payload.sub;
    if (!userId)
        return error(res, 'Invalid reset token', 401);
    const { rows } = await query(`SELECT id, email, tenant_id, is_active FROM users WHERE id = $1`, [userId]);
    const user = rows[0];
    if (!user || !user.is_active)
        return error(res, 'Account not found or inactive', 404);
    const hash = await bcrypt.hash(newPassword, 10);
    await query(`UPDATE users SET password_hash = $2, force_password_change = false, updated_at = NOW() WHERE id = $1`, [user.id, hash]);
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
