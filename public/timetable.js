/**
 * 사용자 주간 시간표 (에브리타임 캡처 / OCR 저장분만 사용, 기본값 없음)
 */
window.USER_TIMETABLE = [];

/** 구버전에 번들된 개발자 샘플 시간표(16과목) — localStorage에 남아 있으면 제거 */
const LEGACY_DEV_SAMPLE_NAMES = [
  '환경과인간',
  '디지털논리회로',
  '전자기학',
  '회로이론',
  '채플',
  '전기회로실험1',
  'C언어',
  '디지털논리회로실험',
];

function isLegacyDevSampleTimetable(classes) {
  if (!Array.isArray(classes) || classes.length !== 16) return false;
  const names = new Set(classes.map((c) => c?.name).filter(Boolean));
  return LEGACY_DEV_SAMPLE_NAMES.every((n) => names.has(n));
}

function purgeLegacyDevSampleFromStorage() {
  try {
    localStorage.removeItem('myeong_timetable');
  } catch (e) {
    console.warn('[timetable] purge legacy sample', e);
  }
  window.USER_TIMETABLE = [];
}

/** 수동 입력·OCR 공통 캠퍼스 건물 (표시 순) */
const CAMPUS_BUILDINGS = [
  { key: '1공', label: '제1공학관' },
  { key: '2공', label: '제2공학관' },
  { key: '3공', label: '제3공학관 (Y19)' },
  { key: '5공', label: '제5공학관 (Y5)' },
  { key: '공2', label: '공학2관 (Y11)' },
  { key: '명진당', label: '명진당 (Y3)' },
  { key: '자연', label: '자연과학관 (Y7)' },
  { key: '학생', label: '학생회관 (Y21)' },
  { key: '창조', label: '창조관' },
  { key: '채플', label: '채플관' },
];

const BUILDING_LABELS = Object.fromEntries(CAMPUS_BUILDINGS.map((b) => [b.key, b.label]));

const BUILDING_ALIASES = {
  '1공': ['1공', '제1공학관', '1공학관', '제1공'],
  '2공': ['2공', '제2공학관', '2공학관', '제2공'],
  '3공': ['3공', '제3공학관', '3공학관', 'Y19'],
  '5공': ['5공', '제5공학관', '5공학관', 'Y5'],
  공2: ['공2', '공학2관', 'Y11', 'Y9'],
  명진당: ['명진당', '명진', 'Y3'],
  자연: ['자연', '자연과학관', 'Y7', 'Y25'],
  학생: ['학생', '학생회관', 'Y21', 'Y22'],
  창조: ['창조', '창조관', '창의', '혁신'],
  채플: ['채플', '채플관', '예배'],
};

const ROOM_PREFIX_MAP = [
  ['Y19', '3공'],
  ['Y22', '학생'],
  ['Y21', '학생'],
  ['Y25', '자연'],
  ['Y7', '자연'],
  ['Y11', '공2'],
  ['Y9', '공2'],
  ['Y5', '5공'],
  ['Y3', '명진당'],
  ['Y1', '1공'],
];

const DOW_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

/** JS 요일: 일=0 … 토=6 (에브리타임·AI 혼동 보정) */
function normalizeDow(raw, refDow = 1) {
  if (raw == null || raw === '') return refDow;
  if (typeof raw === 'string') {
    const s = raw.trim();
    const map = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
    if (map[s] != null) return map[s];
    const n = parseInt(s, 10);
    if (!Number.isNaN(n)) raw = n;
  }
  const d = Number(raw);
  if (Number.isNaN(d)) return refDow;
  if (d === 7) return 0;
  if (d >= 0 && d <= 6) return d;
  return refDow;
}

function t2m(t) {
  if (!t) return null;
  const m = String(t).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function m2t(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 명지대 2026-1 주간 교시 (class_periods.json과 동기) */
const DEFAULT_DAYTIME_PERIODS = [
  { period: 1, start: '09:00', end: '09:50' },
  { period: 2, start: '10:00', end: '10:50' },
  { period: 3, start: '11:00', end: '11:50' },
  { period: 4, start: '12:00', end: '12:50' },
  { period: 5, start: '13:00', end: '13:50' },
  { period: 6, start: '14:00', end: '14:50' },
  { period: 7, start: '15:00', end: '15:50' },
  { period: 8, start: '16:00', end: '16:50' },
  { period: 9, start: '17:00', end: '17:50' },
];

const VALID_PERIOD_DURATIONS = [50, 110, 170];

let _classPeriodsCache = null;
let _classPeriodsPromise = null;

function getDaytimePeriods() {
  return _classPeriodsCache?.daytime?.length ? _classPeriodsCache.daytime : DEFAULT_DAYTIME_PERIODS;
}

function loadClassPeriods() {
  if (_classPeriodsCache) return Promise.resolve(_classPeriodsCache);
  if (!_classPeriodsPromise) {
    _classPeriodsPromise = fetch('/data/class_periods.json')
      .then((res) => (res.ok ? res.json() : { daytime: DEFAULT_DAYTIME_PERIODS }))
      .then((data) => {
        _classPeriodsCache = data && typeof data === 'object' ? data : { daytime: DEFAULT_DAYTIME_PERIODS };
        return _classPeriodsCache;
      })
      .catch(() => {
        _classPeriodsCache = { daytime: DEFAULT_DAYTIME_PERIODS };
        return _classPeriodsCache;
      });
  }
  return _classPeriodsPromise;
}

function findStartPeriodIndex(timeMin, daytime) {
  for (let i = 0; i < daytime.length; i++) {
    if (t2m(daytime[i].start) === timeMin) return i;
  }
  return -1;
}

function endForSpan(startIdx, periodCount, daytime) {
  const endIdx = startIdx + periodCount - 1;
  if (endIdx < 0 || endIdx >= daytime.length) return null;
  return daytime[endIdx].end;
}

function inferPeriodCountFromEndRow(startMin, endMin, daytime) {
  const startIdx = findStartPeriodIndex(startMin, daytime);
  if (startIdx < 0) return null;

  const endMinPart = endMin % 60;
  const endHour = Math.floor(endMin / 60);

  if (endMinPart === 50) {
    for (let count = 1; count <= 3; count++) {
      const expected = endForSpan(startIdx, count, daytime);
      if (expected && t2m(expected) === endMin) return count;
    }
    return null;
  }

  if (endMinPart === 0) {
    const targetEnd = endHour * 60 + 50;
    for (let count = 1; count <= 3; count++) {
      const expected = endForSpan(startIdx, count, daytime);
      if (expected && t2m(expected) === targetEnd) return count;
    }
    const hourSpan = Math.max(1, endHour - Math.floor(startMin / 60));
    if (hourSpan <= 3) return hourSpan;
  }

  return null;
}

function normalizeEverytimeClassTimes(start, end) {
  const daytime = getDaytimePeriods();
  const durations = _classPeriodsCache?.consecutiveSpan?.durationsMin || VALID_PERIOD_DURATIONS;

  const st = t2m(start);
  let en = t2m(end);
  if (st == null || en == null || en <= st) return null;

  const startMinPart = st % 60;
  const normalizedStart = startMinPart === 0 ? st : Math.floor(st / 60) * 60;
  const startIdx = findStartPeriodIndex(normalizedStart, daytime);
  if (startIdx < 0) return null;

  let periodCount = inferPeriodCountFromEndRow(normalizedStart, en, daytime);

  if (periodCount == null) {
    const endMinPart = en % 60;
    const endHour = Math.floor(en / 60);
    if (endMinPart === 0) {
      const targetEnd = endHour * 60 + 50;
      for (let count = 1; count <= 3; count++) {
        const expected = endForSpan(startIdx, count, daytime);
        if (expected && t2m(expected) === targetEnd) {
          periodCount = count;
          break;
        }
      }
    } else if (endMinPart === 50) {
      periodCount = inferPeriodCountFromEndRow(normalizedStart, en, daytime);
    } else {
      en = endHour * 60 + 50;
      periodCount = inferPeriodCountFromEndRow(normalizedStart, en, daytime);
    }
  }

  if (periodCount == null || periodCount < 1 || periodCount > 3) return null;

  const endStr = endForSpan(startIdx, periodCount, daytime);
  if (!endStr) return null;

  const duration = t2m(endStr) - normalizedStart;
  if (!durations.includes(duration)) return null;

  return { start: m2t(normalizedStart), end: endStr };
}

function resolveRoomToBuildingKey(room, fallbackKey) {
  if (!room) return fallbackKey || null;
  const r = String(room).toUpperCase();
  for (const [prefix, key] of ROOM_PREFIX_MAP) {
    if (r.includes(prefix)) return key;
  }
  return fallbackKey || null;
}

function resolveBuildingKey(text) {
  if (!text || text === '없음' || String(text).includes('하교')) return null;
  const t = String(text);
  for (const [key, aliases] of Object.entries(BUILDING_ALIASES)) {
    if (aliases.some((a) => t.includes(a))) return key;
  }
  for (const [key, label] of Object.entries(BUILDING_LABELS)) {
    if (t.includes(key) || t.includes(label)) return key;
  }
  return resolveRoomToBuildingKey(t, null);
}

function loadUserTimetable() {
  try {
    const raw = localStorage.getItem('myeong_timetable');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        if (isLegacyDevSampleTimetable(parsed)) {
          purgeLegacyDevSampleFromStorage();
          return window.USER_TIMETABLE;
        }
        window.USER_TIMETABLE = dedupeOverlappingClasses(parsed);
        return window.USER_TIMETABLE;
      }
    }
  } catch (e) {
    console.warn('[timetable] load', e);
  }
  window.USER_TIMETABLE = [];
  return window.USER_TIMETABLE;
}

function saveUserTimetable(classes) {
  if (!Array.isArray(classes)) return;
  window.USER_TIMETABLE = dedupeOverlappingClasses(classes);
  try {
    localStorage.removeItem('myeong_timetable');
    if (classes.length) {
      localStorage.setItem('myeong_timetable', JSON.stringify(classes));
    }
  } catch (e) {
    console.warn('[timetable] save', e);
  }
  if (classes.length) void syncTimetableSession(classes);
}

/** 기존 시간표를 버리고 새 목록으로만 저장 (누적·병합 없음) */
function replaceUserTimetable(classes) {
  saveUserTimetable(classes);
}

async function syncTimetableSession(classes) {
  if (typeof window.upsertTimetableSession !== 'function') return;
  try {
    await window.upsertTimetableSession(classes);
  } catch (e) {
    console.warn('[timetable] Firestore session', e);
  }
}

function mergeTimetableClasses(existing, incoming) {
  if (!incoming?.length) return dedupeOverlappingClasses(existing || []);
  const incomingDows = new Set(incoming.map((c) => c.dow));
  const kept = (existing || []).filter((c) => !incomingDows.has(c.dow));
  return dedupeOverlappingClasses([...kept, ...incoming]);
}

function classDurationMin(c) {
  const st = t2m(c?.start);
  const en = t2m(c?.end);
  if (st == null || en == null) return 0;
  return en - st;
}

function classScore(c) {
  let score = classDurationMin(c) * 100;
  if (c?.room) score += 10;
  if (c?.name && c.name !== '수업') score += 1;
  return score;
}

function sameStart(a, b) {
  return a.dow === b.dow && t2m(a.start) === t2m(b.start);
}

function pickBetterClass(a, b) {
  return classScore(a) >= classScore(b) ? a : b;
}

function spansContain(outer, inner) {
  const os = t2m(outer.start);
  const oe = t2m(outer.end);
  const is = t2m(inner.start);
  const ie = t2m(inner.end);
  if (os == null || oe == null || is == null || ie == null) return false;
  return os <= is && oe >= ie;
}

/** 같은 요일·겹치는 시간·동일 시작 중복 제거 (긴 교시·호실 있는 쪽 우선) */
function dedupeOverlappingClasses(classes) {
  if (!Array.isArray(classes) || !classes.length) return [];
  const byDow = new Map();
  classes.forEach((c) => {
    if (c?.start == null || c.dow == null) return;
    if (!byDow.has(c.dow)) byDow.set(c.dow, []);
    byDow.get(c.dow).push(c);
  });

  const out = [];
  byDow.forEach((dayClasses) => {
    const sorted = [...dayClasses].sort(
      (a, b) => t2m(a.start) - t2m(b.start) || t2m(b.end) - t2m(a.end),
    );
    const kept = [];

    for (const c of sorted) {
      let merged = false;
      for (let i = 0; i < kept.length; i++) {
        const k = kept[i];
        if (sameStart(k, c)) {
          kept[i] = pickBetterClass(k, c);
          merged = true;
          break;
        }
        if (spansContain(c, k)) {
          kept[i] = pickBetterClass(k, c);
          merged = true;
          break;
        }
        if (spansContain(k, c)) {
          merged = true;
          break;
        }
      }
      if (!merged) kept.push(c);
    }

    kept.sort((a, b) => t2m(a.start) - t2m(b.start));
    out.push(...kept);
  });

  return out.sort((a, b) => a.dow - b.dow || t2m(a.start) - t2m(b.start));
}

function normalizeClass(raw) {
  if (!raw) return null;
  const room = raw.room || raw.호실 || raw.Room || '';
  const buildingKey =
    raw.buildingKey ||
    raw.건물키 ||
    resolveBuildingKey(raw.현재건물키) ||
    resolveRoomToBuildingKey(room, null) ||
    resolveBuildingKey(raw.building);
  const startRaw = raw.start || raw.시작 || raw.startTime;
  const endRaw = raw.end || raw.종료 || raw.endTime;
  if (!startRaw || !endRaw) return null;
  const times = normalizeEverytimeClassTimes(startRaw, endRaw);
  if (!times) return null;
  const refDow = typeof KST !== 'undefined' ? KST.now().getDay() : new Date().getDay();
  const dow = normalizeDow(raw.dow != null ? raw.dow : raw.요일, refDow);
  const key = buildingKey && BUILDING_LABELS[buildingKey] ? buildingKey : resolveBuildingKey(buildingKey) || '3공';
  return {
    dow,
    start: times.start,
    end: times.end,
    name: raw.name || raw.과목 || raw.subject || '수업',
    room: room || '',
    buildingKey: key,
    teacher: raw.teacher || raw.교수 || '',
  };
}

function normalizeClassesFromAi(list, refDow) {
  if (!Array.isArray(list)) return [];
  const normalized = list
    .map((raw) => {
      const c = normalizeClass(raw);
      if (!c) return null;
      c.dow = normalizeDow(c.dow, refDow);
      return c;
    })
    .filter(Boolean);
  return dedupeOverlappingClasses(normalized);
}

function analyzeFromClasses(classes, refDate = null) {
  refDate = refDate || (typeof KST !== 'undefined' ? KST.now() : new Date());
  classes = dedupeOverlappingClasses(classes || []);
  const dow = refDate.getDay();
  const noSchool =
    typeof SchoolCalendar !== 'undefined' && SchoolCalendar.isNoSchoolDay
      ? SchoolCalendar.isNoSchoolDay(refDate)
      : dow === 0 || dow === 6;
  const nowMin = refDate.getHours() * 60 + refDate.getMinutes();
  const today = noSchool ? [] : classes.filter((c) => c.dow === dow).sort((a, b) => t2m(a.start) - t2m(b.start));

  let inClass = null;
  let lastEnded = null;

  for (const c of today) {
    const st = t2m(c.start);
    const en = t2m(c.end);
    if (st == null || en == null) continue;
    if (nowMin >= st && nowMin < en) {
      if (!inClass || classDurationMin(c) > classDurationMin(inClass)) inClass = c;
    }
    if (en <= nowMin && (!lastEnded || en > t2m(lastEnded.end))) lastEnded = c;
  }

  const cutoff = inClass ? t2m(inClass.end) : nowMin;
  let nextClass = null;
  for (const c of today) {
    if (c === inClass) continue;
    const st = t2m(c.start);
    if (st == null) continue;
    if (st >= cutoff && !nextClass) nextClass = c;
  }

  const anchor = inClass || lastEnded;
  const curKey = anchorKey(anchor, today);

  let gapFrom = nowMin;
  if (inClass) gapFrom = t2m(inClass.end);
  else if (lastEnded) gapFrom = Math.max(nowMin, t2m(lastEnded.end));

  let gapMin = 0;
  if (nextClass) {
    gapMin = Math.max(0, t2m(nextClass.start) - gapFrom);
  } else if (noSchool || !today.length) {
    gapMin = 240;
  } else if (lastEnded || inClass) {
    gapMin = Math.max(90, 17 * 60 - gapFrom);
  } else if (today.length) {
    gapMin = Math.max(0, t2m(today[0].start) - nowMin);
  } else {
    gapMin = 75;
  }

  const curTxt = inClass
    ? `${inClass.name} 수업 중 (${inClass.room || BUILDING_LABELS[curKey]})`
    : lastEnded
      ? `${lastEnded.name} 방금 종료 (${lastEnded.room || BUILDING_LABELS[curKey]})`
      : today.length
        ? `다음 수업 전 · ${BUILDING_LABELS[curKey]}`
        : noSchool
          ? typeof SchoolCalendar !== 'undefined' && SchoolCalendar.isHoliday(refDate)
            ? '공휴일 (무수업)'
            : '주말 (무수업)'
          : '캠퍼스';

  const nextTxt = formatNextClassTxt({ nextClass, inClass, noSchool, today });

  const mealIntent =
    typeof MealEngine !== 'undefined' ? MealEngine.computeMealIntent(gapMin, refDate) : { period: 'lunch' };

  return {
    curKey,
    curTxt,
    nextKey: nextClass?.buildingKey || 'none',
    nextTxt,
    gapMin,
    mealIntent,
    inClass,
    lastEnded,
    nextClass,
    today,
    noSchool,
    timeline: buildTodayTimeline(today, nowMin),
    gapSource: 'classes',
  };
}

function anchorKey(anchor, today) {
  return anchor?.buildingKey || today[0]?.buildingKey || '3공';
}

function formatNextClassTxt(snap) {
  if (snap.nextClass) {
    const nc = snap.nextClass;
    const bk = nc.buildingKey;
    return `${nc.name} (${nc.room || BUILDING_LABELS[bk] || bk}) ${nc.start}~${nc.end}`;
  }
  if (snap.inClass) {
    return `없음 (${snap.inClass.end} 종료 후 하교)`;
  }
  if (snap.noSchool || !snap.today?.length) {
    return '없음 (하교·자유)';
  }
  return '없음 (하교)';
}

function buildTodayTimeline(today, nowMin) {
  return today.map((c) => {
    const st = t2m(c.start);
    const en = t2m(c.end);
    let state = 'upcoming';
    if (nowMin >= st && nowMin < en) state = 'now';
    else if (en <= nowMin) state = 'done';
    return { ...c, state, label: BUILDING_LABELS[c.buildingKey] || c.buildingKey };
  });
}

function summarizeByDow(classes) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  classes.forEach((c) => {
    if (c.dow >= 0 && c.dow <= 6) counts[c.dow]++;
  });
  return counts;
}

function formatWeeklyDowLine(classes) {
  const counts = summarizeByDow(classes);
  const parts = [];
  for (let d = 1; d <= 5; d++) {
    if (counts[d]) parts.push(`${DOW_NAMES[d]} ${counts[d]}과목`);
  }
  if (counts[6]) parts.push(`${DOW_NAMES[6]} ${counts[6]}과목`);
  if (counts[0]) parts.push(`${DOW_NAMES[0]} ${counts[0]}과목`);
  return parts.length ? parts.join(' · ') : '';
}

/* ── 공식 강의시간표 DB 매칭 (lecture_db.json) ── */
let _lectureDbCache = null;
let _lectureDbPromise = null;

function normLectureTime(t) {
  if (!t) return null;
  const m = String(t).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return `${String(parseInt(m[1], 10)).padStart(2, '0')}:${m[2]}`;
}

function normLectureRoom(r) {
  if (!r) return '';
  return String(r).toUpperCase().replace(/[\s-]/g, '');
}

function normalizeLectureDbEntry(raw, refDow = 1) {
  const room = raw.강의실 || raw.room || '';
  const buildingRaw = raw.건물 || raw.building || '';
  const buildingKey =
    resolveBuildingKey(buildingRaw) ||
    resolveRoomToBuildingKey(room, null) ||
    resolveBuildingKey(raw.buildingKey);
  return {
    name: (raw.교과목명 || raw.name || raw.subject || '').trim(),
    room,
    buildingKey,
    dow: normalizeDow(raw.요일 ?? raw.dow, refDow),
    start: normLectureTime(raw.시작시간 || raw.start || raw.startTime),
    end: normLectureTime(raw.종료시간 || raw.end || raw.endTime),
  };
}

function getLectureDbList(db) {
  if (!db) return [];
  if (Array.isArray(db.lectures)) return db.lectures;
  if (Array.isArray(db)) return db;
  return [];
}

function findLectureNameForClass(cls, db, refDow = 1) {
  const list = getLectureDbList(db);
  if (!cls || !list.length) return null;

  const clsStart = normLectureTime(cls.start);
  const clsEnd = normLectureTime(cls.end);
  if (!clsStart || !clsEnd || cls.dow == null) return null;

  const entries = list
    .map((e) => normalizeLectureDbEntry(e, refDow))
    .filter((e) => e.name && e.start && e.end && e.buildingKey);

  let candidates = entries.filter(
    (e) =>
      e.dow === cls.dow &&
      e.start === clsStart &&
      e.end === clsEnd &&
      e.buildingKey === cls.buildingKey,
  );

  if (!candidates.length) return null;

  const clsDur = t2m(cls.end) - t2m(cls.start);
  candidates = candidates.filter((e) => {
    const eDur = t2m(e.end) - t2m(e.start);
    return e.end === clsEnd || eDur === clsDur;
  });
  if (!candidates.length) return null;

  if (candidates.length === 1) return candidates[0].name;

  const clsRoom = normLectureRoom(cls.room);
  if (clsRoom) {
    const roomHit = candidates.find((e) => {
      const er = normLectureRoom(e.room);
      return er && (er.includes(clsRoom) || clsRoom.includes(er));
    });
    if (roomHit) return roomHit.name;
  }

  return candidates[0].name;
}

/** 매칭 성공 시에만 name 갱신 (기존 class 필드 구조 유지) */
function enrichClassesWithLectureDb(classes, db, refDow = 1) {
  if (!db || !classes?.length) return classes;
  return classes.map((cls) => {
    const matched = findLectureNameForClass(cls, db, refDow);
    return matched ? { ...cls, name: matched } : cls;
  });
}

/** "제3공학관 (자료구조)" — 매칭 없으면 건물명만 */
function resolveCurrentLocationTxt(snapshot, db, refDow = 1) {
  const label = BUILDING_LABELS[snapshot.curKey] || snapshot.curKey || '';
  const anchor = snapshot.inClass || snapshot.lastEnded;
  if (!anchor || !label) return label;
  const courseName = findLectureNameForClass(anchor, db, refDow);
  return courseName ? `${label} (${courseName})` : label;
}

function loadLectureDb() {
  if (_lectureDbCache) return Promise.resolve(_lectureDbCache);
  if (!_lectureDbPromise) {
    _lectureDbPromise = fetch('/data/lecture_db.json')
      .then((res) => (res.ok ? res.json() : { lectures: [] }))
      .then((data) => {
        _lectureDbCache = data && typeof data === 'object' ? data : { lectures: [] };
        return _lectureDbCache;
      })
      .catch((e) => {
        console.warn('[lecture_db]', e);
        _lectureDbCache = { lectures: [] };
        return _lectureDbCache;
      });
  }
  return _lectureDbPromise;
}

function getLectureDbSync() {
  return _lectureDbCache;
}

function formatGapDetail(snap, refDate = null) {
  refDate = refDate || (typeof KST !== 'undefined' ? KST.now() : new Date());
  const dowLabel = DOW_NAMES[refDate.getDay()];
  const today = snap.today || [];
  if (snap.noSchool) {
    return typeof SchoolCalendar !== 'undefined' && SchoolCalendar.isHoliday(refDate)
      ? `${dowLabel}요일 · 공휴일 (학교 휴무)`
      : `${dowLabel}요일 · 주말 (학교 휴무)`;
  }
  if (!today.length) return `${dowLabel}요일 수업 없음`;

  if (snap.inClass) {
    const en = snap.inClass.end;
    if (snap.nextClass) {
      return `${dowLabel}요일 · ${snap.inClass.start}~${en} 수업 중 → ${en} 이후 ${snap.nextClass.start}까지 ${snap.gapMin}분 공강`;
    }
    return `${dowLabel}요일 · ${snap.inClass.start}~${en} 수업 중 → ${en} 종료 후 하교 (${snap.gapMin}분 여유)`;
  }
  if (snap.nextClass) {
    const from = snap.lastEnded ? snap.lastEnded.end : '지금';
    return `${dowLabel}요일 · ${from}~${snap.nextClass.start} 공강 ${snap.gapMin}분 (다음: ${snap.nextClass.name})`;
  }
  if (snap.lastEnded) {
    return `${dowLabel}요일 · ${snap.lastEnded.name} 종료(${snap.lastEnded.end}) 후 하교·자유 ${snap.gapMin}분`;
  }
  const first = today[0];
  return `${dowLabel}요일 · 첫 수업 ${first.start} 전 ${snap.gapMin}분`;
}

function populateBuildingSelects() {
  const buildings = [
    { value: '3공', label: '제3공학관 (Y19)' },
    { value: '1공', label: '제1공학관 (Y12)' },
    { value: '창조관', label: '창조관 (Y25)' },
    { value: '5공', label: '제5공학관 (Y5)' },
    { value: '공2', label: '공학2관 (Y11)' },
    { value: '자연', label: '자연과학관 (Y9)' },
    { value: '명진당', label: '명진당 (Y2)' },
    { value: '학생', label: '학생회관 (Y21)' },
    { value: '채플관', label: '채플관 (Y22)' },
  ];
  const noneOpt = '<option value="none">없음 (하교)</option>';
  const opts = buildings.map((b) => `<option value="${b.value}">${b.label}</option>`).join('');
  const mCur = document.getElementById('mCur');
  const mNext = document.getElementById('mNext');
  if (mCur) mCur.innerHTML = opts;
  if (mNext) mNext.innerHTML = noneOpt + opts;
}

window.TimetableUtil = {
  CAMPUS_BUILDINGS,
  BUILDING_LABELS,
  BUILDING_ALIASES,
  DOW_NAMES,
  normalizeDow,
  summarizeByDow,
  formatWeeklyDowLine,
  formatGapDetail,
  populateBuildingSelects,
  ROOM_PREFIX_MAP,
  loadUserTimetable,
  saveUserTimetable,
  replaceUserTimetable,
  mergeTimetableClasses,
  dedupeOverlappingClasses,
  normalizeClass,
  normalizeClassesFromAi,
  resolveRoomToBuildingKey,
  resolveBuildingKey,
  analyzeFromClasses,

  loadLectureDb,
  loadClassPeriods,
  getDaytimePeriods,
  getLectureDbSync,
  findLectureNameForClass,
  enrichClassesWithLectureDb,
  resolveCurrentLocationTxt,

  formatNextClassTxt,

  analyzeNow(classes = null, refDate = null) {
    const list = classes || loadUserTimetable();
    return analyzeFromClasses(list, refDate);
  },

  formatGapText(gapMin) {
    if (gapMin >= 120) return `${gapMin}분 (2시간 이상)`;
    if (gapMin >= 90) return `${gapMin}분 (1시간 30분)`;
    if (gapMin >= 60) return `${gapMin}분 (1시간+)`;
    if (gapMin >= 45) return `${gapMin}분`;
    return `${gapMin}분 (짧음)`;
  },

  suggestGapOptionValue(gapMin) {
    if (gapMin >= 120) return '120';
    if (gapMin >= 75) return '75';
    return '45';
  },
};
