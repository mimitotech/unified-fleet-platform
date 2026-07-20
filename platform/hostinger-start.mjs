#!/usr/bin/env node
/**
 * Hostinger entry (same pattern as HomeBridge+ platform/hostinger-start.mjs).
 * Binds PORT immediately for Passenger, then loads the compiled MAMS server.
 *
 * Hostinger MySQL users are typically granted as user@localhost (Unix socket).
 * Using 127.0.0.1 forces TCP → Access denied for 'user'@'127.0.0.1'.
 */
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.NODE_ENV = 'production';
process.env.REDIS_DISABLED = process.env.REDIS_DISABLED || '1';

if (!process.env.PORT) process.env.PORT = '3000';

// Prefer localhost (socket). Do NOT rewrite to 127.0.0.1 on Hostinger.
if (!process.env.DB_HOST) process.env.DB_HOST = 'localhost';
if (process.env.DB_HOST === '127.0.0.1') process.env.DB_HOST = 'localhost';

if (!process.env.MYSQL_HOST) process.env.MYSQL_HOST = process.env.DB_HOST;
if (process.env.MYSQL_HOST === '127.0.0.1') process.env.MYSQL_HOST = 'localhost';
if (!process.env.MYSQL_USER && process.env.DB_USER) process.env.MYSQL_USER = process.env.DB_USER;
if (!process.env.MYSQL_PASSWORD && process.env.DB_PASSWORD) process.env.MYSQL_PASSWORD = process.env.DB_PASSWORD;
if (!process.env.MYSQL_DATABASE && process.env.DB_NAME) process.env.MYSQL_DATABASE = process.env.DB_NAME;

// DATABASE_URL with 127.0.0.1 also breaks Hostinger grants — normalize host
if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(
    /@(127\.0\.0\.1|\[::1\])(:\d+)?\//,
    '@localhost$2/'
  );
}

const root = dirname(fileURLToPath(import.meta.url));
const serverBundle = join(root, 'backend', 'dist', 'index.js');
const port = parseInt(process.env.PORT, 10) || 3000;
const host = process.env.HOST || '0.0.0.0';

console.log('[mams-start] node=', process.version);
console.log('[mams-start] PORT=', port);
console.log('[mams-start] DB_HOST=', process.env.DB_HOST);
console.log('[mams-start] DB_USER=', process.env.DB_USER || process.env.MYSQL_USER || '(unset)');
console.log('[mams-start] DB_NAME=', process.env.DB_NAME || process.env.MYSQL_DATABASE || '(unset)');
console.log('[mams-start] DATABASE_URL=', process.env.DATABASE_URL ? 'set' : 'unset');

if (!existsSync(serverBundle)) {
  console.error('[mams-start] FATAL: backend/dist/index.js missing — run npm run build');
  process.exit(1);
}

/** @type {import('node:http').RequestListener | null} */
let appHandler = null;
/** @type {Array<[import('node:http').IncomingMessage, import('node:http').ServerResponse]>} */
const waiting = [];

const server = createServer((req, res) => {
  if (appHandler) {
    appHandler(req, res);
    return;
  }
  waiting.push([req, res]);
  req.on('close', () => {
    const i = waiting.findIndex((pair) => pair[0] === req);
    if (i >= 0) waiting.splice(i, 1);
  });
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, host, () => {
    console.log(`[mams-start] early listen on http://${host}:${port}`);
    resolve();
  });
});

globalThis.__mamsAttach = (handler) => {
  appHandler = handler;
  const queued = waiting.splice(0, waiting.length);
  console.log(`[mams-start] app ready — flushing ${queued.length} queued request(s)`);
  for (const [req, res] of queued) {
    if (!res.writableEnded) handler(req, res);
  }
};

console.log('[mams-start] loading backend…');
await import(pathToFileURL(serverBundle).href);
