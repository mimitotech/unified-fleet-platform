import { query } from '../config/database.js';
import { decryptCredentials, encryptCredentials } from '../utils/encryption.js';
import { WialonHierarchyService, type WialonCredentialsInput } from './WialonHierarchyService.js';

export type WialonMotherAccountRow = {
  id: string;
  name: string;
  base_url: string | null;
  is_active: boolean;
  connection_verified_at: string | null;
  last_error: string | null;
  session_meta: Record<string, unknown>;
  account_tier: string | null;
  created_at: string;
  updated_at: string;
  linked_tenant_count?: number;
};

export type WialonMotherAccountPublic = {
  id: string;
  name: string;
  baseUrl: string | null;
  isActive: boolean;
  connected: boolean;
  verifiedAt: string | null;
  lastError: string | null;
  meta: Record<string, unknown>;
  accountTier: string | null;
  linkedTenantCount: number;
  counts?: {
    units?: number;
    accounts?: number;
    users?: number;
  };
};

function toPublic(row: WialonMotherAccountRow): WialonMotherAccountPublic {
  const meta = row.session_meta || {};
  const counts = meta.counts as Record<string, number> | undefined;
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    isActive: row.is_active,
    connected: Boolean(row.is_active && row.connection_verified_at && !row.last_error),
    verifiedAt: row.connection_verified_at,
    lastError: row.last_error,
    meta,
    accountTier: row.account_tier,
    linkedTenantCount: Number(row.linked_tenant_count || 0),
    counts: counts
      ? { units: counts.units, accounts: counts.accounts, users: counts.users }
      : undefined,
  };
}

export class WialonMotherAccountService {
  static async list(): Promise<WialonMotherAccountPublic[]> {
    const { rows } = await query<WialonMotherAccountRow>(
      `SELECT m.*,
              (SELECT COUNT(*)::int FROM data_sources ds
               WHERE ds.wialon_mother_account_id = m.id AND ds.source_type = 'wialon' AND ds.is_active = true) AS linked_tenant_count
       FROM wialon_mother_accounts m
       ORDER BY m.created_at ASC`
    );
    return rows.map(toPublic);
  }

  static async get(id: string): Promise<WialonMotherAccountPublic | null> {
    const { rows } = await query<WialonMotherAccountRow>(
      `SELECT m.*,
              (SELECT COUNT(*)::int FROM data_sources ds
               WHERE ds.wialon_mother_account_id = m.id AND ds.source_type = 'wialon' AND ds.is_active = true) AS linked_tenant_count
       FROM wialon_mother_accounts m WHERE m.id = $1`,
      [id]
    );
    return rows[0] ? toPublic(rows[0]) : null;
  }

  static async getDefaultId(): Promise<string | null> {
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM wialon_mother_accounts WHERE is_active = true ORDER BY created_at ASC LIMIT 1`
    );
    return rows[0]?.id || null;
  }

  static async loadCreds(motherId: string): Promise<WialonCredentialsInput> {
    const { rows } = await query<{ credentials_encrypted: string; base_url: string | null; is_active: boolean }>(
      `SELECT credentials_encrypted, base_url, is_active FROM wialon_mother_accounts WHERE id = $1`,
      [motherId]
    );
    if (!rows[0]?.is_active) throw new Error('Wialon mother account is inactive or missing');
    return this.decryptRow(rows[0].credentials_encrypted, rows[0].base_url);
  }

  /** Resolve mother creds: explicit id → tenant row → default mother → legacy platform_integrations */
  static async resolveMotherCreds(motherId?: string | null): Promise<{ motherId: string | null; creds: WialonCredentialsInput }> {
    if (motherId) {
      return { motherId, creds: await this.loadCreds(motherId) };
    }

    const defaultId = await this.getDefaultId();
    if (defaultId) {
      return { motherId: defaultId, creds: await this.loadCreds(defaultId) };
    }

    const { rows } = await query<{ credentials_encrypted: string }>(
      `SELECT credentials_encrypted FROM platform_integrations WHERE source_type = 'wialon' AND is_active = true`,
      []
    );
    if (rows[0]) {
      return { motherId: null, creds: this.decryptRow(rows[0].credentials_encrypted) };
    }

    throw new Error('No Wialon mother account configured. Add one in Admin → Wialon Center.');
  }

  private static decryptRow(encrypted: string, baseUrl?: string | null): WialonCredentialsInput {
    const stored = decryptCredentials(encrypted) as Record<string, unknown>;
    const token = String(stored.token || '').trim();
    if (!token) throw new Error('Wialon mother account token is missing');
    const creds: WialonCredentialsInput = { token };
    const url = baseUrl || (stored.baseUrl ? String(stored.baseUrl).trim() : undefined);
    if (url) creds.baseUrl = url;
    return creds;
  }

  static async create(input: {
    name: string;
    token: string;
    baseUrl?: string;
  }): Promise<WialonMotherAccountPublic> {
    const name = input.name.trim();
    const token = input.token.trim();
    if (!name) throw new Error('Mother account name is required');
    if (!token) throw new Error('Wialon token is required');

    const creds: WialonCredentialsInput = { token };
    if (input.baseUrl?.trim()) creds.baseUrl = input.baseUrl.trim();

    const probe = await WialonHierarchyService.probe(creds);
    const meta = {
      ...WialonHierarchyService.buildSessionMeta(probe),
      baseUrl: creds.baseUrl || 'https://hst-api.wialon.com/wialon/ajax.html',
      configuredAt: new Date().toISOString(),
    };

    const encrypted = encryptCredentials({ token, baseUrl: creds.baseUrl });

    const { rows } = await query<WialonMotherAccountRow>(
      `INSERT INTO wialon_mother_accounts (
         name, credentials_encrypted, base_url, is_active,
         connection_verified_at, last_error, session_meta, account_tier, updated_at
       ) VALUES ($1, $2, $3, true, NOW(), NULL, $4::jsonb, $5, NOW())
       RETURNING *`,
      [name, encrypted, creds.baseUrl || null, JSON.stringify(meta), probe.accountTier]
    );

    return toPublic({ ...rows[0], linked_tenant_count: 0 });
  }

  static async update(
    id: string,
    input: { name?: string; token?: string; baseUrl?: string; isActive?: boolean }
  ): Promise<WialonMotherAccountPublic> {
    const existing = await this.get(id);
    if (!existing) throw new Error('Mother account not found');

    let encrypted: string | undefined;
    let meta = existing.meta;
    let tier = existing.accountTier;
    let verifiedAt = existing.verifiedAt;
    let lastError: string | null = null;
    let baseUrl = input.baseUrl !== undefined ? input.baseUrl.trim() || null : existing.baseUrl;

    if (input.token?.trim()) {
      const creds: WialonCredentialsInput = { token: input.token.trim() };
      if (baseUrl) creds.baseUrl = baseUrl;
      const probe = await WialonHierarchyService.probe(creds);
      meta = {
        ...WialonHierarchyService.buildSessionMeta(probe),
        baseUrl: creds.baseUrl || 'https://hst-api.wialon.com/wialon/ajax.html',
        configuredAt: new Date().toISOString(),
      };
      tier = probe.accountTier;
      encrypted = encryptCredentials({ token: creds.token, baseUrl: creds.baseUrl });
      verifiedAt = new Date().toISOString();
      baseUrl = creds.baseUrl || null;
    }

    const { rows } = await query<WialonMotherAccountRow>(
      `UPDATE wialon_mother_accounts SET
         name = COALESCE($2, name),
         credentials_encrypted = COALESCE($3, credentials_encrypted),
         base_url = $4,
         is_active = COALESCE($5, is_active),
         connection_verified_at = COALESCE($6::timestamptz, connection_verified_at),
         last_error = $7,
         session_meta = COALESCE($8::jsonb, session_meta),
         account_tier = COALESCE($9, account_tier),
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        input.name?.trim() || null,
        encrypted || null,
        baseUrl,
        input.isActive ?? null,
        verifiedAt,
        lastError,
        encrypted ? JSON.stringify(meta) : null,
        tier,
      ]
    );

    const linked = await query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM data_sources WHERE wialon_mother_account_id = $1 AND is_active = true`,
      [id]
    );

    return toPublic({ ...rows[0], linked_tenant_count: linked.rows[0]?.n || 0 });
  }

  static async remove(id: string): Promise<void> {
    const { rows } = await query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM data_sources WHERE wialon_mother_account_id = $1 AND is_active = true`,
      [id]
    );
    if ((rows[0]?.n || 0) > 0) {
      throw new Error('Cannot delete a mother account that still has linked tenants');
    }
    await query(`DELETE FROM wialon_mother_accounts WHERE id = $1`, [id]);
  }

  static async probe(id: string) {
    const creds = await this.loadCreds(id);
    return WialonHierarchyService.probe(creds);
  }

  static async getAccountAssignments(motherId?: string): Promise<
    Map<number, { tenantId: string; tenantName: string; tenantSlug: string }>
  > {
    const { rows } = await query<{
      wialon_resource_id: number;
      tenant_id: string;
      tenant_name: string;
      tenant_slug: string;
    }>(
      `SELECT ds.wialon_resource_id, t.id AS tenant_id, t.name AS tenant_name, t.slug AS tenant_slug
       FROM data_sources ds
       INNER JOIN tenants t ON t.id = ds.tenant_id
       WHERE ds.source_type = 'wialon' AND ds.is_active = true AND ds.wialon_resource_id IS NOT NULL
         AND ($1::uuid IS NULL OR ds.wialon_mother_account_id = $1::uuid)`,
      [motherId || null]
    );
    const map = new Map<number, { tenantId: string; tenantName: string; tenantSlug: string }>();
    for (const r of rows) {
      map.set(Number(r.wialon_resource_id), {
        tenantId: r.tenant_id,
        tenantName: r.tenant_name,
        tenantSlug: r.tenant_slug,
      });
    }
    return map;
  }
}
