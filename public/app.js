/* ════════════════════════════ PROFILE ════ */
const SETUP_DONE_KEY = 'mb_setup_done';
const MB_LAST_SESSION_KEY = 'mb_last_session_id';
/** 배포·캐시 확인용 — 콘솔에서 window.MB_APP_BUILD 로 확인 */
const MB_APP_BUILD = '2026-06-01-ocr-review1';

function getOrCreateUid() {
  try {
    let uid = localStorage.getItem('mb_uid');
    if (!uid) {
      uid = 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      localStorage.setItem('mb_uid', uid);
    }
    return uid;
  } catch {
    return 'u_anon_' + Math.random().toString(36).slice(2, 8);
  }
}

let _mbFirestoreApi = null;

async function getMbFirestoreApi() {
  if (_mbFirestoreApi) return _mbFirestoreApi;
  const [{ initializeApp, getApps }, fs] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'),
  ]);
  let firebaseConfig = { projectId: 'myeong-biseo-v2' };
  try {
    const res = await fetch('/__/firebase/init.json');
    if (res.ok) firebaseConfig = await res.json();
  } catch {
    /* Hosting 배포 환경에서만 init.json 제공 */
  }
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  _mbFirestoreApi = { db: fs.getFirestore(app), ...fs };
  return _mbFirestoreApi;
}

/** uid를 문서 ID로 setDoc upsert (sessions 읽기 불필요) */
async function saveSessionByUid(data) {
  const { db, doc, setDoc } = await getMbFirestoreApi();
  const sessionId = String(data.uid || '').trim();
  if (!sessionId) return null;
  const payload = {
    uid: sessionId,
    buildings: data.buildings || [],
    gapMin: data.gapMin ?? 0,
    timestamp: data.timestamp || new Date(),
    visited: !!data.visited,
  };
  await setDoc(doc(db, 'sessions', sessionId), payload, { merge: true });
  return sessionId;
}

async function persistAnalysisSession(curKey, nextKey, gapMin) {
  try {
    const sessionId = await saveSessionByUid({
      uid: getOrCreateUid(),
      buildings: [curKey, nextKey].filter((b) => b && b !== 'none'),
      gapMin,
      timestamp: new Date(),
      visited: false,
    });
    if (sessionId) {
      try {
        localStorage.setItem(MB_LAST_SESSION_KEY, sessionId);
      } catch (e) {
        console.warn('session id save', e);
      }
    }
  } catch (e) {
    console.warn('Firestore session 저장 실패', e);
  }
}

window.upsertTimetableSession = async (classes) => {
  if (typeof TimetableUtil === 'undefined') return;
  const ref = typeof KST !== 'undefined' ? KST.now() : new Date();
  const snap = TimetableUtil.analyzeFromClasses(classes, ref);
  const sessionId = await saveSessionByUid({
    uid: getOrCreateUid(),
    buildings: [snap.curKey, snap.nextKey].filter((b) => b && b !== 'none'),
    gapMin: snap.gapMin,
    timestamp: new Date(),
    visited: false,
  });
  if (sessionId) {
    try {
      localStorage.setItem(MB_LAST_SESSION_KEY, sessionId);
    } catch (e) {
      console.warn('session id save', e);
    }
  }
};

async function markCurrentSessionVisited() {
  let sessionId = null;
  try {
    sessionId = localStorage.getItem(MB_LAST_SESSION_KEY);
  } catch {
    /* ignore */
  }
  if (!sessionId || typeof window.markSessionVisited !== 'function') return;
  try {
    await window.markSessionVisited(sessionId);
  } catch (e) {
    console.warn('Firestore session visited 업데이트 실패', e);
  }
}
let P = { name: '명지인', tastes: [], home: '', diet: false };
let tArr = [],
  hVal = '';

/** 저장값·구버전 라벨 → 기흥역행 / 시내행 / 기숙사생 */
function normalizeHomeValue(home) {
  if (!home) return '';
  if (home === '기숙사생') return '기숙사생';
  if (home === '기흥역행' || home === '기흥역 통학' || home.includes('기흥역')) return '기흥역행';
  if (home === '시내행' || home === '시내버스 통학' || home.includes('시내')) return '시내행';
  return '';
}

function isGiheungHome(home) {
  return normalizeHomeValue(home) === '기흥역행';
}

function isSinaeHome(home) {
  return normalizeHomeValue(home) === '시내행';
}

function togDiet(el) {
  el.classList.toggle('on');
}

function togChip(el, g) {
  if (g === 't') {
    el.classList.toggle('on');
    const v = el.dataset.v;
    tArr = el.classList.contains('on') ? [...tArr, v] : tArr.filter((x) => x !== v);
  } else {
    hVal = el.dataset.v;
  }
  syncSetupChips();
}

function syncSetupChips() {
  document.querySelectorAll('.chip-taste').forEach((c) => {
    c.classList.toggle('on', tArr.includes(c.dataset.v));
  });
  const homeNorm = normalizeHomeValue(hVal);
  document.querySelectorAll('.chip-home').forEach((c) => {
    c.classList.toggle('on', c.dataset.v === homeNorm);
  });
}

function isSetupComplete() {
  try {
    return localStorage.getItem(SETUP_DONE_KEY) === '1';
  } catch {
    return false;
  }
}

function markSetupComplete() {
  try {
    localStorage.setItem(SETUP_DONE_KEY, '1');
  } catch (e) {
    console.warn('setup save', e);
  }
}

function openSetupModal(firstLaunch = false) {
  const obOv = document.getElementById('obOv');
  if (!obOv) return;
  tArr = [...(P.tastes || [])];
  hVal = P.home || '';
  syncSetupChips();
  const btn = document.getElementById('obSubmitBtn');
  if (btn) btn.textContent = firstLaunch ? '시작하기 →' : '저장하기 →';
  obOv.classList.add('on');
  obOv.style.display = 'flex';
  obOv.style.zIndex = '9999';
  document.documentElement.classList.add('ob-lock');
}

function closeSetupModal() {
  const obOv = document.getElementById('obOv');
  if (!obOv) return;
  obOv.classList.remove('on');
  obOv.style.display = 'none';
  document.documentElement.classList.remove('ob-lock');
}

function updateSetupOnLaunch() {
  if (!isSetupComplete()) {
    const obOv = document.getElementById('obOv');
    if (obOv) {
      obOv.classList.add('on');
      obOv.style.display = 'flex';
      obOv.style.zIndex = '9999';
      document.documentElement.classList.add('ob-lock');
    }
  } else {
    closeSetupModal();
  }
}

function doneOb() {
  if (!hVal) {
    showToast('거주 유형을 선택해 주세요');
    return;
  }
  P.name = '주인님';
  P.tastes = [...tArr];
  P.home = normalizeHomeValue(hVal);
  P.diet = false;
  markSetupComplete();
  document.getElementById('hpName').textContent = P.name;
  document.getElementById('hpHome').textContent = P.home || '거주 미설정';
  closeSetupModal();
  saveProfile();
  updateLearnedDisplay();
  renderHeaderTasteChips();
  drawShuttle();
  if (lastData) drawFood();
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
    if (raw) {
      const saved = JSON.parse(raw);
      P = { ...P, ...saved };
      P.tastes = (P.tastes || []).filter((t) => CUISINE_TYPES.includes(t));
      const prevHome = P.home || '';
      P.home = normalizeHomeValue(prevHome);
      if (P.home !== prevHome) saveProfile();
      tArr = [...P.tastes];
      hVal = P.home;
    }
    document.getElementById('hpName').textContent = P.name === '명지인' ? '주인님' : P.name;
    document.getElementById('hpHome').textContent = P.home || '거주 미설정';
  } catch (e) {
    console.warn('profile load', e);
  }
  updateSetupOnLaunch();
  updateLearnedDisplay();
  renderHeaderTasteChips();
  updateSavedTimetableUi();
}

/* ════════════════════════════ 실제 식단 (mju.ac.kr) ════ */
let MENUS = {};
let menuMeta = { updatedAt: null, ready: false, loading: false };

const MENU_RESTAURANT_KEYS = ['기숙사', '명진당', '교직원', '학생회관'];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

function htmlWithBreaks(value) {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

function safeHttpUrl(value) {
  const url = String(value || '').trim();
  return /^https?:\/\//i.test(url) ? escapeHtml(url) : '#';
}

/** API·JSON은 MM-DD 날짜 키와 요일 키를 모두 보존 */
function normalizeMenusPayload(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};

  function normalizeDaySlots(slots) {
    const out = {
      l: Array.isArray(slots?.l) ? slots.l : [],
      d: Array.isArray(slots?.d) ? slots.d : [],
      b: Array.isArray(slots?.b) ? slots.b : [],
      dow: typeof slots?.dow === 'number' ? slots.dow : undefined,
    };
    if (slots?.closed === true) out.closed = true;
    return out;
  }

  function normalizeDays(restaurantSrc) {
    const days = {};
    const base = restaurantSrc?.days && typeof restaurantSrc.days === 'object' ? restaurantSrc.days : restaurantSrc;
    if (!base || typeof base !== 'object') return days;
    for (const [dk, slots] of Object.entries(base)) {
      if (/^\d{2}-\d{2}$/.test(dk)) {
        days[dk] = normalizeDaySlots(slots);
        continue;
      }
      if (!/^\d+$/.test(dk)) continue;
      const dow = Number(dk);
      if (Number.isNaN(dow) || dow < 0 || dow > 6) continue;
      days[dow] = normalizeDaySlots(slots);
    }
    return days;
  }

  for (const key of MENU_RESTAURANT_KEYS) {
    if (src[key] != null) out[key] = normalizeDays(src[key]);
  }
  for (const [key, val] of Object.entries(src)) {
    if (!out[key]) out[key] = normalizeDays(val);
  }
  return out;
}

function menuDateKey(refDate) {
  const d = refDate instanceof Date ? refDate : new Date(refDate);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

function menuRefDate(dayOffset = 0) {
  const ref = typeof KST !== 'undefined' ? KST.now() : new Date();
  const target = new Date(ref.getTime());
  target.setDate(target.getDate() + dayOffset);
  return target;
}

function getNearestDateKeyData(restaurantDays, ref) {
  const refTime = ref.getTime();
  const year = ref.getFullYear();
  let best = null;
  let bestDiff = Infinity;
  for (const key of Object.keys(restaurantDays)) {
    const m = /^(\d{2})-(\d{2})$/.exec(key);
    if (!m) continue;
    const mm = Number(m[1]);
    const dd = Number(m[2]);
    for (const y of [year - 1, year, year + 1]) {
      const diff = Math.abs(new Date(y, mm - 1, dd).getTime() - refTime);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = restaurantDays[key];
      }
    }
  }
  return best;
}

function isMenuDateClosed(key, refOrOffset = 1) {
  const restaurantDays = MENUS[key];
  if (!restaurantDays) return false;
  const ref = refOrOffset instanceof Date ? refOrOffset : menuRefDate(Number(refOrOffset) || 0);
  const dateKey = menuDateKey(ref);
  return restaurantDays[dateKey]?.closed === true;
}

function getMenuDayData(restaurantDays, refOrOffset = 0) {
  if (!restaurantDays) return null;
  const ref = refOrOffset instanceof Date ? refOrOffset : menuRefDate(Number(refOrOffset) || 0);
  const dateKey = menuDateKey(ref);
  if (restaurantDays[dateKey]) return restaurantDays[dateKey];
  const dow = ref.getDay();
  const dowData = restaurantDays[dow] ?? restaurantDays[String(dow)];
  if (dowData) return dowData;
  return getNearestDateKeyData(restaurantDays, ref) ?? null;
}

/* ════════════════════════════ CAMPUS SCHEDULE / CROWD ════ */
let CAMPUS_SCHEDULE = null;

/** 개인 시간표로 혼잡도 전환하기 전 최소 집계 수 (추후 Firestore 연동) */
const TIMETABLE_CROWD_MIN_POOL = 1000;

/**
 * [혼잡도 예측 — campus_schedule.json 우선]
 * 강의 스케줄(학기 시간표 집계) + 방문 피드백으로 식당 혼잡도를 추정합니다.
 * 개인 OCR 시간표는 공강·요일·동선 분석에만 쓰고, 혼잡도는 pool ≥ 1000 이후 전환.
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

function getDynamicCrowd(restaurantKey, refDate) {
  const now = refDate || (typeof KST !== 'undefined' ? KST.now() : new Date());
  const kstHour = now.getHours();
  const kstMin = now.getMinutes();
  const dow = now.getDay();
  const timeFloat = kstHour + kstMin / 60;

  if (isNoSchoolDay(now)) return 10;
  if (timeFloat < 11.0 || timeFloat > 19.0) return 5;
  if (restaurantKey === '명진당' && timeFloat > 14.5) return 5;
  if (restaurantKey === '학생회관' && timeFloat > 14.5) return 5;
  if (restaurantKey === '교직원' && timeFloat > 14.0) return 5;

  const CROWD_BASE = { 기숙사: 40, 명진당: 45, 교직원: 25, 학생회관: 35 };

  const NEARBY = {
    기숙사: ['자연', '명진당', '1공', '채플', '창조', '체육관', '체육문화관', '학군단', '선수숙소'],
  명진당: ['명진당', '자연', '5공', '3공', '채플', '창조', '차세대과학관', '디자인조형센터', '제4공학관', '건축도시설계원'],
  교직원: ['명진당', '자연', '5공', '채플', '창조', '디자인조형센터', '제4공학관', '차세대과학관'],
  학생회관: ['학생', '자연', '5공', '3공', '채플', '차세대과학관', '2공', '하이브리드구조실험센터', '체육문화관', '산업협력관'],
  };

  let crowdBonus = 0;
  if (canUseTimetableForCrowd()) {
    const ttBonus = getTimetableCrowdBonus(restaurantKey, now, timeFloat, NEARBY);
    if (ttBonus != null) crowdBonus = ttBonus;
  } else if (CAMPUS_SCHEDULE && CAMPUS_SCHEDULE[dow]) {
    Object.entries(CAMPUS_SCHEDULE[dow]).forEach(([timeKey, buildings]) => {
      const [h, m] = timeKey.split(':').map(Number);
      const endFloat = h + m / 60;
      const diff = timeFloat - endFloat;
      if (diff >= -0.17 && diff <= 0.33) {
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

function getTimetablePoolCount() {
  return parseInt(localStorage.getItem('mb_timetable_pool_count') || '0', 10);
}

function canUseTimetableForCrowd() {
  return getTimetablePoolCount() >= TIMETABLE_CROWD_MIN_POOL;
}

/** pool ≥ 1000일 때만 개인 시간표 종료 시각으로 혼잡 가산 */
function getTimetableCrowdBonus(restaurantKey, refDate, timeFloat, nearbyMap) {
  if (typeof TimetableUtil === 'undefined') return null;
  const classes = TimetableUtil.loadUserTimetable();
  if (!classes.length) return null;
  const dow = refDate.getDay();
  const today = classes.filter((c) => c.dow === dow);
  if (!today.length) return 0;

  let bonus = 0;
  for (const c of today) {
    const m = String(c.end || '').match(/(\d{1,2}):(\d{2})/);
    if (!m) continue;
    const endFloat = parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
    const diff = timeFloat - endFloat;
    if (diff >= -0.17 && diff <= 0.33) {
      const near = nearbyMap[restaurantKey] || [];
      if (near.includes(c.buildingKey)) bonus += 12;
    }
  }
  return bonus;
}

async function loadMenus(refresh = false) {
  if (menuMeta.loading) return;
  if (!refresh && menuMeta.ready) return;
  menuMeta.loading = true;
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
    MENUS = normalizeMenusPayload(data.MENUS || {});
    menuMeta.updatedAt = data.updatedAt;
    menuMeta.ready = MENU_RESTAURANT_KEYS.some((k) => Object.keys(MENUS[k] || {}).length > 0);
    console.log(
      '[loadMenus] restaurants',
      MENU_RESTAURANT_KEYS.map((k) => ({
        key: k,
        dayKeys: Object.keys(MENUS[k] || {}),
        todayLunch: getMenuDayData(MENUS[k], menuDayIndex(0))?.l?.length ?? 0,
      })),
    );
    if (lastData) drawFood();
  } catch (e) {
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
    if (!res.ok) throw new Error(`날씨 API HTTP ${res.status}`);
    const data = await res.json();
    const tempRaw = data.current?.temperature_2m;
    const code = data.current?.weathercode;
    if (tempRaw === undefined || code === undefined) {
      throw new Error('날씨 API 응답 형식 오류');
    }
    const temp = Math.round(tempRaw);
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
if (typeof SchoolCalendar !== 'undefined') SchoolCalendar.load().then(() => { if (lastData && typeof buildAndRender === 'function') buildAndRender(lastData.현재건물키, lastData.현재위치, lastData.다음수업, lastData.공강분, lastData.mealIntent?.period || mealMode || 'lunch', { analyzeSource: lastData.analyzeSource, mealIntent: lastData.mealIntent, nextKey: lastData.nextKey, scheduleMeta: lastData.scheduleMeta, aiComment: lastData.총평 }); else if (typeof drawFood === 'function') drawFood(); });

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
  updateFoodRankLabel();
  if (lastData) drawFood();
  else showToast('시간표에서 먼저 분석해 주세요');
}

function setDay(m) {
  dayMode = m;
  document.getElementById('btnToday').classList.toggle('on', m === 'today');
  document.getElementById('btnTmrw').classList.toggle('on', m === 'tomorrow');
  const finishShuttle = () => drawShuttle();
  if (!lastData) {
    finishShuttle();
    return;
  }
  if (m === 'tomorrow') {
    const rebuildTomorrow = () => {
      lastData.내일 = buildTomorrow(
        lastData.현재건물키,
        lastData.mealIntent?.period || mealMode || 'lunch',
      );
      drawFood();
      finishShuttle();
    };
    if (typeof SchoolCalendar !== 'undefined') SchoolCalendar.load().then(rebuildTomorrow);
    else rebuildTomorrow();
    return;
  }
  drawFood();
  finishShuttle();
}
function setMeal(m) {
  mealMode = m;
  document.getElementById('mLunch').classList.toggle('on', m === 'lunch');
  document.getElementById('mDinner').classList.toggle('on', m === 'dinner');
  if (lastData) {
    lastData.rankMode = rankMode;
    drawFood();
  }
}

/* ════════════════════════════ INPUT MODE ════ */
let hasImg = false,
  imgB64 = null,
  imgMediaType = 'image/jpeg';
let ocrReviewState = {
  classes: [],
  rawApi: null,
  appliedData: null,
  issues: [],
};

function setMd(m) {
  document.getElementById('mMan')?.classList.toggle('on', m === 'manual');
  document.getElementById('mSaved')?.classList.toggle('on', m === 'saved');
  document.getElementById('mImg')?.classList.toggle('on', m === 'img');
  document.getElementById('manMode').style.display = m === 'manual' ? 'block' : 'none';
  document.getElementById('savedMode').style.display = m === 'saved' ? 'block' : 'none';
  document.getElementById('imgMode').style.display = m === 'img' ? 'block' : 'none';
}

let _ttEmptyModeApplied = false;

function syncManualFieldLabels(hasSavedTimetable) {
  const lblCur = document.getElementById('lblMCur');
  const lblNext = document.getElementById('lblMNext');
  if (!lblCur || !lblNext) return;
  if (hasSavedTimetable) {
    lblCur.textContent = '방금 종료된 수업 위치';
    lblNext.textContent = '다음 수업 위치';
  } else {
    lblCur.textContent = '현재 위치 (건물)';
    lblNext.textContent = '다음 이동 위치';
  }
}

function updateSavedTimetableUi() {
  const hint = document.getElementById('ttHint');
  const summary = document.getElementById('savedTtSummary');
  if (typeof TimetableUtil === 'undefined') return;
  const classes = TimetableUtil.loadUserTimetable();
  const hasSaved = classes.length > 0;
  const ref = typeof KST !== 'undefined' ? KST.now() : new Date();
  const dow = ref.getDay();
  const offDay = isNoSchoolDay(ref);
  const today = offDay ? [] : classes.filter((c) => c.dow === dow);
  const dayLabel =
    typeof SchoolCalendar !== 'undefined' && SchoolCalendar.dayLabel
      ? SchoolCalendar.dayLabel(ref)
      : `${TimetableUtil.DOW_NAMES[dow]}요일`;

  syncManualFieldLabels(hasSaved);

  if (!hasSaved && !_ttEmptyModeApplied) {
    _ttEmptyModeApplied = true;
    setMd('img');
  }

  if (hint) {
    if (!hasSaved) {
      hint.textContent =
        '등록된 시간표가 없습니다. 「이미지 + AI」로 캡처를 올리거나, 「수동 입력」에서 건물·공강만 골라 바로 분석할 수 있어요.';
    } else if (today.length) {
      hint.textContent = `📅 저장된 시간표 ${classes.length}개 · 오늘 ${today.length}개 수업 — 「저장 시간표」 탭에서 즉시 분석 가능`;
    } else if (offDay) {
      hint.textContent = `${dayLabel} — 오늘 수업 없음 · 저장된 주간 시간표 ${classes.length}과목`;
    } else {
      hint.textContent = `오늘(${TimetableUtil.DOW_NAMES[dow]}) 수업 없음 · 저장된 주간 시간표 ${classes.length}과목 — 「저장 시간표」에서 분석 가능`;
    }
  }
  if (summary) {
    if (today.length) {
      const snap = TimetableUtil.analyzeNow(classes, ref);
      const db = TimetableUtil.getLectureDbSync?.();
      const curDisplay = TimetableUtil.resolveCurrentLocationTxt
        ? TimetableUtil.resolveCurrentLocationTxt(snap, db, ref.getDay())
        : snap.curTxt;
      const gapLine = TimetableUtil.formatGapDetail
        ? TimetableUtil.formatGapDetail(snap, ref)
        : `공강 ${snap.gapMin}분`;
      summary.innerHTML = `<b>${escapeHtml(TimetableUtil.DOW_NAMES[dow])}요일</b> ${today.length}개 · ${escapeHtml(gapLine)}<br>현재: ${escapeHtml(curDisplay)}<br>다음: ${escapeHtml(snap.nextTxt)}`;
    } else if (!classes.length) {
      summary.textContent = '저장된 시간표가 없습니다.';
    } else {
      summary.textContent = '';
    }
  }
}

function ocrClassMinutes(t) {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function ocrMinutesToTime(min, endMode = false) {
  const h = Math.floor(min / 60);
  const m = endMode ? 50 : 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getOcrReviewClasses(apiClasses) {
  if (typeof TimetableUtil === 'undefined') return [];
  const ref = typeof KST !== 'undefined' ? KST.now() : new Date();
  return TimetableUtil.normalizeClassesFromAi(apiClasses || [], ref.getDay());
}

function detectOcrReviewIssues(classes) {
  const issues = [];
  const byIndex = {};
  const add = (idx, level, text) => {
    const issue = { idx, level, text };
    issues.push(issue);
    if (idx != null) {
      if (!byIndex[idx]) byIndex[idx] = [];
      byIndex[idx].push(issue);
    }
  };

  if (!classes.length) {
    add(null, 'bad', '수업을 하나도 인식하지 못했어요. 이미지가 잘렸거나 격자 경계가 흐릴 수 있어요.');
    return { issues, byIndex };
  }

  if (classes.length <= 4) {
    add(null, 'warn', `전체 수업이 ${classes.length}개만 잡혔어요. 누락된 수업이 있는지 확인해 주세요.`);
  }

  const counts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  classes.forEach((c, idx) => {
    counts[c.dow] = (counts[c.dow] || 0) + 1;
    if (c.dow === 0 || c.dow === 6) {
      add(idx, 'bad', `${TimetableUtil?.DOW_NAMES?.[c.dow] || '주말'}요일 수업으로 읽혔어요. 실제 수업인지 확인해 주세요.`);
    }

    const start = ocrClassMinutes(c.start);
    const end = ocrClassMinutes(c.end);
    if (start == null || end == null || end <= start) {
      add(idx, 'bad', '시작/종료 시간이 이상해요.');
    } else if (end - start >= 230) {
      add(idx, 'warn', '4시간 이상 긴 블록으로 읽혔어요. 여러 수업이 합쳐졌는지 확인해 주세요.');
    }

    if (!String(c.room || '').trim()) {
      add(idx, 'warn', '강의실이 비어 있어요.');
    }

    const inferred = TimetableUtil?.resolveRoomToBuildingKey?.(c.room, null);
    if (inferred && c.buildingKey && inferred !== c.buildingKey) {
      add(idx, 'warn', `${c.room} 기준 건물은 ${inferred} 쪽이에요. 현재 ${c.buildingKey}로 저장됩니다.`);
    }
  });

  const ref = typeof KST !== 'undefined' ? KST.now() : new Date();
  const todayDow = ref.getDay();
  const weekdayCounts = [1, 2, 3, 4, 5].map((d) => counts[d] || 0);
  const activeWeekdays = weekdayCounts.filter(Boolean).length;
  const maxDayCount = Math.max(...weekdayCounts);
  if (classes.length >= 6 && activeWeekdays <= 2) {
    add(null, 'warn', '수업이 1~2개 요일에 몰려 있어요. 요일 열이 한 칸 밀렸을 가능성이 있어요.');
  }
  if (todayDow >= 1 && todayDow <= 5 && classes.length >= 6 && (counts[todayDow] || 0) <= 1 && maxDayCount >= 3) {
    add(null, 'warn', `오늘(${TimetableUtil?.DOW_NAMES?.[todayDow] || todayDow}) 수업이 너무 적게 잡혔어요. 오늘 열 누락 가능성이 있어요.`);
  }

  return { issues, byIndex };
}

function ensureOcrReviewStyles() {
  if (document.getElementById('ocrReviewStyles')) return;
  const style = document.createElement('style');
  style.id = 'ocrReviewStyles';
  style.textContent = `
.ocr-review{display:none;margin-top:10px;border:1.5px solid #bfdbfe;background:#f8fbff;border-radius:14px;padding:12px}
.ocr-review.on{display:block;animation:fu .25s ease}
.ocr-r-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}
.ocr-r-title{font-size:13px;font-weight:800;color:var(--navy);line-height:1.35}
.ocr-r-sub{font-size:11px;color:var(--muted);line-height:1.45;margin-top:3px}
.ocr-r-badge{font-size:10px;font-weight:800;border-radius:20px;padding:4px 8px;white-space:nowrap}
.ocr-r-badge.ok{background:#dcfce7;color:#166534}
.ocr-r-badge.warn{background:#fef3c7;color:#92400e}
.ocr-r-badge.bad{background:#fee2e2;color:#991b1b}
.ocr-r-issues{display:flex;flex-direction:column;gap:5px;margin-bottom:10px}
.ocr-r-issue{font-size:11px;line-height:1.45;border-radius:8px;padding:7px 9px;background:#fff;border:1px solid #e2e8f0;color:#475569}
.ocr-r-issue.warn{border-color:#fcd34d;background:#fffbeb;color:#92400e}
.ocr-r-issue.bad{border-color:#fecaca;background:#fff1f2;color:#991b1b}
.ocr-r-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:10px}
.ocr-r-btn{min-height:38px;border-radius:9px;border:1.5px solid var(--border);background:#fff;color:var(--navy);font-size:11.5px;font-weight:800;cursor:pointer;font-family:'Noto Sans KR',sans-serif}
.ocr-r-btn.primary{background:var(--navy);border-color:var(--navy);color:#fff}
.ocr-r-btn.danger{color:#991b1b;border-color:#fecaca}
.ocr-r-list{display:flex;flex-direction:column;gap:8px;max-height:360px;overflow:auto;padding-right:2px}
.ocr-class{background:#fff;border:1.5px solid #e2e8f0;border-radius:12px;padding:10px}
.ocr-class.flag{border-color:#fcd34d;background:#fffdf5}
.ocr-class.bad{border-color:#fecaca;background:#fff7f7}
.ocr-class-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}
.ocr-class-name{font-size:12.5px;font-weight:800;color:var(--text);line-height:1.35}
.ocr-class-tags{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:7px}
.ocr-tag{font-size:9.5px;font-weight:800;border-radius:12px;padding:3px 6px;background:#eff6ff;color:#1d4ed8}
.ocr-tag.warn{background:#fef3c7;color:#92400e}
.ocr-tag.bad{background:#fee2e2;color:#991b1b}
.ocr-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.ocr-field{display:flex;flex-direction:column;gap:3px}
.ocr-field label{font-size:9.5px;font-weight:800;color:var(--muted)}
.ocr-field input,.ocr-field select{width:100%;min-height:36px;border-radius:8px;border:1.5px solid var(--border);background:#f8fafc;color:var(--text);font-size:12px;font-family:'Noto Sans KR',sans-serif;padding:7px 8px;outline:none}
.ocr-field input:focus,.ocr-field select:focus{border-color:var(--blue);background:#fff}
.ocr-class-quick{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px}
.ocr-mini{min-height:32px;border-radius:8px;border:1px solid #dbe4f0;background:#f8fafc;color:#475569;font-size:10.5px;font-weight:800;cursor:pointer;font-family:'Noto Sans KR',sans-serif}
.ocr-daytabs{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:10px}
.ocr-daytab{min-height:36px;border-radius:9px;border:1.5px solid var(--border);background:#fff;color:var(--muted);font-size:12px;font-weight:800;cursor:pointer;font-family:'Noto Sans KR',sans-serif;transition:.15s}
.ocr-daytab.on{background:var(--navy);border-color:var(--navy);color:#fff}
.ocr-daytab.empty{color:#cbd5e1;background:#f8fafc;cursor:not-allowed;opacity:.7}
.ocr-daytab:not(.empty):not(.on):hover{border-color:var(--blue);color:var(--blue)}
.acp-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(7,23,48,.45);padding:20px;animation:fu .18s ease}
.acp-box{width:100%;max-width:340px;background:#fff;border-radius:16px;border:1.5px solid var(--border);box-shadow:0 18px 48px rgba(7,23,48,.28);padding:16px;max-height:90vh;overflow:auto}
.acp-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
.acp-title{font-size:14px;font-weight:800;color:var(--navy)}
.acp-x{width:30px;height:30px;border-radius:8px;border:1px solid var(--border);background:#f8fafc;color:var(--muted);font-size:13px;font-weight:800;cursor:pointer;font-family:'Noto Sans KR',sans-serif}
.acp-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:14px}
.acp-field{display:flex;flex-direction:column;gap:4px}
.acp-field.acp-full{grid-column:1 / -1}
.acp-field label{font-size:10px;font-weight:800;color:var(--muted)}
.acp-field input,.acp-field select{width:100%;min-height:40px;border-radius:9px;border:1.5px solid var(--border);background:#f8fafc;color:var(--text);font-size:13px;font-family:'Noto Sans KR',sans-serif;padding:8px 9px;outline:none}
.acp-field input:focus,.acp-field select:focus{border-color:var(--blue);background:#fff}
.acp-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
`;
  document.head.appendChild(style);
}

function getOcrReviewBox() {
  ensureOcrReviewStyles();
  let box = document.getElementById('ocrReviewBox');
  if (box) return box;
  box = document.createElement('div');
  box.id = 'ocrReviewBox';
  box.className = 'ocr-review';
  const imgMode = document.getElementById('imgMode');
  if (imgMode) imgMode.appendChild(box);
  return box;
}

function ocrTimeOptions(selected, endMode = false) {
  const out = [];
  const seen = new Set();
  for (let h = 6; h <= 21; h++) {
    const v = `${String(h).padStart(2, '0')}:${endMode ? '50' : '00'}`;
    seen.add(v);
    out.push(`<option value="${v}"${v === selected ? ' selected' : ''}>${v}</option>`);
  }
  if (selected && !seen.has(selected)) {
    out.unshift(`<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)}</option>`);
  }
  return out.join('');
}

function ocrDowOptions(selected) {
  return [1, 2, 3, 4, 5, 6, 0]
    .map((d) => `<option value="${d}"${Number(selected) === d ? ' selected' : ''}>${TimetableUtil?.DOW_NAMES?.[d] || d}</option>`)
    .join('');
}

function ocrBuildingOptions(selected) {
  const buildings = TimetableUtil?.CAMPUS_BUILDINGS || [];
  return buildings
    .map((b) => `<option value="${escapeHtml(b.key)}"${b.key === selected ? ' selected' : ''}>${escapeHtml(b.label || b.key)}</option>`)
    .join('');
}

function renderOcrReviewPanel() {
  const box = getOcrReviewBox();
  if (!box) return;
  const classes = ocrReviewState.classes || [];
  const detected = detectOcrReviewIssues(classes);
  ocrReviewState.issues = detected.issues;
  const badN = detected.issues.filter((i) => i.level === 'bad').length;
  const warnN = detected.issues.filter((i) => i.level === 'warn').length;
  const badgeCls = badN ? 'bad' : warnN ? 'warn' : 'ok';
  const badgeText = badN ? `위험 ${badN}` : warnN ? `확인 ${warnN}` : '안정';
  const title = classes.length
    ? `일단 추천했어요 · 인식 수업 ${classes.length}개`
    : '시간표 인식 확인 필요';
  const sub = classes.length
    ? badN || warnN
      ? '추천은 먼저 했고, 저장 시간표는 확인 후 반영돼요. 의심 수업만 빠르게 고치면 즉시 다시 계산됩니다.'
      : '큰 이상은 없어 바로 저장했어요. 필요하면 아래에서 세부 수업만 조정할 수 있어요.'
    : '수업이 비어 있으면 이미지 또는 수동 입력으로 다시 시도해 주세요.';
  const issueHtml = detected.issues.slice(0, 5)
    .map((i) => `<div class="ocr-r-issue ${i.level}">${escapeHtml(i.text)}</div>`)
    .join('');
  const dowCounts = {};
  classes.forEach((c) => { dowCounts[c.dow] = (dowCounts[c.dow] || 0) + 1; });
  let selectedDow = ocrReviewState.selectedDow;
  if (selectedDow == null || !dowCounts[selectedDow]) {
    const firstDowWithClass = [1, 2, 3, 4, 5, 6, 0].find((d) => dowCounts[d]);
    selectedDow = firstDowWithClass != null ? firstDowWithClass : 1;
    ocrReviewState.selectedDow = selectedDow;
  }
  const dayTabsHtml = [1, 2, 3, 4, 5]
    .map((d) => {
      const has = !!dowCounts[d];
      const cls = `ocr-daytab${Number(selectedDow) === d ? ' on' : ''}${has ? '' : ' empty'}`;
      const attr = has ? ` onclick="ocrReviewState.selectedDow=${d};renderOcrReviewPanel()"` : ' disabled';
      return `<button type="button" class="${cls}"${attr}>${escapeHtml(TimetableUtil?.DOW_NAMES?.[d] || d)}</button>`;
    })
    .join('');
  const sorted = classes
    .map((c, idx) => ({ c, idx }))
    .filter(({ c }) => Number(c.dow) === Number(selectedDow))
    .sort((a, b) => ocrClassMinutes(a.c.start) - ocrClassMinutes(b.c.start));
  const listHtml = sorted
    .map(({ c, idx }) => {
      const itemIssues = detected.byIndex[idx] || [];
      const itemCls = itemIssues.some((i) => i.level === 'bad') ? 'bad' : itemIssues.length ? 'flag' : '';
      const tags = [
        `<span class="ocr-tag">${escapeHtml(TimetableUtil?.DOW_NAMES?.[c.dow] || c.dow)} ${escapeHtml(c.start)}~${escapeHtml(c.end)}</span>`,
        `<span class="ocr-tag">${escapeHtml(c.room || '강의실 없음')}</span>`,
        ...itemIssues.map((i) => `<span class="ocr-tag ${i.level}">${escapeHtml(i.text)}</span>`),
      ].join('');
      return `<div class="ocr-class ${itemCls}">
        <div class="ocr-class-top">
          <div class="ocr-class-name">${escapeHtml(c.name || '수업')}</div>
          <button type="button" class="ocr-mini" onclick="deleteOcrReviewClass(${idx})">삭제</button>
        </div>
        <div class="ocr-class-tags">${tags}</div>
        <div class="ocr-grid">
          <div class="ocr-field"><label>요일</label><select onchange="updateOcrReviewClass(${idx}, 'dow', this.value)">${ocrDowOptions(c.dow)}</select></div>
          <div class="ocr-field"><label>건물</label><select onchange="updateOcrReviewClass(${idx}, 'buildingKey', this.value)">${ocrBuildingOptions(c.buildingKey)}</select></div>
          <div class="ocr-field"><label>시작</label><select onchange="updateOcrReviewClass(${idx}, 'start', this.value)">${ocrTimeOptions(c.start, false)}</select></div>
          <div class="ocr-field"><label>종료</label><select onchange="updateOcrReviewClass(${idx}, 'end', this.value)">${ocrTimeOptions(c.end, true)}</select></div>
          <div class="ocr-field"><label>과목</label><input value="${escapeHtml(c.name || '')}" onchange="updateOcrReviewClass(${idx}, 'name', this.value)"></div>
          <div class="ocr-field"><label>강의실</label><input value="${escapeHtml(c.room || '')}" onchange="updateOcrReviewClass(${idx}, 'room', this.value)"></div>
        </div>
        <div class="ocr-class-quick">
          <button type="button" class="ocr-mini" onclick="shiftOcrReviewDay(${idx}, -1)">전날</button>
          <button type="button" class="ocr-mini" onclick="shiftOcrReviewDay(${idx}, 1)">다음날</button>
          <button type="button" class="ocr-mini" onclick="shiftOcrReviewTime(${idx}, -60)">-1시간</button>
          <button type="button" class="ocr-mini" onclick="shiftOcrReviewTime(${idx}, 60)">+1시간</button>
        </div>
      </div>`;
    })
    .join('');

  box.innerHTML = `<div class="ocr-r-head">
      <div><div class="ocr-r-title">${escapeHtml(title)}</div><div class="ocr-r-sub">${escapeHtml(sub)}</div></div>
      <span class="ocr-r-badge ${badgeCls}">${escapeHtml(badgeText)}</span>
    </div>
    ${issueHtml ? `<div class="ocr-r-issues">${issueHtml}</div>` : ''}
    <div class="ocr-r-actions">
      <button type="button" class="ocr-r-btn primary" onclick="applyOcrReviewClasses()">수정 반영하고 다시 추천</button>
      <button type="button" class="ocr-r-btn" onclick="openAddClassPopup(ocrReviewState.selectedDow)">수업 추가</button>
    </div>
    <div class="ocr-daytabs">${dayTabsHtml}</div>
    <div class="ocr-r-list">${listHtml || '<div class="ocr-r-issue bad">인식된 수업이 없습니다.</div>'}</div>`;
  box.classList.add('on');
}

function setOcrReviewState(api, appliedData = null) {
  const classes = getOcrReviewClasses(api?.classes || []);
  const roomByName = new Map();
  for (const c of classes) {
    const name = String(c.name || '').trim();
    if (name && String(c.room || '').trim() && !roomByName.has(name)) {
      roomByName.set(name, { room: c.room, buildingKey: c.buildingKey });
    }
  }
  for (const c of classes) {
    if (String(c.room || '').trim()) continue;
    const twin = roomByName.get(String(c.name || '').trim());
    if (twin) {
      c.room = twin.room;
      if (twin.buildingKey) c.buildingKey = twin.buildingKey;
    }
  }
  const firstDowWithClass = [1, 2, 3, 4, 5, 6, 0].find((d) => classes.some((c) => Number(c.dow) === d));
  ocrReviewState = { classes, rawApi: api, appliedData, issues: [], selectedDow: firstDowWithClass != null ? firstDowWithClass : 1 };
  ocrReviewState.issues = detectOcrReviewIssues(classes).issues;
}

function openOcrReviewPanel(api = null, appliedData = null) {
  if (api) {
    setOcrReviewState(api, appliedData);
  } else if (appliedData) {
    ocrReviewState.appliedData = appliedData;
  }
  renderOcrReviewPanel();
  const detected = ocrReviewState.issues || [];
  if (detected.length) {
    showToast(`추천 완료 — 의심 수업 ${detected.length}개를 확인해 주세요`);
  }
}

function focusOcrReviewPanel() {
  setMd('img');
  const box = document.getElementById('ocrReviewBox');
  if (box?.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function openOcrReviewFromFood() {
  const ttBtn = Array.from(document.querySelectorAll('.tb')).find((el) =>
    String(el.getAttribute?.('onclick') || '').includes("'tt'"),
  );
  if (ttBtn) goTab('tt', ttBtn);
  focusOcrReviewPanel();
}

function updateOcrReviewClass(idx, field, value) {
  const c = ocrReviewState.classes?.[idx];
  if (!c) return;
  if (field === 'dow') c.dow = Number(value);
  else c[field] = value;
  if (field === 'room') {
    const inferred = TimetableUtil?.resolveRoomToBuildingKey?.(value, null);
    if (inferred) c.buildingKey = inferred;
  }
  renderOcrReviewPanel();
}

function shiftOcrReviewDay(idx, delta) {
  const c = ocrReviewState.classes?.[idx];
  if (!c) return;
  let next = Number(c.dow) + delta;
  if (next < 0) next = 6;
  if (next > 6) next = 0;
  c.dow = next;
  renderOcrReviewPanel();
}

function shiftOcrReviewTime(idx, delta) {
  const c = ocrReviewState.classes?.[idx];
  if (!c) return;
  const start = ocrClassMinutes(c.start);
  const end = ocrClassMinutes(c.end);
  if (start == null || end == null) return;
  const ns = Math.max(6 * 60, Math.min(21 * 60, start + delta));
  const ne = Math.max(6 * 60 + 50, Math.min(21 * 60 + 50, end + delta));
  c.start = ocrMinutesToTime(ns, false);
  c.end = ocrMinutesToTime(ne, true);
  renderOcrReviewPanel();
}

function deleteOcrReviewClass(idx) {
  if (!ocrReviewState.classes?.length) return;
  ocrReviewState.classes.splice(idx, 1);
  renderOcrReviewPanel();
}

function addOcrReviewClass() {
  const ref = typeof KST !== 'undefined' ? KST.now() : new Date();
  const last = ocrReviewState.classes?.[ocrReviewState.classes.length - 1];
  const newClass = {
    dow: last?.dow ?? (ref.getDay() || 1),
    start: last?.end ? ocrMinutesToTime(Math.min((ocrClassMinutes(last.end) || 600) + 10, 21 * 60), false) : '10:00',
    end: last?.end ? ocrMinutesToTime(Math.min((ocrClassMinutes(last.end) || 600) + 60, 21 * 60 + 50), true) : '10:50',
    name: '수업',
    room: '',
    buildingKey: last?.buildingKey || '3공',
  };
  const twin = (ocrReviewState.classes || []).find(
    (c) => String(c.name || '').trim() === String(newClass.name).trim() && String(c.room || '').trim()
  );
  if (twin) {
    newClass.room = twin.room;
    newClass.buildingKey = twin.buildingKey || newClass.buildingKey;
  }
  ocrReviewState.classes.push(newClass);
  renderOcrReviewPanel();
}

function openAddClassPopup(dow) {
  ensureOcrReviewStyles();
  document.getElementById('addClassPopup')?.remove();

  const ref = typeof KST !== 'undefined' ? KST.now() : new Date();
  const defDow = (dow != null && dow !== '') ? Number(dow) : (ref.getDay() || 1);

  const overlay = document.createElement('div');
  overlay.id = 'addClassPopup';
  overlay.className = 'acp-overlay';
  overlay.innerHTML = `
    <div class="acp-box" role="dialog" aria-modal="true" aria-label="수업 추가">
      <div class="acp-head">
        <div class="acp-title">수업 추가</div>
        <button type="button" class="acp-x" id="acpClose" aria-label="닫기">✕</button>
      </div>
      <div class="acp-grid">
        <div class="acp-field"><label>요일</label><select id="acpDow">${ocrDowOptions(defDow)}</select></div>
        <div class="acp-field"><label>과목명</label><input id="acpName" type="text" placeholder="예: 운영체제" autocomplete="off"></div>
        <div class="acp-field"><label>시작</label><select id="acpStart">${ocrTimeOptions('10:00', false)}</select></div>
        <div class="acp-field"><label>종료</label><select id="acpEnd">${ocrTimeOptions('10:50', true)}</select></div>
        <div class="acp-field acp-full"><label>강의실</label><input id="acpRoom" type="text" placeholder="예: Y19301" autocomplete="off"></div>
      </div>
      <div class="acp-actions">
        <button type="button" class="ocr-r-btn" id="acpCancel">취소</button>
        <button type="button" class="ocr-r-btn primary" id="acpSave">저장</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const nameInput = overlay.querySelector('#acpName');
  const roomInput = overlay.querySelector('#acpRoom');

  const onKey = (e) => { if (e.key === 'Escape') close(); };
  function close() {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  }
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#acpClose').addEventListener('click', close);
  overlay.querySelector('#acpCancel').addEventListener('click', close);

  nameInput.addEventListener('input', () => {
    const name = nameInput.value.trim();
    if (!name) return;
    const twin = (ocrReviewState.classes || []).find(
      (c) => String(c.name || '').trim() === name && String(c.room || '').trim()
    );
    if (twin) roomInput.value = twin.room;
  });

  overlay.querySelector('#acpSave').addEventListener('click', () => {
    const dow = Number(overlay.querySelector('#acpDow').value);
    const start = overlay.querySelector('#acpStart').value;
    const end = overlay.querySelector('#acpEnd').value;
    const name = nameInput.value.trim() || '수업';
    const room = roomInput.value.trim();
    const twin = (ocrReviewState.classes || []).find((c) => String(c.name || '').trim() === name);
    const buildingKey =
      (twin && twin.buildingKey) ||
      TimetableUtil?.resolveRoomToBuildingKey?.(room, null) ||
      '3공';
    ocrReviewState.classes.push({ dow, start, end, name, room, buildingKey });
    renderOcrReviewPanel();
    close();
  });

  setTimeout(() => nameInput.focus(), 30);
}

async function applyOcrReviewClasses() {
  if (typeof TimetableUtil === 'undefined') {
    showToast('시간표 모듈을 불러오지 못했어요');
    return;
  }
  const ref = typeof KST !== 'undefined' ? KST.now() : new Date();
  const normalized = TimetableUtil.normalizeClassesFromAi(ocrReviewState.classes || [], ref.getDay());
  if (!normalized.length) {
    showToast('저장할 수업이 없습니다');
    return;
  }
  TimetableUtil.replaceUserTimetable(normalized);
  ocrReviewState.classes = normalized;
  updateSavedTimetableUi();
  const snap = TimetableUtil.analyzeNow(normalized, ref);
  await applyScheduleAnalysis(
    { ...snap, gapSource: 'saved_timetable', warnings: ['사용자가 확인한 시간표 기준으로 다시 계산했어요.'] },
    '확인한 시간표',
    { skipLectureDbEnrich: true },
  );
  renderOcrReviewPanel();
}

function refineScheduleAnalysis(api = {}, lectureDb = null, options = {}) {
  const ref = typeof KST !== 'undefined' ? KST.now() : new Date();
  const warnings = [...(api.warnings || [])];
  let classes = [];
  const db = lectureDb || (typeof TimetableUtil !== 'undefined' ? TimetableUtil.getLectureDbSync?.() : null);
  const fromOcr = options.fromOcr || Array.isArray(api.classes);

  if (typeof TimetableUtil !== 'undefined') {
    const fromApi = TimetableUtil.normalizeClassesFromAi(api.classes || [], ref.getDay());
    if (fromOcr) {
      classes = fromApi;
    } else {
      classes = TimetableUtil.loadUserTimetable();
    }

    if (db?.lectures?.length && !fromOcr && !options.skipLectureDbEnrich) {
      classes = TimetableUtil.enrichClassesWithLectureDb(classes, db, ref.getDay());
    }
    classes = TimetableUtil.dedupeOverlappingClasses(classes);

    if (fromOcr && fromApi.length && options.persistOcr !== false) {
      TimetableUtil.replaceUserTimetable(classes);
    }

    const todayClasses = classes.filter((c) => c.dow === ref.getDay());
    if (todayClasses.length >= 1 || classes.length >= 2) {
      const computed = TimetableUtil.analyzeFromClasses(classes, ref);
      const aiGap = parseInt(api.gapMin, 10);
      if (!Number.isNaN(aiGap) && Math.abs(aiGap - computed.gapMin) > 15) {
        warnings.push(`AI 공강 ${aiGap}분 → ${TimetableUtil.DOW_NAMES[ref.getDay()]}요일 수업 기준 ${computed.gapMin}분`);
      }
      const gapDetail = TimetableUtil.formatGapDetail
        ? TimetableUtil.formatGapDetail(computed, ref)
        : `공강 ${computed.gapMin}분`;
      const curTxt = TimetableUtil.resolveCurrentLocationTxt
        ? TimetableUtil.resolveCurrentLocationTxt(computed, db, ref.getDay())
        : computed.curTxt;
      const dowCounts = TimetableUtil.summarizeByDow(classes);
      const dIdx = ref.getDay();
      const todayN = computed.today?.length ?? 0;
      let maxOther = 0;
      for (let i = 1; i <= 5; i++) {
        if (i !== dIdx) maxOther = Math.max(maxOther, dowCounts[i] || 0);
      }
      if (todayN > 0 && maxOther >= todayN + 2) {
        warnings.push(
          `오늘(${TimetableUtil.DOW_NAMES[dIdx]}) 수업 ${todayN}개만 인식됐어요. 오후 수업 누락 가능 — 시간표 이미지를 다시 분석해 보세요.`,
        );
      }
      if (fromOcr && todayN <= 2 && classes.length >= 6) {
        warnings.push(
          `오늘(${TimetableUtil.DOW_NAMES[dIdx]}) 수업이 ${todayN}개뿐이에요. 에브리타임에서 해당 요일 열 전체가 보이도록 캡처 후 다시 분석해 주세요.`,
        );
      }
      return {
        curKey: computed.curKey,
        curTxt,
        nextKey: computed.nextKey,
        nextTxt: computed.nextTxt,
        gapMin: computed.gapMin,
        mealIntent: api.mealIntent || computed.mealIntent,
        scheduleMeta: {
          timeline: computed.timeline,
          gapSource: api.gapSource === 'saved_timetable' ? 'saved_timetable' : 'timetable_classes',
          gapDetail,
          inClass: computed.inClass,
          nextClass: computed.nextClass,
          dow: ref.getDay(),
          dowLabel: TimetableUtil.DOW_NAMES[ref.getDay()],
          todayCount: computed.today?.length ?? todayClasses.length,
          weeklyLine: TimetableUtil.formatWeeklyDowLine
            ? TimetableUtil.formatWeeklyDowLine(classes)
            : '',
          warnings,
          classCount: classes.length,
        },
      };
    }
  }

  return {
    curKey: api.curKey || '3공',
    curTxt: api.curTxt || '캠퍼스',
    nextKey: api.nextKey || 'none',
    nextTxt: api.nextTxt || '없음 (하교)',
    gapMin: api.gapMin || 75,
    mealIntent: api.mealIntent || MealEngine.computeMealIntent(api.gapMin || 75, ref),
    scheduleMeta: {
      timeline: [],
      gapSource: api.gapSource || 'ai',
      warnings,
      classCount: classes.length,
    },
  };
}

function formatGapMinutesLabel(gapMin) {
  if (gapMin >= 120) return `${gapMin}분(2시간 이상)`;
  return `${gapMin}분`;
}

function buildScheduleComment(cur, nextKey, gapMin, mealIntent, scheduleMeta = {}) {
  const lines = [];
  const dow = scheduleMeta.dowLabel || '';
  const todayCount = scheduleMeta.todayCount ?? null;
  const src = scheduleMeta.gapSource || '';
  const fromTimetable = src.includes('classes') || src === 'timetable_classes';

  if (fromTimetable) {
    if (todayCount === 0) {
      lines.push(`📅 오늘(${dow}) 수업 없음 · 여유 ${formatGapMinutesLabel(gapMin)}`);
    } else if (scheduleMeta.gapDetail) {
      lines.push(`📅 ${scheduleMeta.gapDetail}`);
    } else {
      lines.push(`📅 ${dow}요일 ${todayCount}개 수업 · 공강 ${formatGapMinutesLabel(gapMin)}`);
    }
  } else if (src === 'saved_timetable') {
    lines.push(`📅 저장된 시간표 기준 · ${dow}요일 공강 ${formatGapMinutesLabel(gapMin)}`);
    if (scheduleMeta.gapDetail && todayCount !== 0) lines.push(scheduleMeta.gapDetail);
  } else if (src === 'manual') {
    lines.push('✏️ 수동으로 입력한 위치·공강 기준으로 분석했어요.');
  } else if (src === 'timetable_image' || scheduleMeta.ocrUsed) {
    lines.push('🤖 시간표 이미지에서 수업 시간을 읽었어요.');
  } else if (src === 'ai') {
    lines.push('🤖 시간표 이미지 분석 결과를 반영했어요.');
  } else {
    lines.push('📅 시간표 기준으로 분석했어요.');
  }

  if (mealIntent?.reason) lines.push(`🍽️ ${mealIntent.reason}`);

  if (gapMin < 45) {
    lines.push('⏱️ 공강이 짧아요 — 가까운 식당·빠른 동선을 우선 추천합니다.');
  } else if (gapMin >= 120 && !mealIntent?.longGap) {
    lines.push('✨ 여유 있어요 — 취향·메뉴를 천천히 골라볼 수 있어요.');
  }

  if (nextKey && nextKey !== 'none' && typeof CampusDistance !== 'undefined') {
    const walk = CampusDistance.walkB2B(cur, nextKey);
    lines.push(`🚶 다음 수업까지 도보 약 ${walk}분 (식사·이동 시간 반영)`);
  }
  if (scheduleMeta.warnings?.length) {
    lines.push(`ℹ️ ${scheduleMeta.warnings.join(' ')}`);
  }
  return lines.filter(Boolean).join('\n');
}

function fillManualFromAnalysis(data) {
  const curSel = document.getElementById('mCur');
  const nextSel = document.getElementById('mNext');
  const gapSel = document.getElementById('mGap');
  if (curSel && data.curKey) curSel.value = data.curKey;
  if (nextSel) nextSel.value = data.nextKey === 'none' || !data.nextKey ? 'none' : data.nextKey;
  if (gapSel && typeof TimetableUtil !== 'undefined') {
    gapSel.value = TimetableUtil.suggestGapOptionValue(data.gapMin);
  }
}

function fillManualFromTimetable() {
  if (typeof TimetableUtil === 'undefined') return;
  const snap = TimetableUtil.analyzeNow();
  fillManualFromAnalysis(snap);
  setMd('manual');
  showToast('수동 입력에 오늘 시간표를 채웠어요');
}

async function applyScheduleAnalysis(rawApi, sourceLabel = '분석', options = {}) {
  await ensureMenus();
  const ocrUsed = /AI|이미지|OCR/i.test(sourceLabel);
  if (!ocrUsed && !options.skipLectureDbEnrich && typeof TimetableUtil !== 'undefined' && TimetableUtil.loadLectureDb) {
    await TimetableUtil.loadLectureDb();
  }
  if (typeof TimetableUtil !== 'undefined' && TimetableUtil.loadClassPeriods) {
    await TimetableUtil.loadClassPeriods();
  }
  const data = refineScheduleAnalysis(rawApi, null, {
    fromOcr: ocrUsed && Array.isArray(rawApi.classes),
    skipLectureDbEnrich: options.skipLectureDbEnrich,
    persistOcr: options.persistOcr,
  });
  if (data.scheduleMeta && ocrUsed) data.scheduleMeta.ocrUsed = true;
  let analyzeSource = 'timetable_classes';
  if (ocrUsed) analyzeSource = 'timetable_image';
  else if (rawApi.gapSource === 'saved_timetable' || /저장/i.test(sourceLabel)) analyzeSource = 'saved_timetable';
  const ref = typeof KST !== 'undefined' ? KST.now() : new Date();
  const mealIntent = data.mealIntent || MealEngine.computeMealIntent(data.gapMin, ref);
  const period = mealIntent.period || (ref.getHours() >= 17 ? 'dinner' : 'lunch');
  const scheduleMeta = { ...data.scheduleMeta, gapSource: analyzeSource };
  const comment = buildScheduleComment(data.curKey, data.nextKey, data.gapMin, mealIntent, scheduleMeta);
  if (typeof SchoolCalendar !== 'undefined') await SchoolCalendar.load();
  buildAndRender(data.curKey, data.curTxt, data.nextTxt, data.gapMin, period, {
    analyzeSource,
    mealIntent,
    nextKey: data.nextKey,
    scheduleMeta,
    aiComment: comment,
  });
  fillManualFromAnalysis(data);
  updateSavedTimetableUi();
  const btnImg = document.getElementById('btnImg');
  if (btnImg) btnImg.disabled = false;
  showToast(`${sourceLabel} 완료 — 식당·셔틀 탭을 확인하세요`);
  return data;
}

async function doAnalyzeFromTimetable() {
  if (typeof TimetableUtil === 'undefined') {
    showToast('시간표 모듈을 불러오지 못했어요');
    return;
  }
  const classes = TimetableUtil.loadUserTimetable();
  const ref = typeof KST !== 'undefined' ? KST.now() : new Date();
  if (isNoSchoolDay(ref)) {
    const snap = TimetableUtil.analyzeNow(classes, ref);
    await applyScheduleAnalysis(
      { ...snap, gapSource: 'saved_timetable', warnings: [SchoolCalendar?.dayLabel(ref) + ' — 무수업'] },
      '저장 시간표 (휴일)',
    );
    return;
  }
  const today = classes.filter((c) => c.dow === ref.getDay());
  if (!today.length) {
    showToast('오늘 수업이 저장된 시간표에 없어요. OCR로 주간 시간표를 먼저 저장해 주세요');
    return;
  }
  const snap = TimetableUtil.analyzeNow(classes, ref);
  await applyScheduleAnalysis({ ...snap, gapSource: 'saved_timetable', warnings: [] }, '저장 시간표 분석');
}

const MAX_TIMETABLE_IMAGE_BYTES = 5 * 1024 * 1024;

function handleFile(e) {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > MAX_TIMETABLE_IMAGE_BYTES) {
    showToast('이미지는 5MB 이하여야 합니다. 해상도를 낮춰 주세요.');
    e.target.value = '';
    return;
  }
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

const RESTAURANT_HOURS_LABEL = {
  기숙사: '점심 11:30~13:30 · 저녁 17:00~18:30',
  학생회관: '점심 11:00~14:00',
  명진당: '점심 11:30~14:30 (월~목) · 11:30~14:00 (금)',
  교직원: '점심 12:50~13:30 · 저녁 17:30~18:30',
};

const RESTAURANT_WINDOWS = {
  기숙사: { lunch: { start: 11.5, end: 13.5 }, dinner: { start: 17, end: 18.5 } },
  학생회관: { lunch: { start: 11, end: 14 } },
  명진당: { lunch: { start: 11.5, end: 14.5, friEnd: 14 } },
  교직원: { lunch: { start: 12 + 50 / 60, end: 13.5 }, dinner: { start: 17.5, end: 18.5 } },
};

function fmtHourFloat(h) {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function getMealWindow(key, period, dow) {
  if (dow === 0 || dow === 6) return null;
  const cfg = RESTAURANT_WINDOWS[key];
  if (!cfg) return null;
  const win = cfg[period];
  if (!win) return null;
  if (period === 'lunch' && key === '명진당' && dow === 5) {
    return { start: win.start, end: win.friEnd ?? win.end };
  }
  return { start: win.start, end: win.end };
}

function formatMealWindowLabel(key, period, dow) {
  const win = getMealWindow(key, period, dow);
  if (!win) return '';
  const slot = period === 'dinner' ? '저녁' : '점심';
  return `${slot} ${fmtHourFloat(win.start)}~${fmtHourFloat(win.end)}`;
}

function formatOperatingHoursText(key) {
  return RESTAURANT_HOURS_LABEL[key] || '운영 시간 정보 없음';
}

function getRestaurantCardState(key, period, refDate, dayMode) {
  const ref = refDate || (typeof KST !== 'undefined' ? KST.now() : new Date());
  const t = kstTimeFloat(ref);

  if (dayMode === 'tomorrow') {
    const tomorrowRef = new Date(ref.getTime());
    tomorrowRef.setDate(tomorrowRef.getDate() + 1);
    const twDow = tomorrowRef.getDay();
    if (!getMealWindow(key, period, twDow)) return { state: 'closed' };
    if (!isOpen(key, period, mealOpenRef(tomorrowRef, period))) return { state: 'closed' };
    return { state: 'tomorrow', ref: tomorrowRef, dow: twDow };
  }

  if (isNoSchoolDay(ref) && key === '기숙사') return { state: 'closed' };

  const dow = ref.getDay();
  const window = getMealWindow(key, period, dow);
  if (!window) return { state: 'closed' };

  if (t >= window.start && t < window.end) {
    return { state: 'operating', window };
  }

  if (t < window.start) {
    if (period === 'dinner' && (key === '기숙사' || key === '교직원')) {
      const minsUntil = Math.ceil((window.start - t) * 60);
      if (minsUntil > 0 && minsUntil <= 60) {
        return { state: 'dinner_soon', window, minsUntil };
      }
    }
    return { state: 'before_open', window };
  }

  return { state: 'closed' };
}

function buildCardHoursText(key, period, cardState, ctx) {
  const { ref, dow, minsUntil } = ctx;
  if (cardState === 'closed') return formatOperatingHoursText(key);
  if (cardState === 'tomorrow') {
    const slot = period === 'dinner' ? '저녁' : '점심';
    const winLabel = formatMealWindowLabel(key, period, dow);
    return winLabel ? `내일 ${winLabel} 운영 예정` : `내일 ${slot} 운영 예정`;
  }
  if (cardState === 'dinner_soon') {
    const winLabel = formatMealWindowLabel(key, period, dow);
    return `${winLabel} · ${minsUntil}분 후 오픈`;
  }
  return formatOperatingHoursText(key);
}

const RANK_MODE_LABELS = {
  balance: '교내 4대 식당 — 균형 추천 순위',
  distance: '교내 4대 식당 — 왕복 도보 반영 순위',
  food: '교내 4대 식당 — 취향 매칭 순위',
};

function updateFoodRankLabel() {
  const el = document.getElementById('foodRankLbl');
  if (el) el.textContent = RANK_MODE_LABELS[rankMode] || RANK_MODE_LABELS.balance;
}

function kstTimeFloat(ref) {
  return ref.getHours() + ref.getMinutes() / 60;
}

/** 점심/저녁 운영 여부 판별용 기준 시각 (내일 탭·예측) */
function mealOpenRef(baseRef, mealPeriod) {
  const ref = new Date(baseRef.getTime());
  if (mealPeriod === 'lunch') ref.setHours(12, 50, 0, 0);
  else ref.setHours(17, 45, 0, 0);
  return ref;
}

function isOpen(key, period, refDate) {
  const ref = refDate || (typeof KST !== 'undefined' ? KST.now() : new Date());
  if (typeof SchoolCalendar !== 'undefined' && SchoolCalendar.isNoSchoolDay(ref) && key === '기숙사') {
    return false;
  }
  const dow = ref.getDay();
  if (dow === 0 || dow === 6) return false;
  const t = kstTimeFloat(ref);

  if (key === '기숙사') {
    if (period === 'lunch') return t >= 11.5 && t < 13.5;
    if (period === 'dinner') return t >= 17 && t < 18.5;
    return false;
  }
  if (key === '학생회관') {
    if (period === 'dinner') return false;
    return t >= 11 && t < 14;
  }
  if (key === '명진당') {
    if (period === 'dinner') return false;
    if (dow === 5) return t >= 11.5 && t < 14;
    return t >= 11.5 && t < 14.5;
  }
  if (key === '교직원') {
    if (period === 'lunch') return t >= 12 + 50 / 60 && t < 13.5;
    if (period === 'dinner') return t >= 17.5 && t < 18.5;
    return false;
  }
  return false;
}

/** 메뉴명 → 요리 종류 (중복 가능, 구체적 태그 우선) */
const CUISINE_DETECT = [
  ['중식', ['짜장', '짬뽕', '탕수육', '마파', '깐풍', '유린', '팔보', '마라', '꿔바', '난자', '양장피', '고추잡채', '유산슬', '깐쇼', '중국', '짬뽕밥', '짜장밥']],
  ['일식', ['우동', '라멘', '초밥', '돈부리', '텐동', '규동', '가라아게', '가츠', '오야코', '야끼', '스시', '돈코츠', '회덮', '사케동', '카레우동', '냉우동']],
  ['양식', ['스파게티', '파스타', '스테이크', '피자', '샌드위치', '크림', '로제', '오믈렛', '리조또', '햄버거', '치킨스테이크', '포크', '그라탕', '까스', '돈까스', '함박', '그릴', '베이컨']],
  ['한식', ['비빔밥', '불고기', '갈비', '된장', '김치', '잡채', '해장', '삼계', '육개', '설렁', '냉면', '보쌈', '제육', '순대', '국밥', '찌개', '정식', '쌈밥', '나물', '덮밥', '볶음밥', '카레', '부대', '청국', '순두부', '동태', '감자탕', '곰탕', '뚝밥', '비빔', '죽', '밥']],
];

const TKEYS = {
  한식: CUISINE_DETECT.find(([t]) => t === '한식')[1],
  중식: CUISINE_DETECT.find(([t]) => t === '중식')[1],
  일식: CUISINE_DETECT.find(([t]) => t === '일식')[1],
  양식: CUISINE_DETECT.find(([t]) => t === '양식')[1],
};

const CUISINE_TYPES = ['한식', '중식', '일식', '양식'];

function detectMenuCuisines(name) {
  const n = String(name || '');
  const found = [];
  for (const [cuisine, keys] of CUISINE_DETECT) {
    if (keys.some((k) => n.includes(k))) found.push(cuisine);
  }
  if (!found.length) found.push('한식');
  return found;
}

/**
 * 오늘 식단 × 선택 취향(한식/중식/일식/양식) 적합도 0~100
 * @returns {{ score: number, hits: number, breakdown: Record<string,number>, label: string }}
 */
function analyzeCuisineFit(menus, tastes) {
  const selected = tastes?.length ? tastes : effectiveTastes();
  const breakdown = { 한식: 0, 중식: 0, 일식: 0, 양식: 0 };
  if (!menus.length) return { score: 0, hits: 0, breakdown, label: '메뉴 없음' };
  if (!selected.length) return { score: 45, hits: 0, breakdown, label: '취향 미선택' };

  let hits = 0;
  for (const m of menus) {
    const cuisines = detectMenuCuisines(m.name);
    cuisines.forEach((c) => {
      breakdown[c] = (breakdown[c] || 0) + 1;
    });
    if (selected.some((t) => cuisines.includes(t))) hits++;
  }

  const n = menus.length;
  const matchRatio = hits / n;
  const focusRatio = Math.max(...selected.map((t) => (breakdown[t] || 0) / n));
  const onlyOne = selected.length === 1;
  const focusBoost = onlyOne ? focusRatio * 42 : focusRatio * 28;
  const score = Math.min(
    100,
    Math.round(matchRatio * 48 + focusBoost + hits * 7 + selected.length * 3),
  );
  const top = selected
    .map((t) => ({ t, c: breakdown[t] || 0 }))
    .sort((a, b) => b.c - a.c)[0];
  const label =
    top && top.c > 0
      ? `${top.t} ${top.c}/${n}메뉴`
      : hits
        ? `취향 ${hits}/${n}`
        : '취향 메뉴 없음';

  return { score, hits, breakdown, label };
}

function cuisineMatchScore(menus, tastes) {
  return analyzeCuisineFit(menus, tastes).score;
}

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

/** CampusDistance 미로드 시 폴백 (로직은 campusDistance.js와 동일 계열) */
function scoreRestaurantLocal(opts) {
  if (typeof CampusDistance !== 'undefined' && typeof CampusDistance.scoreRestaurant === 'function') {
    return CampusDistance.scoreRestaurant(opts);
  }
  const { gapMin, waitMin, matchCount, mode, period, status } = opts;
  if (status === 'closed') return { score: 0, closed: true, tier: 2, infeasible: false };

  const gap = gapMin ?? 75;
  const totalTime = 8 + (waitMin || 0) + 20;
  const margin = gap - totalTime;
  const infeasible = margin < 0;
  let timeScore;
  if (margin < 0) timeScore = Math.max(0, 22 + margin * 2.2);
  else timeScore = Math.min(100, Math.max(0, 100 - totalTime * 1.42) + Math.min(16, margin * 0.5));
  const waitScore = Math.max(0, 100 - (waitMin || 0) * 2.5);
  const matchScore = Math.min(100, typeof matchCount === 'number' ? matchCount : 0);

  let wTime = 0.4;
  let wWait = 0.2;
  let wMatch = 0.4;
  if (period === 'dinner') {
    if (mode === 'distance') {
      wTime = 0.88;
      wWait = 0.04;
      wMatch = 0.08;
    } else if (mode === 'food') {
      wTime = 0.2;
      wWait = 0.04;
      wMatch = 0.76;
    } else {
      wTime = 0.55;
      wWait = 0.04;
      wMatch = 0.41;
    }
  } else if (mode === 'distance') {
    wTime = 0.76;
    wWait = 0.18;
    wMatch = 0.06;
  } else if (mode === 'food') {
    wTime = 0.1;
    wWait = 0.08;
    wMatch = 0.82;
  } else {
    const p = gap <= 42 ? 1 : gap >= 98 ? 0 : (98 - gap) / 56;
    wTime = 0.24 + 0.5 * p;
    wWait = 0.12 + 0.1 * p;
    wMatch = Math.max(0.08, 1 - wTime - wWait);
  }

  const statusMul = status === 'bad' ? 0.42 : status === 'warn' ? 0.9 : 1;
  const feasibilityMul = infeasible ? 0.35 : 1;
  const raw = timeScore * wTime + waitScore * wWait + matchScore * wMatch;
  return {
    score: Math.round(raw * statusMul * feasibilityMul) || 0,
    closed: false,
    tier: infeasible ? 1 : 0,
    infeasible,
    margin,
    totalTime,
  };
}

function getRestaurantScore(opts) {
  if (typeof CampusDistance !== 'undefined' && typeof CampusDistance.scoreRestaurant === 'function') {
    return CampusDistance.scoreRestaurant(opts);
  }
  return scoreRestaurantLocal(opts);
}

/** 운영 종료만 맨 아래 (오픈 전·내일 예정·운영 중은 모드별 순위 대상) */
function isRestaurantClosed(row) {
  return row.cardState === 'closed';
}

function isRankableRestaurant(row) {
  return (
    row.cardState === 'operating' ||
    row.cardState === 'before_open' ||
    row.cardState === 'tomorrow' ||
    row.cardState === 'dinner_soon'
  );
}

function toRankCompareRow(row) {
  return {
    key: row.key,
    restaurantKey: row.key,
    cardState: row.cardState,
    closed: row.cardState === 'closed',
    status: row.st,
    infeasible: row.infeasible,
    margin: row.margin,
    walk: row.walk,
    wait: row.wait,
    total: row.total,
    tasteScore: row.tasteScore,
    score: row.score,
    tier: row.tier,
  };
}

function compareRestaurantRows(a, b, mode, period) {
  const cA = isRestaurantClosed(a);
  const cB = isRestaurantClosed(b);
  if (cA !== cB) return cA ? 1 : -1;
  if (cA && cB) return (a.key || '').localeCompare(b.key || '', 'ko');

  const mealPeriod = period || mealMode || 'lunch';
  if (typeof CampusDistance !== 'undefined' && typeof CampusDistance.compareRestaurants === 'function') {
    return CampusDistance.compareRestaurants(a, b, mode, mealPeriod);
  }
  if (mealPeriod === 'dinner') {
    if (mode === 'food' && (b.tasteScore || 0) !== (a.tasteScore || 0)) {
      return (b.tasteScore || 0) - (a.tasteScore || 0);
    }
    return (a.walk || 0) - (b.walk || 0) || (a.total || 0) - (b.total || 0);
  }
  if (mode === 'distance') {
    return (a.walk || 0) - (b.walk || 0) || (a.total || 0) - (b.total || 0) || (a.wait || 0) - (b.wait || 0);
  }
  if (mode === 'food') {
    return (b.tasteScore || 0) - (a.tasteScore || 0) || b.score - a.score;
  }
  return b.score - a.score || (b.margin ?? 0) - (a.margin ?? 0);
}

function crowdBadgeLabel(st, baseBadge) {
  if (st === 'closed') return '운영 종료';
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
  const learnedOk = learned.filter((t) => CUISINE_TYPES.includes(t));
  return [...new Set([...(P.tastes || []), ...learnedOk])];
}

function tagsFromMenus(menus) {
  const tags = new Set();
  for (const m of menus) {
    detectMenuCuisines(m.name).forEach((c) => tags.add(c));
  }
  return [...tags];
}

function openSettings() {
  openSetupModal(false);
}

const HEADER_TASTES = CUISINE_TYPES;

function renderHeaderTasteChips() {
  const box = document.getElementById('hpTasteChips');
  if (!box) return;
  box.innerHTML = HEADER_TASTES.map(
    (t) =>
      `<button type="button" class="hdr-taste-chip${(P.tastes || []).includes(t) ? ' on' : ''}" onclick="toggleHeaderTaste('${t}')">${t}</button>`,
  ).join('');
}

function toggleHeaderTaste(t) {
  if (!P.tastes) P.tastes = [];
  P.tastes = P.tastes.includes(t) ? P.tastes.filter((x) => x !== t) : [...P.tastes, t];
  saveProfile();
  renderHeaderTasteChips();
  updateLearnedDisplay();
  if (lastData) drawFood();
}

/** 학습·방문 집계는 dashboard.html 전용 — 메인 UI에는 표시하지 않음 */
function updateLearnedDisplay() {}

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

function isMatch(name) {
  const tastes = effectiveTastes();
  if (!tastes.length) return false;
  const cuisines = detectMenuCuisines(name);
  return tastes.some((t) => cuisines.includes(t));
}

function isNoSchoolDay(d) {
  if (typeof SchoolCalendar !== 'undefined' && SchoolCalendar.isNoSchoolDay) {
    return SchoolCalendar.isNoSchoolDay(d);
  }
  const x = d || (typeof KST !== 'undefined' ? KST.now() : new Date());
  const dow = x.getDay();
  return dow === 0 || dow === 6;
}

function menuDayIndex(dayOffset = 0) {
  const now = typeof KST !== 'undefined' ? KST.now() : new Date();
  return (now.getDay() + dayOffset) % 7;
}

function getMenus(key, period, dayOffset = null) {
  const offset = dayOffset !== null ? dayOffset : dayMode === 'tomorrow' ? 1 : 0;
  const slot = period === 'dinner' ? 'd' : 'l';
  const restaurantDays = MENUS[key];
  if (!restaurantDays) return [];
  const dayData = getMenuDayData(restaurantDays, offset) || {};
  let raw = dayData[slot] || [];
  if (!raw.length && period === 'dinner' && (key === '명진당' || key === '학생회관')) {
    raw = dayData.l?.length ? dayData.l : dayData.b || [];
  }
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
  const ref = typeof KST !== 'undefined' ? KST.now() : new Date();
  const mealIntent = MealEngine.computeMealIntent(gapMin, ref);
  const period = mealIntent.period;
  const scheduleMeta = { gapSource: 'manual', timeline: [], warnings: [] };
  if (typeof SchoolCalendar !== 'undefined') await SchoolCalendar.load();
  buildAndRender(cur, curTxt, nxtTxt, gapMin, period, {
    analyzeSource: 'manual',
    mealIntent,
    nextKey,
    scheduleMeta,
    aiComment: buildScheduleComment(cur, nextKey, gapMin, mealIntent, scheduleMeta),
  });
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
    if (!isOpen(key, period, refNow)) {
      return {
        상태: 'closed',
        배지: '운영 종료',
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
      if (v.상태 === 'closed') return;
      const tasteScore = cuisineMatchScore(v.메뉴, effectiveTastes());
      const trip = v.trip;
      const total = trip?.total ?? v.총소요 ?? 0;
      const margin = trip?.margin ?? gapMin - total;
      const { score, closed, tier } = getRestaurantScore({
        fromKey: cur,
        nextKey,
        gapMin,
        restaurantKey: k,
        waitMin: v.대기분,
        matchCount: tasteScore,
        mode: rankMode,
        period,
        status: v.상태 === 'closed' ? 'closed' : v.상태,
      });
      if (closed || tier >= 2) return;
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

  const analyzeSource =
    extra.analyzeSource || extra.scheduleMeta?.gapSource || 'manual';

  void persistAnalysisSession(cur, nextKey, gapMin);

  lastData = {
    analyzeSource,
    현재건물키: cur,
    현재위치: curTxt,
    다음수업: nxtTxt,
    공강분: gapMin,
    공강텍스트:
      extra.scheduleMeta?.gapDetail ||
      (TimetableUtil?.formatGapText
        ? TimetableUtil.formatGapText(gapMin)
        : gapMin < 60
          ? `${gapMin}분`
          : gapMin < 90
            ? '1시간 ~ 1시간 30분'
            : '2시간 이상'),
    시간대: tLabel,
    캠퍼스인원: crowd.인원,
    총평: extra.aiComment || (mealIntent.willEat ? mealIntent.reason : mealIntent.reason),
    mealIntent,
    segment,
    external,
    nextKey,
    rankMode,
    scheduleMeta: extra.scheduleMeta || null,
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
window.buildAndRender = buildAndRender;

function buildTomorrow(cur, period) {
  const mult2 = (PMULT[period] || 1) * 1.1;
  const walkFn =
    typeof CampusDistance !== 'undefined' ? (k) => CampusDistance.walkToRest(cur, k) : () => 8;
  const tomorrowDay = menuDayIndex(1);
  const 식당 = {};
  ['기숙사', '명진당', '교직원', '학생회관'].forEach((key) => {
    const walkMin = walkFn(key);
    const tomorrowRef = typeof KST !== 'undefined' ? KST.now() : new Date();
    tomorrowRef.setDate(tomorrowRef.getDate() + 1);
    if (tomorrowDay === 0 || tomorrowDay === 6) {
      식당[key] = {
        상태: 'closed',
        배지: '주말 미운영',
        메뉴: [],
        혼잡도: 0,
        추천여부: false,
      };
      return;
    }
    if (isMenuDateClosed(key, tomorrowRef)) {
      식당[key] = {
        상태: 'closed',
        배지: '휴무',
        도보분: walkMin,
        대기분: 0,
        혼잡도: 0,
        추천여부: false,
        메뉴: [],
      };
      return;
    }
    const openRef = mealOpenRef(tomorrowRef, period);
    if (!isOpen(key, period, openRef)) {
      const isHoliday =
        typeof SchoolCalendar !== 'undefined' && SchoolCalendar.isHoliday && SchoolCalendar.isHoliday(tomorrowRef);
      식당[key] = {
        상태: 'closed',
        배지: isHoliday && key === '기숙사' ? '공휴일 미운영' : '운영 종료',
        도보분: walkMin,
        대기분: 0,
        혼잡도: 0,
        추천여부: false,
        메뉴: [],
      };
      return;
    }
    const cong = getDynamicCrowd(key, openRef);
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
    예측: '내일 혼잡도 참고값 (데이터 수집·피드백 반영 중)',
    식당,
    셔틀: { 상태: 'warn', 설명: '내일 하교 시간대도 승강장 대기가 예상됩니다.', 대안: '진입로 셔틀 → 에버라인 환승을 미리 계획해두세요.', 혼잡도: 58 },
  };
}

function resolveAnalyzeComment(d) {
  const meta = d.scheduleMeta || {};
  const src = d.analyzeSource || meta.gapSource || 'manual';
  const ref = typeof KST !== 'undefined' ? KST.now() : new Date();
  const mealIntent = d.mealIntent || MealEngine.computeMealIntent(d.공강분 || 75, ref);
  return buildScheduleComment(d.현재건물키 || '3공', d.nextKey || 'none', d.공강분 || 75, mealIntent, {
    ...meta,
    gapSource: src,
  });
}

function drawBoard() {
  const d = lastData;
  const meta = d.scheduleMeta || {};
  const gapLabel = meta.inClass ? '수업 · 이후' : '공강 시간';
  document.getElementById('sbRows').innerHTML = [
    ['분석 요일', meta.dowLabel ? `${meta.dowLabel}요일` : '-'],
    ['현재 위치', d.현재위치 || '-'],
    ['다음 수업', d.다음수업 || '-'],
    [gapLabel, meta.gapDetail || d.공강텍스트 || '-', true],
    ['분석 시각', d.analyzedAt || 'KST'],
  ]
    .map(([k, v, isGap]) => `<div class="dr${isGap ? ' dr--gap' : ''}"><span class="dk">${escapeHtml(k)}</span><span class="dv${isGap ? ' dv--wrap' : ''}">${escapeHtml(v)}</span></div>`)
    .join('');

  const tlEl = document.getElementById('ttTimeline');
  if (tlEl) {
    const timeline = meta.timeline || [];
    if (timeline.length) {
      const dowTitle = meta.dowLabel ? `${escapeHtml(meta.dowLabel)}요일 · ` : '';
      tlEl.innerHTML = `<div class="tt-tl-title">🗓 ${dowTitle}오늘 수업 (${timeline.length}개)</div>${timeline
        .map((c) => {
          const st = c.state === 'now' ? 'now' : c.state === 'done' ? 'done' : '';
          const badge = c.state === 'now' ? ' · 지금' : c.state === 'done' ? ' · 종료' : '';
          return `<div class="tt-tl-row ${st}"><span class="tt-tl-dot"></span><span class="tt-tl-time">${escapeHtml(c.start)}~${escapeHtml(c.end)}</span><span>${escapeHtml(c.name)}${badge}<br><span style="font-size:10px;color:var(--sub)">${escapeHtml(c.label || c.buildingKey)} ${escapeHtml(c.room || '')}</span></span></div>`;
        })
        .join('')}`;
    } else {
      tlEl.innerHTML = '';
    }
  }

  const reviewIssueCount = meta.ocrUsed && ocrReviewState?.issues?.length ? ocrReviewState.issues.length : 0;
  const reviewButton = reviewIssueCount
    ? ` <button type="button" style="margin-left:auto;border:1px solid #f59e0b;background:#fff7ed;color:#92400e;border-radius:7px;padding:5px 8px;font-size:10.5px;font-weight:800;font-family:'Noto Sans KR',sans-serif;cursor:pointer" onclick="focusOcrReviewPanel()">의심 수업 ${reviewIssueCount}개 확인</button>`
    : '';
  document.getElementById('tAlert').innerHTML = (d.mealIntent?.willEat
    ? `⚠️ ${escapeHtml(d.오늘?.crowd?.설명 || '식사 파동')} · 동시 이동 <b>${escapeHtml(d.캠퍼스인원)}</b>`
    : `ℹ️ 짧은 공강 — 학식 대신 간단히 해결하는 패턴`) + reviewButton;
  document.getElementById('schBd').classList.add('on');
  document.getElementById('aiBox').classList.add('on');
  document.getElementById('aiTxt').innerHTML = '';
  typeText('aiTxt', resolveAnalyzeComment(d) || d.총평 || '분석 완료되었습니다.');
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
      return `<a class="alt-link" href="${safeHttpUrl(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(it.platform)} · ${escapeHtml(it.name)}</a>`;
    })
    .join('');
  box.className = 'alt-food on';
  box.innerHTML = `<div class="alt-ttl">🛒 학식 대신 추천</div><div class="alt-why">${escapeHtml(ext.why)}</div><div class="alt-links">${items}</div>`;
}

function rcStatusBadgeHtml(cardState, isPick, st, crowdLbl, rankIdx) {
  if (cardState === 'closed') return `<span class="rc-badge rc-badge--closed">운영 종료</span>`;
  if (cardState === 'before_open') return `<span class="rc-badge rc-badge--blue">오픈 전</span>`;
  if (cardState === 'dinner_soon') return `<span class="rc-badge rc-badge--o">저녁 오픈 예정</span>`;
  if (cardState === 'tomorrow') return `<span class="rc-badge rc-badge--g">운영 예정</span>`;
  if (isPick) return `<span class="rc-badge rc-badge--g">1순위 · ${escapeHtml(crowdLbl)}</span>`;
  const cls = st === 'ok' ? 'rc-badge--g' : st === 'warn' ? 'rc-badge--o' : 'rc-badge--r';
  const rankPrefix = rankIdx === 1 ? '2순위 · ' : rankIdx === 2 ? '3순위 · ' : rankIdx === 3 ? '4순위 · ' : '';
  return `<span class="rc-badge ${cls}">${rankPrefix}${escapeHtml(crowdLbl)}</span>`;
}

function buildRestaurantCardHtml(row, ctx) {
  const { e, n, st, menus, walk, back, wait, total, margin, cardState } = row;
  const { gapMin, mealMin, isPick, instaUrl, rankIdx, hoursText } = ctx;
  const crowdLbl = crowdBadgeLabel(st);
  const badge = rcStatusBadgeHtml(cardState, isPick, st, crowdLbl, rankIdx);
  const nameCls = cardState === 'closed' ? ' rc-hd-name--muted' : '';
  const rankTag =
    (cardState === 'before_open' || cardState === 'tomorrow') && rankIdx >= 0
      ? `<span class="rc-rank-tag">${rankIdx + 1}순위</span>`
      : '';
  const header = `<div class="rc-hd"><div class="rc-hd-name${nameCls}">${escapeHtml(e)} ${escapeHtml(n)}${rankTag}</div>${badge}</div>`;

  const insta =
    instaUrl
      ? `<a class="rc-insta" href="${safeHttpUrl(instaUrl)}" target="_blank" rel="noopener noreferrer">📸 인스타 보기</a>`
      : '';

  if (cardState === 'closed') {
    return `${header}<div class="rc-body rc-body--closed"><div class="rc-hours">${escapeHtml(hoursText)}</div>${insta}</div>`;
  }

  const roundTrip = walk + back;
  const waitHot = st === 'warn' || st === 'bad';
  const waitDash = cardState === 'dinner_soon';
  const waitCell = waitDash
    ? `<div class="rc-tcell rc-twait--na"><span class="rc-tval">-</span><span class="rc-tlbl">⏳ 대기</span></div>`
    : `<div class="rc-tcell${waitHot ? ' rc-twait--hot' : ''}"><span class="rc-tval">${wait}분</span><span class="rc-tlbl">⏳ 대기</span></div>`;

  const timeGrid = `<div class="rc-time3">
    <div class="rc-tcell"><span class="rc-tval">${roundTrip}분</span><span class="rc-tlbl">🚶 왕복</span></div>
    ${waitCell}
    <div class="rc-tcell"><span class="rc-tval">${mealMin}분</span><span class="rc-tlbl">🍽️ 식사</span></div>
  </div>`;

  let marginRow = '';
  if (cardState !== 'dinner_soon') {
    const marginCls = margin >= 15 ? 'rc-margin--safe' : margin >= 3 ? 'rc-margin--tight' : 'rc-margin--over';
    const marginTxt = margin >= 0 ? `여유 ${margin}분` : `부족 ${Math.abs(margin)}분`;
    marginRow = `<div class="rc-margin ${marginCls}">
      <span class="rc-margin-l">합계 <b>${total}분</b> / 공강 <b>${gapMin}분</b></span>
      <span class="rc-margin-r">${marginTxt}</span>
    </div>`;
  }

  let menuBlock;
  if (!menus.length) {
    menuBlock = '<div class="rc-menus"><div class="rc-menu-empty">주말 식단 미제공</div></div>';
  } else {
    const matchMs = menus.filter((m) => m.tag === 'match');
    const sortedM = [...matchMs, ...menus.filter((m) => m.tag !== 'match')];
    const items = sortedM
      .slice(0, 4)
      .map((m) => {
        const taste = m.tag === 'match' ? '<span class="rc-menu-match">취향</span>' : '';
        return `<div class="rc-menu-item"><span>${escapeHtml(m.name)}</span>${taste}</div>`;
      })
      .join('');
    menuBlock = `<div class="rc-menus">${items}</div>`;
  }

  return `${header}<div class="rc-body"><div class="rc-hours">${escapeHtml(hoursText)}</div>${timeGrid}${marginRow}${menuBlock}${insta}</div>`;
}

function drawFood() {
  if (!lastData) return;
  const src = dayMode === 'today' ? lastData.오늘 : lastData.내일;
  if (!src?.식당) return;

  drawAltFood();
  document.getElementById('dayChip').innerHTML =
    dayMode === 'tomorrow' && lastData.내일?.예측 ? `<div class="pred-chip">🔮 내일 예측 — ${escapeHtml(lastData.내일.예측)}</div>` : '';

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
  const activeRankMode = rankMode;
  const menuDayOff = dayMode === 'tomorrow' ? 1 : 0;
  const menuRef = typeof KST !== 'undefined' ? KST.now() : new Date();
  menuRef.setDate(menuRef.getDate() + menuDayOff);

  const nowRef = typeof KST !== 'undefined' ? KST.now() : new Date();
  const fromKey = lastData.현재건물키 || '3공';

  const scored = DEFS.map((def) => {
    const base = src.식당[def.key] || {};
    const cardInfo = getRestaurantCardState(def.key, mealMode, nowRef, dayMode);
    let cardState = cardInfo.state;
    if (dayMode === 'tomorrow') {
      if (base.상태 !== 'closed' && cardState === 'closed') {
        const tRef = new Date(nowRef.getTime());
        tRef.setDate(tRef.getDate() + 1);
        if (isOpen(def.key, mealMode, mealOpenRef(tRef, mealMode))) cardState = 'tomorrow';
      }
      if (base.상태 === 'closed') cardState = 'closed';
    }
    const isClosed = cardState === 'closed';
    const showMenus = !isClosed;
    const menus = showMenus ? getMenus(def.key, mealMode, menuDayOff) : [];
    const walk = base.도보분 ?? CampusDistance.walkToRest(fromKey, def.key);
    const back = base.복귀분 ?? CampusDistance.walkRestToBuilding(def.key, nextKey);
    const congBase = base.혼잡도 || (cardState === 'before_open' ? getDynamicCrowd(def.key, (() => { const r = new Date(nowRef); const win = getMealWindow(def.key, 'lunch', r.getDay()); if (win) { const h = Math.floor(win.start); r.setHours(h, Math.round((win.start - h) * 60), 0, 0); } else { r.setHours(12, 30, 0, 0); } return r; })()) : getDynamicCrowd(def.key));
    const liveCong = cardState === 'operating' ? getDynamicCrowd(def.key) : congBase;
    const liveWait = cardState === 'dinner_soon' ? 0 : waitMin(liveCong);
    const effectiveWait = cardState === 'operating' || cardState === 'before_open' || cardState === 'tomorrow'
      ? liveWait
      : cardState === 'dinner_soon'
        ? 0
        : 0;
    const total = walk + effectiveWait + MEAL + back;
    const margin = gapMin - total;
    const st = isClosed ? 'closed' : liveCong >= 80 ? 'bad' : liveCong >= 55 ? 'warn' : 'ok';
    const tasteScore = cuisineMatchScore(menus, effectiveTastes());
    const scoreResult = isClosed
      ? { score: 0, closed: true, tier: 2, infeasible: false, margin }
      : getRestaurantScore({
          fromKey,
          nextKey,
          gapMin,
          restaurantKey: def.key,
          waitMin: liveWait,
          matchCount: tasteScore,
          mode: activeRankMode,
          period: mealMode,
          status: st,
        });
    const score = isClosed ? 0 : scoreResult.score ?? 0;
    const rowMargin = scoreResult.margin ?? margin;
    const hoursText = buildCardHoursText(def.key, mealMode, cardState, {
      ref: nowRef,
      dow: cardInfo.dow ?? menuRef.getDay(),
      minsUntil: cardInfo.minsUntil,
    });
    return {
      ...def,
      base,
      st,
      menus,
      walk,
      back,
      wait: effectiveWait,
      cong: liveCong,
      total,
      margin: rowMargin,
      score,
      tasteScore,
      cardState,
      hoursText,
      openNow: cardState === 'operating',
      closed: isClosed || !!scoreResult.closed,
      infeasible: !!scoreResult.infeasible,
      tier: isClosed ? 2 : scoreResult.tier ?? 0,
    };
  });

  const rankableRows = [];
  const closedRows = [];
  for (const row of scored) {
    (isRankableRestaurant(row) ? rankableRows : closedRows).push(row);
  }
  rankableRows.sort((a, b) =>
    compareRestaurantRows(toRankCompareRow(a), toRankCompareRow(b), activeRankMode, mealMode),
  );
  closedRows.sort((a, b) => (a.key || '').localeCompare(b.key || '', 'ko'));
  const ordered = rankableRows.concat(closedRows);

  let pickName = '추천 식당';
  let pickKey = ordered[0]?.key;
  const wrap = document.getElementById('rcWrap');
  const shortGapBanner =
    dayMode === 'today' && gapMin < 45
      ? '<div class="gap-short-banner">⚠️ 공강이 짧아요! 빠른 식당을 우선 추천해요</div>'
      : '';
  const foodOcrIssueCount =
    dayMode === 'today' && lastData.scheduleMeta?.ocrUsed && ocrReviewState?.issues?.length
      ? ocrReviewState.issues.length
      : 0;
  const foodOcrBanner = foodOcrIssueCount
    ? `<div class="food-pred-banner food-pred-banner--warn">
        <span class="food-pred-ico">⚠️</span>
        <div style="flex:1">시간표 ${foodOcrIssueCount}곳 확인 필요 · 추천은 먼저 계산했어요.</div>
        <button type="button" style="border:1px solid #fdba74;background:#fff;color:#9a3412;border-radius:8px;padding:6px 9px;font-size:11px;font-weight:800;font-family:'Noto Sans KR',sans-serif;cursor:pointer" onclick="openOcrReviewFromFood()">확인</button>
      </div>`
    : '';
  wrap.innerHTML = foodOcrBanner + shortGapBanner;

  ordered.forEach((row, idx) => {
    const { key, e, n, st, menus, walk, back, wait, total, margin, cardState, hoursText, tier, infeasible } = row;
    const isClosed = cardState === 'closed';
    const isPick = idx === 0 && cardState === 'operating' && tier === 0 && !infeasible && st !== 'bad';
    if (isPick) {
      pickName = n;
      pickKey = key;
    }

    const card = document.createElement('div');
    card.className = 'rc-card' + (isPick ? ' rc-card--pick' : '') + (isClosed ? ' rc-card--closed' : '');
    card.innerHTML = buildRestaurantCardHtml(
      { key, e, n, st, menus, walk, back, wait, total, margin, cardState },
      {
        gapMin,
        mealMin: MEAL,
        isPick,
        instaUrl: INSTA[key],
        rankIdx: idx,
        hoursText,
      },
    );
    wrap.appendChild(card);
  });

  if (deliveryWrap) deliveryWrap.innerHTML = renderDeliverySectionHtml();

  window._lastPickKey = pickKey;
  document.getElementById('fbBtn').textContent = '✅ 방문 완료 기록';
  setTimeout(() => document.getElementById('fbBox').classList.add('on'), 400);
}

/* ════════════════════════════ 셔틀 실시간 (2026-1학기 공식표) ════ */
const SHUTTLE_ROUTE_STOPS = {
  entranceMyeongji: ['캠퍼스', '이마트', '상공회의소', '역북동행정복지센터', '명지대역'],
  sinae: ['캠퍼스', '용인CGV', '중앙공영주차장', '명지대역'],
};

function formatShuttleRoute(stops) {
  return stops.join(' → ');
}

function formatShuttleRoutePath(text) {
  const parts = String(text || '').split(/\s*(→|↔)\s*/);
  let html = '';
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '→' || parts[i] === '↔') {
      html += `<span class="sh-route-arrow">${parts[i]}</span>`;
    } else if (parts[i]) {
      html += `<span class="sh-route-stop">${parts[i]}</span>`;
    }
  }
  return html;
}

const SHUTTLE_ROUTES = {
  giheung: '기흥역 ↔ 캠퍼스 (진입로)',
  entranceMyeongji: formatShuttleRoute(SHUTTLE_ROUTE_STOPS.entranceMyeongji),
  entranceSinae: formatShuttleRoute(SHUTTLE_ROUTE_STOPS.sinae),
  city: formatShuttleRoute(SHUTTLE_ROUTE_STOPS.sinae),
};

function getEntranceRouteForType(type) {
  return type === '시내' ? SHUTTLE_ROUTES.entranceSinae : SHUTTLE_ROUTES.entranceMyeongji;
}

function renderShuttleRouteHtml(kind) {
  if (kind === 'entrance') {
    return `<div class="sh-route">
      <div class="sh-route-row"><span class="sh-route-tag">명지대역</span><span class="sh-route-path">${formatShuttleRoutePath(SHUTTLE_ROUTES.entranceMyeongji)}</span></div>
      <div class="sh-route-row"><span class="sh-route-tag">시내</span><span class="sh-route-path">${formatShuttleRoutePath(SHUTTLE_ROUTES.entranceSinae)}</span></div>
    </div>`;
  }
  if (kind === 'city') {
    return `<div class="sh-route"><div class="sh-route-row"><span class="sh-route-path">${formatShuttleRoutePath(SHUTTLE_ROUTES.city)}</span></div></div>`;
  }
  return `<div class="sh-route"><div class="sh-route-row"><span class="sh-route-path">${formatShuttleRoutePath(SHUTTLE_ROUTES.giheung)}</span></div></div>`;
}

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

const SHUTTLE_DOW_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

function getWeekendShuttleReturn(schedule) {
  const now = getKstNow();
  const dow = now.getDay();
  const isHoliday =
    typeof SchoolCalendar !== 'undefined' && SchoolCalendar.isHoliday && SchoolCalendar.isHoliday(now);
  if (dow !== 0 && dow !== 6 && !isHoliday) return null;
  const tomorrow = (dow + 1) % 7;
  const isWeekday = tomorrow >= 1 && tomorrow <= 5;
  return {
    statusText: isWeekday
      ? `주말 미운행 · 내일(${SHUTTLE_DOW_NAMES[tomorrow]}요일) 첫차 08:15 출발 예정`
      : '주말·공휴일 미운행',
    statusCls: 'bad',
    upcoming: [],
    after18: false,
    limit18: schedule?.limit18 || '',
    hint: '주말·공휴일에는 학기중 통학버스가 운행하지 않습니다.',
    isTomorrow: false,
  };
}

function getTomorrowViewWeekendReturn(schedule, viewDow) {
  const tomorrow = new Date(getKstNow());
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isHoliday =
    typeof SchoolCalendar !== 'undefined' && SchoolCalendar.isHoliday && SchoolCalendar.isHoliday(tomorrow);
  if (viewDow !== 0 && viewDow !== 6 && !isHoliday) return null;
  const dayAfter = (viewDow + 1) % 7;
  const isWeekday = dayAfter >= 1 && dayAfter <= 5;
  return {
    statusText: isWeekday
      ? `주말·공휴일 미운행 · ${SHUTTLE_DOW_NAMES[dayAfter]}요일 첫차 08:15 출발 예정`
      : '주말·공휴일 미운행',
    statusCls: 'bad',
    upcoming: [],
    after18: false,
    limit18: schedule?.limit18 || '',
    hint: '주말·공휴일에는 학기중 통학버스가 운행하지 않습니다.',
    isTomorrow: true,
  };
}

function buildShuttleTomorrowFullList(events) {
  return [...events]
    .sort((a, b) => a.depM - b.depM)
    .map((ev) => ({ ...ev, isPast: false, isTomorrow: true, remain: 0, hl: false }));
}

function getShuttleCongestionHint() {
  const dow = getKstNow().getDay();
  const nowM = getKstMinutes();
  if (isNoSchoolDay(getKstNow())) return '주말·공휴일은 학기중 셔틀 미운행입니다.';
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
  const weekend = getWeekendShuttleReturn(schedule);
  if (weekend) return weekend;

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
    isTomorrow: false,
  };
}

function analyzeSchoolDepartTomorrow(schedule, opts = {}) {
  const travel = schedule.travelMin || 15;
  const viewDow = (getKstNow().getDay() + 1) % 7;
  const weekend = getTomorrowViewWeekendReturn(schedule, viewDow);
  if (weekend) return weekend;
  const events = (schedule.schoolDepart || []).map((item) => {
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
  const first = events[0];
  return {
    statusText: first ? `내일 첫차 ${first.depart} 출발 예정` : '내일 운행 시간표 확인',
    statusCls: 'ok',
    upcoming: buildShuttleTomorrowFullList(events),
    after18: false,
    limit18: schedule.limit18,
    hint: '',
    isTomorrow: true,
  };
}

function analyzeGiheungShuttle() {
  const nowM = getKstMinutes();
  const travel = GIHEUNG_SCHEDULE.travelMin;
  const weekend = getWeekendShuttleReturn(GIHEUNG_SCHEDULE);
  if (weekend) return weekend;

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
    isTomorrow: false,
  };
}

function analyzeGiheungShuttleTomorrow() {
  const travel = GIHEUNG_SCHEDULE.travelMin;
  const viewDow = (getKstNow().getDay() + 1) % 7;
  const weekend = getTomorrowViewWeekendReturn(GIHEUNG_SCHEDULE, viewDow);
  if (weekend) return weekend;
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
    };
  });
  const schoolEvents = GIHEUNG_SCHEDULE.schoolDepart.map((t) => {
    const depM = shTimeToMin(t);
    return {
      depart: t,
      depM,
      arrM: depM + travel,
      arrive: shMinToStr(depM + travel),
      type: '기흥역행',
      kind: '하교',
    };
  });
  const allEvents = [...toCampus, ...schoolEvents];
  const firstArr = GIHEUNG_SCHEDULE.arriveCampus[0];
  const firstDep = firstArr ? shMinToStr(shTimeToMin(firstArr) - travel) : '08:15';
  return {
    statusText: `내일 첫차 ${firstDep} 출발 예정`,
    statusCls: 'ok',
    upcoming: buildShuttleTomorrowFullList(allEvents),
    after18: false,
    limit18: GIHEUNG_SCHEDULE.limit18,
    hint: '',
    isTomorrow: true,
  };
}

function renderShuttleCard(containerId, title, route, analysis, modalKind) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const bc = analysis.statusCls === 'ok' ? 'bdg-g' : analysis.statusCls === 'bad' ? 'bdg-r' : 'bdg-o';
  const shcCls = analysis.statusCls === 'ok' ? 'shc-ok' : analysis.statusCls === 'bad' ? 'shc-bad' : 'shc-warn';
  const upTitle = analysis.isTomorrow
    ? '📅 내일 전체 시간표'
    : '⏱ 직전·2시간 이내 (학교 출발·도착 기준)';
  const upHtml = analysis.upcoming.length
    ? `<div class="sh-upcoming"><div style="font-weight:700;color:var(--navy);margin-bottom:6px">${upTitle}</div>${analysis.upcoming
        .map((u) => {
          const label = u.kind === '등교' ? `기흥역 ${u.depart} → 캠퍼스 ${u.arrive}` : `학교 ${u.depart} 출발 · ${u.type || ''}`;
          if (analysis.isTomorrow) {
            return `<div class="sh-up-row"><span>${label}</span><span>도착 ${u.arrive}</span></div>`;
          }
          if (u.isPast) {
            return `<div class="sh-up-row past"><span>${label}</span><span class="sh-past-lbl">지난 버스</span></div>`;
          }
          const timeLbl = u.isMoving ? `<b>이동 중 · ${u.remain}분 후 도착</b>` : `<b>${u.remain}분 후</b>`;
          return `<div class="sh-up-row${u.hl ? ' hl' : ''}"><span>${label}</span><span>${timeLbl}</span></div>`;
        })
        .join('')}</div>`
    : `<div class="sh-upcoming" style="color:var(--sub)">${analysis.isTomorrow ? '내일 운행 시간표 없음' : '2시간 이내 예정 버스 없음'}</div>`;
  const hintHtml = analysis.hint ? `<div class="sh-limit" style="color:#1e40af;background:#eff6ff;border-color:#bfdbfe">${analysis.hint}</div>` : '';

  const routeHtml = modalKind ? renderShuttleRouteHtml(modalKind) : `<div style="font-size:11px;color:var(--muted);margin-bottom:6px">📍 ${route}</div>`;
  el.innerHTML = `<div class="shc ${shcCls} on" style="margin-bottom:12px">
    <div class="sh-in">
      <div class="sh-hd"><div class="sh-name">${title}</div><span class="bdg ${bc}">${analysis.statusCls === 'ok' ? '원활' : analysis.statusCls === 'bad' ? '운행 종료' : '혼잡 주의'}</span></div>
      ${routeHtml}
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
  const dayLbl = dayMode === 'tomorrow' ? '내일 예측' : '오늘 실시간';
  const viewDow = dayMode === 'tomorrow' ? (n.getDay() + 1) % 7 : n.getDay();
  if (kstEl) {
    kstEl.textContent = `${dayLbl} · ${SHUTTLE_DOW_NAMES[viewDow]} ${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')} KST`;
  }
  let gi, ent, city;
  if (dayMode === 'tomorrow') {
    gi = analyzeGiheungShuttleTomorrow();
    ent = analyzeSchoolDepartTomorrow(ENTRANCE_SHUTTLE_SCHEDULE, {
      defaultType: '진입로',
      destLabel: '명지대역·시내',
    });
    city = analyzeSchoolDepartTomorrow(CITY_SHUTTLE_SCHEDULE, {
      defaultType: '시내행',
      destLabel: '용인 시내',
    });
  } else {
    gi = analyzeGiheungShuttle();
    ent = analyzeSchoolDepart(ENTRANCE_SHUTTLE_SCHEDULE, {
      defaultType: '진입로',
      destLabel: '명지대역·시내',
    });
    city = analyzeSchoolDepart(CITY_SHUTTLE_SCHEDULE, {
      defaultType: '시내행',
      destLabel: '용인 시내',
    });
  }
  renderShuttleCard('shGiheung', '🚌 기흥역 통학버스', SHUTTLE_ROUTES.giheung, gi, 'giheung');
  renderShuttleCard('shEntrance', '🚏 진입로 셔틀', '학교 출발 · 명지대역·시내', ent, 'entrance');
  renderShuttleCard('shSinae', '🚍 시내 셔틀', '학교 출발 · 용인 시내', city, 'city');

  const shRes = document.getElementById('shRes');
  const shLbl = shRes?.querySelector('.slbl');
  const shGi = document.getElementById('shGiheung');
  const shEnt = document.getElementById('shEntrance');
  const shCity = document.getElementById('shSinae');
  if (shRes && shGi && shEnt && shCity) {
    const home = P.home || '';
    const order = isGiheungHome(home)
      ? [shGi, shEnt, shCity]
      : isSinaeHome(home)
        ? [shCity, shEnt, shGi]
        : [shGi, shEnt, shCity];
    if (shLbl) shRes.appendChild(shLbl);
    order.forEach((node) => shRes.appendChild(node));
  }
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
        route: getEntranceRouteForType(item.type),
      };
    });
  } else {
    const travel = CITY_SHUTTLE_SCHEDULE.travelMin;
    rows = CITY_SHUTTLE_SCHEDULE.schoolDepart.map((t) => {
      const depM = shTimeToMin(t);
      return {
        depart: t,
        arrive: shMinToStr(depM + travel),
        depM,
        arrM: depM + travel,
        sub: '시내행',
        route: SHUTTLE_ROUTES.city,
      };
    });
  }

  const routeBlock = renderShuttleRouteHtml(shModalKind);
  let display;
  if (dayMode === 'tomorrow') {
    display = rows
      .sort((a, b) => a.depM - b.depM)
      .map((r) => ({ ...r, isPast: false, isMoving: false, next: false }));
  } else {
    const sorted = [...rows].sort((a, b) => a.depM - b.depM);
    const firstUp = sorted.find((r) => r.depM > nowM && !(nowM >= r.depM && nowM < r.arrM));
    display = sorted.map((r) => ({
      ...r,
      isPast: r.arrM <= nowM,
      isMoving: nowM >= r.depM && nowM < r.arrM,
      next: firstUp ? r.depM === firstUp.depM : false,
    }));
  }

  const schedRows = display.length
    ? display
        .map((r) => {
          const left = `${r.sub ? r.sub + ' · ' : ''}${shModalKind === 'giheung' && shModalTab === 'arrive' ? r.depart + ' 기흥역' : r.depart + ' 학교'} 출발`;
          const routeLine = r.route ? `<div class="sched-route">${formatShuttleRoutePath(r.route)}</div>` : '';
          if (r.isPast) {
            return `<div class="sched-row past"><div><span>${left}</span>${routeLine}</div><span class="sh-past-lbl">지난 버스 · 도착 ${r.arrive}</span></div>`;
          }
          return `<div class="sched-row${r.next ? ' next' : ''}"><div><span>${left}</span>${routeLine}</div><span>도착 ${r.arrive}</span></div>`;
        })
        .join('')
    : `<p style="color:var(--sub);font-size:12px;padding:8px 0">${dayMode === 'tomorrow' ? '내일 운행 시간표 없음' : '오늘 남은 운행 시간이 없습니다.'}</p>`;

  const viewDowModal = dayMode === 'tomorrow' ? (getKstNow().getDay() + 1) % 7 : getKstNow().getDay();
  const weekendNote = [0, 6].includes(viewDowModal)
    ? '<p class="sh-limit" style="margin-top:0;margin-bottom:10px">주말·공휴일에는 학기중 통학버스가 운행하지 않습니다.</p>'
    : '';

  body.innerHTML =
    routeBlock +
    weekendNote +
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
    const existingClasses =
      typeof TimetableUtil !== 'undefined' ? TimetableUtil.loadUserTimetable() : [];
    const res = await fetch('/api/analyze/timetable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: imgB64, mediaType: imgMediaType, existingClasses }),
    });
    const data = await res.json();
    stopLd();
    document.getElementById('ldg').classList.remove('on');

    if (!data.ok) {
      document.getElementById('btnImg').disabled = false;
      if (data.code === 'IMAGE_TOO_LARGE') {
        showToast('이미지는 5MB 이하여야 합니다');
        return;
      }
      throw new Error(data.error || '분석 실패');
    }

    const reviewClasses = getOcrReviewClasses(data.classes);
    const reviewIssues = detectOcrReviewIssues(reviewClasses).issues;
    const reviewWarnings = reviewIssues
      .slice(0, 3)
      .map((i) => `OCR 확인: ${i.text}`);
    const reviewedData = reviewWarnings.length
      ? { ...data, warnings: [...(data.warnings || []), ...reviewWarnings] }
      : data;
    setOcrReviewState(reviewedData);
    const applied = await applyScheduleAnalysis(reviewedData, 'AI 시간표', {
      persistOcr: reviewIssues.length === 0,
    });
    openOcrReviewPanel(null, applied);
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
  const raw = String(text);
  const htmlFull = htmlWithBreaks(raw);
  let i = 0;
  el.innerHTML = '';
  const t = setInterval(() => {
    if (i < raw.length) {
      const partial = htmlWithBreaks(raw.slice(0, ++i));
      el.innerHTML = partial + '<span class="cur"></span>';
    } else {
      el.innerHTML = htmlFull;
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

  await markCurrentSessionVisited();

  if (typeof window.saveVisitToFirestore === 'function') {
    try {
      await window.saveVisitToFirestore({ ...record, uid: getOrCreateUid() });
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
  const type =
    document.querySelector('.stype.on')?.dataset?.type ||
    document.querySelector('.stype.on')?.textContent?.trim() ||
    '기타';
  const replyEmail = document.getElementById('sgEmail')?.value?.trim() || '';
  const btn = document.querySelector('#sgForm .btnm');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('/api/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ type, body, name: P.name, home: P.home, replyEmail }),
    });
    const data = await res.json();
    if (!data.ok) {
      const hint =
        data.code === 'NO_MAIL_CONFIG' || data.code === 'NO_SMTP' || data.code === 'SMTP_AUTH'
          ? ' (서버 메일 설정 필요)'
          : data.saved
            ? ' (서버에만 저장됨)'
            : '';
      throw new Error((data.error || '전송 실패') + hint);
    }
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

async function bootApp() {
  loadProfile();
  if (typeof TimetableUtil !== 'undefined' && TimetableUtil.populateBuildingSelects) {
    TimetableUtil.populateBuildingSelects();
  }
  if (typeof TimetableUtil !== 'undefined') {
    TimetableUtil.loadUserTimetable();
    if (TimetableUtil.loadClassPeriods) void TimetableUtil.loadClassPeriods();
    if (TimetableUtil.loadLectureDb) void TimetableUtil.loadLectureDb().then(() => updateSavedTimetableUi());
  }
  updateSavedTimetableUi();
  updateFoodRankLabel();
  drawShuttle();
  setInterval(drawShuttle, 60000);
  await loadMenus();
  await loadCampusSchedule();
  await tryAutoAnalyzeFromSavedTimetable();
}

async function tryAutoAnalyzeFromSavedTimetable() {
  if (typeof TimetableUtil === 'undefined' || lastData) return;
  let hasSaved = false;
  try {
    hasSaved = !!localStorage.getItem('myeong_timetable');
  } catch {
    return;
  }
  if (!hasSaved) return;
  const classes = TimetableUtil.loadUserTimetable();
  if (!classes.length) return;
  const ref = typeof KST !== 'undefined' ? KST.now() : new Date();
  const dayKey = ref.toDateString();
  if (sessionStorage.getItem('mb_auto_tt') === dayKey) return;
  sessionStorage.setItem('mb_auto_tt', dayKey);
  try {
    await doAnalyzeFromTimetable();
  } catch (e) {
    console.warn('[auto timetable]', e);
  }
}

window.MB_APP_BUILD = MB_APP_BUILD;
bootApp();
