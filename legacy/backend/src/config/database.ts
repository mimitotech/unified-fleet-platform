import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { randomUUID, createHash } from 'crypto';
import { existsSync } from 'fs';

export type QueryResultRow = Record<string, unknown>;

export interface QueryResult<T extends QueryResultRow = QueryResultRow> {
  rows: T[];
  rowCount: number;
  insertId?: string | number;
}

let pool: Pool | null = null;
let poolReady: Promise<Pool> | null = null;

function strip(value: string): string {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

function findMysqlSocket(): string | undefined {
  if (process.env.DB_SOCKET?.trim()) return process.env.DB_SOCKET.trim();
  const candidates = [
    '/var/run/mysqld/mysqld.sock',
    '/run/mysqld/mysqld.sock',
    '/tmp/mysql.sock',
    '/var/lib/mysql/mysql.sock',
  ];
  return candidates.find((p) => existsSync(p));
}

type ConnParts = {
  user: string;
  password: string;
  database: string;
  port: number;
};

function readParts(): ConnParts {
  let user = strip(process.env.DB_USER || process.env.MYSQL_USER || process.env.DB_USERNAME || '');
  let password = strip(process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '');
  let database = strip(process.env.DB_NAME || process.env.MYSQL_DATABASE || process.env.DB_DATABASE || '');
  let port = parseInt(process.env.DB_PORT || process.env.MYSQL_PORT || '3306', 10);

  if ((!user || !database || !password) && process.env.DATABASE_URL?.startsWith('mysql')) {
    const u = new URL(
      process.env.DATABASE_URL.replace(/^mysql2:\/\//, 'mysql://')
    );
    user = user || decodeURIComponent(u.username);
    password = password || decodeURIComponent(u.password);
    database = database || decodeURIComponent((u.pathname || '/').replace(/^\//, ''));
    port = Number(u.port || port);
  }

  if (!user || !database) {
    throw new Error('MySQL is not configured. Set DB_USER / DB_PASSWORD / DB_NAME.');
  }

  return { user, password, database, port };
}

async function tryConnect(label: string, opts: mysql.PoolOptions): Promise<Pool> {
  const p = mysql.createPool({
    ...opts,
    waitForConnections: true,
    connectionLimit: 10,
    timezone: 'Z',
    supportBigNumbers: true,
    connectTimeout: 10000,
    enableKeepAlive: true,
  });
  try {
    const conn = await p.getConnection();
    try {
      await conn.query('SELECT 1');
    } finally {
      conn.release();
    }
  } catch (err) {
    await p.end().catch(() => undefined);
    throw err;
  }
  console.log('[mams-db] connected via', label);
  return p;
}

async function createWorkingPool(): Promise<Pool> {
  const parts = readParts();
  const fp = createHash('sha256').update(parts.password).digest('hex').slice(0, 8);
  console.log('[mams-db] credentials', {
    user: parts.user,
    database: parts.database,
    passwordLength: parts.password.length,
    passwordFingerprint: fp,
  });

  const base = {
    user: parts.user,
    password: parts.password,
    database: parts.database,
  };

  const errors: string[] = [];

  // 1) Unix socket → MySQL authenticates as user@localhost (Hostinger phpMyAdmin style)
  const socket = findMysqlSocket();
  if (socket) {
    try {
      return await tryConnect(`socket:${socket}`, { ...base, socketPath: socket });
    } catch (err) {
      errors.push(`socket ${socket}: ${(err as Error).message}`);
    }
  } else {
    console.warn('[mams-db] no mysql.sock found — will try TCP');
  }

  // 2) TCP IPv4 127.0.0.1 (never localhost — Node resolves localhost to ::1)
  try {
    return await tryConnect('tcp:127.0.0.1', {
      ...base,
      host: '127.0.0.1',
      port: parts.port,
      family: 4,
    } as mysql.PoolOptions);
  } catch (err) {
    errors.push(`tcp 127.0.0.1: ${(err as Error).message}`);
  }

  console.error('[mams-db] all connection strategies failed:\n - ' + errors.join('\n - '));
  throw new Error(
    `MySQL Access denied. passwordLength=${parts.password.length} fingerprint=${fp}. ` +
      `Open phpMyAdmin with the same user/password; re-save DB_PASSWORD in Hostinger; ` +
      `ensure user is assigned to database ${parts.database}.`
  );
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database pool not initialized — connectDatabase() must run first');
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
  // MariaDB prepared statements reject CAST(? AS JSON) — pass JSON strings directly
  sql = sql.replace(/CAST\(\s*(\$\d+|\?)\s+AS\s+JSON\s*\)/gi, '$1');
  sql = sql.replace(/::text/gi, '');
  sql = sql.replace(/::int(?:eger)?/gi, '');
  sql = sql.replace(/::bigint/gi, '');
  sql = sql.replace(/::numeric/gi, '');
  sql = sql.replace(/::float8/gi, '');
  sql = sql.replace(/::float/gi, '');
  sql = sql.replace(/::double precision/gi, '');
  sql = sql.replace(/::double/gi, '');
  sql = sql.replace(/::real/gi, '');
  sql = sql.replace(/::timestamptz/gi, '');
  sql = sql.replace(/::timestamp/gi, '');
  sql = sql.replace(/::date/gi, '');
  sql = sql.replace(/::boolean/gi, '');
  sql = sql.replace(/::interval/gi, '');

  sql = sql.replace(/\bILIKE\b/gi, 'LIKE');
  // Postgres regex operators → MySQL REGEXP (case-insensitive under default collations)
  sql = sql.replace(/(\S+)\s+~\*\s+'/g, "$1 REGEXP '");
  sql = sql.replace(/(\S+)\s+~\s+'/g, "$1 REGEXP '");
  sql = sql.replace(/\bTRUE\b/gi, '1');
  sql = sql.replace(/\bFALSE\b/gi, '0');
  sql = sql.replace(/\bEXCLUDED\.(\w+)/gi, 'VALUES($1)');

  // date_trunc BEFORE NOW() rewrite (NOW() becomes CURRENT_TIMESTAMP(3) and breaks [^)]+ matching)
  sql = rewriteDateTrunc(sql);
  sql = sql.replace(/\bto_char\s*\(\s*([^,]+)\s*,\s*'YYYY-MM-DD[^']*'\s*\)/gi, "DATE_FORMAT($1, '%Y-%m-%d')");
  sql = sql.replace(/\bto_char\s*\(\s*([^,]+)\s*,\s*'YYYY-MM'\s*\)/gi, "DATE_FORMAT($1, '%Y-%m')");
  sql = sql.replace(/\bto_char\s*\(\s*([^,]+)\s*,\s*'HH24[^']*'\s*\)/gi, "DATE_FORMAT($1, '%H')");
  sql = sql.replace(/\bEXTRACT\s*\(\s*EPOCH\s+FROM\s+([^)]+)\)/gi, 'UNIX_TIMESTAMP($1)');

  sql = sql.replace(/\bNOW\(\)/gi, 'CURRENT_TIMESTAMP(3)');

  // Reserved column names used as identifiers
  sql = sql.replace(/\bmd\.key\b/gi, 'md.`key`');
  sql = sql.replace(/\bm\.key\b/gi, 'm.`key`');
  sql = sql.replace(/\bSELECT\s+key\s*,/gi, 'SELECT `key`,');
  sql = sql.replace(/\bSELECT\s+key\s+FROM\b/gi, 'SELECT `key` FROM');
  sql = sql.replace(/,\s*key\s*,/gi, ', `key`,');
  sql = sql.replace(/\bORDER BY\s+key\b/gi, 'ORDER BY `key`');
  sql = sql.replace(/\bFROM\s+module_definitions\s+WHERE\s+key\b/gi, 'FROM module_definitions WHERE `key`');
  sql = sql.replace(/\bWHERE\s+key\s*=/gi, 'WHERE `key` =');
  sql = sql.replace(/\bON CONFLICT\s*\(\s*key\s*\)/gi, 'ON CONFLICT (`key`)');
  sql = sql.replace(/\bON CONFLICT\s*\(\s*`key`\s*\)/gi, 'ON CONFLICT (`key`)');

  // Allow whitespace/newlines between DO UPDATE and SET (common in multi-line upserts)
  sql = sql.replace(
    /ON CONFLICT\s*\(([^)]+)\)\s*WHERE[\s\S]*?DO UPDATE\s+SET/gi,
    'ON DUPLICATE KEY UPDATE'
  );
  sql = sql.replace(/ON CONFLICT\s*\(([^)]+)\)\s*DO UPDATE\s+SET/gi, 'ON DUPLICATE KEY UPDATE');
  sql = sql.replace(/ON CONFLICT\s+ON CONSTRAINT\s+\w+\s+DO UPDATE\s+SET/gi, 'ON DUPLICATE KEY UPDATE');

  if (/ON CONFLICT[\s\S]*DO NOTHING/i.test(sql)) {
    sql = sql.replace(/^\s*INSERT\s+INTO/i, 'INSERT IGNORE INTO');
    sql = sql.replace(/ON CONFLICT[\s\S]*DO NOTHING/gi, '');
  }

  // FILTER (WHERE …) with balanced parentheses
  sql = rewriteFilterAggregates(sql);

  sql = sql.replace(
    /string_agg\s*\(\s*([\s\S]+?)\s*,\s*'([^']*)'\s*\)/gi,
    "GROUP_CONCAT($1 SEPARATOR '$2')"
  );
  sql = sql.replace(/json_agg\s*\(\s*([\s\S]+?)\s*\)/gi, 'JSON_ARRAYAGG($1)');

  // ORDER BY col ASC NULLS LAST → ORDER BY (col IS NULL), col ASC
  sql = sql.replace(
    /(\S+)\s+(ASC|DESC)\s+NULLS\s+LAST\b/gi,
    '($1 IS NULL), $1 $2'
  );
  sql = sql.replace(
    /(\S+)\s+(ASC|DESC)\s+NULLS\s+FIRST\b/gi,
    '($1 IS NOT NULL), $1 $2'
  );
  sql = sql.replace(/(\S+)\s+NULLS\s+LAST\b/gi, '($1 IS NULL), $1');
  sql = sql.replace(/(\S+)\s+NULLS\s+FIRST\b/gi, '($1 IS NOT NULL), $1');

  sql = sql.replace(/INTERVAL\s+'(\d+)\s+hours?'/gi, 'INTERVAL $1 HOUR');
  sql = sql.replace(/INTERVAL\s+'(\d+)\s+days?'/gi, 'INTERVAL $1 DAY');
  sql = sql.replace(/INTERVAL\s+'(\d+)\s+minutes?'/gi, 'INTERVAL $1 MINUTE');
  sql = sql.replace(/to_timestamp\(([^)]+)\)/gi, 'FROM_UNIXTIME($1)');

  // Double-quoted identifiers → backticks (MySQL)
  sql = sql.replace(/"([a-zA-Z_][a-zA-Z0-9_]*)"/g, '`$1`');

  // Hostinger MySQL may not support RETURNING — query() re-selects; strip for raw prepareSql too
  sql = sql.replace(/\sRETURNING\s+[\s\S]+$/i, '');

  return sql;
}

/** Rewrite date_trunc('unit', expr) with paren-balanced expr matching. */
function rewriteDateTrunc(sql: string): string {
  const re = /date_trunc\(\s*'(\w+)'\s*,\s*/gi;
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(sql)) !== null) {
    const unit = m[1].toLowerCase();
    const exprStart = m.index + m[0].length;
    // Find end of expr: either matching close for nested parens, or the date_trunc closing )
    let i = exprStart;
    let depth = 0;
    for (; i < sql.length; i++) {
      const ch = sql[i];
      if (ch === '(') depth++;
      else if (ch === ')') {
        if (depth === 0) break;
        depth--;
      }
    }
    if (i >= sql.length) continue;
    const expr = sql.slice(exprStart, i).trim();
    let replacement: string;
    if (unit === 'day') replacement = `DATE(${expr})`;
    else if (unit === 'hour') replacement = `DATE_FORMAT(${expr}, '%Y-%m-%d %H:00:00')`;
    else if (unit === 'month') replacement = `DATE_FORMAT(${expr}, '%Y-%m-01')`;
    else if (unit === 'year') replacement = `DATE_FORMAT(${expr}, '%Y-01-01')`;
    else replacement = `DATE(${expr})`;
    out += sql.slice(last, m.index) + replacement;
    last = i + 1; // skip closing )
    re.lastIndex = last;
  }
  return out + sql.slice(last);
}

/** Rewrite COUNT/SUM … FILTER (WHERE …) using paren-balanced matching. */
function rewriteFilterAggregates(sql: string): string {
  // COALESCE(SUM(x) FILTER (WHERE …), 0)
  sql = replaceAllBalanced(
    sql,
    /COALESCE\(\s*SUM\(([^)]+)\)\s*FILTER\s*\(\s*WHERE\s+/gi,
    (m, whereClause) =>
      `COALESCE(SUM(CASE WHEN ${whereClause} THEN ${m[1]} ELSE 0 END), 0)`
  );

  sql = replaceAllBalanced(
    sql,
    /COUNT\(DISTINCT\s+(\w+(?:\.\w+)?)\)\s*FILTER\s*\(\s*WHERE\s+/gi,
    (m, whereClause) => `COUNT(DISTINCT CASE WHEN ${whereClause} THEN ${m[1]} END)`
  );

  sql = replaceAllBalanced(
    sql,
    /COUNT\(\*\)\s*FILTER\s*\(\s*WHERE\s+/gi,
    (_m, whereClause) => `SUM(CASE WHEN ${whereClause} THEN 1 ELSE 0 END)`
  );

  sql = replaceAllBalanced(
    sql,
    /SUM\(([^)]+)\)\s*FILTER\s*\(\s*WHERE\s+/gi,
    (m, whereClause) => `SUM(CASE WHEN ${whereClause} THEN ${m[1]} ELSE 0 END)`
  );

  return sql;
}

/**
 * Match `prefixRe` then consume through the FILTER's closing `)`.
 * For COALESCE(SUM…FILTER…), also consume the trailing `, 0)`.
 */
function replaceAllBalanced(
  sql: string,
  prefixRe: RegExp,
  build: (m: RegExpExecArray, whereClause: string) => string
): string {
  let out = '';
  let last = 0;
  prefixRe.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = prefixRe.exec(sql)) !== null) {
    const filterOpen = sql.lastIndexOf('(', m.index + m[0].length - 1);
    const filterClose = findMatchingParen(sql, filterOpen);
    if (filterClose < 0) continue;

    const whereClause = sql
      .slice(filterOpen + 1, filterClose)
      .replace(/^\s*WHERE\s+/i, '')
      .trim();

    let end = filterClose + 1;
    const built = build(m, whereClause);

    // COALESCE(SUM…FILTER…), 0) — swallow trailing `, 0)`
    if (built.startsWith('COALESCE(')) {
      const rest = sql.slice(end).match(/^\s*,\s*0\s*\)/);
      if (rest) end += rest[0].length;
    }

    out += sql.slice(last, m.index) + built;
    last = end;
    prefixRe.lastIndex = last;
  }
  return out + sql.slice(last);
}

function findMatchingParen(sql: string, openIdx: number): number {
  if (openIdx < 0 || sql[openIdx] !== '(') return -1;
  let depth = 0;
  for (let i = openIdx; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
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
      outParams.push(anyValues[anyIdx++] ?? null);
    } else {
      out += '?';
      const v = params[Number(m[1]) - 1];
      outParams.push(v === undefined ? null : v);
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
      const valsMatch = sql.match(
        /VALUES\s*\(([\s\S]*?)\)\s*(?:ON\s+(?:DUPLICATE|CONFLICT)|RETURNING|$)/i
      );
      const valueParts = valsMatch?.[1].split(',').map((v) => v.trim()) ?? [];

      const bindForCol = (colName: string): unknown | undefined => {
        const idx = cols.findIndex((c) => c.toLowerCase() === colName.toLowerCase());
        if (idx < 0) return undefined;
        const ph = valueParts[idx];
        const dollar = ph?.match(/^\$(\d+)$/);
        if (dollar) return bind[Number(dollar[1]) - 1];
        if (ph && /^'[0-9a-f-]{36}'$/i.test(ph)) return ph.slice(1, -1);
        return undefined;
      };

      // Natural / alternate PKs — never invent an `id` column (e.g. user_preferences.user_id)
      let reselectCol: string | null = null;
      let reselectVal: unknown;
      for (const key of ['user_id', 'token', 'key', 'slug'] as const) {
        const v = bindForCol(key);
        if (v != null) {
          reselectCol = key;
          reselectVal = v;
          break;
        }
      }

      let id: string | undefined;
      if (!reselectCol) {
        id = bindForCol('id') != null ? String(bindForCol('id')) : undefined;
        if (!id && !cols.some((c) => c.toLowerCase() === 'id')) {
          id = randomUUID();
          sql = sql.replace(
            /INSERT\s+(IGNORE\s+)?INTO\s+`?(\w+)`?\s*\(([^)]+)\)\s*VALUES\s*\(/i,
            `INSERT ${ignore}INTO ${table} (id, ${colList}) VALUES ('${id}', `
          );
        }
        if (id) {
          reselectCol = 'id';
          reselectVal = id;
        }
      }

      const execResult = await executeRaw(conn, sql, bind);
      if (reselectCol != null && reselectVal != null) {
        return executeRaw(
          conn,
          `SELECT ${selectCols === '*' ? '*' : selectCols} FROM ${table} WHERE \`${reselectCol}\` = $1`,
          [reselectVal]
        );
      }
      if (execResult.insertId) {
        return executeRaw(
          conn,
          `SELECT ${selectCols === '*' ? '*' : selectCols} FROM ${table} WHERE id = $1`,
          [execResult.insertId]
        );
      }
      return { rows: [], rowCount: 0 };
    }

    // UPDATE … RETURNING: re-select with the same WHERE (supports id, key, composites)
    const tableMatch = sql.match(/^\s*UPDATE\s+`?(\w+)`?/i);
    const whereMatch = sql.match(/\bWHERE\s+([\s\S]+)$/i);
    if (tableMatch && whereMatch) {
      const table = tableMatch[1];
      await executeRaw(conn, sql, bind);
      return executeRaw(
        conn,
        `SELECT ${selectCols === '*' ? '*' : selectCols} FROM ${table} WHERE ${whereMatch[1]}`,
        bind
      );
    }
  }

  return executeRaw(conn, sql, bind);
}

export async function connectDatabase(): Promise<void> {
  if (pool) {
    const conn = await pool.getConnection();
    try {
      await conn.query('SELECT 1');
    } finally {
      conn.release();
    }
    return;
  }
  if (!poolReady) {
    poolReady = createWorkingPool()
      .then((p) => {
        pool = p;
        return p;
      })
      .catch((err) => {
        poolReady = null;
        throw err;
      });
  }
  await poolReady;
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
