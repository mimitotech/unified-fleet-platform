import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ufp:ufp_dev@localhost:5432/unified_fleet',
});

async function runSqlFile(path: string) {
  const fs = await import('fs');
  const sql = fs.readFileSync(path, 'utf8');
  await pool.query(sql);
}

async function main() {
  const root = new URL('..', import.meta.url).pathname;
  const migrations = [
    '001_tenants.sql', '002_data_sources.sql', '003_assets.sql', '004_alerts.sql',
    '005_users.sql', '006_users_modules.sql', '007_seed_modules.sql',
    '008_domain_tables.sql', '009_demo_domain_seed.sql',
  ];

  // Verify connection first
  try {
    await pool.query('SELECT 1');
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ECONNREFUSED') {
      console.error(`
Cannot connect to Postgres. Database is not running.

Run the setup script (starts Docker + seeds DB):
  bash scripts/setup.sh

Or manually:
  1. Open Docker Desktop and wait until Running
  2. docker compose up -d postgres redis
  3. npm run db:migrate
`);
      process.exit(1);
    }
    throw e;
  }

  for (const m of migrations) {
    try {
      await runSqlFile(`${root}/migrations/${m}`);
      console.log('Migration', m);
    } catch (e) {
      console.warn('Skip', m, (e as Error).message);
    }
  }

  const demoHash = await bcrypt.hash('demo123', 10);
  const adminHash = await bcrypt.hash('admin123', 10);

  await pool.query(
    `INSERT INTO tenants (name, slug, primary_color) VALUES ('Demo Fleet', 'demo', '#006f45')
     ON CONFLICT (slug) DO NOTHING`
  );

  await pool.query(
    `INSERT INTO tenant_modules (tenant_id, module_key, is_enabled)
     SELECT t.id, md.key, md.default_enabled FROM tenants t
     CROSS JOIN module_definitions md WHERE t.slug = 'demo'
     ON CONFLICT DO NOTHING`
  );

  await pool.query(
    `INSERT INTO users (tenant_id, email, password_hash, full_name, role)
     SELECT t.id, 'demo@mimito.ug', $1, 'Demo Admin', 'tenant_admin'
     FROM tenants t WHERE t.slug = 'demo'
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [demoHash]
  );

  await pool.query(
    `INSERT INTO users (tenant_id, email, password_hash, full_name, role)
     VALUES (NULL, 'admin@ufp.local', $1, 'Platform Admin', 'platform_admin')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [adminHash]
  );

  console.log('Demo tenant: demo / demo@mimito.ug / demo123');
  console.log('Platform admin: admin@ufp.local / admin123');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
