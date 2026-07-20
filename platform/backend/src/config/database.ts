import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { randomUUID } from 'crypto';

export type QueryResultRow = Record<string, unknown>;

export interface QueryResult<T extends QueryResultRow = QueryResultRow> {
  rows: T[];
  rowCount: number;
  insertId?: string | number;
}

let pool: Pool | null = null;

function buildPoolConfig(): mysql.PoolOptions {
  const url = process.env.DATABASE_URL?.trim();
  if (url && (url.startsWith('mysql://') || url.startsWith('mysql2://'))) {
    return {
      uri: url.replace(/^mysql2:\/\//, 'mysql://'),
      waitForConnections: true,
      connectionLimit: 20,
      timezone: 'Z',
    };
  }

  const host = process.env.DB_HOST || process.env.MYSQL_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || process.env.MYSQL_PORT || '3306', 10);
  const user = process.env.DB_USER || process.env.MYSQL_USER || process.env.DB_USERNAME || '';
  const password = process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '';
  const database = process.env.DB_NAME || process.env.MYSQL_DATABASE || process.env.DB_DATABASE || '';

  if (!user || !database) {
    throw new Error(
      'MySQL is not configured. Set DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME.'
    );
  }

  return {
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 20,
    timezone: 'Z',
    supportBigNumbers: true,
  };
}

export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool(buildPoolConfig());
  }
  return pool;
}

/** Convert common Postgres SQL dialect fragments toward MySQL. */
export function normalizeSql(text: string): string {
  let sql = text;

  sql = sql.replace(/::[a-zA-Z0-9_\s]+\[\]/gi, '');
  sql = sql.replace(/::uuid/gi, '');
  sql = sql.replace(/::jsonb/gi, '');
  sql = sql.replace(/::json/gi, '');
  sql = sql.replace(/::text/gi, '');
  sql = sql.replace(/::int(?:eger)?/gi, '');
  sql = sql.replace(/::bigint/gi, '');
  sql = sql.replace(/::numeric/gi, '');
  sql = sql.replace(/::float8/gi, '');
  sql = sql.replace(/::double precision/gi, '');
  sql = sql.replace(/::timestamptz/gi, '');
  sql = sql.replace(/::timestamp/gi, '');
  sql = sql.replace(/::date/gi, '');
  sql = sql.replace(/::boolean/gi, '');
  sql = sql.replace(/::interval/gi, '');

  sql = sql.replace(/\bILIKE\b/gi, 'LIKE');
  sql = sql.replace(/\bTRUE\b/g, '1');
  sql = sql.replace(/\bFALSE\b/g, '0');
  sql = sql.replace(/\bNOW\(\)/gi, 'CURRENT_TIMESTAMP(3)');
  sql = sql.replace(/\bEXCLUDED\.(\w+)/gi, 'VALUES($1)');

  sql = sql.replace(
    /ON CONFLICT\s*\(([^)]+)\)\s*WHERE[\s\S]*?DO UPDATE SET/gi,
    'ON DUPLICATE KEY UPDATE'
  );
  sql = sql.replace(/ON CONFLICT\s*\(([^)]+)\)\s*DO UPDATE SET/gi, 'ON DUPLICATE KEY UPDATE');
  sql = sql.replace(/ON CONFLICT\s+ON CONSTRAINT\s+\w+\s+DO UPDATE SET/gi, 'ON DUPLICATE KEY UPDATE');

  if (/ON CONFLICT[\s\S]*DO NOTHING/i.test(sql)) {
    sql = sql.replace(/^\s*INSERT\s+INTO/i, 'INSERT IGNORE INTO');
    sql = sql.replace(/ON CONFLICT[\s\S]*DO NOTHING/gi, '');
  }

  sql = sql.replace(
    /COUNT\(\*\)\s*FILTER\s*\(\s*WHERE\s+([\s\S]*?)\)/gi,
    'SUM(CASE WHEN $1 THEN 1 ELSE 0 END)'
  );
  sql = sql.replace(
    /COUNT\(DISTINCT\s+(\w+(?:\.\w+)?)\)\s*FILTER\s*\(\s*WHERE\s+([\s\S]*?)\)/gi,
    'COUNT(DISTINCT CASE WHEN $2 THEN $1 END)'
  );
  sql = sql.replace(
    /COALESCE\(SUM\(([^)]+)\)\s*FILTER\s*\(\s*WHERE\s+([\s\S]*?)\),\s*0\)/gi,
    'COALESCE(SUM(CASE WHEN $2 THEN $1 ELSE 0 END), 0)'
  );
  sql = sql.replace(
    /SUM\(([^)]+)\)\s*FILTER\s*\(\s*WHERE\s+([\s\S]*?)\)/gi,
    'SUM(CASE WHEN $2 THEN $1 ELSE 0 END)'
  );

  sql = sql.replace(/date_trunc\(\s*'day'\s*,\s*([^)]+)\)/gi, 'DATE($1)');
  sql = sql.replace(
    /date_trunc\(\s*'hour'\s*,\s*([^)]+)\)/gi,
    "DATE_FORMAT($1, '%Y-%m-%d %H:00:00')"
  );
  sql = sql.replace(
    /date_trunc\(\s*'month'\s*,\s*([^)]+)\)/gi,
    "DATE_FORMAT($1, '%Y-%m-01')"
  );

  sql = sql.replace(/INTERVAL\s+'(\d+)\s+hours?'/gi, 'INTERVAL $1 HOUR');
  sql = sql.replace(/INTERVAL\s+'(\d+)\s+days?'/gi, 'INTERVAL $1 DAY');
  sql = sql.replace(/INTERVAL\s+'(\d+)\s+minutes?'/gi, 'INTERVAL $1 MINUTE');
  sql = sql.replace(/to_timestamp\(([^)]+)\)/gi, 'FROM_UNIXTIME($1)');

  // Hostinger MySQL may not support RETURNING — query() re-selects; strip for raw prepareSql too
  sql = sql.replace(/\sRETURNING\s+[\s\S]+$/i, '');

  return sql;
}

/** Expand $1 / ANY($1::uuid[]) into MySQL `?` placeholders. */
export function prepareSql(text: string, params: unknown[] = []): { sql: string; params: unknown[] } {
  let src = text;
  const anyValues: unknown[] = [];

  src = src.replace(/=\s*ANY\s*\(\s*\$(\d+)(?:::[^)]*)?\s*\)/gi, (_full, n: string) => {
    const idx = Number(n) - 1;
    const arr = Array.isArray(params[idx]) ? (params[idx] as unknown[]) : [];
    if (arr.length === 0) return ' IN (NULL) AND 1=0 ';
    anyValues.push(...arr);
    return ` IN (${arr.map(() => '__ANY__').join(',')}) `;
  });

  src = normalizeSql(src);

  const outParams: unknown[] = [];
  let out = '';
  let last = 0;
  let anyIdx = 0;
  const tokenRe = /__ANY__|\$(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(src)) !== null) {
    out += src.slice(last, m.index);
    if (m[0] === '__ANY__') {
      out += '?';
      outParams.push(anyValues[anyIdx++]);
    } else {
      out += '?';
      outParams.push(params[Number(m[1]) - 1]);
    }
    last = m.index + m[0].length;
  }
  out += src.slice(last);
  return { sql: out, params: outParams };
}

type ExecConn = { execute: Pool['execute'] };

async function executeRaw(
  conn: ExecConn,
  text: string,
  params: unknown[] = []
): Promise<QueryResult> {
  const prepared = prepareSql(text, params);
  const [result] = await conn.execute(prepared.sql, prepared.params as never[]);
  if (Array.isArray(result)) {
    const rows = result as QueryResultRow[];
    return { rows, rowCount: rows.length };
  }
  const header = result as ResultSetHeader;
  return { rows: [], rowCount: header.affectedRows ?? 0, insertId: header.insertId };
}

async function queryWithConn(
  conn: ExecConn,
  text: string,
  params: unknown[] = []
): Promise<QueryResult> {
  const returningMatch = text.match(/\sRETURNING\s+([\s\S]+)$/i);
  const selectCols = returningMatch ? returningMatch[1].trim() : '*';
  let sql =
    returningMatch && returningMatch.index != null ? text.slice(0, returningMatch.index).trim() : text;
  const bind = [...params];

  if (returningMatch) {
    const insert = sql.match(
      /INSERT\s+(IGNORE\s+)?INTO\s+`?(\w+)`?\s*\(([^)]+)\)\s*VALUES\s*\(/i
    );
    if (insert) {
      const ignore = insert[1] || '';
      const table = insert[2];
      const colList = insert[3];
      const cols = colList.split(',').map((c) => c.trim().replace(/`/g, ''));

      let id: string | undefined;
      if (!cols.some((c) => c.toLowerCase() === 'id')) {
        id = randomUUID();
        sql = sql.replace(
          /INSERT\s+(IGNORE\s+)?INTO\s+`?(\w+)`?\s*\(([^)]+)\)\s*VALUES\s*\(/i,
          `INSERT ${ignore}INTO ${table} (id, ${colList}) VALUES ('${id}', `
        );
      } else {
        const valsMatch = sql.match(/VALUES\s*\(([^)]+)\)/i);
        const idIdx = cols.findIndex((c) => c.toLowerCase() === 'id');
        const ph = valsMatch?.[1].split(',').map((v) => v.trim())[idIdx];
        const dollar = ph?.match(/\$(\d+)/);
        if (dollar) id = String(bind[Number(dollar[1]) - 1]);
        else if (ph && /^'[0-9a-f-]{36}'$/i.test(ph)) id = ph.slice(1, -1);
      }

      await executeRaw(conn, sql, bind);
      if (id) {
        return executeRaw(
          conn,
          `SELECT ${selectCols === '*' ? '*' : selectCols} FROM ${table} WHERE id = $1`,
          [id]
        );
      }
      return { rows: [], rowCount: 0 };
    }

    const tableMatch = sql.match(/^\s*UPDATE\s+`?(\w+)`?/i);
    const whereId = sql.match(/\bWHERE\s+id\s*=\s*\$(\d+)/i);
    if (tableMatch && whereId) {
      const table = tableMatch[1];
      const id = bind[Number(whereId[1]) - 1];
      await executeRaw(conn, sql, bind);
      return executeRaw(
        conn,
        `SELECT ${selectCols === '*' ? '*' : selectCols} FROM ${table} WHERE id = $1`,
        [id]
      );
    }
  }

  return executeRaw(conn, sql, bind);
}

export async function connectDatabase(): Promise<void> {
  const conn = await getPool().getConnection();
  try {
    await conn.query('SELECT 1');
  } finally {
    conn.release();
  }
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  return queryWithConn(getPool(), text, params) as Promise<QueryResult<T>>;
}

export async function withTransaction<T>(fn: (q: typeof query) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const txQuery = (async (text: string, params: unknown[] = []) =>
      queryWithConn(conn, text, params)) as typeof query;
    const value = await fn(txQuery);
    await conn.commit();
    return value;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export function newId(): string {
  return randomUUID();
}

export type { Pool, PoolConnection, RowDataPacket };
