import { WialonClient } from '../adapters/wialonClient.js';
import type { WialonCredentialsInput } from './WialonHierarchyService.js';
import { loadTenantWialonCreds } from './tenantWialonCredentials.js';

export async function withWialonClient<T>(
  credentials: WialonCredentialsInput,
  fn: (client: WialonClient) => Promise<T>
): Promise<T> {
  const client = new WialonClient({
    token: credentials.token,
    baseUrl: credentials.baseUrl,
    operateAs: credentials.operateAs,
  });
  try {
    await client.connect();
    client.startKeepAlive();
    return await fn(client);
  } finally {
    client.stopKeepAlive();
    await client.disconnect();
  }
}

export async function withTenantWialonClient<T>(
  tenantId: string,
  fn: (client: WialonClient) => Promise<T>
): Promise<T> {
  const creds = await loadTenantWialonCreds(tenantId);
  return withWialonClient(creds, fn);
}
