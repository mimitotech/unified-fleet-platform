import { filterActiveWialonUnits } from './wialonLiveUtils.js';
const TTL_MS = 45_000;
const cache = new Map();
/** Short-lived cache of Wialon search_items — shared with fleet fetch. */
export const WialonUnitItemsCache = {
    get(accountKey) {
        const row = cache.get(accountKey);
        if (!row || row.expires < Date.now()) {
            cache.delete(accountKey);
            return null;
        }
        return filterActiveWialonUnits(row.items);
    },
    set(accountKey, items, ttlMs = TTL_MS) {
        cache.set(accountKey, { items: filterActiveWialonUnits(items), expires: Date.now() + ttlMs });
    },
    byId(accountKey) {
        const items = this.get(accountKey);
        if (!items)
            return null;
        return new Map(items.map((i) => [i.id, i]));
    },
};
