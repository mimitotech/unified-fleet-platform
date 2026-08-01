import pg from 'pg';

const url = process.env.DATABASE_URL || 'postgresql://ufp:ufp_dev@localhost:5432/unified_fleet';
const maxAttempts = parseInt(process.env.WAIT_ATTEMPTS || '30', 10);
const delayMs = 2000;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  for (let i = 1; i <= maxAttempts; i++) {
    const pool = new pg.Pool({ connectionString: url });
    try {
      await pool.query('SELECT 1');
      await pool.end();
      console.log('Postgres is ready.');
      return;
    } catch {
      await pool.end().catch(() => {});
      if (i === maxAttempts) {
        console.error(`
Postgres is not reachable at: ${url.replace(/:[^:@]+@/, ':****@')}

Fix one of these:

  A) Docker (recommended)
     1. Open Docker Desktop and wait until it says "Running"
     2. Run: docker compose up -d postgres redis
     3. Run: npm run db:migrate

  B) Homebrew Postgres (no Docker)
     brew install postgresql@16
     brew services start postgresql@16
     createuser -s ufp 2>/dev/null || true
     createdb unified_fleet -O ufp 2>/dev/null || true
     psql postgres -c "ALTER USER ufp PASSWORD 'ufp_dev';" 2>/dev/null || true
     Then set DATABASE_URL in .env and run: npm run db:migrate
`);
        process.exit(1);
      }
      process.stdout.write(`Waiting for Postgres (${i}/${maxAttempts})...\n`);
      await sleep(delayMs);
    }
  }
}

main();
