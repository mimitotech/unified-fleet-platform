/**
 * Legacy self-destructing service worker.
 *
 * Older builds registered a network-first shell cache that could serve a stale
 * index.html (and thus an old UI) when the network was flaky. This file replaces
 * that worker: clear every cache, unregister, and leave network requests alone.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        if ('navigate' in client) {
          try {
            await client.navigate(client.url);
          } catch {
            /* ignore */
          }
        }
      }
    })(),
  );
});

// Do not intercept fetches — always go to the network.
self.addEventListener('fetch', () => undefined);
