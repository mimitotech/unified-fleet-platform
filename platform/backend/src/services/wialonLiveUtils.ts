import type { WialonClient } from '../adapters/wialonClient.js';
import {
  WIALON_UNIT_FLAG,
  WIALON_UNIT_FLAGS,
  WIALON_SEARCH_PAGE_SIZE,
  type WialonSearchItem,
  type WialonSearchResult,
} from '../adapters/wialonUtils.js';
import type { WialonCredentialsInput } from './WialonHierarchyService.js';

/** Safe flags for core/search_items — some hosts reject TRIP_FUEL / PROFILE in bulk search. */
export const WIALON_UNIT_SEARCH_FLAGS =
  WIALON_UNIT_FLAG.BASE |
  WIALON_UNIT_FLAG.CUSTOM_PROPS |
  WIALON_UNIT_FLAG.CUSTOM_FIELDS |
  WIALON_UNIT_FLAG.IMAGE |
  WIALON_UNIT_FLAG.ADVANCED |
  WIALON_UNIT_FLAG.LAST_MSG_POS |
  WIALON_UNIT_FLAG.SENSORS |
  WIALON_UNIT_FLAG.COUNTERS |
  WIALON_UNIT_FLAG.MSG_PARAMS |
  WIALON_UNIT_FLAG.CONNECTION;

const UNIT_FLAG_FALLBACKS = [
  WIALON_UNIT_FLAGS,
  WIALON_UNIT_SEARCH_FLAGS,
  WIALON_UNIT_FLAG.BASE | WIALON_UNIT_FLAG.ADVANCED | WIALON_UNIT_FLAG.CONNECTION | WIALON_UNIT_FLAG.LAST_MSG_POS,
  0x1 | 0x10 | 0x100 | 0x400 | 0x1000 | 0x2000,
  0x1 | 0x100 | 0x400,
  0x1 | 0x100,
  0x1,
];

/**
 * Wialon advanced `act` / `dactt` — deactivated units must not appear in fleet or reports.
 * Explicitly activated units win even if a stale `dactt` remains after reactivation.
 */
export function isWialonUnitActive(item: Pick<WialonSearchItem, 'act' | 'dactt' | 'nm'>): boolean {
  if (item.act === 1 || item.act === true) return true;
  if (item.act === 0 || item.act === false) return false;
  if (typeof item.dactt === 'number' && item.dactt > 0) return false;
  return true;
}

export function filterActiveWialonUnits<T extends Pick<WialonSearchItem, 'act' | 'dactt' | 'nm' | 'id'>>(
  items: T[],
): T[] {
  return items.filter((item) => isWialonUnitActive(item));
}

/** Prefer richer search_items payloads when merging strategies. */
function rankUnitPayload(item: WialonSearchItem): number {
  let score = 0;
  if (item.pos) score += 2;
  if (item.sens && Object.keys(item.sens).length) score += 2;
  if (item.prp && Object.keys(item.prp).length) score += 1;
  if (item.act !== undefined) score += 1;
  if (item.uid) score += 1;
  return score;
}

function mergeUnitsById(
  target: Map<number, WialonSearchItem>,
  items: WialonSearchItem[],
): void {
  for (const item of items) {
    if (!item?.id) continue;
    const prev = target.get(item.id);
    if (!prev || rankUnitPayload(item) >= rankUnitPayload(prev)) {
      target.set(item.id, item);
    }
  }
}

export function activeUnitNameSet(items: Array<{ nm?: string; name?: string }>): Set<string> {
  const set = new Set<string>();
  for (const u of items) {
    const n = String(u.nm ?? u.name ?? '').trim().toLowerCase();
    if (n) set.add(n);
  }
  return set;
}

export function accountIdFrom(credentials: WialonCredentialsInput): string | undefined {
  const raw = credentials.accountId;
  if (raw === undefined || raw === null || String(raw).trim() === '') return undefined;
  return String(raw);
}

export function unitSearchSpec(accountId?: string): Record<string, unknown> {
  if (accountId) {
    return {
      itemsType: 'avl_unit',
      propName: 'sys_billing_account_guid',
      propValueMask: accountId,
      sortType: 'sys_name',
      propType: 'property',
    };
  }
  return {
    itemsType: 'avl_unit',
    propName: 'sys_name',
    propValueMask: '*',
    sortType: 'sys_name',
  };
}

export function resourceSearchSpec(accountId?: string): Record<string, unknown> {
  if (accountId) {
    return {
      itemsType: 'avl_resource',
      propName: 'sys_billing_account_guid',
      propValueMask: accountId,
      sortType: 'sys_name',
      propType: 'property',
    };
  }
  return {
    itemsType: 'avl_resource',
    propName: 'sys_name',
    propValueMask: '*',
    sortType: 'sys_name',
  };
}

export function routeSearchSpec(accountId?: string): Record<string, unknown> {
  if (accountId) {
    return {
      itemsType: 'avl_route',
      propName: 'sys_billing_account_guid',
      propValueMask: accountId,
      sortType: 'sys_name',
      propType: 'property',
    };
  }
  return {
    itemsType: 'avl_route',
    propName: 'sys_name',
    propValueMask: '*',
    sortType: 'sys_name',
  };
}

export async function searchAll(
  client: WialonClient,
  spec: Record<string, unknown>,
  flags: number
): Promise<WialonSearchItem[]> {
  const all: WialonSearchItem[] = [];
  let from = 0;
  while (true) {
    const to = from + WIALON_SEARCH_PAGE_SIZE - 1;
    const result = await client.request<WialonSearchResult>('core/search_items', {
      spec,
      force: 1,
      flags,
      from,
      to,
    });
    const items = result.items || [];
    all.push(...items);
    const total = result.totalItemsCount ?? all.length;
    if (items.length === 0 || all.length >= total) break;
    from += WIALON_SEARCH_PAGE_SIZE;
  }
  return all;
}

function unitSearchSpecs(accountId: string): Array<Record<string, unknown>> {
  return [
    {
      itemsType: 'avl_unit',
      propName: 'sys_billing_account_guid',
      propValueMask: accountId,
      sortType: 'sys_name',
      propType: 'property',
    },
    {
      itemsType: 'avl_unit',
      propName: 'sys_billing_account_guid',
      propValueMask: accountId,
      sortType: 'sys_name',
      propType: 'accounttree',
    },
    {
      itemsType: 'avl_unit',
      propName: 'sys_name',
      propValueMask: '*',
      sortType: 'sys_name',
    },
  ];
}

/**
 * Search units with flag/spec fallbacks — avoids Wialon error 4 (Invalid input) on some hosts.
 *
 * IMPORTANT: Do not return on the first non-empty strategy. Billing `property` vs
 * `accounttree` vs bact-filtered wildcard often return different subsets on the
 * same account; merge by unit id so fleet/sync/alerts see the full active set.
 */
export async function searchUnitsForAccount(
  client: WialonClient,
  accountId: number,
  limit = 10_000
): Promise<WialonSearchItem[]> {
  const accountKey = String(accountId);
  const specs = unitSearchSpecs(accountKey);
  const byId = new Map<number, WialonSearchItem>();
  let lastErr: Error | undefined;
  let anySuccess = false;

  for (const spec of specs) {
    for (const flags of UNIT_FLAG_FALLBACKS) {
      try {
        const items = await searchAll(client, spec, flags);
        anySuccess = true;
        const filtered =
          spec.propValueMask === '*'
            ? items.filter((u) => Number(u.bact) === accountId)
            : items;
        const active = filterActiveWialonUnits(filtered);
        mergeUnitsById(byId, active);
        // Billing-scoped hit is complete — skip remaining strategies (major link/sync speedup).
        if (active.length && spec.propValueMask !== '*') {
          return [...byId.values()].slice(0, limit);
        }
        if (active.length || filtered.length) break;
      } catch (err) {
        lastErr = err as Error;
      }
    }
    if (byId.size && spec.propValueMask !== '*') {
      return [...byId.values()].slice(0, limit);
    }
  }

  if (byId.size) return [...byId.values()].slice(0, limit);
  if (lastErr && !anySuccess) throw lastErr;
  return [];
}

function billingScopedSpecs(
  itemsType: 'avl_unit_group' | 'avl_resource',
  accountId: string
): Array<Record<string, unknown>> {
  return [
    {
      itemsType,
      propName: 'sys_billing_account_guid',
      propValueMask: accountId,
      sortType: 'sys_name',
      propType: 'property',
    },
    {
      itemsType,
      propName: 'sys_billing_account_guid',
      propValueMask: accountId,
      sortType: 'sys_name',
      propType: 'accounttree',
    },
    {
      itemsType,
      propName: 'sys_name',
      propValueMask: '*',
      sortType: 'sys_name',
    },
  ];
}

function filterByBillingAccount(items: WialonSearchItem[], accountId: number, wildcard: boolean) {
  if (!wildcard) return items;
  return items.filter((item) => Number(item.bact) === accountId);
}

/** Unit groups with billing-account fallbacks (matches unit search behaviour). */
export async function searchGroupsForAccount(
  client: WialonClient,
  accountId: number,
  limit = 200
): Promise<WialonSearchItem[]> {
  const specs = billingScopedSpecs('avl_unit_group', String(accountId));
  let lastErr: Error | undefined;

  for (const spec of specs) {
    try {
      const items = await searchAll(client, spec, 1);
      const wildcard = spec.propValueMask === '*';
      const filtered = filterByBillingAccount(items, accountId, wildcard);
      if (filtered.length) return filtered.slice(0, limit);
      if (items.length && !wildcard) return items.slice(0, limit);
    } catch (err) {
      lastErr = err as Error;
    }
  }

  if (lastErr) throw lastErr;
  return [];
}

/** avl_resource items (reports, notifications, geofences) with billing-account fallbacks.
 * Merges every discovery strategy (property → accounttree → wildcard+bact) so a hit on an
 * empty/wrong resource set cannot hide resources that actually hold `unf` / `rep` / `zl`.
 */
export async function searchResourcesForAccount(
  client: WialonClient,
  accountId: number,
  flags = 8193,
  limit = 200
): Promise<WialonSearchItem[]> {
  const specs = billingScopedSpecs('avl_resource', String(accountId));
  const byId = new Map<number, WialonSearchItem>();
  let lastErr: Error | undefined;
  let anySuccess = false;

  for (const spec of specs) {
    try {
      const items = await searchAll(client, spec, flags);
      anySuccess = true;
      const wildcard = spec.propValueMask === '*';
      const filtered = filterByBillingAccount(items, accountId, wildcard);
      const toMerge = !wildcard && !filtered.length ? items : filtered;
      for (const item of toMerge) {
        const id = Number(item?.id);
        if (!Number.isFinite(id) || id <= 0) continue;
        const prev = byId.get(id);
        // Prefer the richer payload when the same resource appears in multiple strategies.
        const prevScore =
          (prev?.unf ? 4 : 0) + (prev?.rep ? 2 : 0) + (prev?.zl ? 1 : 0);
        const nextScore =
          (item.unf ? 4 : 0) + (item.rep ? 2 : 0) + (item.zl ? 1 : 0);
        if (!prev || nextScore >= prevScore) byId.set(id, item);
      }
    } catch (err) {
      lastErr = err as Error;
    }
  }

  if (byId.size) return [...byId.values()].slice(0, limit);
  if (lastErr && !anySuccess) throw lastErr;
  return [];
}

/** Minimal flags search — fast path for surveillance video unit discovery. */
export async function searchUnitsBasicForAccount(
  client: WialonClient,
  accountId: number,
  limit = 10_000
): Promise<WialonSearchItem[]> {
  const accountKey = String(accountId);
  const specs = unitSearchSpecs(accountKey);
  const MIN_FLAGS =
    WIALON_UNIT_FLAG.BASE | WIALON_UNIT_FLAG.ADVANCED | WIALON_UNIT_FLAG.CONNECTION;
  const byId = new Map<number, WialonSearchItem>();
  let lastErr: Error | undefined;
  let anySuccess = false;

  for (const spec of specs) {
    try {
      const items = await searchAll(client, spec, MIN_FLAGS);
      anySuccess = true;
      const filtered =
        spec.propValueMask === '*'
          ? items.filter((u) => Number(u.bact) === accountId)
          : items;
      mergeUnitsById(byId, filterActiveWialonUnits(filtered));
    } catch (err) {
      lastErr = err as Error;
    }
  }

  if (byId.size) return [...byId.values()].slice(0, limit);
  if (lastErr && !anySuccess) throw lastErr;
  return [];
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
