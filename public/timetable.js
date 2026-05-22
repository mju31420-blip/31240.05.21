/**
 * 사용자 주간 시간표 (에브리타임 캡처 / OCR / 수동 저장)
 * 호실 → 건물키: Y19→3공, Y22→학생, Y25→자연, Y9/Y11→공2
 */
window.USER_TIMETABLE = [
  { dow: 1, start: '09:00', end: '10:30', name: '환경과인간', room: 'Y2532', buildingKey: '자연', teacher: '조성경' },
  { dow: 1, start: '13:00', end: '14:30', name: '디지털논리회로', room: 'Y19221', buildingKey: '3공', teacher: '남순열' },
  { dow: 1, start: '14:30', end: '16:00', name: '전자기학', room: 'Y19127', buildingKey: '3공', teacher: '정의훈' },

  { dow: 2, start: '10:00', end: '11:30', name: '회로이론', room: 'Y19116', buildingKey: '3공', teacher: '강상희' },
  { dow: 2, start: '12:00', end: '13:00', name: '채플', room: 'Y22217', buildingKey: '학생', teacher: '교목실' },
  { dow: 2, start: '14:00', end: '16:00', name: '전기회로실험1', room: 'Y19319', buildingKey: '3공', teacher: '심재륜' },

  { dow: 3, start: '09:00', end: '10:30', name: '환경과인간', room: 'Y2532', buildingKey: '자연', teacher: '조성경' },
  { dow: 3, start: '11:00', end: '12:30', name: '디지털논리회로', room: 'Y19221', buildingKey: '3공', teacher: '남순열' },
  { dow: 3, start: '13:00', end: '14:00', name: '전자기학', room: 'Y19127', buildingKey: '3공', teacher: '정의훈' },
  { dow: 3, start: '14:00', end: '16:30', name: 'C언어', room: 'Y9119', buildingKey: '공2', teacher: '미배정' },

  { dow: 4, start: '10:00', end: '12:00', name: '회로이론', room: 'Y19116', buildingKey: '3공', teacher: '강상희' },
  { dow: 4, start: '13:00', end: '15:00', name: '디지털논리회로실험', room: 'Y19319', buildingKey: '3공', teacher: '김태완' },
];

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
];

const BUILDING_LABELS = {
  '3공': '제3공학관 (Y19)',
  '5공': '제5공학관 (Y5)',
  명진당: '명진당 (Y3)',
  공2: '공학2관 (Y11)',
  자연: '자연과학관 (Y7)',
  학생: '학생회관 (Y21)',
};

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
  for (const [key, label] of Object.entries(BUILDING_LABELS)) {
    if (t.includes(key) || label.includes(t)) return key;
  }
  return resolveRoomToBuildingKey(t, null);
}

function loadUserTimetable() {
  try {
    const raw = localStorage.getItem('myeong_timetable');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        window.USER_TIMETABLE = parsed;
        return parsed;
      }
    }
  } catch (e) {
    console.warn('[timetable] load', e);
  }
  return window.USER_TIMETABLE;
}

function saveUserTimetable(classes) {
  if (!Array.isArray(classes) || !classes.length) return;
  window.USER_TIMETABLE = classes;
  try {
    localStorage.setItem('myeong_timetable', JSON.stringify(classes));
  } catch (e) {
    console.warn('[timetable] save', e);
  }
}

function mergeTimetableClasses(existing, incoming) {
  const map = new Map();
  [...existing, ...incoming].forEach((c) => {
    if (!c?.start || c.dow == null) return;
    const key = `${c.dow}|${c.start}|${c.name || ''}|${c.room || ''}`;
    map.set(key, c);
  });
  return [...map.values()].sort((a, b) => a.dow - b.dow || t2m(a.start) - t2m(b.start));
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
  const start = raw.start || raw.시작 || raw.startTime;
  const end = raw.end || raw.종료 || raw.endTime;
  if (!start || !end) return null;
  const refDow = typeof KST !== 'undefined' ? KST.now().getDay() : new Date().getDay();
  const dow = normalizeDow(raw.dow != null ? raw.dow : raw.요일, refDow);
  return {
    dow,
    start: String(start).slice(0, 5),
    end: String(end).slice(0, 5),
    name: raw.name || raw.과목 || raw.subject || '수업',
    room: room || '',
    buildingKey: buildingKey || '3공',
    teacher: raw.teacher || raw.교수 || '',
  };
}

function normalizeClassesFromAi(list, refDow) {
  if (!Array.isArray(list)) return [];
  return list
    .map((raw) => {
      const c = normalizeClass(raw);
      if (!c) return null;
      c.dow = normalizeDow(c.dow, refDow);
      return c;
    })
    .filter(Boolean);
}

function analyzeFromClasses(classes, refDate = null) {
  refDate = refDate || (typeof KST !== 'undefined' ? KST.now() : new Date());
  const dow = refDate.getDay();
  const noSchool =
    typeof SchoolCalendar !== 'undefined' && SchoolCalendar.isNoSchoolDay
      ? SchoolCalendar.isNoSchoolDay(refDate)
      : dow === 0 || dow === 6;
  const nowMin = refDate.getHours() * 60 + refDate.getMinutes();
  const today = noSchool ? [] : classes.filter((c) => c.dow === dow).sort((a, b) => t2m(a.start) - t2m(b.start));

  let inClass = null;
  let lastEnded = null;
  let nextClass = null;

  for (const c of today) {
    const st = t2m(c.start);
    const en = t2m(c.end);
    if (st == null || en == null) continue;
    if (nowMin >= st && nowMin < en) inClass = c;
    if (en <= nowMin) lastEnded = c;
    if (st > nowMin && !nextClass) nextClass = c;
  }

  const anchor = inClass || lastEnded;
  const curKey = anchor?.buildingKey || today[0]?.buildingKey || '3공';

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

  const nextTxt = nextClass
    ? `${nextClass.name} (${nextClass.room || BUILDING_LABELS[nextClass.buildingKey]}) ${nextClass.start}~${nextClass.end}`
    : noSchool || !today.length
      ? '없음 (하교·자유)'
      : '없음 (하교)';

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
    timeline: buildTodayTimeline(today, nowMin),
    gapSource: 'classes',
  };
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
    if (counts[d]) parts.push(`${DOW_NAMES[d]} ${counts[d]}`);
  }
  if (counts[6]) parts.push(`${DOW_NAMES[6]} ${counts[6]}`);
  if (counts[0]) parts.push(`${DOW_NAMES[0]} ${counts[0]}`);
  return parts.length ? `주간: ${parts.join(' · ')}` : '';
}

function formatGapDetail(snap, refDate = null) {
  refDate = refDate || (typeof KST !== 'undefined' ? KST.now() : new Date());
  const dowLabel = DOW_NAMES[refDate.getDay()];
  const today = snap.today || [];
  if (!today.length) return `${dowLabel}요일 — 등록된 수업 없음`;

  if (snap.inClass) {
    const en = snap.inClass.end;
    const nx = snap.nextClass ? ` → 다음 ${snap.nextClass.start} (${snap.gapMin}분 공강)` : ` → 하교 (${snap.gapMin}분)`;
    return `${dowLabel}요일 · ${snap.inClass.start}~${en} 수업 중${nx}`;
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

window.TimetableUtil = {
  BUILDING_LABELS,
  DOW_NAMES,
  normalizeDow,
  summarizeByDow,
  formatWeeklyDowLine,
  formatGapDetail,
  ROOM_PREFIX_MAP,
  loadUserTimetable,
  saveUserTimetable,
  mergeTimetableClasses,
  normalizeClass,
  normalizeClassesFromAi,
  resolveRoomToBuildingKey,
  resolveBuildingKey,
  analyzeFromClasses,

  /** 지금 시각 기준 상태 (저장된 시간표 우선) */
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
