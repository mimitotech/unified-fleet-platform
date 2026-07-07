import type { SourceType } from '@ufp/shared';
import { decryptCredentials } from '../utils/encryption.js';
import { loadTenantWialonCreds } from './tenantWialonCredentials.js';

/** Resolve adapter credentials, merging platform Wialon Center token when tenant inherits it. */
export async function resolveSourceCredentials(
  tenantId: string,
  sourceType: SourceType,
  credentialsEncrypted: string
): Promise<Record<string, unknown>> {
  if (sourceType === 'wialon') {
    return (await loadTenantWialonCreds(tenantId)) as unknown as Record<string, unknown>;
  }
  return decryptCredentials(credentialsEncrypted);
}
