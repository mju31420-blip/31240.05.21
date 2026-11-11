import { fetchAllMenus } from './menuScraper.js';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ERROR_CACHE_TTL_MS = 60 * 1000;
let memoryCache = null;
let refreshPromise = null;

function isFresh(cache) {
  if (!cache?.updatedAt) return false;
  const ttl = cache.errors.length ? ERROR_CACHE_TTL_MS : CACHE_TTL_MS;
  return Date.now() - new Date(cache.updatedAt).getTime() < ttl;
}

/** Cloud Functions: 메모리 캐시만 사용 (디스크 없음) */
export async function getMenus({ force = false } = {}) {
  if (!force && memoryCache && isFresh(memoryCache)) return memoryCache;

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const data = await fetchAllMenus();
        memoryCache = data;
        return data;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}
