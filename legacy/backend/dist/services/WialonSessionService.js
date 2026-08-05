import { WialonClient } from '../adapters/wialonClient.js';
import { loadTenantWialonCreds } from './tenantWialonCredentials.js';
export async function withWialonClient(credentials, fn) {
    const client = new WialonClient({
        token: credentials.token,
        baseUrl: credentials.baseUrl,
        operateAs: credentials.operateAs,
    });
    try {
        await client.connect();
        client.startKeepAlive();
        return await fn(client);
    }
    finally {
        client.stopKeepAlive();
        await client.disconnect();
    }
}
export async function withTenantWialonClient(tenantId, fn) {
    const creds = await loadTenantWialonCreds(tenantId);
    return withWialonClient(creds, fn);
}
