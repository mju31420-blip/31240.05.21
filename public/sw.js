/* eslint-disable no-restricted-globals */
/**
 * 명비서 PWA Service Worker
 * - HTML/JS: 네트워크 우선 (배포 후에도 예전 app.js가 안 남게)
 * - API: 캐시 안 함
 */
const SW_VERSION = 'mb-pwa-9';
const STATIC_CACHE = `static-${SW_VERSION}`;
const SHELL_CACHE = `shell-${SW_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

const APP_JS = [
  '/utils.js',
  '/kst.js',
  '/schoolCalendar.js',
  '/campusDistance.js',
  '/timetable.js',
  '/mealEngine.js',
  '/app.js',
  '/analytics-sync.js',
];

const STATIC_EXT = /\.(?:js|json|css|png|jpg|jpeg|webp|svg|woff2?)$/i;

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

function isNavigationRequest(request) {
  return request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html');
}

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isAppScript(pathname) {
  return APP_JS.includes(pathname);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[sw] precache failed', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !key.includes(SW_VERSION)).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

/** JS/HTML은 항상 네트워크 먼저 — stale 캐시로 구버전이 안 보이게 */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error('offline');
  }
}

async function networkFirstShell(request) {
  return networkFirst(request, SHELL_CACHE);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!isSameOrigin(url)) return;

  if (isApiRequest(url)) return;

  if (url.pathname === '/dashboard.html') return;

  if (isNavigationRequest(request) || isAppScript(url.pathname) || url.pathname === '/sw.js') {
    event.respondWith(networkFirst(request, isNavigationRequest(request) ? SHELL_CACHE : STATIC_CACHE));
    return;
  }

  if (STATIC_EXT.test(url.pathname) || url.pathname.startsWith('/data/')) {
    event.respondWith(networkFirst(request, STATIC_CACHE));
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
