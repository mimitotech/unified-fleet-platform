import bcrypt from 'bcryptjs';
import { query } from '../config/database.js';
import { generateStrongPassword, assertStrongPassword } from '../utils/passwordPolicy.js';

export type ResetPasswordResult = {
  id: string;
  email: string;
  temporaryPassword: string;
};

function resolveResetPassword(password?: string | null): string {
  const explicit = password != null ? String(password).trim() : '';
  const finalPassword = explicit || generateStrongPassword({ length: 16 });
  assertStrongPassword(finalPassword);
  return finalPassword;
}

/**
 * Reset a tenant (or any) user password by id.
 * Always returns the plaintext temporary password for the admin UI.
 */
export async function resetUserPasswordById(
  userId: string,
  opts?: {
    password?: string | null;
    tenantId?: string | null;
    forcePasswordChange?: boolean;
  },
): Promise<ResetPasswordResult> {
  const temporaryPassword = resolveResetPassword(opts?.password);
  const hash = await bcrypt.hash(temporaryPassword, 10);
  const forceChange = opts?.forcePasswordChange !== false;

  const runUpdate = async (withForceCol: boolean) => {
    if (opts?.tenantId) {
      if (withForceCol) {
        return query<{ id: string; email: string }>(
          `UPDATE users
           SET password_hash = $3, force_password_change = $4, updated_at = NOW()
           WHERE id = $2 AND tenant_id = $1
           RETURNING id, email`,
          [opts.tenantId, userId, hash, forceChange],
        );
      }
      return query<{ id: string; email: string }>(
        `UPDATE users
         SET password_hash = $3, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $1
         RETURNING id, email`,
        [opts.tenantId, userId, hash],
      );
    }

    if (withForceCol) {
      return query<{ id: string; email: string }>(
        `UPDATE users
         SET password_hash = $2, force_password_change = $3, updated_at = NOW()
         WHERE id = $1
         RETURNING id, email`,
        [userId, hash, forceChange],
      );
    }
    return query<{ id: string; email: string }>(
      `UPDATE users
       SET password_hash = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING id, email`,
      [userId, hash],
    );
  };

  let rows: { id: string; email: string }[];
  try {
    ({ rows } = await runUpdate(true));
  } catch (e) {
    const msg = ((e as Error).message || '').toLowerCase();
    if (msg.includes('force_password_change') || msg.includes('unknown column')) {
      ({ rows } = await runUpdate(false));
    } else {
      throw e;
    }
  }

  const user = rows[0];
  if (!user) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }

  return { id: user.id, email: user.email, temporaryPassword };
}

export async function resetSystemUserPassword(
  userId: string,
  password?: string | null,
): Promise<ResetPasswordResult> {
  const temporaryPassword = resolveResetPassword(password);
  const hash = await bcrypt.hash(temporaryPassword, 10);

  const { rows } = await query<{ id: string; email: string }>(
    `UPDATE users
     SET password_hash = $2, updated_at = NOW()
     WHERE id = $1 AND tenant_id IS NULL AND role IN ('super_admin', 'platform_admin')
     RETURNING id, email`,
    [userId, hash],
  );

  const user = rows[0];
  if (!user) {
    throw Object.assign(new Error('System user not found'), { status: 404 });
  }
  return { id: user.id, email: user.email, temporaryPassword };
}
