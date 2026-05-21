/* ════════════════════════════ PROFILE ════ */
let P = { name: '명지인', tastes: [], home: '', diet: false };
let tArr = [],
  hVal = '';

function togDiet(el) {
  el.classList.toggle('on');
}

function togChip(el, g) {
  if (g === 't') {
    el.classList.toggle('on');
    const v = el.dataset.v;
    tArr = el.classList.contains('on') ? [...tArr, v] : tArr.filter((x) => x !== v);
  } else {
    document.querySelectorAll('#homeG .chip').forEach((c) => c.classList.remove('on'));
    el.classList.add('on');
    hVal = el.dataset.v;
  }
}

function doneOb() {
  P.name = document.getElementById('obName').value.trim() || '명지인';
  P.tastes = [...tArr];
  P.home = hVal;
  P.diet = document.getElementById('obDiet')?.classList.contains('on') || false;
  document.getElementById('hpName').textContent = P.name + '님';
  document.getElementById('hpHome').textContent = P.home || '거주 미설정';
  document.getElementById('obOv').style.display = 'none';
  saveProfile();
  updateLearnedDisplay();
  setTimeout(() => moveInk(document.querySelector('.tb.on')), 60);
}

function saveProfile() {
  try {
    localStorage.setItem('profile', JSON.stringify(P));
  } catch (e) {
    console.warn('profile save', e);
  }
}

function loadProfile() {
  try {
    const raw = localStorage.getItem('profile');
    if (!raw) return;
    const saved = JSON.parse(raw);
    P = { ...P, ...saved };
    document.getElementById('hpName').textContent = P.name + '님';
    document.getElementById('hpHome').textContent = P.home || '거주 미설정';
    if (P.name && P.name !== '명지인') document.getElementById('obOv').style.display = 'none';
  } catch (e) {
    console.warn('profile load', e);
  }
  updateLearnedDisplay();
}

/* ════════════════════════════ 실제 식단 (mju.ac.kr) ════ */
let MENUS = {};
let menuMeta = { updatedAt: null, ready: false, loading: false };

/* ════════════════════════════ CAMPUS SCHEDULE / CROWD ════ */
let CAMPUS_SCHEDULE = null;

/**
 * [혼잡도 예측 - 1단계: 강의시간표 기반]
 * 현재는 명지대 자연캠퍼스 2026년 1학기 강의시간표 데이터를 기반으로
 * 수업 종료 시각과 건물별 인원을 계산해 혼잡도를 예측함.
 *
 * 이 데이터는 임시 대안이며, 아래 단계로 발전 예정:
 * - 2단계: 사용자 방문 피드백(crowd_feedback)이 쌓이면 피드백 비중을 높임
 * - 3단계: 실사용자 데이터가 충분히 쌓이면 강의시간표 데이터 완전 대체
 *
 * 즉, 명비서 사용자가 늘어날수록 campus_schedule.json은 점점 덜 중요해지고
 * 실제 방문 피드백 데이터가 핵심이 됨. 추후 campus_schedule.json 의존도를
 * 낮추는 방향으로 리팩토링 권장.
 */
async function loadCampusSchedule() {
  if (CAMPUS_SCHEDULE) return;
  try {
    const res = await fetch('/data/campus_schedule.json');
    if (!res.ok) throw new Error(`schedule HTTP ${res.status}`);
    const data = await res.json();
    CAMPUS_SCHEDULE = Object.fromEntries(
      Object.entries(data).filter(([k]) => /^[1-5]$/.test(String(k))),
    );
  } catch (e) {
    console.warn('[campus_schedule]', e.message || e);
    CAMPUS_SCHEDULE = {};
  }
}

function getDynamicCrowd(restaurantKey) {
  const now = typeof KST !== 'undefined' ? KST.now() : new Date();
  const kstHour = now.getHours();
  const kstMin = now.getMinutes();
  const dow = now.getDay();
  const timeFloat = kstHour + kstMin / 60;

  if (dow === 0 || dow === 6) return 10;
  if (timeFloat < 11.0 || timeFloat > 19.0) return 5;
  if (restaurantKey === '명진당' && timeFloat > 14.5) return 5;
  if (restaurantKey === '학생회관' && timeFloat > 14.5) return 5;
  if (restaurantKey === '교직원' && timeFloat > 14.0) return 5;

  const CROWD_BASE = { 기숙사: 40, 명진당: 45, 교직원: 25, 학생회관: 35 };

  let crowdBonus = 0;
  if (CAMPUS_SCHEDULE && CAMPUS_SCHEDULE[dow]) {
    Object.entries(CAMPUS_SCHEDULE[dow]).forEach(([timeKey, buildings]) => {
      const [h, m] = timeKey.split(':').map(Number);
      const endFloat = h + m / 60;
      const diff = timeFloat - endFloat;
      if (diff >= -0.17 && diff <= 0.33) {
        const NEARBY = {
          기숙사: ['자연', '명진당', '1공'],
          명진당: ['명진당', '자연', '5공', '3공'],
          교직원: ['명진당', '자연', '5공'],
          학생회관: ['학생', '자연', '5공', '3공'],
        };
        (NEARBY[restaurantKey] || []).forEach((b) => {
          crowdBonus += (buildings[b] || 0) * 0.02;
        });
      }
    });
  }

  // 사용자 피드백이 쌓일수록 아래 비중(0.5)을 높여야 함
  // 피드백 10건 이상: 0.7, 30건 이상: 0.9 로 조정 권장
  try {
    const feedback = JSON.parse(localStorage.getItem('crowd_feedback') || '[]');
    const relevant = feedback.filter(
      (f) => f.restaurant === restaurantKey && f.dow === dow && Math.abs(f.hour - kstHour) <= 1,
    );
    if (relevant.length > 0) {
      const avg = relevant.reduce((s, f) => s + f.actualCrowd, 0) / relevant.length;
      crowdBonus = crowdBonus * 0.5 + avg * 0.5;
    }
  } catch (e) {}

  return Math.min(95, Math.max(5, Math.round((CROWD_BASE[restaurantKey] || 40) + crowdBonus)));
}

async function loadMenus(refresh = false) {
  if (menuMeta.loading) return;
  if (!refresh && menuMeta.ready) return;
  menuMeta.loading = true;
  const el = document.getElementById('menuSync');
  if (el) el.textContent = '식단 불러오는 중…';
  try {
    const res = await fetch('/api/menus' + (refresh ? '?refresh=1' : ''));
    const ct = res.headers.get('content-type') || '';
    if (!res.ok) {
      throw new Error(
        res.status === 403
          ? '식단 API 403 — Functions 배포·공개 호출(invoker) 설정을 확인하세요'
          : `식단 API HTTP ${res.status}`,
      );
    }
    if (!ct.includes('json')) {
      throw new Error('식단 API가 JSON이 아닌 응답을 반환했습니다 (Hosting rewrite 확인)');
    }
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || '식단 API 오류');
    MENUS = data.MENUS || {};
    menuMeta.updatedAt = data.updatedAt;
    menuMeta.ready = Object.keys(MENUS).length > 0;
    if (el) {
      const t = menuMeta.updatedAt
        ? new Date(menuMeta.updatedAt).toLocaleString('ko-KR', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '';
      el.textContent = menuMeta.ready ? `식단 연동 · ${t}` : '식단 일부만 로드됨';
    }
    if (lastData) drawFood();
  } catch (e) {
    if (el) el.textContent = '식단 연동 실패';
    showToast('공식 식단을 불러오지 못했어요');
    console.error(e);
  } finally {
    menuMeta.loading = false;
  }
}

async function ensureMenus() {
  if (!menuMeta.ready && !menuMeta.loading) await loadMenus();
}

/* ════════════════════════════ TIME / WEATHER ════ */
function tick() {
  const n = typeof KST !== 'undefined' ? KST.now() : new Date(),
    d = ['일', '월', '화', '수', '목', '금', '토'][n.getDay()];
  document.getElementById('nowTime').textContent =
    `${d}요일 ${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
}
tick();
setInterval(tick, 30000);

async function fetchWeather() {
  try {
    const res = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=37.2219&longitude=127.1887&current=temperature_2m,weathercode&timezone=Asia%2FSeoul',
    );
    const data = await res.json();
    const temp = Math.round(data.current.temperature_2m);
    const code = data.current.weathercode;
    let icon, label;
    if (code === 0) {
      icon = '☀️';
      label = `맑음 ${temp}°`;
    } else if (code <= 3) {
      icon = '⛅';
      label = `구름 ${temp}°`;
    } else if (code <= 48) {
      icon = '☁️';
      label = `흐림 ${temp}°`;
    } else if (code <= 67) {
      icon = '🌧️';
      label = `비 ${temp}°`;
    } else if (code <= 77) {
      icon = '❄️';
      label = `눈 ${temp}°`;
    } else {
      icon = '🌧️';
      label = `비/눈 ${temp}°`;
    }
    document.getElementById('wIco').textContent = icon;
    document.getElementById('wLbl').textContent = label;
  } catch (e) {
    console.error('날씨 로드 실패', e);
  }
}
fetchWeather();
setInterval(fetchWeather, 30 * 60 * 1000);
loadMenus();
loadCampusSchedule();

/* ════════════════════════════ TABS ════ */
function goTab(id, btn) {
  document.querySelectorAll('.pane').forEach((e) => e.classList.remove('on'));
  document.querySelectorAll('.tb').forEach((e) => e.classList.remove('on'));
  document.getElementById('pane-' + id).classList.add('on');
  btn.classList.add('on');
  moveInk(btn);
  if (id === 'shuttle') drawShuttle();
}
function moveInk(btn) {
  const t = document.getElementById('tabs'),
    ink = document.getElementById('tbInk');
  if (!btn || !t) return;
  const tr = t.getBoundingClientRect(),
    br = btn.getBoundingClientRect();
  ink.style.left = br.left - tr.left + 'px';
  ink.style.width = br.width + 'px';
}
window.addEventListener('resize', () => moveInk(document.querySelector('.tb.on')));

/* ════════════════════════════ DAY / MEAL ════ */
let dayMode = 'today',
  mealMode = 'lunch',
  rankMode = 'balance',
  lastData = null;

function setRank(m) {
  rankMode = m;
  if (lastData) lastData.rankMode = m;
  document.getElementById('rBal')?.classList.toggle('on', m === 'balance');
  document.getElementById('rDist')?.classList.toggle('on', m === 'distance');
  document.getElementById('rFood')?.classList.toggle('on', m === 'food');
  if (lastData) drawFood();
}

function setDay(m) {
  dayMode = m;
  document.getElementById('btnToday').classList.toggle('on', m === 'today');
  document.getElementById('btnTmrw').classList.toggle('on', m === 'tomorrow');
  if (lastData) drawFood();
}
function setMeal(m) {
  mealMode = m;
  document.getElementById('mLunch').classList.toggle('on', m === 'lunch');
  document.getElementById('mDinner').classList.toggle('on', m === 'dinner');
  if (lastData) drawFood();
}

/* ════════════════════════════ INPUT MODE ════ */
let hasImg = false,
  imgB64 = null,
  imgMediaType = 'image/jpeg';

function setMd(m) {
  document.getElementById('mMan').classList.toggle('on', m === 'manual');
  document.getElementById('mImg').classList.toggle('on', m === 'img');
  document.getElementById('manMode').style.display = m === 'manual' ? 'block' : 'none';
  document.getElementById('imgMode').style.display = m === 'img' ? 'block' : 'none';
}

function handleFile(e) {
  const f = e.target.files[0];
  if (!f) return;
  imgMediaType = f.type || 'image/jpeg';
  const r = new FileReader();
  r.onload = (ev) => {
    const dataUrl = ev.target.result;
    imgB64 = dataUrl.split(',')[1];
    document.getElementById('upPrev').src = dataUrl;
    document.getElementById('upPrev').style.display = 'block';
    document.getElementById('upIco').style.display = 'none';
    document.getElementById('upTtl').textContent = '✅ 등록 완료';
    document.getElementById('upHint').textContent = '분석 버튼을 눌러주세요';
    document.getElementById('upzone').classList.add('done');
    hasImg = true;
    document.getElementById('btnImg').disabled = false;
  };
  r.readAsDataURL(f);
}

/* ════════════════════════════ LOGIC ════ */
const BASE = { 기숙사: 70, 명진당: 82, 교직원: 28, 학생회관: 60 };
const PMULT = { lunch: 1.0, dinner: 0.55 };

function waitMin(c) {
  return c <= 30 ? 5 : c <= 55 ? 12 : c <= 70 ? 20 : c <= 83 ? 28 : 36;
}
function isOpen(key, period) {
  if (period !== 'dinner') return true;
  if (key === '명진당' || key === '학생회관') return false;
  if (key === '교직원' && new Date().getDay() === 6) return false;
  return true;
}

const TKEYS = {
  매운맛: ['매운', '제육', '김치', '부대', '육개장', '닭갈비', '라면', '짬뽕', '마라', '불닭', '고추', '청양', '떡볶이', '순대국', '빨간'],
  건강식: ['비빔밥', '나물', '두부', '콩나물', '미역', '샐러드', '현미', '잡곡', '채소', '닭가슴살', '그린', '저칼로리', '곤약', '두유', '닭죽'],
  고기류: ['제육', '불고기', '갈비', '삼겹', '돼지', '닭', '함박', '돈까스', '목살', '차돌', '소고기', '양념육', '스테이크', '닭볶음', '오리', '육전'],
  찌개류: ['찌개', '국밥', '순대', '해장', '갈비탕', '부대', '된장', '청국장', '순두부', '동태', '뚝배기', '설렁탕', '곰탕', '감자탕'],
  면류: ['국수', '라면', '우동', '냉면', '스파게티', '덮밥', '볶음밥', '쌀국수', '짜장', '짬뽕', '파스타', '소면', '비빔면', '막국수', '칼국수'],
  양식: ['스파게티', '파스타', '돈까스', '함박', '스테이크', '피자', '샌드위치', '크림', '로제', '오믈렛', '그라탕', '리조또', '치킨스테이크', '포크커틀릿'],
  일식: ['우동', '라멘', '초밥', '돈부리', '텐동', '규동', '가라아게', '미소', '오야코동', '가츠동', '야끼소바', '타코야끼', '스시', '돈코츠'],
  중식: ['짜장', '짬뽕', '탕수육', '마파두부', '볶음밥', '깐풍기', '유린기', '팔보채', '마라탕', '훠궈', '딤섬', '꿔바로우', '난자완스'],
  한식: ['비빔밥', '불고기', '갈비', '된장', '김치', '잡채', '떡볶이', '순대', '해장국', '삼계탕', '육개장', '설렁탕', '냉면', '보쌈'],
  가성비: [],
};

const DELIVERY_LINKS = [
  { name: '배달의민족', url: 'https://www.baemin.com', icon: '🛵' },
  { name: '쿠팡이츠', url: 'https://www.coupangeats.com', icon: '🟡' },
  { name: '요기요', url: 'https://www.yogiyo.co.kr', icon: '🔴' },
];

function renderDeliverySectionHtml() {
  const opts = DELIVERY_LINKS.map(
    (d) =>
      `<a class="delivery-opt-btn" href="${d.url}" target="_blank" rel="noopener noreferrer">${d.icon} ${d.name}</a>`,
  ).join('');
  return `<div class="delivery-wrap">
    <button type="button" class="delivery-main-btn" onclick="toggleDeliveryOptions()">🛵 배달 앱으로 주문하기 (배민 · 쿠팡이츠 · 요기요)</button>
    <div class="delivery-options" id="deliveryOptions">${opts}</div>
  </div>`;
}

function toggleDeliveryOptions() {
  document.getElementById('deliveryOptions')?.classList.toggle('on');
}

/** CampusDistance 미로드 시 폴백 */
function scoreRestaurantLocal({ fromKey, nextKey, gapMin, restaurantKey, waitMin, matchCount, mode, status }) {
  if (status === 'closed') return { score: -9999 };
  if (status === 'bad') return { score: -500 };

  const walk =
    typeof CampusDistance !== 'undefined' ? CampusDistance.walkToRest(fromKey, restaurantKey) : 8;
  const back =
    nextKey === 'none' || !nextKey
      ? 0
      : typeof CampusDistance !== 'undefined'
        ? CampusDistance.walkToRest(restaurantKey, nextKey)
        : 8;

  const totalTime = walk + waitMin + 15 + back;
  const timeScore = Math.max(0, 100 - totalTime * 1.5);
  const waitScore = Math.max(0, 100 - waitMin * 2.5);
  const matchScore = Math.min(100, matchCount * 30);

  let w = 1.0;
  try {
    const weights = JSON.parse(localStorage.getItem('restaurant_weights') || '{}');
    w = weights[restaurantKey] || 1.0;
  } catch (e) {
    /* ignore */
  }

  let score;
  if (mode === 'distance') {
    score = (timeScore * 0.75 + waitScore * 0.2 + matchScore * 0.05) * w;
  } else if (mode === 'food') {
    score = (matchScore * 0.75 + timeScore * 0.15 + waitScore * 0.1) * w;
  } else {
    score = (timeScore * 0.4 + waitScore * 0.2 + matchScore * 0.4) * w;
  }

  return { score: Math.round(score || 0) };
}

function getRestaurantScore(opts) {
  if (typeof CampusDistance !== 'undefined' && typeof CampusDistance.scoreRestaurant === 'function') {
    return CampusDistance.scoreRestaurant(opts);
  }
  return scoreRestaurantLocal(opts);
}

function crowdBadgeLabel(st, baseBadge) {
  if (st === 'closed') return '저녁 운영 없음';
  if (baseBadge) return baseBadge;
  if (st === 'ok') return '원활';
  if (st === 'warn') return '혼잡 주의';
  if (st === 'bad') return '대기 길음';
  return '혼잡 주의';
}

function platformUrl(platform, q) {
  if (platform === '배달의민족') return `https://www.baemin.com/search?q=${encodeURIComponent(q)}`;
  if (platform === '쿠팡이츠') return `https://www.coupangeats.com/search?q=${encodeURIComponent(q)}`;
  if (platform === '요기요') return `https://www.yogiyo.co.kr/search/?query=${encodeURIComponent(q)}`;
  return `https://map.naver.com/v5/search/${encodeURIComponent(q)}`;
}

const VISIT_RESTAURANTS = [
  { key: '기숙사', label: '🏠 기숙사식당' },
  { key: '명진당', label: '🍱 명진당' },
  { key: '교직원', label: '👔 교직원식당' },
  { key: '학생회관', label: '🏢 학생회관' },
];
let visitDraft = {};

function effectiveTastes() {
  let learned = [];
  try {
    learned = JSON.parse(localStorage.getItem('learned_tastes') || '[]');
  } catch {
    learned = [];
  }
  return [...new Set([...(P.tastes || []), ...learned])];
}

function tagsFromMenus(menus) {
  const tags = new Set();
  for (const m of menus) {
    for (const [tag, keys] of Object.entries(TKEYS)) {
      if (tag === '가성비' || !keys.length) continue;
      if (keys.some((k) => m.name.includes(k))) tags.add(tag);
    }
  }
  return [...tags];
}

function updateLearnedDisplay() {
  const el = document.getElementById('hpLearned');
  if (!el) return;
  let learned = [];
  try {
    learned = JSON.parse(localStorage.getItem('learned_tastes') || '[]');
  } catch {
    learned = [];
  }
  if (!learned.length) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  el.innerHTML = `🤖 AI 파악 취향: <b>${learned.join(', ')}</b>`;
}

function recordVisitLearning(restaurantKey, menus) {
  const menuNames = menus.map((m) => m.name);
  const tags = tagsFromMenus(menus);
  const entry = { restaurant: restaurantKey, menus: menuNames, tags, timestamp: Date.now() };

  let visitHistory = [];
  let tasteHistory = {};
  let weights = {};
  try {
    visitHistory = JSON.parse(localStorage.getItem('visit_history') || '[]');
    tasteHistory = JSON.parse(localStorage.getItem('taste_history') || '{}');
    weights = JSON.parse(localStorage.getItem('restaurant_weights') || '{}');
  } catch {
    visitHistory = [];
    tasteHistory = {};
    weights = {};
  }

  visitHistory.push(entry);
  if (visitHistory.length > 200) visitHistory = visitHistory.slice(-200);
  localStorage.setItem('visit_history', JSON.stringify(visitHistory));

  for (const tag of tags) {
    tasteHistory[tag] = (tasteHistory[tag] || 0) + 1;
  }
  localStorage.setItem('taste_history', JSON.stringify(tasteHistory));

  const learned = Object.entries(tasteHistory)
    .filter(([, n]) => n >= 3)
    .map(([tag]) => tag);
  localStorage.setItem('learned_tastes', JSON.stringify(learned));

  const restVisits = visitHistory.filter((v) => v.restaurant === restaurantKey).length;
  if (restVisits >= 3) {
    weights[restaurantKey] = Math.max(weights[restaurantKey] || 1, 1.1);
    localStorage.setItem('restaurant_weights', JSON.stringify(weights));
  }

  updateLearnedDisplay();
}

function resetLearnData() {
  ['visit_history', 'taste_history', 'learned_tastes', 'restaurant_weights'].forEach((k) =>
    localStorage.removeItem(k),
  );
  updateLearnedDisplay();
  if (lastData) drawFood();
  showToast('학습 데이터가 초기화됐어요');
}

function isMatch(name) {
  return effectiveTastes().some((t) => (TKEYS[t] || []).some((k) => name.includes(k)));
}

function menuDayIndex(dayOffset = 0) {
  return (new Date().getDay() + dayOffset) % 7;
}

function getMenus(key, period, dayOffset = null) {
  const offset = dayOffset !== null ? dayOffset : dayMode === 'tomorrow' ? 1 : 0;
  const day = menuDayIndex(offset);
  const slot = period === 'dinner' ? 'd' : 'l';
  const raw = ((MENUS[key] || {})[day] || {})[slot] || [];
  return raw.map((m) => ({
    name: m.n,
    tag: isMatch(m.n) ? 'match' : m.t || '없음',
    kcal: m.k || 0,
  }));
}

const CMT = {
  tight: ['공강이 짧아요! 가장 가깝고 대기 짧은 곳으로 이동하세요.', '교직원 식당이 지금 가장 빠른 선택이에요.'],
  normal: ['적당한 여유가 있어요. 취향 메뉴를 확인해보세요!', '공강이 충분해요. 마음에 드는 메뉴가 있는 곳으로 가보세요.'],
  free: ['공강이 넉넉해요! 원하는 식당 어디든 여유롭게 가세요.', '오늘 취향 메뉴가 있는 곳으로 가보세요!'],
};
function getCmt(g) {
  const k = g < 60 ? 'tight' : g < 100 ? 'normal' : 'free';
  return CMT[k][new Date().getMinutes() % 2];
}

async function doAnalyze() {
  await ensureMenus();
  const cur = document.getElementById('mCur').value;
  const curTxt = document.getElementById('mCur').options[document.getElementById('mCur').selectedIndex].text;
  const nxtTxt = document.getElementById('mNext').options[document.getElementById('mNext').selectedIndex].text;
  const gapMin = parseInt(document.getElementById('mGap').value, 10);
  const nextKey = document.getElementById('mNext').value;
  const mealIntent = MealEngine.computeMealIntent(gapMin);
  const period = mealIntent.period;
  buildAndRender(cur, curTxt, nxtTxt, gapMin, period, { mealIntent, nextKey });
}

function buildAndRender(cur, curTxt, nxtTxt, gapMin, period, extra = {}) {
  const refNow = typeof KST !== 'undefined' ? KST.now() : new Date();
  const mealIntent = extra.mealIntent || MealEngine.computeMealIntent(gapMin, refNow);
  const segment = MealEngine.getUserSegment(P.home);
  const nextKey = extra.nextKey ?? (nxtTxt.includes('없음') ? 'none' : cur);
  const crowd = MealEngine.estimateCrowd(cur, period, gapMin, mealIntent.willEat);
  MealEngine.logCrowdEvent({
    building: cur,
    gapMin,
    period,
    willEat: mealIntent.willEat,
    nextKey,
    rule: mealIntent.rule,
    rankMode,
  });
  const mult = PMULT[period] || 1;
  const tLabel = period === 'dinner' ? '저녁' : '점심';

  function buildR(key) {
    const walkGo = CampusDistance.walkToRest(cur, key);
    if (!isOpen(key, period)) {
      return {
        상태: 'closed',
        배지: '저녁 운영 없음',
        도보분: walkGo,
        복귀분: 0,
        대기분: 0,
        총소요: 0,
        혼잡도: 0,
        추천여부: false,
        메뉴: [],
        trip: null,
      };
    }
    const cong = getDynamicCrowd(key);
    const wait = waitMin(cong);
    const st = cong >= 80 ? 'bad' : cong >= 55 ? 'warn' : 'ok';
    const BDGS = { ok: '원활', warn: '혼잡 주의', bad: '대기 길음' };
    const trip = CampusDistance.planRoundTrip(cur, nextKey, key, wait, CampusDistance.EAT_MIN);
    trip.margin = gapMin - trip.total;
    return {
      상태: st,
      배지: BDGS[st],
      도보분: trip.go,
      복귀분: trip.back,
      대기분: wait,
      총소요: trip.total,
      혼잡도: cong,
      추천여부: false,
      메뉴: getMenus(key, period),
      trip,
    };
  }

  const 식당 = { 기숙사: buildR('기숙사'), 명진당: buildR('명진당'), 교직원: buildR('교직원'), 학생회관: buildR('학생회관') };

  let best = null,
    bestScore = -9999;
  if (mealIntent.willEat) {
    Object.entries(식당).forEach(([k, v]) => {
      const matchCount = v.메뉴.filter((m) => m.tag === 'match').length;
      const { score } = getRestaurantScore({
        fromKey: cur,
        nextKey,
        gapMin,
        restaurantKey: k,
        waitMin: v.대기분,
        matchCount,
        mode: rankMode,
        status: v.상태,
      });
      if (score > bestScore) {
        bestScore = score;
        best = k;
      }
    });
    if (best) 식당[best].추천여부 = true;
  }

  const isLeave = nextKey === 'none';
  const shBad = isLeave && cur === '3공' && period === 'dinner';
  const sh = {
    상태: isLeave ? (shBad ? 'bad' : 'warn') : 'ok',
    설명: isLeave
      ? shBad
        ? 'Y19 하교 묶음 — 승강장 만차 가능성 높음 (통학 시 참고)'
        : '하교 시간 — 승강장·셔틀 확인 권장'
      : '다음 수업이 있어 캠퍼스 내 이동 중심입니다.',
    대안: isLeave ? '진입로 셔틀 → 에버라인 환승' : '',
    혼잡도: isLeave ? (shBad ? 91 : 55) : 25,
  };

  const bestMenus = best ? 식당[best].메뉴 : [];
  const external = MealEngine.shouldSuggestExternal(P, bestMenus, mealIntent);

  lastData = {
    현재건물키: cur,
    현재위치: curTxt,
    다음수업: nxtTxt,
    공강분: gapMin,
    공강텍스트: TimetableUtil?.formatGapText
      ? TimetableUtil.formatGapText(gapMin)
      : gapMin < 60
        ? `${gapMin}분`
        : gapMin < 90
          ? '1시간 ~ 1시간 30분'
          : '2시간 이상',
    시간대: tLabel,
    캠퍼스인원: crowd.인원,
    총평: mealIntent.willEat ? mealIntent.reason : mealIntent.reason,
    mealIntent,
    segment,
    external,
    nextKey,
    rankMode,
    analyzedAt: typeof KST !== 'undefined' ? KST.format() : '',
    오늘: { 식당, 셔틀: sh, crowd },
    내일: buildTomorrow(cur, period),
  };

  document.getElementById('schBd').classList.remove('on');
  document.getElementById('aiBox').classList.remove('on');
  document.getElementById('fbBox').classList.remove('on');
  setTimeout(() => {
    drawBoard();
    drawFood();
  }, 50);
}

function buildTomorrow(cur, period) {
  const mult2 = (PMULT[period] || 1) * 1.1;
  const walkFn =
    typeof CampusDistance !== 'undefined' ? (k) => CampusDistance.walkToRest(cur, k) : () => 8;
  const 식당 = {};
  ['기숙사', '명진당', '교직원', '학생회관'].forEach((key) => {
    const walkMin = walkFn(key);
    if (!isOpen(key, period)) {
      식당[key] = { 상태: 'closed', 배지: '저녁 운영 없음', 도보분: walkMin, 대기분: 0, 혼잡도: 0, 추천여부: false, 메뉴: [] };
      return;
    }
    const cong = getDynamicCrowd(key);
    const wait = waitMin(cong);
    const st = cong >= 80 ? 'bad' : cong >= 55 ? 'warn' : 'ok';
    const BDGS = { ok: '원활', warn: '혼잡 주의', bad: '대기 길음' };
    식당[key] = {
      상태: st,
      배지: BDGS[st],
      도보분: walkMin,
      대기분: wait,
      혼잡도: cong,
      추천여부: key === '교직원',
      메뉴: getMenus(key, period, 1),
    };
  });
  return {
    예측: '내일도 오늘과 비슷한 혼잡도가 예상됩니다.',
    식당,
    셔틀: { 상태: 'warn', 설명: '내일 하교 시간대도 승강장 대기가 예상됩니다.', 대안: '진입로 셔틀 → 에버라인 환승을 미리 계획해두세요.', 혼잡도: 58 },
  };
}

function drawBoard() {
  const d = lastData;
  document.getElementById('sbRows').innerHTML = [
    ['현재 위치', d.현재위치 || '-'],
    ['다음 수업', d.다음수업 || '-'],
    ['공강 시간', d.공강텍스트 || '-'],
    ['분석 시각', d.analyzedAt || 'KST'],
  ]
    .map(([k, v]) => `<div class="dr"><span class="dk">${k}</span><span class="dv">${v}</span></div>`)
    .join('');

  document.getElementById('tAlert').innerHTML = d.mealIntent?.willEat
    ? `⚠️ ${d.오늘?.crowd?.설명 || '식사 파동'} · 동시 이동 <b>${d.캠퍼스인원}</b>`
    : `ℹ️ 짧은 공강 — 학식 대신 간단히 해결하는 패턴`;
  document.getElementById('schBd').classList.add('on');
  document.getElementById('aiBox').classList.add('on');
  document.getElementById('aiTxt').innerHTML = '';
  typeText('aiTxt', d.총평 || '분석 완료되었습니다.');
}

function drawAltFood() {
  const box = document.getElementById('altFood');
  if (!box) return;
  const ext = lastData?.external;
  if (!ext) {
    box.classList.remove('on');
    box.innerHTML = '';
    return;
  }
  const urlFn = typeof MealEngine !== 'undefined' ? MealEngine.platformUrl : platformUrl;
  const items = ext.list
    .map((it) => {
      const href = urlFn(it.platform, it.q);
      return `<a class="alt-link" href="${href}" target="_blank" rel="noopener noreferrer">${it.platform} · ${it.name}</a>`;
    })
    .join('');
  box.className = 'alt-food on';
  box.innerHTML = `<div class="alt-ttl">🛒 학식 대신 추천</div><div class="alt-why">${ext.why}</div><div class="alt-links">${items}</div>`;
}

function drawFood() {
  if (!lastData) return;
  const src = dayMode === 'today' ? lastData.오늘 : lastData.내일;
  if (!src?.식당) return;

  drawAltFood();
  document.getElementById('dayChip').innerHTML =
    dayMode === 'tomorrow' && lastData.내일?.예측 ? `<div class="pred-chip">🔮 내일 예측 — ${lastData.내일.예측}</div>` : '';

  const deliveryWrap = document.getElementById('deliveryWrap');
  if (!menuMeta.ready) {
    document.getElementById('rcWrap').innerHTML =
      '<p style="text-align:center;color:var(--sub);font-size:12px;padding:20px">공식 식단 불러오는 중…</p>';
    if (deliveryWrap) deliveryWrap.innerHTML = '';
    return;
  }

  const gapMin = lastData.공강분 || 75;
  const nextKey = lastData.nextKey || 'none';
  const MEAL = CampusDistance.EAT_MIN;
  const INSTA = {
    기숙사: 'https://www.instagram.com/mj_bokji_foodist/',
    명진당: 'https://www.instagram.com/mju_lounge/',
    교직원: 'https://www.instagram.com/mj_bangmok_foodist/',
    학생회관: 'https://www.instagram.com/mjhs_yongin/',
  };
  const DEFS = [
    { key: '기숙사', e: '🏠', n: '기숙사식당 (복지동)' },
    { key: '명진당', e: '🍱', n: '명진당 식당' },
    { key: '교직원', e: '👔', n: '교직원 식당' },
    { key: '학생회관', e: '🏢', n: '학생회관 식당' },
  ];
  const TMAP = { 추천: 'mt-rec', 인기: 'mt-hot', 신메뉴: 'mt-new', match: 'mt-match' };
  const activeRankMode = rankMode || lastData.rankMode || 'balance';

  const scored = DEFS.map((def) => {
    const base = src.식당[def.key] || {};
    const openNow = isOpen(def.key, mealMode);
    const st = !openNow ? 'closed' : base.상태 || 'warn';
    const menus = openNow ? getMenus(def.key, mealMode) : [];
    const walk = base.도보분 || 5;
    const back = base.복귀분 || 0;
    const wait = !openNow ? 0 : base.대기분 || 10;
    const cong = !openNow ? 0 : base.혼잡도 || 50;
    const total = base.총소요 || walk + wait + MEAL + back;
    const margin = base.trip?.margin ?? gapMin - total;
    const matchB = menus.filter((m) => m.tag === 'match').length;
    const { score } = getRestaurantScore({
      fromKey: lastData.현재건물키 || '3공',
      nextKey,
      gapMin,
      restaurantKey: def.key,
      waitMin: wait,
      matchCount: matchB,
      mode: activeRankMode,
      status: st,
    });
    return { ...def, base, st, menus, walk, back, wait, cong, total, margin, score, openNow };
  }).sort((a, b) => b.score - a.score);

  let pickName = '추천 식당';
  let pickKey = scored[0]?.key;
  const wrap = document.getElementById('rcWrap');
  const shortGapBanner =
    dayMode === 'today' && gapMin < 45
      ? '<div class="gap-short-banner">⚠️ 공강이 짧아요! 빠른 식당을 우선 추천해요</div>'
      : '';
  wrap.innerHTML = shortGapBanner;

  scored.forEach((row, idx) => {
    const { key, e, n, base, st, menus, walk, back, wait, cong, total, margin, score, openNow } = row;
    const isPick = idx === 0 && openNow && st !== 'closed' && st !== 'bad';
    if (isPick) {
      pickName = n;
      pickKey = key;
    }
    const mc = margin >= 15 ? 'c-safe' : margin >= 3 ? 'c-tight' : 'c-over';
    const mi = margin >= 15 ? '✅' : margin >= 3 ? '⚠️' : '❌';
    const mt = margin >= 0 ? `여유 ${margin}분` : `복귀 불가 ${Math.abs(margin)}분`;
    const backLbl = back > 0 ? `복귀` : '하교';
    const wc = cong <= 30 ? 'v-ok' : cong <= 65 ? 'v-warn' : 'v-bad';
    const matchMs = menus.filter((m) => m.tag === 'match');
    const sortedM = [...matchMs, ...menus.filter((m) => m.tag !== 'match')];
    const mealLbl = mealMode === 'dinner' ? '🌙 저녁' : '☀️ 점심';
    const crowdLbl = crowdBadgeLabel(st, base.배지);
    const badgeCls = st === 'ok' ? 'bdg-g' : st === 'warn' ? 'bdg-o' : st === 'bad' ? 'bdg-r' : 'bdg-gr';
    const headBadge =
      isPick && st !== 'closed'
        ? `<span class="bdg bdg-g">⭐ 1순위 · ${crowdLbl}</span>`
        : `<span class="bdg ${badgeCls}">${crowdLbl}</span>`;
    const rankTxt = isPick ? '' : idx === 1 ? '<span class="rank rank-2">2순위</span>' : idx === 2 ? '<span class="rank rank-3">3순위</span>' : '';

    let menuHtml;
    if (st === 'closed') {
      menuHtml =
        '<div class="menu-box"><div class="menu-ttl" style="color:var(--gray)">영업 종료</div><div style="font-size:12px;color:var(--sub);padding:4px 0">해당 시간대에는 영업하지 않습니다</div></div>';
    } else if (!menus.length) {
      menuHtml = `<div class="menu-box"><div class="menu-ttl">${mealLbl} 메뉴</div><div style="font-size:12px;color:var(--sub)">공식 식단 없음</div></div>`;
    } else {
      const items = sortedM
        .slice(0, 4)
        .map((m) => {
          const tc = TMAP[m.tag] || '';
          const tagSpan = tc ? `<span class="mt ${tc}">${m.tag === 'match' ? '🌶' : m.tag}</span>` : '';
          return `<div class="mrow"><div class="mname">${m.name}${tagSpan}</div></div>`;
        })
        .join('');
      menuHtml = `<div class="menu-box menu-compact"><div class="menu-ttl">${mealLbl}${matchMs.length ? ' · 취향🌶' : ''}</div><div class="menu-grid">${items}</div></div>`;
    }

    const instaUrl = INSTA[row.key];
    const instaHtml = instaUrl
      ? `<a class="insta-btn" href="${instaUrl}" target="_blank" rel="noopener noreferrer">📸 오늘 메뉴 인스타 보기</a>`
      : '';

    const rcCls = isPick ? 'rc-pick' : st === 'ok' ? 'rc-ok' : st === 'warn' ? 'rc-warn' : st === 'bad' ? 'rc-bad' : 'rc-cl';
    const card = document.createElement('div');
    card.className = 'rc ' + rcCls;
    card.innerHTML =
      st === 'closed'
        ? `<div class="rc-in"><div class="rc-head"><div class="rc-name">${e} ${n}${rankTxt}</div>${headBadge}</div>${menuHtml}${instaHtml}</div>`
        : `<div class="rc-in rc-compact">
      <div class="rc-head"><div class="rc-name">${e} ${n}${rankTxt}</div>${headBadge}</div>
      <div class="time-oneline">🚶 ${walk}분 · ⏳ <span class="${wc}">${wait}분</span> · 🔙 ${backLbl} ${back ? back + '분' : '-'} · 식사포함 <b>${total}분</b> / 공강 ${gapMin}분 <span class="${mc}">${mi}${mt}</span></div>
      ${menuHtml}
      ${instaHtml}
    </div>`;
    wrap.appendChild(card);
  });

  if (deliveryWrap) deliveryWrap.innerHTML = renderDeliverySectionHtml();

  window._lastPickKey = pickKey;
  document.getElementById('fbBtn').textContent = '✅ 방문 완료 기록';
  setTimeout(() => document.getElementById('fbBox').classList.add('on'), 400);
}

/* ════════════════════════════ 셔틀 실시간 (2026-1학기 공식표) ════ */
const GIHEUNG_SCHEDULE = {
  /** 캠퍼스 도착 (기흥역 출발 +15분) */
  arriveCampus: ['08:30', '08:35', '09:30', '09:35', '10:30', '10:35', '12:30', '13:30', '14:30', '15:45', '16:45', '17:45', '18:45', '19:45'],
  /** 학교 출발 → 기흥역 */
  schoolDepart: ['09:05', '09:10', '10:05', '10:10', '12:00', '13:00', '14:00', '15:15', '16:15', '17:15', '18:15', '19:15'],
  limit18: '18:00 이후 기흥역 셔틀은 명진당까지만 운행',
  travelMin: 15,
};

/** 시내 셔틀 — 학교 출발 10회/일 */
const CITY_SHUTTLE_SCHEDULE = {
  schoolDepart: ['08:20', '09:20', '10:20', '11:20', '12:20', '13:20', '15:20', '16:20', '17:20', '18:00'],
  limit18: '18:00 이후 시내버스는 제1공학관까지만 운행',
  travelMin: 25,
};

/** 진입로 셔틀 — 학교(버스관리사무소) 출발, 명지대역/시내 */
const ENTRANCE_SHUTTLE_SCHEDULE = {
  schoolDepart: [
    { t: '08:00', type: '명지대역' },
    { t: '08:05', type: '시내' },
    { t: '08:15', type: '명지대역' },
    { t: '08:20', type: '명지대역' },
    { t: '08:25', type: '명지대역' },
    { t: '08:35', type: '명지대역' },
    { t: '08:45', type: '명지대역' },
    { t: '08:50', type: '명지대역' },
    { t: '08:55', type: '시내' },
    { t: '09:00', type: '명지대역' },
    { t: '09:15', type: '명지대역' },
    { t: '09:25', type: '명지대역' },
    { t: '09:30', type: '명지대역' },
    { t: '09:35', type: '명지대역' },
    { t: '09:40', type: '명지대역' },
    { t: '09:55', type: '명지대역' },
    { t: '10:00', type: '명지대역' },
    { t: '10:10', type: '시내' },
    { t: '10:20', type: '명지대역' },
    { t: '10:30', type: '명지대역' },
    { t: '10:40', type: '명지대역' },
    { t: '10:45', type: '명지대역' },
    { t: '11:00', type: '명지대역' },
    { t: '11:20', type: '시내' },
    { t: '11:25', type: '명지대역' },
    { t: '11:30', type: '명지대역' },
    { t: '11:45', type: '명지대역' },
    { t: '11:55', type: '명지대역' },
    { t: '12:05', type: '명지대역' },
    { t: '12:20', type: '명지대역' },
    { t: '12:30', type: '명지대역' },
    { t: '12:45', type: '명지대역' },
    { t: '13:00', type: '명지대역' },
    { t: '13:10', type: '시내' },
    { t: '13:25', type: '명지대역' },
    { t: '13:40', type: '명지대역' },
    { t: '14:00', type: '명지대역' },
    { t: '14:10', type: '명지대역' },
    { t: '14:15', type: '명지대역' },
    { t: '14:20', type: '시내' },
    { t: '14:30', type: '명지대역' },
    { t: '14:50', type: '명지대역' },
    { t: '15:00', type: '명지대역' },
    { t: '15:10', type: '명지대역' },
    { t: '15:25', type: '명지대역' },
    { t: '15:30', type: '명지대역' },
    { t: '15:40', type: '시내' },
    { t: '15:55', type: '명지대역' },
    { t: '16:10', type: '명지대역' },
    { t: '16:25', type: '명지대역' },
    { t: '16:30', type: '명지대역' },
    { t: '16:35', type: '시내' },
    { t: '16:50', type: '명지대역' },
    { t: '17:00', type: '명지대역' },
    { t: '17:10', type: '명지대역' },
    { t: '17:20', type: '명지대역' },
    { t: '17:30', type: '명지대역' },
    { t: '17:45', type: '명지대역' },
    { t: '18:00', type: '명지대역' },
    { t: '18:10', type: '시내' },
    { t: '19:00', type: '명지대역' },
    { t: '19:20', type: '명지대역' },
    { t: '19:30', type: '명지대역' },
    { t: '20:00', type: '시내' },
  ],
  limit18: '18:00 이후 진입로 셔틀은 명진당까지만 운행',
  travelMin: 15,
};

function shTimeToMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function shMinToStr(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function getKstNow() {
  return typeof KST !== 'undefined' ? KST.now() : new Date();
}

function getKstMinutes() {
  const n = getKstNow();
  return n.getHours() * 60 + n.getMinutes();
}

/** 직전 지난 버스 1개 + 2시간 이내 예정 버스 (등교/하교 공통) */
function buildShuttleUpcomingList(events, nowM, streamMoving = false) {
  const sorted = [...events].sort((a, b) => a.depM - b.depM);
  const completed = sorted.filter((ev) => ev.arrM <= nowM);
  const lastPast = completed.length ? completed[completed.length - 1] : null;
  const inFlight = sorted.find((ev) => nowM >= ev.depM && nowM < ev.arrM);
  const future = sorted.filter((ev) => ev.depM > nowM && ev.depM <= nowM + 120);
  const firstUp = future[0];
  const out = [];

  if (lastPast) {
    out.push({ ...lastPast, isPast: true, remain: 0, hl: false });
  }
  if (inFlight) {
    out.push({
      ...inFlight,
      isPast: false,
      isMoving: true,
      remain: inFlight.arrM - nowM,
      hl: true,
    });
  }
  future.forEach((ev) => {
    out.push({
      ...ev,
      isPast: false,
      isMoving: false,
      remain: ev.depM - nowM,
      hl: !streamMoving && !inFlight && firstUp && ev.depM === firstUp.depM,
    });
  });
  return out.sort((a, b) => a.depM - b.depM);
}

function getShuttleCongestionHint() {
  const dow = getKstNow().getDay();
  const nowM = getKstMinutes();
  if (dow === 0 || dow === 6) return '주말·공휴일은 학기중 셔틀 미운행입니다.';
  if (dow === 4 || dow === 5) {
    if (nowM >= 14 * 60 && nowM < 18 * 60) {
      return '📌 목·금 오후는 공강·하교가 겹쳐 승차 대기 15~25분 예상될 수 있어요.';
    }
    if (dow === 5 && nowM >= 15 * 60) {
      return '📌 금요일 오후 하교 셔틀 만차 가능성이 높아요. 승강장에 여유 있게 이동하세요.';
    }
  }
  return '';
}

/** 학교 출발 기준 셔틀 분석 */
function analyzeSchoolDepart(schedule, opts = {}) {
  const nowM = getKstMinutes();
  const travel = schedule.travelMin || 15;
  const dow = getKstNow().getDay();
  if (dow === 0 || dow === 6) {
    return {
      statusText: '주말·공휴일 미운행',
      statusCls: 'bad',
      upcoming: [],
      after18: false,
      limit18: schedule.limit18,
      hint: getShuttleCongestionHint(),
    };
  }

  const raw = schedule.schoolDepart || [];
  const events = raw.map((item) => {
    const time = typeof item === 'string' ? item : item.t;
    const type = typeof item === 'string' ? opts.defaultType || '셔틀' : item.type;
    const depM = shTimeToMin(time);
    return {
      depart: time,
      depM,
      arrM: depM + travel,
      arrive: shMinToStr(depM + travel),
      type,
      kind: opts.kindLabel || '하교',
    };
  });
  events.sort((a, b) => a.depM - b.depM);

  let statusText = '오늘 운행 종료 🔴';
  let statusCls = 'bad';
  let moving = false;

  for (const ev of events) {
    if (nowM >= ev.depM && nowM < ev.arrM) {
      moving = true;
      statusCls = 'warn';
      statusText = `현재 캠퍼스발 버스 이동 중 — 약 ${ev.arrM - nowM}분 후 ${opts.destLabel || '목적지'} 도착 예상 (${ev.type})`;
      break;
    }
  }

  if (!moving) {
    const next = events.find((ev) => ev.depM > nowM);
    if (next) {
      const remain = next.depM - nowM;
      statusCls = remain <= 15 ? 'warn' : 'ok';
      statusText = `다음 버스 <b>${remain}분 후</b> 학교 출발 (${next.depart} · ${next.type})`;
    }
  }

  const upcoming = buildShuttleUpcomingList(events, nowM, moving);

  const lastM = events.length ? events[events.length - 1].depM : 0;
  if (nowM > lastM + 20 && !moving) {
    statusText = '오늘 운행 종료 🔴';
    statusCls = 'bad';
  }

  const after18 = nowM >= shTimeToMin('18:00');
  return {
    statusText,
    statusCls,
    upcoming,
    after18,
    limit18: schedule.limit18,
    hint: getShuttleCongestionHint(),
    events,
    moving,
  };
}

function analyzeGiheungShuttle() {
  const nowM = getKstMinutes();
  const travel = GIHEUNG_SCHEDULE.travelMin;
  const dow = getKstNow().getDay();
  if (dow === 0 || dow === 6) {
    return {
      statusText: '주말·공휴일 미운행',
      statusCls: 'bad',
      upcoming: [],
      after18: false,
      limit18: GIHEUNG_SCHEDULE.limit18,
      hint: getShuttleCongestionHint(),
    };
  }

  const toCampus = GIHEUNG_SCHEDULE.arriveCampus.map((arr) => {
    const arrM = shTimeToMin(arr);
    const depM = arrM - travel;
    return {
      depart: shMinToStr(depM),
      depM,
      arrM,
      arrive: arr,
      type: '기흥역발',
      kind: '등교',
      remain: 0,
    };
  });

  let statusText = '다음 등교·하교 버스를 확인하세요';
  let statusCls = 'ok';
  let moving = false;

  for (const ev of toCampus) {
    if (nowM >= ev.depM && nowM < ev.arrM) {
      moving = true;
      statusCls = 'warn';
      statusText = `기흥역발 버스 이동 중 — 약 ${ev.arrM - nowM}분 후 캠퍼스 도착 (${ev.arrive})`;
      break;
    }
  }

  const school = analyzeSchoolDepart(
    { schoolDepart: GIHEUNG_SCHEDULE.schoolDepart, travelMin: travel, limit18: GIHEUNG_SCHEDULE.limit18 },
    { defaultType: '기흥역행', destLabel: '기흥역', kindLabel: '하교' },
  );

  if (!moving && school.statusText.includes('분 후')) {
    statusText = school.statusText;
    statusCls = school.statusCls;
  } else if (!moving) {
    const nextIn = toCampus.find((ev) => ev.depM > nowM);
    if (nextIn) {
      const remain = nextIn.depM - nowM;
      statusText = `다음 등교 버스 ${remain}분 후 기흥역 출발 → 캠퍼스 ${nextIn.arrive} 도착`;
      statusCls = remain <= 12 ? 'warn' : 'ok';
    } else if (school.statusCls !== 'bad') {
      statusText = school.statusText;
      statusCls = school.statusCls;
    } else {
      statusText = school.statusText;
      statusCls = school.statusCls;
    }
  }

  const arriveList = buildShuttleUpcomingList(toCampus, nowM, moving);
  const departList = buildShuttleUpcomingList(school.events || [], nowM, school.moving);
  const upcoming = [...arriveList, ...departList].sort((a, b) => a.depM - b.depM);

  return {
    statusText,
    statusCls: moving ? 'warn' : school.statusCls,
    upcoming,
    after18: nowM >= shTimeToMin('18:00'),
    limit18: GIHEUNG_SCHEDULE.limit18,
    hint: getShuttleCongestionHint(),
  };
}

function renderShuttleCard(containerId, title, route, analysis, modalKind) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const bc = analysis.statusCls === 'ok' ? 'bdg-g' : analysis.statusCls === 'bad' ? 'bdg-r' : 'bdg-o';
  const shcCls = analysis.statusCls === 'ok' ? 'shc-ok' : analysis.statusCls === 'bad' ? 'shc-bad' : 'shc-warn';
  const upHtml = analysis.upcoming.length
    ? `<div class="sh-upcoming"><div style="font-weight:700;color:var(--navy);margin-bottom:6px">⏱ 직전·2시간 이내 (학교 출발·도착 기준)</div>${analysis.upcoming
        .map((u) => {
          const label = u.kind === '등교' ? `기흥역 ${u.depart} → 캠퍼스 ${u.arrive}` : `학교 ${u.depart} 출발 · ${u.type || ''}`;
          if (u.isPast) {
            return `<div class="sh-up-row past"><span>${label}</span><span class="sh-past-lbl">지난 버스</span></div>`;
          }
          const timeLbl = u.isMoving ? `<b>이동 중 · ${u.remain}분 후 도착</b>` : `<b>${u.remain}분 후</b>`;
          return `<div class="sh-up-row${u.hl ? ' hl' : ''}"><span>${label}</span><span>${timeLbl}</span></div>`;
        })
        .join('')}</div>`
    : '<div class="sh-upcoming" style="color:var(--sub)">2시간 이내 예정 버스 없음</div>';
  const hintHtml = analysis.hint ? `<div class="sh-limit" style="color:#1e40af;background:#eff6ff;border-color:#bfdbfe">${analysis.hint}</div>` : '';

  el.innerHTML = `<div class="shc ${shcCls} on" style="margin-bottom:12px">
    <div class="sh-in">
      <div class="sh-hd"><div class="sh-name">${title}</div><span class="bdg ${bc}">${analysis.statusCls === 'ok' ? '원활' : analysis.statusCls === 'bad' ? '운행 종료' : '혼잡 주의'}</span></div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:6px">📍 ${route}</div>
      <div class="sh-desc"><b>🚌 현재 버스 상태</b><br>${analysis.statusText}</div>
      ${hintHtml}
      ${upHtml}
      ${analysis.after18 ? `<div class="sh-limit">⚠️ ${analysis.limit18}</div>` : ''}
      <button type="button" class="btn-sh-sched" onclick="openShuttleModal('${modalKind}')">📋 전체 시간표 보기</button>
    </div>
  </div>`;
}

function drawShuttle() {
  const n = getKstNow();
  const kstEl = document.getElementById('shKstNow');
  if (kstEl) {
    kstEl.textContent = `${['일', '월', '화', '수', '목', '금', '토'][n.getDay()]} ${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')} KST`;
  }
  const gi = analyzeGiheungShuttle();
  const ent = analyzeSchoolDepart(ENTRANCE_SHUTTLE_SCHEDULE, {
    defaultType: '진입로',
    destLabel: '명지대역·시내',
  });
  const city = analyzeSchoolDepart(CITY_SHUTTLE_SCHEDULE, {
    defaultType: '시내행',
    destLabel: '용인 시내',
  });
  renderShuttleCard('shGiheung', '🚌 기흥역 통학버스', '명지대역 ↔ 캠퍼스 (진입로)', gi, 'giheung');
  renderShuttleCard('shEntrance', '🚏 진입로 셔틀', '캠퍼스 → 명지대역 / 시내 (학교 출발)', ent, 'entrance');
  renderShuttleCard('shSinae', '🚍 시내 셔틀', '캠퍼스 → 용인 시내 (학교 출발 10회/일)', city, 'city');
}

let shModalKind = 'giheung';
let shModalTab = 'arrive';

function renderGiheungModalTabs() {
  const tabs = document.getElementById('shModalTabs');
  if (!tabs) return;
  tabs.innerHTML = `<button type="button" class="modal-tab${shModalTab === 'arrive' ? ' on' : ''}" onclick="setShuttleModalTab('arrive')">등교 (캠퍼스 도착)</button>
    <button type="button" class="modal-tab${shModalTab === 'depart' ? ' on' : ''}" onclick="setShuttleModalTab('depart')">하교 (학교 출발)</button>`;
}

function openShuttleModal(kind) {
  shModalKind = kind;
  shModalTab = kind === 'giheung' ? 'arrive' : 'depart';
  const modal = document.getElementById('shModal');
  const tabs = document.getElementById('shModalTabs');
  const title = document.getElementById('shModalTitle');
  if (!modal) return;
  const titles = {
    giheung: '기흥역 통학버스 전체표',
    entrance: '진입로 셔틀 전체표 (학교 출발)',
    city: '시내 셔틀 전체표 (학교 출발)',
  };
  title.textContent = titles[kind] || '셔틀 전체표';
  if (kind === 'giheung') renderGiheungModalTabs();
  else if (tabs) tabs.innerHTML = '';
  renderShuttleModalBody();
  modal.classList.add('on');
}

function setShuttleModalTab(tab) {
  shModalTab = tab;
  renderGiheungModalTabs();
  renderShuttleModalBody();
}

function closeShuttleModal() {
  document.getElementById('shModal')?.classList.remove('on');
}

function renderShuttleModalBody() {
  const body = document.getElementById('shModalBody');
  if (!body) return;
  const nowM = getKstMinutes();
  let rows = [];

  if (shModalKind === 'giheung') {
    const travel = GIHEUNG_SCHEDULE.travelMin;
    const list = shModalTab === 'arrive' ? GIHEUNG_SCHEDULE.arriveCampus : GIHEUNG_SCHEDULE.schoolDepart;
    rows = list.map((t) => {
      if (shModalTab === 'arrive') {
        const arrM = shTimeToMin(t);
        const depM = arrM - travel;
        return { depart: shMinToStr(depM), arrive: t, depM, arrM, sub: '기흥역→캠퍼스' };
      }
      const depM = shTimeToMin(t);
      return { depart: t, arrive: shMinToStr(depM + travel), depM, arrM: depM + travel, sub: '학교→기흥역' };
    });
  } else if (shModalKind === 'entrance') {
    const travel = ENTRANCE_SHUTTLE_SCHEDULE.travelMin;
    rows = ENTRANCE_SHUTTLE_SCHEDULE.schoolDepart.map((item) => {
      const depM = shTimeToMin(item.t);
      return {
        depart: item.t,
        arrive: shMinToStr(depM + travel),
        depM,
        arrM: depM + travel,
        sub: item.type,
      };
    });
  } else {
    const travel = CITY_SHUTTLE_SCHEDULE.travelMin;
    rows = CITY_SHUTTLE_SCHEDULE.schoolDepart.map((t) => {
      const depM = shTimeToMin(t);
      return { depart: t, arrive: shMinToStr(depM + travel), depM, arrM: depM + travel, sub: '시내행' };
    });
  }

  const completed = rows.filter((r) => r.arrM <= nowM);
  const lastPast = completed.length ? completed[completed.length - 1] : null;
  const future = rows.filter((r) => r.depM > nowM && r.depM <= nowM + 120);
  const inFlight = rows.find((r) => nowM >= r.depM && nowM < r.arrM);
  const firstUp = future[0];

  let display = [];
  if (lastPast) display.push({ ...lastPast, isPast: true });
  if (inFlight) display.push({ ...inFlight, isPast: false, isMoving: true });
  display = [
    ...display,
    ...future.map((r) => ({
      ...r,
      isPast: false,
      isMoving: false,
      next: !inFlight && firstUp && r.depM === firstUp.depM,
    })),
  ];

  const schedRows = display.length
    ? display
        .map((r) => {
          const left = `${r.sub ? r.sub + ' · ' : ''}${shModalKind === 'giheung' && shModalTab === 'arrive' ? r.depart + ' 기흥역' : r.depart + ' 학교'} 출발`;
          if (r.isPast) {
            return `<div class="sched-row past"><span>${left}</span><span class="sh-past-lbl">지난 버스 · 도착 ${r.arrive}</span></div>`;
          }
          return `<div class="sched-row${r.next ? ' next' : ''}"><span>${left}</span><span>도착 ${r.arrive}</span></div>`;
        })
        .join('')
    : '<p style="color:var(--sub);font-size:12px;padding:8px 0">오늘 남은 운행 시간이 없습니다.</p>';

  body.innerHTML =
    schedRows +
    `<p class="sh-limit" style="margin-top:12px">⚠️ ${
      shModalKind === 'giheung'
        ? GIHEUNG_SCHEDULE.limit18
        : shModalKind === 'entrance'
          ? ENTRANCE_SHUTTLE_SCHEDULE.limit18
          : CITY_SHUTTLE_SCHEDULE.limit18
    }</p>`;
}

const LDM = ['시간표 OCR 분석 중...', '수업 동선 파악 중...', '트래픽 계산 중...', '메뉴 매칭 중...'];
let ldI = 0,
  ldT;
function startLd() {
  ldI = 0;
  document.getElementById('ldgMsg').textContent = LDM[0];
  ldT = setInterval(() => {
    ldI = (ldI + 1) % LDM.length;
    document.getElementById('ldgMsg').textContent = LDM[ldI];
  }, 750);
}
function stopLd() {
  clearInterval(ldT);
}

async function doAnalyzeImg() {
  if (!hasImg) {
    showToast('시간표 이미지를 먼저 업로드해주세요');
    return;
  }
  await ensureMenus();
  document.getElementById('btnImg').disabled = true;
  document.getElementById('ldg').classList.add('on');
  startLd();

  try {
    const res = await fetch('/api/analyze/timetable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: imgB64, mediaType: imgMediaType }),
    });
    const data = await res.json();
    stopLd();
    document.getElementById('ldg').classList.remove('on');

    if (!data.ok) {
      throw new Error(data.error || '분석 실패');
    }

    const h = new Date().getHours();
    const period = h >= 17 ? 'dinner' : 'lunch';
    const mealIntent = data.mealIntent || MealEngine.computeMealIntent(data.gapMin);
    buildAndRender(data.curKey, data.curTxt, data.nextTxt, data.gapMin, period, {
      mealIntent,
      nextKey: data.nextKey,
    });
    showToast('AI 시간표 분석 완료');
  } catch (err) {
    stopLd();
    document.getElementById('ldg').classList.remove('on');
    document.getElementById('btnImg').disabled = false;
    if (err.message?.includes('API_KEY') || err.message?.includes('API Key')) {
      showToast('API Key 필요 — Firebase Secret(ANTHROPIC_API_KEY)을 설정해 주세요');
    } else {
      showToast('AI 분석 실패 — 수동 입력을 이용해주세요');
      console.error(err);
    }
  }
}

function typeText(eid, text, sp = 18) {
  const el = document.getElementById(eid);
  let i = 0;
  el.innerHTML = '';
  const t = setInterval(() => {
    if (i < text.length) el.innerHTML = text.slice(0, ++i) + '<span class="cur"></span>';
    else {
      el.innerHTML = text;
      clearInterval(t);
    }
  }, sp);
}

function recVisit() {
  if (!lastData) {
    showToast('먼저 시간표 분석을 해주세요');
    return;
  }
  visitDraft = {};
  renderVisitStep1();
}

function renderVisitStep1() {
  document.getElementById('fbBox').innerHTML = `
    <div class="fb-title">어느 식당에 다녀오셨나요?</div>
    <div class="visit-pick-g">
      ${VISIT_RESTAURANTS.map((r) => `<button type="button" class="visit-pick-btn" onclick="pickVisitRestaurant('${r.key}')">${r.label}</button>`).join('')}
    </div>`;
}

function pickVisitRestaurant(key) {
  visitDraft.restaurant = key;
  renderVisitStep2();
}

function renderVisitStep2() {
  document.getElementById('fbBox').innerHTML = `
    <div class="fb-title">혼잡도는 어땠나요?</div>
    <div class="fb-desc">${visitDraft.restaurant}</div>
    <div class="crowd-fb-g">
      <button type="button" class="crowd-fb-btn" onclick="pickVisitCrowd(10)">😊 한산</button>
      <button type="button" class="crowd-fb-btn" onclick="pickVisitCrowd(40)">😐 보통</button>
      <button type="button" class="crowd-fb-btn" onclick="pickVisitCrowd(70)">😰 혼잡</button>
      <button type="button" class="crowd-fb-btn" onclick="pickVisitCrowd(90)">😱 매우 혼잡</button>
    </div>
    <button type="button" class="btn-again" onclick="renderVisitStep1()">← 식당 다시 선택</button>`;
}

function pickVisitCrowd(actualCrowd) {
  visitDraft.actualCrowd = actualCrowd;
  renderVisitStep3();
}

function renderVisitStep3() {
  document.getElementById('fbBox').innerHTML = `
    <div class="fb-title">어떠셨나요?</div>
    <div class="fb-desc">${visitDraft.restaurant} · 만족도</div>
    <div class="crowd-fb-g">
      <button type="button" class="crowd-fb-btn" onclick="finishVisit('good')">😊 좋았어요</button>
      <button type="button" class="crowd-fb-btn" onclick="finishVisit('neutral')">😐 보통이에요</button>
      <button type="button" class="crowd-fb-btn" onclick="finishVisit('bad')">😞 별로예요</button>
    </div>
    <button type="button" class="btn-again" onclick="renderVisitStep2()">← 혼잡도 다시 선택</button>`;
}

async function finishVisit(satisfaction) {
  const now = getKstNow();
  const record = {
    restaurant: visitDraft.restaurant,
    satisfaction,
    actualCrowd: visitDraft.actualCrowd,
    dow: now.getDay(),
    hour: now.getHours(),
    timestamp: new Date(),
  };

  let visits = [];
  try {
    visits = JSON.parse(localStorage.getItem('visits') || '[]');
  } catch {
    visits = [];
  }
  visits.push({ ...record, timestamp: Date.now() });
  if (visits.length > 500) visits = visits.slice(-500);
  localStorage.setItem('visits', JSON.stringify(visits));

  let feedback = [];
  try {
    feedback = JSON.parse(localStorage.getItem('crowd_feedback') || '[]');
  } catch {
    feedback = [];
  }
  feedback.push({
    restaurant: record.restaurant,
    dow: record.dow,
    hour: record.hour,
    actualCrowd: record.actualCrowd,
    timestamp: Date.now(),
  });
  if (feedback.length > 300) feedback = feedback.slice(-300);
  localStorage.setItem('crowd_feedback', JSON.stringify(feedback));

  const menus = getMenus(record.restaurant, mealMode);
  recordVisitLearning(record.restaurant, menus);

  let weights = {};
  try {
    weights = JSON.parse(localStorage.getItem('restaurant_weights') || '{}');
  } catch {
    weights = {};
  }
  weights[record.restaurant] = Math.min(1.5, (weights[record.restaurant] || 1) * 1.05);
  localStorage.setItem('restaurant_weights', JSON.stringify(weights));

  if (typeof window.saveVisitToFirestore === 'function') {
    try {
      await window.saveVisitToFirestore(record);
    } catch (e) {
      console.warn('Firestore 저장 실패', e);
    }
  }

  document.getElementById('fbBox').innerHTML = `
    <div class="fb-title">✅ 기록 완료</div>
    <div class="fb-desc">${record.restaurant} 방문이 저장됐어요.<br>다음 추천에 반영됩니다.</div>`;
  drawFood();
  showToast('✅ 피드백 감사해요! 다음 추천에 반영됩니다');
}
function selSt(el) {
  document.querySelectorAll('.stype').forEach((e) => e.classList.remove('on'));
  el.classList.add('on');
}
function fillEg(el) {
  document.getElementById('sgTa').value = el.textContent.replace(/^[""]|[""]$/g, '');
  updCnt();
}
function updCnt() {
  document.getElementById('sCnt').textContent = document.getElementById('sgTa').value.length;
}
async function submitSg() {
  const body = document.getElementById('sgTa').value.trim();
  if (!body) {
    showToast('내용을 입력해주세요');
    return;
  }
  const type = document.querySelector('.stype.on')?.textContent?.trim() || '기타';
  const replyEmail = document.getElementById('sgEmail')?.value?.trim() || '';
  const btn = document.querySelector('#sgForm .btnm');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('/api/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, body, name: P.name, home: P.home, replyEmail }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || '전송 실패');
    document.getElementById('sgForm').style.display = 'none';
    document.getElementById('sgSent').style.display = 'block';
    showToast('건의가 메일로 전달됐어요');
  } catch (e) {
    showToast(e.message || '전송 실패 — SMTP 설정 확인');
    console.error(e);
  } finally {
    if (btn) btn.disabled = false;
  }
}
function resetSg() {
  document.getElementById('sgTa').value = '';
  updCnt();
  document.querySelectorAll('.stype').forEach((e) => e.classList.remove('on'));
  document.querySelector('.stype').classList.add('on');
  document.getElementById('sgForm').style.display = 'block';
  document.getElementById('sgSent').style.display = 'none';
}
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('on');
  setTimeout(() => t.classList.remove('on'), 2600);
}

loadProfile();
drawShuttle();
setInterval(drawShuttle, 60000);
