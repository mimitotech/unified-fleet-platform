import type { WialonClient } from '../adapters/wialonClient.js';
import {
  accountIdFrom,
  filterActiveWialonUnits,
  resourceSearchSpec,
  searchAll,
  searchGroupsForAccount,
  searchResourcesForAccount,
  searchUnitsForAccount,
  unitSearchSpec,
} from './wialonLiveUtils.js';
import type { WialonCredentialsInput } from './WialonHierarchyService.js';
import {
  patternsForModule,
  REPORT_TEMPLATE_PATTERNS,
  type FuelReportFamily,
  type WialonReportModule,
} from './wialonReportTemplateRegistry.js';

/** Scope key for tenant + billing account — prevents cross-tenant template cache leaks */
export type WialonReportScope = {
  tenantId: string;
  accountId?: string | number;
};

export type ResolvedReportTemplate = {
  resourceId: number;
  resourceName: string;
  templateId: number;
  templateName: string;
  module: WialonReportModule;
  isGroupReport: boolean;
  fuelFamily?: FuelReportFamily;
  canonicalName?: string;
  fallback?: boolean;
};

type ResourceWithTemplates = {
  id: number;
  nm: string;
  rep?: Record<string, { n: string; id?: number }>;
};

const RESOURCE_FLAGS = 8193; // general props + report templates
const CACHE_TTL_MS = 60 * 60 * 1000;

const resourcesCache = new Map<string, { resources: ResourceWithTemplates[]; expires: number }>();
const groupsCache = new Map<string, { groups: Array<{ id: number; nm: string }>; expires: number }>();
const moduleTemplateCache = new Map<
  string,
  { templates: ResolvedReportTemplate[]; expires: number }
>();

export function wialonReportScopeKey(scope: WialonReportScope): string {
  const acct =
    scope.accountId != null && String(scope.accountId).trim() !== ''
      ? String(scope.accountId)
      : 'all';
  return `${scope.tenantId}:${acct}`;
}

export function scopeFromCredentials(
  tenantId: string,
  credentials: WialonCredentialsInput
): WialonReportScope {
  return { tenantId, accountId: accountIdFrom(credentials) };
}

function unitGroupSearchSpec(accountId?: string, nameMask = '*'): Record<string, unknown> {
  if (accountId) {
    return {
      itemsType: 'avl_unit_group',
      propName: 'sys_billing_account_guid',
      propValueMask: accountId,
      sortType: 'sys_name',
      propType: 'property',
    };
  }
  return {
    itemsType: 'avl_unit_group',
    propName: 'sys_name',
    propValueMask: nameMask,
    sortType: 'sys_name',
  };
}

function templateNameMatches(name: string, patterns: readonly string[]): boolean {
  const lower = name.toLowerCase();
  return patterns.some((p) => lower.includes(p));
}

export class WialonReportResolverService {
  static invalidate(scope?: WialonReportScope): void {
    if (!scope) {
      resourcesCache.clear();
      groupsCache.clear();
      moduleTemplateCache.clear();
      return;
    }
    const prefix = `${wialonReportScopeKey(scope)}:`;
    for (const key of [...resourcesCache.keys()]) {
      if (key.startsWith(prefix) || key === wialonReportScopeKey(scope)) {
        resourcesCache.delete(key);
      }
    }
    for (const key of [...groupsCache.keys()]) {
      if (key.startsWith(prefix) || key === wialonReportScopeKey(scope)) {
        groupsCache.delete(key);
      }
    }
    for (const key of [...moduleTemplateCache.keys()]) {
      if (key.startsWith(prefix)) {
        moduleTemplateCache.delete(key);
      }
    }
  }

  /** List avl_resource items with report templates, scoped to billing account when provided */
  static async listResourcesWithTemplates(
    client: WialonClient,
    scope: WialonReportScope
  ): Promise<ResourceWithTemplates[]> {
    const cacheKey = wialonReportScopeKey(scope);
    const hit = resourcesCache.get(cacheKey);
    if (hit && hit.expires > Date.now()) return hit.resources;

    const accountId = accountIdFrom({ accountId: scope.accountId } as WialonCredentialsInput);
    let resources: ResourceWithTemplates[];

    if (accountId && Number.isFinite(Number(accountId))) {
      const items = await searchResourcesForAccount(client, Number(accountId), RESOURCE_FLAGS);
      resources = items.map((item) => ({
        id: item.id,
        nm: item.nm,
        rep: item.rep as ResourceWithTemplates['rep'],
      }));
    } else {
      const items = await searchAll(client, resourceSearchSpec(accountId), RESOURCE_FLAGS);
      resources = items.map((item) => ({
        id: item.id,
        nm: item.nm,
        rep: item.rep as ResourceWithTemplates['rep'],
      }));
    }

    resourcesCache.set(cacheKey, { resources, expires: Date.now() + CACHE_TTL_MS });
    return resources;
  }

  /** Find templates for a module using registry patterns (account-scoped resource search) */
  static async findModuleTemplates(
    client: WialonClient,
    scope: WialonReportScope,
    module: WialonReportModule,
    opts?: { includeFallback?: boolean }
  ): Promise<ResolvedReportTemplate[]> {
    const cacheKey = `${wialonReportScopeKey(scope)}:${module}:${opts?.includeFallback !== false}`;
    const hit = moduleTemplateCache.get(cacheKey);
    if (hit && hit.expires > Date.now()) return hit.templates;

    const patterns = patternsForModule(module, { includeFallback: opts?.includeFallback });
    const resources = await this.listResourcesWithTemplates(client, scope);
    const found: ResolvedReportTemplate[] = [];
    const seen = new Set<string>();

    for (const slot of patterns) {
      let matched: ResolvedReportTemplate | null = null;
      for (const resource of resources) {
        if (!resource.rep) continue;
        for (const [templateIdStr, tmpl] of Object.entries(resource.rep)) {
          const templateName = tmpl.n || '';
          if (!templateNameMatches(templateName, slot.patterns)) continue;
          const templateId = tmpl.id ?? parseInt(templateIdStr, 10);
          const key = `${resource.id}:${templateId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const resolved: ResolvedReportTemplate = {
            resourceId: resource.id,
            resourceName: resource.nm,
            templateId,
            templateName,
            module: slot.module,
            isGroupReport: slot.isGroupReport ?? false,
            fuelFamily: slot.fuelFamily,
            canonicalName: slot.canonicalName,
            fallback: slot.fallback,
          };
          if (!matched) matched = resolved;
          found.push(resolved);
        }
      }
      // One template per pattern slot (primary group/unit slot)
      if (matched && !slot.fallback) {
        // prefer first primary per isGroupReport kind — handled by fuel wrapper
      }
    }

    moduleTemplateCache.set(cacheKey, { templates: found, expires: Date.now() + CACHE_TTL_MS });
    return found;
  }

  static pickTemplate(
    templates: ResolvedReportTemplate[],
    opts: { isGroupReport?: boolean; preferNonFallback?: boolean }
  ): ResolvedReportTemplate | null {
    const pool = templates.filter((t) =>
      opts.isGroupReport === undefined ? true : t.isGroupReport === opts.isGroupReport
    );
    if (!pool.length) return null;
    if (opts.preferNonFallback !== false) {
      const primary = pool.find((t) => !t.fallback);
      if (primary) return primary;
    }
    return pool[0];
  }

  /** Unit groups visible within billing account scope */
  static async listUnitGroups(
    client: WialonClient,
    scope: WialonReportScope,
    opts?: { namePattern?: RegExp; limit?: number }
  ): Promise<Array<{ id: number; nm: string }>> {
    const cacheKey = `${wialonReportScopeKey(scope)}:groups`;
    if (!opts?.namePattern) {
      const hit = groupsCache.get(cacheKey);
      if (hit && hit.expires > Date.now()) return hit.groups;
    }

    const accountId = accountIdFrom({ accountId: scope.accountId } as WialonCredentialsInput);
    let groups: Array<{ id: number; nm: string }>;

    if (accountId && Number.isFinite(Number(accountId))) {
      const items = await searchGroupsForAccount(client, Number(accountId));
      groups = items.map((g) => ({ id: g.id, nm: g.nm }));
    } else {
      const items = await searchAll(client, unitGroupSearchSpec(undefined, '*'), 1);
      groups = items.map((g) => ({ id: g.id, nm: g.nm }));
    }

    if (opts?.namePattern) {
      groups = groups.filter((g) => opts.namePattern!.test(g.nm));
    }
    if (opts?.limit) {
      groups = groups.slice(0, opts.limit);
    }

    if (!opts?.namePattern) {
      groupsCache.set(cacheKey, { groups, expires: Date.now() + CACHE_TTL_MS });
    }
    return groups;
  }

  /** Units within billing account scope */
  static async listUnits(
    client: WialonClient,
    scope: WialonReportScope,
    maxUnits = 500
  ): Promise<Array<{ id: number; nm: string }>> {
    const accountId = accountIdFrom({ accountId: scope.accountId } as WialonCredentialsInput);
    if (accountId && Number.isFinite(Number(accountId))) {
      const items = await searchUnitsForAccount(client, Number(accountId), maxUnits);
      return items.map((u) => ({ id: u.id, nm: u.nm }));
    }
    const items = await searchAll(client, unitSearchSpec(undefined), 1);
    return filterActiveWialonUnits(items).slice(0, maxUnits).map((u) => ({ id: u.id, nm: u.nm }));
  }

  /** Full template catalog for tenant scope (for Reports workspace / debugging) */
  static async listAllTemplates(
    client: WialonClient,
    scope: WialonReportScope,
    limit = 400
  ): Promise<ResolvedReportTemplate[]> {
    const resources = await this.listResourcesWithTemplates(client, scope);
    const out: ResolvedReportTemplate[] = [];
    for (const resource of resources) {
      if (!resource.rep) continue;
      for (const [templateIdStr, tmpl] of Object.entries(resource.rep)) {
        const templateName = tmpl.n || '';
        const templateId = tmpl.id ?? parseInt(templateIdStr, 10);
        let module: WialonReportModule = 'events';
        for (const slot of REPORT_TEMPLATE_PATTERNS) {
          if (templateNameMatches(templateName, slot.patterns)) {
            module = slot.module;
            break;
          }
        }
        const isGroupReport =
          /\(group\)|\(gensets?\)/i.test(templateName) ||
          (/\bgroup\b/i.test(templateName) && !/\(unit/i.test(templateName));
        let fuelFamily: FuelReportFamily | undefined;
        let canonicalName: string | undefined;
        for (const slot of REPORT_TEMPLATE_PATTERNS) {
          if (slot.module !== 'fuel') continue;
          if (!templateNameMatches(templateName, slot.patterns)) continue;
          fuelFamily = slot.fuelFamily;
          canonicalName = slot.canonicalName;
          break;
        }
        out.push({
          resourceId: resource.id,
          resourceName: resource.nm,
          templateId,
          templateName,
          module,
          isGroupReport,
          fuelFamily,
          canonicalName,
        });
        if (out.length >= limit) return out;
      }
    }
    return out;
  }
}
