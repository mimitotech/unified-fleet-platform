import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../config/database.js';
import { isValidTenantRole } from '../utils/userAccess.js';
import { assertStrongPassword, generateStrongPassword } from '../utils/passwordPolicy.js';
import { AuditService } from './AuditService.js';
import { ensureUserAlertAccessSchema } from './userAlertAccess.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return String(email || '').toLowerCase().trim();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(normalizeEmail(email));
}

export function resolvePassword(password?: string | null): {
  password: string;
  temporaryPassword?: string;
} {
  const explicit = password != null ? String(password).trim() : '';
  if (explicit) {
    assertStrongPassword(explicit);
    return { password: explicit };
  }
  const generated = generateStrongPassword({ length: 16 });
  return { password: generated, temporaryPassword: generated };
}

function isDuplicateError(err: unknown): boolean {
  const msg = ((err as Error)?.message || '').toLowerCase();
  return (
    msg.includes('duplicate') ||
    msg.includes('unique') ||
    msg.includes('er_dup_entry') ||
    /uq_users_email/i.test(msg)
  );
}

async function filterValidModuleKeys(modules: string[]): Promise<string[]> {
  const keys = [...new Set(modules.map((m) => String(m || '').trim()).filter(Boolean))];
  if (!keys.length) return [];
  const { rows } = await query<{ key: string }>(
    `SELECT \`key\` FROM module_definitions WHERE \`key\` = ANY($1)`,
    [keys],
  );
  return rows.map((r) => r.key);
}

async function insertUserModules(userId: string, modules: string[]): Promise<void> {
  const valid = await filterValidModuleKeys(modules);
  for (const mod of valid) {
    await query(
      `INSERT INTO user_modules (user_id, module_key, is_enabled)
       VALUES ($1, $2, true)
       ON CONFLICT DO NOTHING`,
      [userId, mod],
    );
  }
}

export type CreateTenantUserInput = {
  tenantId: string;
  email: string;
  password?: string | null;
  fullName?: string | null;
  role?: string | null;
  modules?: string[] | null;
  allowedAlertTypesJson?: string | null;
  forcePasswordChange?: boolean;
  actorUserId?: string;
  actorEmail?: string;
  auditAction?: string;
  auditDetails?: Record<string, unknown>;
};

export type CreateTenantUserResult = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at?: string;
  temporaryPassword?: string;
};

/** Create a tenant-scoped user with clear validation and duplicate handling. */
export async function createTenantUser(
  input: CreateTenantUserInput,
): Promise<CreateTenantUserResult> {
  await ensureUserAlertAccessSchema();
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) {
    throw Object.assign(new Error('A valid email is required'), { status: 400 });
  }

  const role = String(input.role || 'viewer');
  if (!isValidTenantRole(role)) {
    throw Object.assign(
      new Error('Invalid role. Use tenant_admin, manager, operator, or viewer.'),
      { status: 400 },
    );
  }

  let passwordInfo: { password: string; temporaryPassword?: string };
  try {
    passwordInfo = resolvePassword(input.password);
  } catch (e) {
    throw Object.assign(new Error((e as Error).message || 'Password does not meet policy'), {
      status: 400,
    });
  }

  const { rows: existing } = await query<{
    id: string;
    tenant_id: string | null;
    is_active: boolean | number;
  }>(`SELECT id, tenant_id, is_active FROM users WHERE email = $1 LIMIT 1`, [email]);

  if (existing[0]) {
    const sameTenant = existing[0].tenant_id === input.tenantId;
    const active = Boolean(existing[0].is_active);
    if (sameTenant && !active) {
      throw Object.assign(
        new Error(
          'This email belongs to a deactivated user in this organization. Reactivate them from the users list instead of creating a new account.',
        ),
        { status: 409 },
      );
    }
    if (sameTenant) {
      throw Object.assign(
        new Error('A user with this email already exists in this organization'),
        { status: 409 },
      );
    }
    throw Object.assign(new Error('This email is already registered to another account'), {
      status: 409,
    });
  }

  const hash = await bcrypt.hash(passwordInfo.password, 10);
  const fullName = String(input.fullName || '').trim() || email;
  const forceChange = input.forcePasswordChange !== false;

  try {
    const created = await withTransaction(async (tx) => {
      const { rows } = await tx<{
        id: string;
        email: string;
        full_name: string;
        role: string;
        is_active: boolean;
        created_at: string;
      }>(
        `INSERT INTO users (
           tenant_id, email, password_hash, full_name, role,
           force_password_change, is_active
         ) VALUES ($1, $2, $3, $4, $5, $6, true)
         RETURNING id, email, full_name, role, is_active, created_at`,
        [input.tenantId, email, hash, fullName, role, forceChange],
      );

      const user = rows[0];
      if (!user?.id) {
        throw Object.assign(new Error('Failed to create user'), { status: 500 });
      }

      if (Array.isArray(input.modules) && input.modules.length) {
        const valid = await filterValidModuleKeys(input.modules);
        for (const mod of valid) {
          await tx(
            `INSERT INTO user_modules (user_id, module_key, is_enabled)
             VALUES ($1, $2, true)
             ON CONFLICT DO NOTHING`,
            [user.id, mod],
          );
        }
      }

      return user;
    });

    if (input.allowedAlertTypesJson !== undefined) {
      try {
        await query(`UPDATE users SET allowed_alert_types = $2, updated_at = NOW() WHERE id = $1`, [
          created.id,
          input.allowedAlertTypesJson,
        ]);
      } catch (colErr) {
        console.warn(
          '[user-create] allowed_alert_types update skipped:',
          (colErr as Error).message,
        );
      }
    }

    try {
      await AuditService.log({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        userEmail: input.actorEmail,
        action: input.auditAction || 'user.create',
        resourceType: 'user',
        resourceId: created.id,
        details: {
          email,
          role,
          ...(input.auditDetails || {}),
        },
      });
    } catch (auditErr) {
      console.warn('[user-create] audit log failed:', (auditErr as Error).message);
    }

    return {
      ...created,
      temporaryPassword: passwordInfo.temporaryPassword,
    };
  } catch (e) {
    if ((e as { status?: number }).status) throw e;
    if (isDuplicateError(e)) {
      throw Object.assign(new Error('A user with this email already exists'), { status: 409 });
    }
    throw e;
  }
}

export type CreateSystemUserInput = {
  email: string;
  password?: string | null;
  fullName?: string | null;
  role: 'super_admin' | 'platform_admin';
  actorUserId?: string;
  actorEmail?: string;
};

export async function createSystemUser(input: CreateSystemUserInput) {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) {
    throw Object.assign(new Error('A valid email is required'), { status: 400 });
  }

  let passwordInfo: { password: string; temporaryPassword?: string };
  try {
    passwordInfo = resolvePassword(input.password);
  } catch (e) {
    throw Object.assign(new Error((e as Error).message || 'Password does not meet policy'), {
      status: 400,
    });
  }

  const { rows: existing } = await query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1 LIMIT 1`,
    [email],
  );
  if (existing[0]) {
    throw Object.assign(new Error('A user with this email already exists'), { status: 409 });
  }

  const hash = await bcrypt.hash(passwordInfo.password, 10);
  const fullName = String(input.fullName || '').trim() || email;

  try {
    const { rows } = await query<{
      id: string;
      email: string;
      full_name: string;
      role: string;
      is_active: boolean;
      created_at: string;
    }>(
      `INSERT INTO users (tenant_id, email, password_hash, full_name, role, is_active, force_password_change)
       VALUES (NULL, $1, $2, $3, $4, true, false)
       RETURNING id, email, full_name, role, is_active, created_at`,
      [email, hash, fullName, input.role],
    );

    const user = rows[0];
    if (!user?.id) {
      throw Object.assign(new Error('Failed to create system user'), { status: 500 });
    }

    try {
      await AuditService.log({
        userId: input.actorUserId,
        userEmail: input.actorEmail,
        action: 'system_user.create',
        resourceType: 'user',
        resourceId: user.id,
        details: { email, role: input.role },
      });
    } catch (auditErr) {
      console.warn('[user-create] audit log failed:', (auditErr as Error).message);
    }

    return { ...user, temporaryPassword: passwordInfo.temporaryPassword };
  } catch (e) {
    if ((e as { status?: number }).status) throw e;
    if (isDuplicateError(e)) {
      throw Object.assign(new Error('A user with this email already exists'), { status: 409 });
    }
    throw e;
  }
}

export { insertUserModules };
