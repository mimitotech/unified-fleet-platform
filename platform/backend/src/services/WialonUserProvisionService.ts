import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { query } from '../config/database.js';
import { encryptCredentials } from '../utils/encryption.js';
import { WialonHierarchyService } from './WialonHierarchyService.js';
import { PlatformIntegrationService } from './PlatformIntegrationService.js';
import { loadTenantWialonCreds } from './tenantWialonCredentials.js';
import { upsertWialonUnit } from './wialonUnitSync.js';

export interface WialonProvisionedUser {
  id: string;
  email: string;
  fullName: string;
  wialonUserId: number;
  wialonLogin: string;
  role: string;
  created: boolean;
  temporaryPassword?: string;
}

function sanitizeLogin(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 48) || 'user';
}

function buildEmail(login: string, wialonUserId: number, tenantSlug: string, wialonEmail?: string): string {
  if (wialonEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(wialonEmail)) {
    return wialonEmail.toLowerCase().trim();
  }
  const base = sanitizeLogin(login);
  return `${base}.${wialonUserId}@${tenantSlug}.wialon.mams`;
}

export class WialonUserProvisionService {
  /** Provision all Wialon users under the linked account. */
  static async provisionTenantUsers(tenantId: string, selectedUserIds?: number[]) {
    const creds = await loadTenantWialonCreds(tenantId);
    const accountId = Number(creds.accountId);
    if (!accountId) throw new Error('No Wialon account linked for this tenant');
    const allUsers = await WialonHierarchyService.getUsersForAccount(creds, accountId);
    const wialonUsers =
      selectedUserIds?.length
        ? allUsers.filter((u) => selectedUserIds.includes(u.id))
        : allUsers;
    return this.provisionUsers(tenantId, accountId, wialonUsers, selectedUserIds?.length ? selectedUserIds : allUsers.map((u) => u.id));
  }

  static async provisionUsers(
    tenantId: string,
    accountId: number,
    wialonUsers: Awaited<ReturnType<typeof WialonHierarchyService.getUsersForAccount>>,
    activeWialonIds: number[]
  ) {
    const { rows: tenantRows } = await query<{ slug: string }>(
      `SELECT slug FROM tenants WHERE id = $1`,
      [tenantId]
    );
    const tenantSlug = tenantRows[0]?.slug || 'tenant';

    const { rows: dsRows } = await query<{ wialon_account_name: string | null }>(
      `SELECT wialon_account_name FROM data_sources WHERE tenant_id = $1 AND source_type = 'wialon'`,
      [tenantId]
    );
    const accountName = dsRows[0]?.wialon_account_name || String(accountId);

    const activeSet = new Set(activeWialonIds);
    let created = 0;
    let updated = 0;
    const users: WialonProvisionedUser[] = [];

    for (const wu of wialonUsers) {
      const login = wu.name.trim();
      const email = buildEmail(login, wu.id, tenantSlug, wu.email);
      const role = 'operator';
      const tempPassword = crypto.randomBytes(9).toString('base64url');
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      const { rows: byWialon } = await query<{ id: string }>(
        `SELECT id FROM users WHERE tenant_id = $1 AND wialon_user_id = $2 LIMIT 1`,
        [tenantId, wu.id]
      );

      if (byWialon[0]) {
        await query(
          `UPDATE users SET full_name = $3, wialon_login = $4, email = $5, is_active = true, updated_at = NOW()
           WHERE id = $1 AND tenant_id = $2`,
          [byWialon[0].id, tenantId, login, login, email]
        );
        updated++;
        users.push({
          id: byWialon[0].id,
          email,
          fullName: login,
          wialonUserId: wu.id,
          wialonLogin: login,
          role,
          created: false,
        });
        continue;
      }

      const { rows: byEmail } = await query<{ id: string }>(
        `SELECT id FROM users WHERE email = $1 LIMIT 1`,
        [email]
      );
      if (byEmail[0]) {
        await query(
          `UPDATE users SET tenant_id = $2, full_name = $3, wialon_user_id = $4, wialon_login = $5,
           role = $6, is_active = true, updated_at = NOW()
           WHERE id = $1`,
          [byEmail[0].id, tenantId, login, wu.id, login, role]
        );
        updated++;
        users.push({
          id: byEmail[0].id,
          email,
          fullName: login,
          wialonUserId: wu.id,
          wialonLogin: login,
          role,
          created: false,
        });
        continue;
      }

      const ins = await query<{ id: string }>(
        `INSERT INTO users (tenant_id, email, password_hash, full_name, role, wialon_user_id, wialon_login)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [tenantId, email, passwordHash, login, role, wu.id, login]
      );
      created++;
      users.push({
        id: ins.rows[0].id,
        email,
        fullName: login,
        wialonUserId: wu.id,
        wialonLogin: login,
        role,
        created: true,
        temporaryPassword: tempPassword,
      });
    }

    const { rows: stale } = await query<{ id: string; wialon_user_id: number }>(
      `SELECT id, wialon_user_id FROM users
       WHERE tenant_id = $1 AND wialon_user_id IS NOT NULL AND is_active = true`,
      [tenantId]
    );
    let deactivated = 0;
    for (const row of stale) {
      if (!activeSet.has(Number(row.wialon_user_id))) {
        await query(`UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1`, [row.id]);
        deactivated++;
      }
    }

    return { accountId, accountName, created, updated, deactivated, users };
  }

  /** Import or refresh a single Wialon user without deactivating other tenant users. */
  static async provisionOneUser(tenantId: string, wialonUserId: number) {
    const creds = await loadTenantWialonCreds(tenantId);
    const accountId = Number(creds.accountId);
    if (!accountId) throw new Error('No Wialon account linked for this tenant');

    const allUsers = await WialonHierarchyService.getUsersForAccount(creds, accountId);
    const wu = allUsers.find((u) => u.id === wialonUserId);
    if (!wu) throw new Error('Wialon user not found in the linked account');

    const { rows: existing } = await query<{ wialon_user_id: number }>(
      `SELECT wialon_user_id FROM users
       WHERE tenant_id = $1 AND wialon_user_id IS NOT NULL AND is_active = true`,
      [tenantId]
    );
    const activeIds = [...existing.map((r) => Number(r.wialon_user_id)), wialonUserId];
    return this.provisionUsers(tenantId, accountId, [wu], [...new Set(activeIds)]);
  }
}

export class WialonAccountLinkService {
  static async linkAccount(
    tenantId: string,
    accountId: number,
    accountName?: string,
    selectedUserIds?: number[],
    motherAccountId?: string
  ) {
    await PlatformIntegrationService.assertAccountAvailable(accountId, tenantId);

    const resolvedMother = motherAccountId || (await import('./tenantWialonCredentials.js').then((m) => m.getTenantMotherAccountId(tenantId)));
    const motherId = resolvedMother || (await import('./WialonMotherAccountService.js').then((m) => m.WialonMotherAccountService.getDefaultId()));
    if (!motherId) throw new Error('Select a Wialon mother account before linking a tenant');

    const platformCreds = await import('./WialonMotherAccountService.js').then((m) =>
      m.WialonMotherAccountService.loadCreds(motherId)
    );
    const creds = { ...platformCreds, accountId: String(accountId) };
    const probe = await WialonHierarchyService.probe(creds);

    const resolvedName =
      accountName ||
      probe.accounts.find((a) => a.id === accountId)?.name ||
      String(accountId);

    const units = await WialonHierarchyService.getUnitsForAccount(creds, accountId);
    const users = await WialonHierarchyService.getUsersForAccount(creds, accountId);

    const platformMeta = motherId ? await import('./WialonMotherAccountService.js').then((m) => m.WialonMotherAccountService.get(motherId)) : null;
    const baseMeta = WialonHierarchyService.buildSessionMeta(probe);
    const wialonMeta = {
      ...baseMeta,
      counts: {
        ...((baseMeta.counts as Record<string, number> | undefined) || {}),
        units: units.length,
      },
      baseUrl: platformMeta?.baseUrl || 'https://hst-api.wialon.com/wialon/ajax.html',
      scopedAccountId: accountId,
      scopedAccountName: resolvedName,
      motherAccountId: motherId,
      motherAccountName: platformMeta?.name,
      linkedAt: new Date().toISOString(),
      source: 'wialon_center',
    };

    const tenantCreds = encryptCredentials({ accountId: String(accountId) });
    const webhookSecret = crypto.randomBytes(16).toString('hex');

    await query(
      `INSERT INTO data_sources (tenant_id, source_type, credentials_encrypted, is_active, sync_interval_minutes, webhook_secret, inherits_platform_credentials)
       VALUES ($1, 'wialon', $2, true, 5, $3, true)
       ON CONFLICT (tenant_id, source_type) DO UPDATE SET
         credentials_encrypted = $2,
         is_active = true,
         inherits_platform_credentials = true,
         updated_at = NOW()`,
      [tenantId, tenantCreds, webhookSecret]
    );

    await query(
      `UPDATE data_sources SET
         wialon_resource_id = $2,
         wialon_account_name = $3,
         wialon_operate_as = NULL,
         wialon_mother_account_id = $4,
         wialon_session_meta = $5::jsonb,
         preview_asset_count = $6,
         connection_verified_at = NOW(),
         last_error = NULL,
         updated_at = NOW()
       WHERE tenant_id = $1 AND source_type = 'wialon'`,
      [tenantId, accountId, resolvedName, motherId, JSON.stringify(wialonMeta), units.length]
    );

    const userIds = selectedUserIds?.length ? selectedUserIds : users.map((u) => u.id);
    let provision = { accountId, accountName: resolvedName, created: 0, updated: 0, deactivated: 0, users: [] as WialonProvisionedUser[] };
    if (userIds.length) {
      provision = await WialonUserProvisionService.provisionUsers(
        tenantId,
        accountId,
        users.filter((u) => userIds.includes(u.id)),
        userIds
      );
    }

    let sync = {
      vehicles: units.length,
      drivers: 0,
      geofences: 0,
      usersCreated: provision.created,
      usersUpdated: provision.updated,
      usersTotal: users.length,
    };
    try {
      const syncResult = await import('./WialonSyncService.js').then((m) =>
        m.WialonSyncService.syncTenant(tenantId, { credentials: creds, units })
      );
      sync = {
        ...syncResult,
        vehicles: syncResult.vehicles > 0 ? syncResult.vehicles : units.length,
        usersCreated: syncResult.usersCreated ?? provision.created,
        usersUpdated: syncResult.usersUpdated ?? provision.updated,
        usersTotal: syncResult.usersTotal ?? users.length,
      };
      await query(
        `UPDATE data_sources SET last_error = NULL WHERE tenant_id = $1 AND source_type = 'wialon'`,
        [tenantId]
      );
    } catch (syncErr) {
      const warn = `Sync after link: ${(syncErr as Error).message}`;
      for (const unit of units) {
        await upsertWialonUnit(tenantId, unit).catch(() => undefined);
      }
      await query(
        `UPDATE data_sources SET
           last_error = NULL,
           last_sync_at = NOW(),
           wialon_session_meta = JSON_MERGE_PATCH(COALESCE(wialon_session_meta, '{}'), $2),
           updated_at = NOW()
         WHERE tenant_id = $1 AND source_type = 'wialon'`,
        [
          tenantId,
          JSON.stringify({ syncWarning: warn, syncWarningAt: new Date().toISOString() }),
        ]
      );
      sync = {
        vehicles: units.length,
        drivers: 0,
        geofences: 0,
        usersCreated: provision.created,
        usersUpdated: provision.updated,
        usersTotal: users.length,
      };
    }
    await import('../orchestrators/AssetOrchestrator.js').then((m) =>
      m.AssetOrchestrator.invalidateTenantCache(tenantId)
    );

    return {
      accountId,
      accountName: resolvedName,
      unitCount: units.length,
      userCount: users.length,
      provision,
      sync,
    };
  }
}
