import { fetchAllMenus } from './menuScraper.js';
import { getSampleMenus } from './sampleMenus.js';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let memoryCache = null;
let refreshPromise = null;

function isFresh(cache) {
  if (!cache?.updatedAt) return false;
  return Date.now() - new Date(cache.updatedAt).getTime() < CACHE_TTL_MS;
}

/** Cloud Functions: 메모리 캐시만 사용 (디스크 없음) */
export async function getMenus({ force = false } = {}) {
  if (!force && memoryCache && isFresh(memoryCache)) return memoryCache;

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const data = await fetchAllMenus();
        if (!data.MENUS || Object.keys(data.MENUS).length === 0) {
          data.MENUS = getSampleMenus();
          data.source = 'sample';
        }
        memoryCache = data;
        return data;
      } catch (err) {
        const fallback = {
          updatedAt: new Date().toISOString(),
          source: 'sample',
          MENUS: getSampleMenus(),
          errors: [err.message],
        };
        memoryCache = fallback;
        return fallback;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}
