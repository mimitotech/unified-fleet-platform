import { query } from '../config/database.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ResolveAssetOpts = {
  /** Optional display name when creating a stub asset for a Wialon unit. */
  name?: string | null;
  /** Optional plate when creating / matching a stub asset. */
  plate?: string | null;
  /**
   * When true (default), create assets + wialon mapping if the fleet unit id
   * is not yet linked. When false, return null if no mapping exists.
   */
  createIfMissing?: boolean;
};

/**
 * Resolve a UI fleet-unit id (Wialon external id or assets UUID) to assets.id.
 * Returns null for empty / unresolvable values so FK columns stay valid.
 */
export async function resolveTenantAssetId(
  tenantId: string,
  rawId: unknown,
  opts: ResolveAssetOpts = {},
): Promise<string | null> {
  const id = rawId != null ? String(rawId).trim() : '';
  if (!id) return null;

  const createIfMissing = opts.createIfMissing !== false;
  const name = String(opts.name || '').trim() || `Unit ${id}`;
  const plate = String(opts.plate || '').trim() || null;

  if (UUID_RE.test(id)) {
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM assets WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [id, tenantId],
    );
    if (rows[0]?.id) return rows[0].id;
    // UUID not in this tenant's assets — do not write a broken FK.
    return null;
  }

  // FleetUnitSelect / live snapshot ids are typically numeric Wialon unit ids.
  const externalId = id;
  const { rows: mapped } = await query<{ asset_id: string }>(
    `SELECT am.asset_id
     FROM asset_mappings am
     INNER JOIN assets a ON a.id = am.asset_id
     WHERE a.tenant_id = $1 AND am.source_type = 'wialon' AND am.external_id = $2
     LIMIT 1`,
    [tenantId, externalId],
  );
  if (mapped[0]?.asset_id) return mapped[0].asset_id;

  if (!createIfMissing) return null;

  if (plate) {
    const { rows: byPlate } = await query<{ id: string }>(
      `SELECT id FROM assets
       WHERE tenant_id = $1 AND registration_plate = $2
       LIMIT 1`,
      [tenantId, plate],
    );
    if (byPlate[0]?.id) {
      await query(
        `INSERT INTO asset_mappings (asset_id, source_type, external_id)
         VALUES ($1, 'wialon', $2)
         ON CONFLICT (asset_id, source_type) DO UPDATE SET external_id = EXCLUDED.external_id`,
        [byPlate[0].id, externalId],
      );
      return byPlate[0].id;
    }
  }

  const ins = await query<{ id: string }>(
    `INSERT INTO assets (tenant_id, name, registration_plate)
     VALUES ($1, $2, $3) RETURNING id`,
    [tenantId, name, plate],
  );
  const assetId = ins.rows[0]?.id;
  if (!assetId) return null;

  await query(
    `INSERT INTO asset_mappings (asset_id, source_type, external_id)
     VALUES ($1, 'wialon', $2)
     ON CONFLICT (asset_id, source_type) DO UPDATE SET external_id = EXCLUDED.external_id`,
    [assetId, externalId],
  );
  return assetId;
}

/** True when value is a non-empty UUID string. */
export function isUuid(value: unknown): boolean {
  return value != null && UUID_RE.test(String(value).trim());
}
