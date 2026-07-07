import type { WialonSearchItem } from '../adapters/wialonUtils.js';

const TTL_MS = 45_000;
const cache = new Map<string, { items: WialonSearchItem[]; expires: number }>();

/** Short-lived cache of Wialon search_items — shared with fleet fetch. */
export const WialonUnitItemsCache = {
  get(accountKey: string): WialonSearchItem[] | null {
    const row = cache.get(accountKey);
    if (!row || row.expires < Date.now()) {
      cache.delete(accountKey);
      return null;
    }
    return row.items;
  },

  set(accountKey: string, items: WialonSearchItem[], ttlMs = TTL_MS): void {
    cache.set(accountKey, { items, expires: Date.now() + ttlMs });
  },

  byId(accountKey: string): Map<number, WialonSearchItem> | null {
    const items = this.get(accountKey);
    if (!items) return null;
    return new Map(items.map((i) => [i.id, i]));
  },
};
