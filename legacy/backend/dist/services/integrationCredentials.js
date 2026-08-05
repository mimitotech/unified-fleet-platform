import { decryptCredentials } from '../utils/encryption.js';
import { loadTenantWialonCreds } from './tenantWialonCredentials.js';
/** Resolve adapter credentials, merging platform Wialon Center token when tenant inherits it. */
export async function resolveSourceCredentials(tenantId, sourceType, credentialsEncrypted) {
    if (sourceType === 'wialon') {
        return (await loadTenantWialonCreds(tenantId));
    }
    return decryptCredentials(credentialsEncrypted);
}
