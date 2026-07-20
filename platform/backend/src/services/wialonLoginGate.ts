const MIN_GAP_MS = Number(process.env.WIALON_LOGIN_GAP_MS || 2500);
const RATE_LIMIT_BACKOFF_MS = Number(process.env.WIALON_RATE_LIMIT_BACKOFF_MS || 15000);

let chain: Promise<unknown> = Promise.resolve();
let lastLoginAt = 0;
let rateLimitedUntil = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /LIMIT invalid_logins|Only one request is allowed/i.test(msg);
}

/**
 * Serialize Wialon token/login calls across the process to avoid LIMIT invalid_logins.
 */
export async function withWialonLoginGate<T>(fn: () => Promise<T>): Promise<T> {
  const run = async () => {
    const now = Date.now();
    if (now < rateLimitedUntil) {
      await sleep(rateLimitedUntil - now);
    }
    const gapWait = Math.max(0, MIN_GAP_MS - (Date.now() - lastLoginAt));
    if (gapWait > 0) await sleep(gapWait);

    lastLoginAt = Date.now();
    try {
      return await fn();
    } catch (err) {
      if (isRateLimitError(err)) {
        rateLimitedUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
      }
      throw err;
    }
  };

  const result = chain.then(run, run);
  chain = result.catch(() => undefined);
  return result;
}

export async function delayBetweenTenants(): Promise<void> {
  await sleep(MIN_GAP_MS);
}
