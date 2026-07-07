import type { WialonClient } from '../../adapters/wialonClient.js';
import type { FuelReportTemplate } from './types.js';

const TEMPLATE_CACHE_TTL = 3600000;
let templatesCache: {
  groupTemplate: FuelReportTemplate | null;
  unitTemplate: FuelReportTemplate | null;
  timestamp: number;
} = { groupTemplate: null, unitTemplate: null, timestamp: 0 };

let fleetGroupsCache: { groups: Array<{ id: number; nm: string }>; timestamp: number } = {
  groups: [],
  timestamp: 0,
};

export function invalidateFuelReportCaches() {
  templatesCache = { groupTemplate: null, unitTemplate: null, timestamp: 0 };
  fleetGroupsCache = { groups: [], timestamp: 0 };
}

export async function findFleetGroups(client: WialonClient): Promise<Array<{ id: number; nm: string }>> {
  const now = Date.now();
  if (fleetGroupsCache.groups.length && now - fleetGroupsCache.timestamp < TEMPLATE_CACHE_TTL) {
    return fleetGroupsCache.groups;
  }
  const result = await client.request<{ items: Array<{ id: number; nm: string }> }>('core/search_items', {
    spec: { itemsType: 'avl_unit_group', propName: 'sys_name', propValueMask: '*', sortType: 'sys_name' },
    force: 1,
    flags: 1,
    from: 0,
    to: 50,
  });
  const groups = result.items ?? [];
  fleetGroupsCache = { groups, timestamp: now };
  return groups;
}

export async function findFuelReportTemplates(client: WialonClient): Promise<{
  groupTemplate: FuelReportTemplate | null;
  unitTemplate: FuelReportTemplate | null;
}> {
  const now = Date.now();
  if (now - templatesCache.timestamp < TEMPLATE_CACHE_TTL) {
    return { groupTemplate: templatesCache.groupTemplate, unitTemplate: templatesCache.unitTemplate };
  }

  const GROUP_PATTERNS = ['fuel report(group)', 'fuel report (group)'];
  const UNIT_PATTERNS = ['fuel report(unit)', 'fuel report (unit)'];
  let groupTemplate: FuelReportTemplate | null = null;
  let unitTemplate: FuelReportTemplate | null = null;

  const resources = await client.request<{
    items: Array<{ id: number; nm: string; rep?: Record<string, { n: string }> }>;
  }>('core/search_items', {
    spec: { itemsType: 'avl_resource', propName: 'sys_name', propValueMask: '*', sortType: 'sys_name' },
    force: 1,
    flags: 8193,
    from: 0,
    to: 50,
  });

  for (const resource of resources.items || []) {
    if (!resource.rep) continue;
    for (const [templateId, tmpl] of Object.entries(resource.rep)) {
      const name = tmpl.n?.toLowerCase() || '';
      if (!groupTemplate && GROUP_PATTERNS.some((p) => name.includes(p))) {
        groupTemplate = {
          resourceId: resource.id,
          templateId: parseInt(templateId, 10),
          templateName: tmpl.n,
          isGroupReport: true,
        };
      }
      if (!unitTemplate && UNIT_PATTERNS.some((p) => name.includes(p))) {
        unitTemplate = {
          resourceId: resource.id,
          templateId: parseInt(templateId, 10),
          templateName: tmpl.n,
          isGroupReport: false,
        };
      }
      if (groupTemplate && unitTemplate) break;
    }
    if (groupTemplate && unitTemplate) break;
  }

  templatesCache = { groupTemplate, unitTemplate, timestamp: now };
  return { groupTemplate, unitTemplate };
}

export async function listAllUnits(client: WialonClient, maxUnits = 500): Promise<Array<{ id: number; nm: string }>> {
  const result = await client.request<{ items: Array<{ id: number; nm: string }> }>('core/search_items', {
    spec: { itemsType: 'avl_unit', propName: 'sys_name', propValueMask: '*', sortType: 'sys_name' },
    force: 1,
    flags: 1,
    from: 0,
    to: maxUnits,
  });
  return result.items ?? [];
}
