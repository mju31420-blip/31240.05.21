/* eslint-disable no-restricted-globals */
/**
 * 명비서 PWA Service Worker
 * - 앱 셸·정적 자산: stale-while-revalidate
 * - API·실시간 데이터: 네트워크 우선 (캐시하지 않음)
 * - 오프라인: 셸(index.html) 폴백
 */
const SW_VERSION = 'mb-pwa-2';
const STATIC_CACHE = `static-${SW_VERSION}`;
const SHELL_CACHE = `shell-${SW_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/utils.js',
  '/kst.js',
  '/schoolCalendar.js',
  '/campusDistance.js',
  '/timetable.js',
  '/mealEngine.js',
  '/app.js',
  '/analytics-sync.js',
  '/data/kr-holidays.json',
  '/data/crowd-model.json',
  '/data/campus-walk.json',
  '/data/campus_schedule.json',
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
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== SHELL_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || networkPromise || fetch(request);
}

async function networkFirstShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put('/index.html', response.clone());
    return response;
  } catch {
    const cached = (await cache.match(request)) || (await cache.match('/index.html'));
    if (cached) return cached;
    throw new Error('offline');
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!isSameOrigin(url)) return;

  if (isApiRequest(url)) return;

  if (url.pathname === '/dashboard.html') return;

  if (isNavigationRequest(request)) {
    event.respondWith(networkFirstShell(request));
    return;
  }

  if (STATIC_EXT.test(url.pathname) || url.pathname.startsWith('/data/')) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
