import { getRedis } from '../config/redis.js';
import type { WialonCredentialsInput } from './WialonHierarchyService.js';
import { WialonClient } from '../adapters/wialonClient.js';
import { wialonHostFromBaseUrl, wialonUnitIconUrl } from './wialonIcon.js';

type MemEntry = { buf: Buffer; expires: number };

const memory = new Map<string, MemEntry>();
const MEM_TTL_MS = 6 * 60 * 60 * 1000;
const REDIS_TTL_SEC = 7 * 24 * 60 * 60;

type SessionSlot = {
  key: string;
  client: WialonClient;
  lastUsed: number;
  busy: Promise<void>;
};

const sessions = new Map<string, SessionSlot>();
const SESSION_IDLE_MS = 4 * 60 * 1000;

function iconCacheKey(tokenHint: string, unitId: number, size: number, ugi: number): string {
  return `wialon:icon:${tokenHint}:${unitId}:${size}:${ugi}`;
}

function tokenHint(creds: WialonCredentialsInput): string {
  const t = creds.token || '';
  return `${(creds.baseUrl || '').slice(0, 32)}:${t.slice(0, 12)}:${creds.operateAs || ''}`;
}

function pruneMemory() {
  if (memory.size < 400) return;
  const now = Date.now();
  for (const [k, v] of memory) {
    if (v.expires < now) memory.delete(k);
  }
  if (memory.size > 500) {
    const oldest = [...memory.entries()].sort((a, b) => a[1].expires - b[1].expires).slice(0, 100);
    for (const [k] of oldest) memory.delete(k);
  }
}

async function getCached(key: string): Promise<Buffer | null> {
  const mem = memory.get(key);
  if (mem && mem.expires > Date.now()) return mem.buf;

  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    const buf = Buffer.from(raw, 'base64');
    memory.set(key, { buf, expires: Date.now() + MEM_TTL_MS });
    return buf;
  } catch {
    return null;
  }
}

async function setCached(key: string, buf: Buffer): Promise<void> {
  memory.set(key, { buf, expires: Date.now() + MEM_TTL_MS });
  pruneMemory();
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.setEx(key, REDIS_TTL_SEC, buf.toString('base64'));
  } catch {
    /* ignore */
  }
}

async function withPooledClient<T>(
  creds: WialonCredentialsInput,
  fn: (client: WialonClient) => Promise<T>,
): Promise<T> {
  const key = tokenHint(creds);
  let slot = sessions.get(key);
  if (!slot) {
    const client = new WialonClient({
      token: creds.token,
      baseUrl: creds.baseUrl,
      operateAs: creds.operateAs,
    });
    await client.connect();
    client.startKeepAlive();
    slot = { key, client, lastUsed: Date.now(), busy: Promise.resolve() };
    sessions.set(key, slot);
  }

  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const prev = slot.busy;
  slot.busy = prev.then(() => gate);
  await prev;

  try {
    slot.lastUsed = Date.now();
    return await fn(slot.client);
  } finally {
    slot.lastUsed = Date.now();
    release();
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [key, slot] of sessions) {
    if (now - slot.lastUsed < SESSION_IDLE_MS) continue;
    sessions.delete(key);
    slot.client.stopKeepAlive();
    void slot.client.disconnect().catch(() => undefined);
  }
}, 60_000).unref?.();

/** Cached Wialon unit icon — memory + Redis; reuses a pooled session. */
export async function fetchCachedUnitIcon(
  creds: WialonCredentialsInput,
  unitId: number,
  size = 32,
  ugi = 1,
): Promise<Buffer> {
  const hint = tokenHint(creds);
  const key = iconCacheKey(hint, unitId, size, ugi);
  const hit = await getCached(key);
  if (hit?.byteLength) return hit;

  const buf = await withPooledClient(creds, async (client) => {
    const sid = client.getSessionId();
    if (!sid) throw new Error('No Wialon session');
    const host = wialonHostFromBaseUrl(creds.baseUrl);

    const download = async (ugiVal: number) => {
      const url = `${wialonUnitIconUrl(host, unitId, size, ugiVal)}?sid=${encodeURIComponent(sid)}`;
      // Plain fetch — icon CDN must not abort under Hostinger latency.
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Wialon icon HTTP ${res.status}`);
      const ab = await res.arrayBuffer();
      if (!ab.byteLength) throw new Error('Empty Wialon icon');
      return Buffer.from(ab);
    };

    try {
      return await download(ugi);
    } catch {
      if (ugi === 1) throw new Error('Wialon icon unavailable');
      return download(1);
    }
  });

  await setCached(key, buf);
  if (ugi !== 1) {
    await setCached(iconCacheKey(hint, unitId, size, 1), buf);
  }
  return buf;
}
