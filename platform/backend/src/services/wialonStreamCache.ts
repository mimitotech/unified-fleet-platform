import { randomBytes } from 'node:crypto';

type StreamEntry = {
  tenantId: string;
  unitId: number;
  channel: number;
  upstreamUrl: string;
  contentType?: string;
  expiresAt: number;
  accessToken: string;
};

const cache = new Map<string, StreamEntry>();
const accessByToken = new Map<string, { key: string; expiresAt: number }>();
const TTL_MS = 5 * 60_000;

function cacheKey(tenantId: string, unitId: number, channel: number): string {
  return `${tenantId}:${unitId}:${channel}`;
}

export function setStreamUpstream(
  tenantId: string,
  unitId: number,
  channel: number,
  upstreamUrl: string,
  contentType?: string
): string {
  const key = cacheKey(tenantId, unitId, channel);
  const accessToken = randomBytes(16).toString('hex');
  cache.set(key, {
    tenantId,
    unitId,
    channel,
    upstreamUrl,
    contentType,
    expiresAt: Date.now() + TTL_MS,
    accessToken,
  });
  accessByToken.set(accessToken, { key, expiresAt: Date.now() + TTL_MS });
  return accessToken;
}

export function getStreamUpstream(
  tenantId: string,
  unitId: number,
  channel: number
): StreamEntry | null {
  const key = cacheKey(tenantId, unitId, channel);
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    accessByToken.delete(entry.accessToken);
    return null;
  }
  return entry;
}

export function getStreamByAccessToken(token: string): StreamEntry | null {
  const ref = accessByToken.get(token);
  if (!ref) return null;
  if (ref.expiresAt < Date.now()) {
    accessByToken.delete(token);
    cache.delete(ref.key);
    return null;
  }
  return cache.get(ref.key) ?? null;
}

const proxyTokens = new Map<string, { url: string; expiresAt: number }>();

export function registerProxyUrl(url: string): string {
  const token = randomBytes(12).toString('hex');
  proxyTokens.set(token, { url, expiresAt: Date.now() + TTL_MS });
  return token;
}

export function resolveProxyToken(token: string): string | null {
  const entry = proxyTokens.get(token);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    proxyTokens.delete(token);
    return null;
  }
  return entry.url;
}

function resolveAgainst(base: string, ref: string): string {
  if (/^https?:\/\//i.test(ref)) return ref;
  if (ref.startsWith('//')) return `https:${ref}`;
  try {
    return new URL(ref, base).href;
  } catch {
    return ref;
  }
}

export function rewriteM3u8Playlist(playlistText: string, baseUrl: string, segmentProxyPrefix: string): string {
  return playlistText
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        return trimmed.replace(/URI="([^"]+)"/g, (_m, uri: string) => {
          const abs = resolveAgainst(baseUrl, uri);
          const token = registerProxyUrl(abs);
          return `URI="${segmentProxyPrefix}${token}"`;
        });
      }
      const abs = resolveAgainst(baseUrl, trimmed);
      const token = registerProxyUrl(abs);
      return `${segmentProxyPrefix}${token}`;
    })
    .join('\n');
}

export async function fetchUpstream(
  url: string,
  range?: string
): Promise<{ body: Buffer; contentType: string; status: number }> {
  const headers: Record<string, string> = {};
  if (range) headers.Range = range;
  const res = await fetch(url, { headers, redirect: 'follow' });
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  return { body: buf, contentType, status: res.status };
}
