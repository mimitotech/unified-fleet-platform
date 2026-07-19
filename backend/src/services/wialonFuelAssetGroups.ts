import type { WialonClient } from '../adapters/wialonClient.js';

export type FuelGroupCategory = 'vehicle' | 'generator' | 'machinery';

export type FuelGroupMembership = {
  generatorUnitIds: Set<number>;
  machineryUnitIds: Set<number>;
  vehicleUnitIds: Set<number>;
};

const GROUP_CACHE_TTL_MS = 15 * 60 * 1000;
const groupCache = new Map<string, { data: FuelGroupMembership; expires: number }>();

const GENERATOR_GROUP_RE = /gensets?|generator|\[gen\]|gen\s*set|dg\s*set|power\s*plant/i;
const MACHINERY_GROUP_RE = /machiner|equipment|plant|excavat|crane|compressor|pump|forklift|loader|mixer|welder|\[mach\]|\[plant\]|\[equip\]/i;
const VEHICLE_GROUP_RE = /vehicle|truck|fleet|lorry|bus|\[veh\]/i;

async function searchGroups(client: WialonClient): Promise<Array<{ id: number; nm: string }>> {
  const result = await client.request<{ items: Array<{ id: number; nm: string }> }>('core/search_items', {
    spec: { itemsType: 'avl_unit_group', propName: 'sys_name', propValueMask: '*', sortType: 'sys_name' },
    force: 1,
    flags: 1,
    from: 0,
    to: 200,
  });
  return result.items ?? [];
}

async function unitIdsInGroup(client: WialonClient, groupId: number): Promise<number[]> {
  try {
    const res = await client.request<{ item?: { u?: number[] } }>('core/search_item', {
      id: groupId,
      flags: 1,
    });
    return res.item?.u ?? [];
  } catch {
    return [];
  }
}

function classifyGroupName(name: string): FuelGroupCategory | null {
  const n = name.trim();
  if (GENERATOR_GROUP_RE.test(n)) return 'generator';
  if (MACHINERY_GROUP_RE.test(n)) return 'machinery';
  if (VEHICLE_GROUP_RE.test(n)) return 'vehicle';
  return null;
}

/** Load Wialon unit-group membership for fuel asset classification (cached per tenant). */
export async function loadFuelGroupMembership(
  client: WialonClient,
  tenantId: string
): Promise<FuelGroupMembership> {
  const now = Date.now();
  const cached = groupCache.get(tenantId);
  if (cached && cached.expires > now) return cached.data;

  const membership: FuelGroupMembership = {
    generatorUnitIds: new Set(),
    machineryUnitIds: new Set(),
    vehicleUnitIds: new Set(),
  };

  const groups = await searchGroups(client);
  for (const group of groups) {
    const category = classifyGroupName(group.nm);
    if (!category) continue;
    const unitIds = await unitIdsInGroup(client, group.id);
    const target =
      category === 'generator'
        ? membership.generatorUnitIds
        : category === 'machinery'
          ? membership.machineryUnitIds
          : membership.vehicleUnitIds;
    for (const id of unitIds) target.add(id);
  }

  groupCache.set(tenantId, { data: membership, expires: now + GROUP_CACHE_TTL_MS });
  return membership;
}

export function invalidateFuelGroupMembershipCache(tenantId?: string): void {
  if (tenantId) groupCache.delete(tenantId);
  else groupCache.clear();
}
