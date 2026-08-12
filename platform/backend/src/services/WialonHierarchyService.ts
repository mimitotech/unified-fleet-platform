import { WialonClient, type WialonSessionUser } from '../adapters/wialonClient.js';
import {
  WIALON_RESOURCE_ACCOUNT_FLAGS,
  WIALON_SEARCH_PAGE_SIZE,
  WIALON_USER_FLAGS,
  type WialonSearchItem,
  type WialonSearchResult,
} from '../adapters/wialonUtils.js';
import { filterActiveWialonUnits, searchUnitsForAccount, WIALON_UNIT_SEARCH_FLAGS } from './wialonLiveUtils.js';

export type WialonAccountTier = 'mother' | 'dealer' | 'admin' | 'user';

export interface WialonCredentialsInput {
  token: string;
  baseUrl?: string;
  operateAs?: string | number;
  accountId?: string | number;
}

export interface WialonAccountNode {
  id: number;
  name: string;
  isAccount: boolean;
  parentAccountId?: number;
  parentAccountName?: string;
  unitCount?: number;
  userCount?: number;
  enabled?: boolean;
  plan?: string;
}

export interface WialonUserNode {
  id: number;
  name: string;
  accountId?: number;
  creatorId?: number;
  lastLogin?: number;
  email?: string;
}

export interface WialonProbeResult {
  sessionUser: WialonSessionUser;
  accountTier: WialonAccountTier;
  dealerRights: boolean;
  counts: {
    units: number;
    accounts: number;
    users: number;
    resources: number;
    routes: number;
    unitGroups: number;
  };
  accounts: WialonAccountNode[];
  users: WialonUserNode[];
  scopedAccountId?: number;
  currentAccount?: {
    id: number;
    name: string;
    parentAccountId?: number;
    parentAccountName?: string;
    enabled?: boolean;
    plan?: string;
    balance?: string;
    daysCounter?: number;
  };
}

function tierFromProbe(
  sessionUser: WialonSessionUser,
  accountCount: number,
  dealerRights: boolean
): WialonAccountTier {
  if (dealerRights && accountCount > 1) return 'mother';
  if (dealerRights) return 'dealer';
  if (accountCount > 1) return 'admin';
  return 'user';
}

async function searchAll(
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

/**
 * Per-account active unit counts via billing/accounttree search.
 * bact on a flat mother search is often missing or points only at the mother —
 * so the tree would show "0 active" on every client. This matches how account
 * detail already counts units.
 */
async function fillAccountUnitCounts(
  client: WialonClient,
  accounts: WialonAccountNode[],
  concurrency = 5,
): Promise<void> {
  if (!accounts.length) return;
  let cursor = 0;
  async function worker() {
    while (cursor < accounts.length) {
      const idx = cursor++;
      const acct = accounts[idx];
      try {
        const units = await searchUnitsForAccount(client, acct.id, 10_000);
        acct.unitCount = units.length;
      } catch {
        if (acct.unitCount == null) acct.unitCount = 0;
      }
    }
  }
  const n = Math.min(concurrency, accounts.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
}

export class WialonHierarchyService {
  private static hierarchyCache = new Map<string, { at: number; result: WialonProbeResult }>();
  private static readonly HIERARCHY_TTL_MS = 5 * 60_000;

  private static cacheKey(credentials: WialonCredentialsInput): string {
    return `${credentials.baseUrl || ''}|${String(credentials.token || '').slice(0, 32)}|${credentials.operateAs || ''}`;
  }

  static invalidateHierarchyCache(credentials?: WialonCredentialsInput): void {
    if (!credentials) {
      this.hierarchyCache.clear();
      return;
    }
    this.hierarchyCache.delete(this.cacheKey(credentials));
  }

  /**
   * Fast mother-account listing for Wialon Center / client link UI.
   * Loads billing accounts (+ light user list) only — no units / no per-account unit fan-out.
   * Required for 100–500+ accounts under a mother without gateway timeouts.
   */
  static async probeAccountsOnly(
    credentials: WialonCredentialsInput,
    opts?: { force?: boolean }
  ): Promise<WialonProbeResult> {
    const key = this.cacheKey(credentials);
    if (!opts?.force) {
      const hit = this.hierarchyCache.get(key);
      if (hit && Date.now() - hit.at < this.HIERARCHY_TTL_MS) {
        return hit.result;
      }
    }

    const client = new WialonClient({
      token: credentials.token,
      baseUrl: credentials.baseUrl,
      operateAs: credentials.operateAs,
    });

    try {
      await client.connect();
      const sessionUser = client.getSessionUser();
      if (!sessionUser) throw new Error('Wialon login succeeded but user context is missing');

      let dealerRights = false;
      let currentAccount: WialonProbeResult['currentAccount'];

      try {
        const acctData = await client.request<{
          dealerRights?: number;
          plan?: string;
          enabled?: number;
          balance?: string;
          daysCounter?: number;
          parentAccountId?: number;
          parentAccountName?: string;
        }>('core/get_account_data', { type: 1 });
        dealerRights = acctData.dealerRights === 1;
        if (sessionUser.bact) {
          currentAccount = {
            id: sessionUser.bact,
            name: sessionUser.nm,
            parentAccountId: acctData.parentAccountId,
            parentAccountName: acctData.parentAccountName,
            enabled: acctData.enabled === 1,
            plan: acctData.plan,
            balance: acctData.balance,
            daysCounter: acctData.daysCounter,
          };
        }
      } catch {
        /* optional */
      }

      const accountResources = await searchAll(
        client,
        {
          itemsType: 'avl_resource',
          propName: 'rel_is_account',
          propValueMask: '1',
          sortType: 'sys_name',
          propType: 'property',
        },
        WIALON_RESOURCE_ACCOUNT_FLAGS
      );

      const accounts: WialonAccountNode[] = accountResources.map((r) => ({
        id: r.id,
        name: r.nm,
        isAccount: true,
        parentAccountId: r.bpact,
        parentAccountName: undefined,
        unitCount: undefined,
        enabled: true,
      }));

      const usersById = new Map<number, WialonSearchItem>();
      try {
        const creatorUsers = await searchAll(
          client,
          {
            itemsType: 'user',
            propName: 'sys_user_creator',
            propValueMask: String(sessionUser.id),
            sortType: 'sys_name',
            propType: 'creatortree',
          },
          WIALON_USER_FLAGS
        );
        for (const u of creatorUsers) usersById.set(u.id, u);
      } catch {
        /* optional — account list still usable without users */
      }

      const userNodes: WialonUserNode[] = [...usersById.values()].map((u) => ({
        id: u.id,
        name: u.nm,
        accountId: u.bact,
        creatorId: u.crt,
        lastLogin: u.ld,
        email: u.prp?.email || u.prp?.e_mail || undefined,
      }));

      for (const acct of accounts) {
        acct.userCount = userNodes.filter((un) => un.accountId === acct.id).length;
      }

      const accountTier = tierFromProbe(sessionUser, accounts.length, dealerRights);
      const result: WialonProbeResult = {
        sessionUser,
        accountTier,
        dealerRights,
        counts: {
          units: 0,
          accounts: accounts.length,
          users: userNodes.length,
          resources: 0,
          routes: 0,
          unitGroups: 0,
        },
        accounts,
        users: userNodes,
        currentAccount,
      };

      this.hierarchyCache.set(key, { at: Date.now(), result });
      return result;
    } finally {
      await client.disconnect();
    }
  }

  static async probe(credentials: WialonCredentialsInput): Promise<WialonProbeResult> {
    const client = new WialonClient({
      token: credentials.token,
      baseUrl: credentials.baseUrl,
      operateAs: credentials.operateAs,
    });

    try {
      await client.connect();
      const sessionUser = client.getSessionUser();
      if (!sessionUser) throw new Error('Wialon login succeeded but user context is missing');

      let dealerRights = false;
      let currentAccount: WialonProbeResult['currentAccount'];

      try {
        const acctData = await client.request<{
          dealerRights?: number;
          plan?: string;
          enabled?: number;
          balance?: string;
          daysCounter?: number;
          parentAccountId?: number;
          parentAccountName?: string;
        }>('core/get_account_data', { type: 1 });
        dealerRights = acctData.dealerRights === 1;
        if (sessionUser.bact) {
          currentAccount = {
            id: sessionUser.bact,
            name: sessionUser.nm,
            parentAccountId: acctData.parentAccountId,
            parentAccountName: acctData.parentAccountName,
            enabled: acctData.enabled === 1,
            plan: acctData.plan,
            balance: acctData.balance,
            daysCounter: acctData.daysCounter,
          };
        }
      } catch {
        /* optional */
      }

      const accountResources = await searchAll(
        client,
        {
          itemsType: 'avl_resource',
          propName: 'rel_is_account',
          propValueMask: '1',
          sortType: 'sys_name',
          propType: 'property',
        },
        WIALON_RESOURCE_ACCOUNT_FLAGS
      );

      const accounts: WialonAccountNode[] = accountResources.map((r) => ({
        id: r.id,
        name: r.nm,
        isAccount: true,
        parentAccountId: r.bpact,
        parentAccountName: undefined,
        unitCount: undefined,
        enabled: true,
      }));

      const usersById = new Map<number, WialonSearchItem>();

      const creatorUsers = await searchAll(
        client,
        {
          itemsType: 'user',
          propName: 'sys_user_creator',
          propValueMask: String(sessionUser.id),
          sortType: 'sys_name',
          propType: 'creatortree',
        },
        WIALON_USER_FLAGS
      );
      for (const u of creatorUsers) usersById.set(u.id, u);

      if (dealerRights && sessionUser.bact) {
        try {
          const accountUsers = await searchAll(
            client,
            {
              itemsType: 'user',
              propName: 'sys_billing_account_guid',
              propValueMask: String(sessionUser.bact),
              sortType: 'sys_name',
              propType: 'accounttree',
            },
            WIALON_USER_FLAGS
          );
          for (const u of accountUsers) usersById.set(u.id, u);
        } catch {
          /* optional — accounttree needs dealer/mother rights */
        }
      }

      const userNodes: WialonUserNode[] = [...usersById.values()].map((u) => ({
        id: u.id,
        name: u.nm,
        accountId: u.bact,
        creatorId: u.crt,
        lastLogin: u.ld,
        email: u.prp?.email || u.prp?.e_mail || undefined,
      }));

      const scopedAccountId = credentials.accountId
        ? parseInt(String(credentials.accountId), 10)
        : NaN;

      let scopedUsers = userNodes;
      if (!Number.isNaN(scopedAccountId)) {
        try {
          scopedUsers = await this.getUsersForAccount(credentials, scopedAccountId, client);
        } catch {
          scopedUsers = userNodes.filter((u) => u.accountId === scopedAccountId);
        }
      }

      const rawUnits = !Number.isNaN(scopedAccountId)
        ? await this.getUnitsForAccount(credentials, scopedAccountId, 10_000, client)
        : await searchAll(
            client,
            {
              itemsType: 'avl_unit',
              propName: 'sys_name',
              propValueMask: '*',
              sortType: 'sys_name',
            },
            WIALON_UNIT_SEARCH_FLAGS,
          );
      const units = filterActiveWialonUnits(rawUnits);

      // Fast bact attribution (works when Wialon returns billing ids)
      const unitCountByAccount = new Map<number, number>();
      for (const u of units) {
        const bact = Number(u.bact);
        if (Number.isFinite(bact) && bact > 0) {
          unitCountByAccount.set(bact, (unitCountByAccount.get(bact) || 0) + 1);
        }
      }
      for (const acct of accounts) {
        acct.unitCount = unitCountByAccount.get(acct.id) ?? 0;
        acct.userCount = scopedUsers.filter((un) => un.accountId === acct.id).length;
      }

      // When bact is missing/wrong, every client shows 0 while mother totals are fine.
      // Fall back to per-account billing/accounttree search — but NEVER for large mother trees
      // (that is O(N accounts × unit search) and times out Hostinger at 100–200+ clients).
      const attributed = accounts.reduce((s, a) => s + (a.unitCount || 0), 0);
      const needAccurate =
        accounts.length > 0 &&
        accounts.length <= 40 &&
        units.length > 0 &&
        (attributed === 0 || attributed < Math.floor(units.length * 0.3));
      if (needAccurate || !Number.isNaN(scopedAccountId)) {
        const targets = !Number.isNaN(scopedAccountId)
          ? accounts.filter((a) => a.id === scopedAccountId)
          : accounts;
        await fillAccountUnitCounts(client, targets.length ? targets : accounts);
      }

      const displayUsers = !Number.isNaN(scopedAccountId) ? scopedUsers : userNodes;

      const resources = await searchAll(
        client,
        {
          itemsType: 'avl_resource',
          propName: 'sys_name',
          propValueMask: '*',
          sortType: 'sys_name',
        },
        1
      );

      const routes = await searchAll(
        client,
        {
          itemsType: 'avl_route',
          propName: 'sys_name',
          propValueMask: '*',
          sortType: 'sys_name',
        },
        1
      );

      const unitGroups = await searchAll(
        client,
        {
          itemsType: 'avl_unit_group',
          propName: 'sys_name',
          propValueMask: '*',
          sortType: 'sys_name',
        },
        1
      );

      const accountTier = tierFromProbe(sessionUser, accounts.length, dealerRights);

      // Prefer sum of account tree counts when we filled them; else flat search total
      const treeUnitSum = accounts.reduce((s, a) => s + (a.unitCount || 0), 0);
      const unitTotal =
        !Number.isNaN(scopedAccountId)
          ? units.length
          : treeUnitSum > 0
            ? treeUnitSum
            : units.length;

      return {
        sessionUser,
        accountTier,
        dealerRights,
        counts: {
          units: unitTotal,
          accounts: accounts.length,
          users: displayUsers.length,
          resources: resources.length,
          routes: routes.length,
          unitGroups: unitGroups.length,
        },
        accounts,
        users: displayUsers,
        scopedAccountId: !Number.isNaN(scopedAccountId) ? scopedAccountId : undefined,
        currentAccount,
      };
    } finally {
      await client.disconnect();
    }
  }

  static async getUnitsForAccount(
    credentials: WialonCredentialsInput,
    accountId: number,
    limit = 10_000,
    existingClient?: WialonClient
  ): Promise<WialonSearchItem[]> {
    const client =
      existingClient ||
      new WialonClient({
        token: credentials.token,
        baseUrl: credentials.baseUrl,
        operateAs: credentials.operateAs,
      });
    const ownsClient = !existingClient;
    try {
      if (ownsClient) await client.connect();
      return searchUnitsForAccount(client, accountId, limit);
    } finally {
      if (ownsClient) await client.disconnect();
    }
  }

  static async getUsersForAccount(
    credentials: WialonCredentialsInput,
    accountId: number,
    existingClient?: WialonClient
  ): Promise<WialonUserNode[]> {
    const client =
      existingClient ||
      new WialonClient({
        token: credentials.token,
        baseUrl: credentials.baseUrl,
        operateAs: credentials.operateAs,
      });
    const ownsClient = !existingClient;
    const mapUser = (u: WialonSearchItem): WialonUserNode => ({
      id: u.id,
      name: u.nm,
      accountId: u.bact,
      creatorId: u.crt,
      lastLogin: u.ld,
      email: u.prp?.email || u.prp?.e_mail || undefined,
    });

    const searchSpecs: Array<Record<string, unknown>> = [
      {
        itemsType: 'user',
        propName: 'sys_billing_account_guid',
        propValueMask: String(accountId),
        sortType: 'sys_name',
        propType: 'accounttree',
      },
      {
        itemsType: 'user',
        propName: 'sys_billing_account_guid',
        propValueMask: String(accountId),
        sortType: 'sys_name',
        propType: 'property',
      },
      // Do NOT search sys_name=* under mother tokens — at 200+ accounts that loads the whole fleet.
    ];

    try {
      if (ownsClient) await client.connect();

      for (const spec of searchSpecs) {
        try {
          const users = await searchAll(client, spec, WIALON_USER_FLAGS);
          if (users.length) {
            return users.map(mapUser);
          }
        } catch {
          /* try next Wialon search shape */
        }
      }
      return [];
    } finally {
      if (ownsClient) await client.disconnect();
    }
  }

  static buildSessionMeta(probe: WialonProbeResult): Record<string, unknown> {
    return {
      probedAt: new Date().toISOString(),
      accountTier: probe.accountTier,
      dealerRights: probe.dealerRights,
      sessionUserId: probe.sessionUser.id,
      sessionUserName: probe.sessionUser.nm,
      sessionAccountId: probe.sessionUser.bact,
      counts: probe.counts,
      currentAccount: probe.currentAccount,
    };
  }
}
