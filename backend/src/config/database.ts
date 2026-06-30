import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://ufp:ufp_dev@localhost:5432/unified_fleet',
    });
  }
  return pool;
}

export async function connectDatabase(): Promise<void> {
  const client = await getPool().connect();
  await client.query('SELECT 1');
  client.release();
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params);
}
