/**
 * Test a Wialon access token (same flow as Mamsvv scripts/test-wialon-token.ts)
 *
 * Usage:
 *   npx tsx backend/scripts/test-wialon-token.ts <token>
 *   WIALON_TOKEN=... npx tsx backend/scripts/test-wialon-token.ts
 */
import { formatWialonError, WIALON_UNIT_FLAGS } from '../src/adapters/wialonUtils.js';

const WIALON_API_URL = process.env.WIALON_API_URL || 'https://hst-api.wialon.com/wialon/ajax.html';

async function testToken(token: string): Promise<void> {
  const trimmed = token.trim();
  console.log(`Testing Wialon token against ${WIALON_API_URL}`);

  const loginParams = new URLSearchParams({
    svc: 'token/login',
    params: JSON.stringify({ token: trimmed }),
  });
  const loginRes = await fetch(`${WIALON_API_URL}?${loginParams}`);
  const loginData = await loginRes.json();

  if (loginData.error) {
    console.error('Login failed:', formatWialonError(loginData.error, loginData.reason));
    process.exit(1);
  }

  console.log('Login OK — session:', loginData.eid);

  const searchParams = new URLSearchParams({
    svc: 'core/search_items',
    params: JSON.stringify({
      spec: {
        itemsType: 'avl_unit',
        propName: 'sys_name',
        propValueMask: '*',
        sortType: 'sys_name',
      },
      force: 1,
      flags: WIALON_UNIT_FLAGS,
      from: 0,
      to: 10,
    }),
    sid: loginData.eid,
  });
  const searchRes = await fetch(`${WIALON_API_URL}?${searchParams}`);
  const searchData = await searchRes.json();

  if (searchData.error) {
    console.error('Search failed:', formatWialonError(searchData.error, searchData.reason));
    process.exit(1);
  }

  console.log(`Found ${searchData.totalItemsCount ?? searchData.items?.length ?? 0} vehicles`);
  for (const v of (searchData.items || []).slice(0, 5)) {
    console.log(`  - ${v.nm} (id ${v.id})`);
  }

  await fetch(`${WIALON_API_URL}?${new URLSearchParams({ svc: 'core/logout', sid: loginData.eid })}`);
  console.log('Done.');
}

const token = process.argv[2] || process.env.WIALON_TOKEN || '';
if (!token) {
  console.error('Pass token as argument or set WIALON_TOKEN');
  process.exit(1);
}

testToken(token).catch((e) => {
  console.error(e);
  process.exit(1);
});
