import { getTenantSlug, getToken } from '@/lib/api';

const API_URL = import.meta.env.VITE_API_URL || '';

/** Single fetch size — scaled in UI; keeps cache stable across map/list. */
export const FLEET_ICON_CANONICAL_SIZE = 48;

const PRELOAD_CONCURRENCY = 3;

const blobCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | undefined>>();
const listeners = new Set<() => void>();
let notifyTimer: ReturnType<typeof setTimeout> | null = null;

function cacheKey(wialonId: number, ugi: number): string {
  return `${wialonId}:${ugi}`;
}

function notifyListeners(): void {
  if (notifyTimer != null) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    listeners.forEach((fn) => fn());
  }, 80);
}

export function subscribeFleetIconCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = getToken();
  // Must match api() tenant resolution (URL → session preview → localStorage).
  // localStorage-only broke View Client icons (question marks) for system staff.
  const tenant = getTenantSlug();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenant) headers['X-Tenant-Slug'] = tenant;
  return headers;
}

export function getFleetUnitIconCached(wialonId?: number, ugi = 1): string | undefined {
  if (!wialonId) return undefined;
  return blobCache.get(cacheKey(wialonId, ugi));
}

/** Fetch Wialon unit icon with auth; deduped + cached by unit id. */
export async function loadFleetUnitIconBlob(
  wialonId: number,
  ugi = 1
): Promise<string | undefined> {
  const key = cacheKey(wialonId, ugi);
  const cached = blobCache.get(key);
  if (cached) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const task = (async () => {
    const tryFetch = async (ugiVal: number) => {
      const res = await fetch(
        `${API_URL}/api/client/wialon/units/${wialonId}/icon?size=${FLEET_ICON_CANONICAL_SIZE}&v=${ugiVal}`,
        { headers: authHeaders() }
      );
      if (!res.ok) return undefined;
      const blob = await res.blob();
      if (!blob.size) return undefined;
      const url = URL.createObjectURL(blob);
      blobCache.set(cacheKey(wialonId, ugiVal), url);
      if (ugiVal !== ugi) blobCache.set(key, url);
      notifyListeners();
      return url;
    };

    try {
      const primary = await tryFetch(ugi);
      if (primary) return primary;
      if (ugi !== 1) return tryFetch(1);
      return undefined;
    } catch {
      return undefined;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}

async function runPool<T>(items: T[], worker: (item: T) => Promise<void>, concurrency: number) {
  let i = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx]);
    }
  });
  await Promise.all(runners);
}

/** Warm icon cache when fleet snapshot arrives — parallel batch to avoid marker flicker. */
export function preloadFleetUnitIcons(
  units: Array<{ wialonId?: number; iconUgi?: number }>
): void {
  const jobs: Array<{ wialonId: number; ugi: number }> = [];
  const seen = new Set<string>();

  for (const u of units) {
    if (!u.wialonId) continue;
    const ugi = u.iconUgi ?? 1;
    const key = cacheKey(u.wialonId, ugi);
    if (seen.has(key) || blobCache.has(key) || inflight.has(key)) continue;
    seen.add(key);
    jobs.push({ wialonId: u.wialonId, ugi });
  }

  if (!jobs.length) return;

  void runPool(
    jobs,
    async (job) => {
      await loadFleetUnitIconBlob(job.wialonId, job.ugi);
    },
    PRELOAD_CONCURRENCY
  );
}
