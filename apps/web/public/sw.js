/*
 * LingoLive service worker.
 *
 * Caching policy is deliberately narrow. The application shell, icons and
 * static assets are cached so the app opens instantly and shows a real page
 * when the network is gone.
 *
 * NEVER cached, under any circumstance:
 *   - API responses (they carry transcripts, tokens and account data);
 *   - WebSocket traffic;
 *   - anything with an Authorization header.
 *
 * A stale transcript resurfacing from a cache would be both wrong and a
 * privacy failure, so the fetch handler refuses to store those responses
 * rather than relying on cache headers alone.
 */

const VERSION = 'v1';
const SHELL_CACHE = `lingolive-shell-${VERSION}`;
const ASSET_CACHE = `lingolive-assets-${VERSION}`;
const OFFLINE_URL = '/offline';

const SHELL_ASSETS = [OFFLINE_URL, '/manifest.webmanifest', '/icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isPrivate(request) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.startsWith('/api/')) return true;
  if (request.headers.has('authorization')) return true;
  // Product surfaces can contain live transcript content.
  return /\/(listen|discuss|join|history|settings|admin)(\/|$)/.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (isPrivate(request)) return;

  // Navigations: network first, offline page as the fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error()),
      ),
    );
    return;
  }

  // Static assets: cache first, refreshed in the background.
  const url = new URL(request.url);
  if (url.pathname.startsWith('/_next/static') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached ?? network;
      }),
    );
  }
});
