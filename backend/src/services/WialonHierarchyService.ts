import { WialonClient, type WialonSessionUser } from '../adapters/wialonClient.js';
import {
  WIALON_RESOURCE_ACCOUNT_FLAGS,
  WIALON_SEARCH_PAGE_SIZE,
  WIALON_USER_FLAGS,
  type WialonSearchItem,
  type WialonSearchResult,
} from '../adapters/wialonUtils.js';
import { searchUnitsForAccount } from './wialonLiveUtils.js';

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

export class WialonHierarchyService {
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

      const units = !Number.isNaN(scopedAccountId)
        ? await this.getUnitsForAccount(credentials, scopedAccountId, 10_000, client)
        : await searchAll(
            client,
            {
              itemsType: 'avl_unit',
              propName: 'sys_name',
              propValueMask: '*',
              sortType: 'sys_name',
            },
            5
          );

      const unitCountByAccount = new Map<number, number>();
      for (const u of units) {
        if (u.bact) {
          unitCountByAccount.set(u.bact, (unitCountByAccount.get(u.bact) || 0) + 1);
        }
      }
      for (const acct of accounts) {
        acct.unitCount = unitCountByAccount.get(acct.id) ?? 0;
        acct.userCount = scopedUsers.filter((un) => un.accountId === acct.id).length;
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

      return {
        sessionUser,
        accountTier,
        dealerRights,
        counts: {
          units: units.length,
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
      {
        itemsType: 'user',
        propName: 'sys_name',
        propValueMask: '*',
        sortType: 'sys_name',
      },
    ];

    try {
      if (ownsClient) await client.connect();

      for (const spec of searchSpecs) {
        try {
          const users = await searchAll(client, spec, WIALON_USER_FLAGS);
          const filtered =
            spec.propValueMask === '*'
              ? users.filter((u) => Number(u.bact) === accountId)
              : users;
          if (filtered.length) {
            return filtered.map(mapUser);
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
