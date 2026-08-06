const CACHE_PREFIX = 'master-ten-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v4`;

function scopeUrl(path = './') {
  return new URL(path, self.registration.scope).href;
}

async function cacheApplicationShell() {
  const cache = await caches.open(CACHE_NAME);
  const rootUrl = scopeUrl();
  const response = await fetch(rootUrl, { cache: 'reload' });
  if (!response.ok) throw new Error(`App shell request failed: ${response.status}`);

  await cache.put(rootUrl, response.clone());
  const html = await response.text();
  const urls = new Set([
    scopeUrl('manifest.webmanifest'),
    scopeUrl('icons/icon.svg'),
    scopeUrl('icons/icon-180.png'),
    scopeUrl('icons/icon-192.png'),
    scopeUrl('icons/icon-512.png'),
    scopeUrl('icons/icon-maskable-512.png'),
  ]);
  const attributePattern = /(?:src|href)="([^"]+)"/g;
  for (const match of html.matchAll(attributePattern)) {
    const candidate = new URL(match[1], rootUrl);
    if (candidate.origin === self.location.origin) urls.add(candidate.href);
  }
  await cache.addAll([...urls]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheApplicationShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request, { ignoreSearch: true }))
      || (await cache.match(scopeUrl()))
      || new Response('Master Tenをオフラインで開けませんでした。オンラインで一度開いてください。', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});
