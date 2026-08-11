import { query } from '../config/database.js';
import { decryptCredentials } from '../utils/encryption.js';
import type { WialonCredentialsInput } from './WialonHierarchyService.js';
import { PlatformIntegrationService } from './PlatformIntegrationService.js';
import { WialonMotherAccountService } from './WialonMotherAccountService.js';

export function parseWialonCredsFromBody(body: Record<string, unknown>): WialonCredentialsInput {
  const token = String(body.token || '').trim();
  if (!token) throw new Error('Wialon token is required');
  const creds: WialonCredentialsInput = { token };
  if (body.baseUrl) creds.baseUrl = String(body.baseUrl).trim();
  if (body.operateAs !== undefined && body.operateAs !== '') {
    const raw = body.operateAs;
    creds.operateAs = typeof raw === 'number' ? raw : String(raw).trim();
  }
  if (body.accountId !== undefined && body.accountId !== '') {
    const raw = body.accountId;
    creds.accountId = typeof raw === 'number' ? raw : String(raw).trim();
  }
  return creds;
}

function resolveAccountId(
  stored: Record<string, unknown>,
  wialonResourceId: number | null
): string | number | undefined {
  if (stored.accountId !== undefined && stored.accountId !== '' && stored.accountId !== null) {
    return stored.accountId as string | number;
  }
  if (wialonResourceId != null) return wialonResourceId;
  return undefined;
}

/**
 * Resolve Wialon API credentials for a tenant.
 * Uses the tenant's chosen mother account token + scoped billing accountId.
 */
export async function loadTenantWialonCreds(tenantId: string): Promise<WialonCredentialsInput> {
  const { rows } = await query<{
    credentials_encrypted: string;
    wialon_resource_id: number | null;
    wialon_operate_as: number | string | null;
    wialon_mother_account_id: string | null;
    inherits_platform_credentials: boolean;
    is_active: boolean;
  }>(
    `SELECT credentials_encrypted, wialon_resource_id, wialon_operate_as, wialon_mother_account_id,
            inherits_platform_credentials, is_active
     FROM data_sources WHERE tenant_id = $1 AND source_type = 'wialon'`,
    [tenantId]
  );
  if (!rows[0]) {
    throw new Error('Wialon integration not configured for this tenant');
  }

  let stored: Record<string, unknown> = {};
  try {
    stored = decryptCredentials(rows[0].credentials_encrypted) as Record<string, unknown>;
  } catch {
    /* tenant blob may be legacy/corrupt — platform center still applies */
  }

  const accountId = resolveAccountId(stored, rows[0].wialon_resource_id);

  // Prefer encrypted blob, then the dedicated column set at link time.
  const fromBlob =
    stored.operateAs !== undefined && stored.operateAs !== '' && stored.operateAs !== null
      ? (stored.operateAs as string | number)
      : undefined;
  const fromCol =
    rows[0].wialon_operate_as !== undefined &&
    rows[0].wialon_operate_as !== null &&
    String(rows[0].wialon_operate_as).trim() !== ''
      ? rows[0].wialon_operate_as
      : undefined;
  const operateAs = fromBlob ?? fromCol;

  if (rows[0].inherits_platform_credentials || await PlatformIntegrationService.isWialonConfigured()) {
    const motherId = rows[0].wialon_mother_account_id || (await WialonMotherAccountService.getDefaultId());
    const platform = motherId
      ? await WialonMotherAccountService.loadCreds(motherId)
      : await PlatformIntegrationService.loadWialonCreds();
    return {
      ...platform,
      accountId: accountId !== undefined ? accountId : platform.accountId,
      operateAs: operateAs !== undefined ? operateAs : platform.operateAs,
    };
  }

  if (!String(stored.token || '').trim()) {
    throw new Error(
      'Wialon is not configured. Add a mother account in Admin → Wialon Center and link this tenant.'
    );
  }

  const creds = parseWialonCredsFromBody(stored);
  if (!creds.accountId && rows[0].wialon_resource_id) {
    creds.accountId = rows[0].wialon_resource_id;
  }
  if (creds.operateAs === undefined && operateAs !== undefined) {
    creds.operateAs = operateAs;
  }
  return creds;
}

export type TenantWialonRow = {
  wialon_resource_id: number | null;
  wialon_operate_as: number | null;
  wialon_account_name: string | null;
  wialon_mother_account_id: string | null;
  wialon_session_meta: Record<string, unknown> | null;
  connection_verified_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  preview_asset_count: number | null;
  is_active: boolean;
  inherits_platform_credentials: boolean;
};

export async function getTenantWialonRow(tenantId: string): Promise<TenantWialonRow | null> {
  const { rows } = await query<TenantWialonRow>(
    `SELECT wialon_resource_id, wialon_operate_as, wialon_account_name, wialon_mother_account_id,
            wialon_session_meta, connection_verified_at, last_sync_at, last_error,
            preview_asset_count, is_active, inherits_platform_credentials
     FROM data_sources WHERE tenant_id = $1 AND source_type = 'wialon'`,
    [tenantId]
  );
  return rows[0] || null;
}

export async function getTenantMotherAccountId(tenantId: string): Promise<string | null> {
  const row = await getTenantWialonRow(tenantId);
  return row?.wialon_mother_account_id || (await WialonMotherAccountService.getDefaultId());
}
