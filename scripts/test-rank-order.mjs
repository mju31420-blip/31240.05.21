/**
 * 모드별 식당 순위가 달라지는지 검증 (3공 · 점심 · 공강 75분)
 */
import { readFileSync } from 'fs';
import { createContext, runInContext } from 'vm';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const ctx = createContext({ window: {}, console });
runInContext(readFileSync(join(root, 'public/campusDistance.js'), 'utf8'), ctx);
const CD = ctx.window.CampusDistance;

function compareSortTuple(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i];
    const bv = b[i];
    if (typeof av === 'string' && typeof bv === 'string') {
      const c = av.localeCompare(bv, 'ko');
      if (c !== 0) return c;
      continue;
    }
    const na = Number(av) || 0;
    const nb = Number(bv) || 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

function restaurantSortTuple(row, mode, period = 'lunch') {
  const closed = row.cardState === 'closed' ? 1 : 0;
  const tier = closed ? 9 : row.tier ?? 0;
  const walk = Number(row.walk) || 999;
  const total = Number(row.total) || 999;
  const wait = Number(row.wait) || 999;
  const margin = typeof row.margin === 'number' ? row.margin : -999;
  const key = row.key || '';
  const m = mode || 'balance';

  if (m === 'distance') {
    if (period === 'dinner') return [closed, tier, walk, total, wait, key];
    return [closed, tier, walk, total, wait, -margin, key];
  }
  if (m === 'food') {
    return [
      closed,
      -(row.cuisineFocus ?? 0),
      -(row.cuisineHits ?? 0),
      -(row.tasteScore ?? 0),
      -(row.foodScore ?? 0),
      walk,
      key,
    ];
  }
  if (period === 'dinner') return [closed, -(row.balanceScore ?? 0), -margin, walk, key];
  return [closed, -(row.balanceScore ?? 0), -margin, total, walk, key];
}

function sortByMode(rows, mode, period = 'lunch') {
  return [...rows].sort((a, b) =>
    compareSortTuple(restaurantSortTuple(a, mode, period), restaurantSortTuple(b, mode, period)),
  );
}

const CUISINE_DETECT = [
  ['중식', ['짜장', '짬뽕', '마라']],
  ['일식', ['우동', '돈까스', '가라아게']],
  ['양식', ['스파게티', '파스타', '스테이크', '함박']],
  ['한식', ['제육', '불고기', '된장', '비빔', '찌개', '국밥']],
];

function detectMenuCuisines(name) {
  const found = [];
  for (const [cuisine, keys] of CUISINE_DETECT) {
    if (keys.some((k) => name.includes(k))) found.push(cuisine);
  }
  if (!found.length) found.push('한식');
  return found;
}

function analyzeCuisineFit(menus, tastes) {
  const breakdown = { 한식: 0, 중식: 0, 일식: 0, 양식: 0 };
  if (!menus.length) return { score: 0, hits: 0, breakdown };
  if (!tastes.length) return { score: 45, hits: 0, breakdown };
  let hits = 0;
  for (const m of menus) {
    const cuisines = detectMenuCuisines(m.name);
    cuisines.forEach((c) => {
      breakdown[c] = (breakdown[c] || 0) + 1;
    });
    if (tastes.some((t) => cuisines.includes(t))) hits++;
  }
  const n = menus.length;
  const matchRatio = hits / n;
  const score = Math.min(100, Math.round(matchRatio * 48 + hits * 7 + tastes.length * 3));
  return { score, hits, breakdown };
}

const fromKey = '3공';
const nextKey = 'none';
const gapMin = 75;
const waitMin = 8;
const keys = ['기숙사', '명진당', '교직원', '학생회관'];
const menusByKey = {
  기숙사: [{ name: '제육볶음' }, { name: '김치찌개' }, { name: '비빔밥' }],
  명진당: [{ name: '돈까스' }, { name: '우동' }],
  교직원: [{ name: '불고기' }, { name: '된장찌개' }],
  학생회관: [{ name: '스파게티' }, { name: '함박스테이크' }],
};

function buildRows(tastes) {
  return keys.map((key) => {
    const walk = CD.walkToRest(fromKey, key);
    const back = CD.walkRestToBuilding(key, nextKey);
    const total = walk + waitMin + CD.EAT_MIN + back;
    const margin = gapMin - total;
    const menus = menusByKey[key];
    const fit = analyzeCuisineFit(menus, tastes);
    const cuisineFocus = tastes.length
      ? tastes.reduce((sum, t) => sum + (fit.breakdown[t] || 0), 0)
      : 0;
    const scoreBase = {
      fromKey,
      nextKey,
      gapMin,
      restaurantKey: key,
      waitMin,
      matchCount: fit.score,
      period: 'lunch',
      status: 'ok',
    };
    return {
      key,
      cardState: 'operating',
      tier: 0,
      walk,
      wait: waitMin,
      total,
      margin,
      tasteScore: fit.score,
      cuisineHits: fit.hits,
      cuisineFocus,
      balanceScore: CD.scoreRestaurant({ ...scoreBase, mode: 'balance' }).score,
      foodScore: CD.scoreRestaurant({ ...scoreBase, mode: 'food' }).score,
    };
  });
}

function orderLabel(rows) {
  return rows.map((r) => r.key).join(' > ');
}

const tastesHan = ['한식'];
const tastesWest = ['양식'];

const rowsHan = buildRows(tastesHan);
const rowsWest = buildRows(tastesWest);

const dist = sortByMode(rowsHan, 'distance');
const bal = sortByMode(rowsHan, 'balance');
const foodHan = sortByMode(rowsHan, 'food');
const foodWest = sortByMode(rowsWest, 'food');

console.log('=== 3공 점심 · 취향 한식 ===');
console.log('distance:', orderLabel(dist));
console.log('balance :', orderLabel(bal));
console.log('food    :', orderLabel(foodHan));
console.log('');
console.log('=== 취향 양식으로 food 모드 ===');
console.log('food    :', orderLabel(foodWest));
console.log('');

const sameAll =
  orderLabel(dist) === orderLabel(bal) && orderLabel(bal) === orderLabel(foodHan);
const foodChanges = orderLabel(foodHan) !== orderLabel(foodWest);

console.log('distance vs balance 동일?', orderLabel(dist) === orderLabel(bal));
console.log('distance vs food(한식) 동일?', orderLabel(dist) === orderLabel(foodHan));
console.log('food 한식 vs 양식 변경됨?', foodChanges);
console.log('세 모드 전부 동일?', sameAll);

if (orderLabel(dist) === orderLabel(bal) && orderLabel(dist) === orderLabel(foodHan)) {
  console.error('FAIL: 세 모드 순서가 모두 같음');
  process.exit(1);
}
if (!foodChanges) {
  console.error('FAIL: 취향 변경 시 food 순서 불변');
  process.exit(1);
}
// 공강 30분(베타 UI와 유사) — tier 분리 후에도 균형·음식은 거리와 달라야 함
const gap30 = 30;
const waitByKey = { 교직원: 5, 명진당: 12, 학생회관: 12, 기숙사: 12 };
const rows30 = keys.map((key) => {
  const walk = CD.walkToRest(fromKey, key);
  const wait = waitByKey[key];
  const total = walk + wait + CD.EAT_MIN;
  const margin = gap30 - total;
  const menus = menusByKey[key];
  const fit = analyzeCuisineFit(menus, tastesHan);
  const cuisineFocus = tastesHan.reduce((s, t) => s + (fit.breakdown[t] || 0), 0);
  const scoreBase = {
    fromKey,
    nextKey,
    gapMin: gap30,
    restaurantKey: key,
    waitMin: wait,
    matchCount: fit.score,
    period: 'lunch',
    status: 'ok',
  };
  return {
    key,
    cardState: 'operating',
    tier: margin < 0 ? 1 : 0,
    walk,
    wait,
    total,
    margin,
    tasteScore: fit.score,
    cuisineHits: fit.hits,
    cuisineFocus,
    balanceScore: CD.scoreRestaurant({ ...scoreBase, mode: 'balance' }).score,
    foodScore: CD.scoreRestaurant({ ...scoreBase, mode: 'food' }).score,
  };
});
const d30 = sortByMode(rows30, 'distance');
const b30 = sortByMode(rows30, 'balance');
const f30 = sortByMode(rows30, 'food');
console.log('');
console.log('=== 공강 30분 (짧은 공강) ===');
console.log('distance:', orderLabel(d30));
console.log('balance :', orderLabel(b30));
console.log('food    :', orderLabel(f30));
if (orderLabel(d30) === orderLabel(b30) && orderLabel(d30) === orderLabel(f30)) {
  console.error('FAIL: 공강 30분에서 세 모드 동일');
  process.exit(1);
}

console.log('OK: 모드·취향별 순서 차이 확인');
