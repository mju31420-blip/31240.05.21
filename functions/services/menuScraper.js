import * as cheerio from 'cheerio';
import { RESTAURANT_SOURCES } from '../config.js';
import { getSampleMenus } from './sampleMenus.js';

const MEAL_SLOT = { 중식: 'l', 점심: 'l', 조식: 'b', 석식: 'd', 저녁: 'd' };

const SIDE_WORDS = new Set([
  '백미밥', '쌀밥', '잡곡밥', '추가밥', '배추김치', '깍두기', '단무지', '요구르트',
  '샐러드', '드레싱', '냉매실차', '오미자차', '홍차', '팩주스', '도시락김', '후리가케밥',
  '인기', '메뉴', '추천',
]);

const TAG_RULES = [
  ['찌개', '찌개류'], ['국밥', '찌개류'], ['탕', '찌개류'],
  ['볶음밥', '면류'], ['덮밥', '면류'], ['우동', '면류'], ['라면', '면류'],
  ['스파게티', '면류'], ['쌀국수', '면류'],
  ['제육', '고기류'], ['불고기', '고기류'], ['돈까스', '고기류'], ['함박', '고기류'],
  ['삼겹', '고기류'], ['닭', '고기류'],
  ['비빔밥', '건강식'], ['샐러드', '건강식'], ['두부', '건강식'],
];

function detectTag(name) {
  for (const [kw, tag] of TAG_RULES) {
    if (name.includes(kw)) return tag;
  }
  if (/매운|김치|짬뽕|마라|고추/.test(name)) return '인기';
  return '없음';
}

const EMPTY_MENU_RE = /등록된\s*식단|식단내용이\s*없/;

function parseDateCell(text) {
  const m = text.match(/(\d{2})\.(\d{2})\s*\(\s*([월화수목금토일])\s*\)/);
  if (!m) return null;
  const dowMap = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  return {
    month,
    day,
    dow: dowMap[m[3]] ?? 0,
    dateKey: `${m[1]}-${m[2]}`,
  };
}

function parseMenuItems(content) {
  if (!content || content === '-' || content === '.') return [];
  const cleaned = content.replace(/\*[^*\s]+/g, '').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const items = [];
  for (const part of parts) {
    if (part.startsWith('[')) continue;
    if (part.endsWith(']')) continue;
    if (SIDE_WORDS.has(part)) continue;
    if (/^배추김치|^깍두기/.test(part)) continue;
    if (part.length < 2) continue;
    items.push({ n: part, t: detectTag(part), k: 0 });
    if (items.length >= 4) break;
  }
  if (!items.length) items.push({ n: cleaned.slice(0, 36), t: '없음', k: 0 });
  return items;
}

function parseTableRows($) {
  const days = {};
  let currentDow = null;
  let currentDateKey = null;
  $('table tr').each((_, row) => {
    const cells = $(row)
      .find('td, th')
      .map((__, c) => $(c).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter(Boolean);
    if (cells.length < 3) return;
    const dateInfo = parseDateCell(cells[0]);
    if (dateInfo) {
      currentDow = dateInfo.dow;
      currentDateKey = dateInfo.dateKey;
    }
    const mealIdx = cells.findIndex((c) => MEAL_SLOT[c]);
    if (mealIdx < 0 || currentDateKey == null) return;
    const slot = MEAL_SLOT[cells[mealIdx]];
    let content = '';
    for (let i = mealIdx + 1; i < cells.length; i++) {
      const c = cells[i];
      if (c === '-' || MEAL_SLOT[c] || parseDateCell(c)) continue;
      if (c.length > 4 && !EMPTY_MENU_RE.test(c)) {
        content = c;
        break;
      }
    }
    const items = parseMenuItems(content);
    if (!items.length) return;
    if (!days[currentDateKey]) {
      days[currentDateKey] = { l: [], d: [], b: [], dow: currentDow };
    }
    days[currentDateKey][slot] = items;
  });
  return withDowKeys(days);
}

/** MM-DD 날짜 키 데이터를 요일(0~6) 키로도 미러링 (가장 최근 날짜 우선) */
function withDowKeys(days) {
  const dated = Object.keys(days)
    .filter((k) => /^\d{2}-\d{2}$/.test(k))
    .sort();
  for (const dateKey of dated) {
    const entry = days[dateKey];
    const dow = entry?.dow;
    if (typeof dow !== 'number' || dow < 0 || dow > 6) continue;
    days[dow] = entry;
  }
  return days;
}

export async function fetchRestaurantMenus(key) {
  const src = RESTAURANT_SOURCES[key];
  if (!src) throw new Error(`Unknown restaurant: ${key}`);
  const res = await fetch(src.url, {
    headers: { 'User-Agent': 'MyeongBiseo/1.0', Accept: 'text/html' },
  });
  if (!res.ok) throw new Error(`${key} fetch failed: ${res.status}`);
  const $ = cheerio.load(await res.text());
  return { key, label: src.label, source: src.url, days: parseTableRows($) };
}

export async function fetchAllMenus() {
  const keys = Object.keys(RESTAURANT_SOURCES);
  const sample = getSampleMenus();
  const results = await Promise.allSettled(keys.map((k) => fetchRestaurantMenus(k)));
  const MENUS = {};
  const errors = [];
  for (let i = 0; i < results.length; i++) {
    const key = keys[i];
    const r = results[i];
    if (r.status === 'fulfilled' && Object.keys(r.value.days).length > 0) {
      MENUS[key] = r.value.days;
      continue;
    }
    const msg = r.status === 'rejected' ? r.reason?.message : `${key}: empty menu table`;
    errors.push(msg || String(r.reason));
    MENUS[key] = sample[key] || sample.기숙사;
  }
  return {
    updatedAt: new Date().toISOString(),
    source: errors.length ? 'sample+fallback' : 'https://www.mju.ac.kr/mjukr/',
    MENUS,
    errors,
  };
}
