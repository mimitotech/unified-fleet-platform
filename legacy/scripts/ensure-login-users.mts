/**
 * Ensures standard login accounts exist with known passwords.
 * Run: npm run db:ensure-users
 */
import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ufp:ufp_dev@localhost:5432/unified_fleet',
});

const ACCOUNTS = [
  { email: 'super@mimito.ug', password: 'super123', fullName: 'Super Admin', role: 'super_admin', tenantSlug: null },
  { email: 'admin@ufp.local', password: 'admin123', fullName: 'Platform Admin', role: 'platform_admin', tenantSlug: null },
  { email: 'demo@mimito.ug', password: 'demo123', fullName: 'Demo Admin', role: 'tenant_admin', tenantSlug: 'demo' },
  { email: 'nsambajunior190@gmail.com', password: 'client123', fullName: 'Nsamba Admin', role: 'tenant_admin', tenantSlug: 'nsamba-motors-ug' },
  { email: 'nayiga@gmail.com', password: 'client123', fullName: 'Nayiga Viewer', role: 'viewer', tenantSlug: 'nsamba-motors-ug' },
  { email: 'marvin@gmail.com', password: 'client123', fullName: 'Marvin Manager', role: 'manager', tenantSlug: 'nsamba' },
] as const;

async function main() {
  for (const acct of ACCOUNTS) {
    const hash = await bcrypt.hash(acct.password, 10);
    let tenantId: string | null = null;

    if (acct.tenantSlug) {
      const { rows } = await pool.query<{ id: string }>(
        `SELECT id FROM tenants WHERE slug = $1`,
        [acct.tenantSlug]
      );
      tenantId = rows[0]?.id || null;
      if (!tenantId) {
        console.warn(`Skip ${acct.email}: tenant slug "${acct.tenantSlug}" not found`);
        continue;
      }
    }

    await pool.query(
      `INSERT INTO users (tenant_id, email, password_hash, full_name, role, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         full_name = EXCLUDED.full_name,
         role = EXCLUDED.role,
         tenant_id = EXCLUDED.tenant_id,
         is_active = true,
         updated_at = NOW()`,
      [tenantId, acct.email.toLowerCase(), hash, acct.fullName, acct.role]
    );

    console.log(`✓ ${acct.email} / ${acct.password} (${acct.role}${acct.tenantSlug ? ` · ${acct.tenantSlug}` : ''})`);
  }

  await pool.end();
  console.log('\nAll accounts ready. Sign in with email + password only (no slug).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
