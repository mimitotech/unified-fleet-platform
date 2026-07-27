/**
 * Lazy-load print helpers with stale-chunk recovery after deploys.
 * Vite hashes change; an old tab still references deleted `/assets/*.js`.
 */

const RELOAD_KEY = 'ufp_print_chunk_reload';

async function importWithStaleChunkRecovery<T>(loader: () => Promise<T>): Promise<T> {
  try {
    const mod = await loader();
    try {
      sessionStorage.removeItem(RELOAD_KEY);
    } catch {
      /* ignore */
    }
    return mod;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const staleChunk =
      /Failed to fetch dynamically imported module|Loading chunk \d+ failed|Importing a module script failed/i.test(
        msg,
      );
    if (staleChunk && typeof window !== 'undefined') {
      try {
        if (!sessionStorage.getItem(RELOAD_KEY)) {
          sessionStorage.setItem(RELOAD_KEY, '1');
          window.location.reload();
          return new Promise(() => undefined);
        }
        sessionStorage.removeItem(RELOAD_KEY);
      } catch {
        /* fall through */
      }
    }
    throw new Error(
      staleChunk
        ? 'Print module is out of date after a site update. Refresh the page and try again.'
        : msg || 'Could not load print module',
    );
  }
}

export type PrintReportModule = typeof import('@/lib/printReport');
export type PrintPageSectionModule = typeof import('@/lib/printPageSection');

export function importPrintReport(): Promise<PrintReportModule> {
  return importWithStaleChunkRecovery(() => import('@/lib/printReport'));
}

export function importPrintPageSection(): Promise<PrintPageSectionModule> {
  return importWithStaleChunkRecovery(() => import('@/lib/printPageSection'));
}
