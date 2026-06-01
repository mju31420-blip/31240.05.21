import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { BUILDING_KEYS } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ROOM_PREFIX_MAP = [
  ['Y86', '2공'],
  ['Y85', '2공'],
  ['Y83', '2공'],
  ['Y81', '2공'],
  ['Y71', '체육관'],
  ['Y64', '체육문화관'],
  ['Y63', '체육문화관'],
  ['Y62', '체육문화관'],
  ['Y61', '체육문화관'],
  ['Y27', '창조'],
  ['Y25', '창조'],
  ['Y24', '하이브리드구조실험센터'],
  ['Y23', '차세대과학관'],
  ['Y22', '채플'],
  ['Y21', '학생'],
  ['Y20', '건축도시설계원'],
  ['Y19', '3공'],
  ['Y17', '산업협력관'],
  ['Y13', '제4공학관'],
  ['Y12', '디자인조형센터'],
  ['Y11', '학군단'],
  ['Y9', '자연'],
  ['Y7', '자연'],
  ['Y5', '5공'],
  ['Y3', '명진당'],
  ['Y1', '1공'],
];

let lectureDbCache = null;

export function resolveBuildingKey(text) {
  if (!text || text === '없음' || String(text).includes('하교')) return null;
  const t = String(text);
  const roomKey = resolveRoomToBuildingKey(t, null);
  if (roomKey) return roomKey;
  for (const [key, aliases] of Object.entries(BUILDING_KEYS)) {
    if (aliases.some((a) => t.includes(a))) return key;
  }
  return null;
}

function resolveRoomToBuildingKey(room, fallbackKey) {
  if (!room) return fallbackKey || null;
  const r = String(room).toUpperCase();
  for (const [prefix, key] of ROOM_PREFIX_MAP) {
    if (r.includes(prefix)) return key;
  }
  return fallbackKey || null;
}

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

function normTime(t) {
  if (!t) return null;
  const m = String(t).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return `${String(parseInt(m[1], 10)).padStart(2, '0')}:${m[2]}`;
}

function normRoom(r) {
  if (!r) return '';
  return String(r).toUpperCase().replace(/[\s-]/g, '');
}

export function normalizeLectureEntry(raw, refDow = 1) {
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
    start: normTime(raw.시작시간 || raw.start || raw.startTime),
    end: normTime(raw.종료시간 || raw.end || raw.endTime),
  };
}

export function getLectureList(db) {
  if (!db) return [];
  if (Array.isArray(db.lectures)) return db.lectures;
  if (Array.isArray(db)) return db;
  return [];
}

/** OCR·시간표 수업과 공식 강의 DB 매칭 — 요일·시작·종료·건물키 기준 */
export function findLectureNameForClass(cls, db, refDow = 1) {
  const list = getLectureList(db);
  if (!cls || !list.length) return null;

  const clsStart = normTime(cls.start);
  const clsEnd = normTime(cls.end);
  if (!clsStart || !clsEnd || cls.dow == null) return null;

  const entries = list
    .map((e) => normalizeLectureEntry(e, refDow))
    .filter((e) => e.name && e.start && e.end && e.buildingKey);

  let candidates = entries.filter(
    (e) =>
      e.dow === cls.dow &&
      e.start === clsStart &&
      e.end === clsEnd &&
      e.buildingKey === cls.buildingKey,
  );

  if (!candidates.length) {
    candidates = entries.filter(
      (e) => e.dow === cls.dow && e.start === clsStart && e.buildingKey === cls.buildingKey,
    );
  }

  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0].name;

  const clsRoom = normRoom(cls.room);
  if (clsRoom) {
    const roomHit = candidates.find((e) => {
      const er = normRoom(e.room);
      return er && (er.includes(clsRoom) || clsRoom.includes(er));
    });
    if (roomHit) return roomHit.name;
  }

  return candidates[0].name;
}

export function loadLectureDb() {
  if (lectureDbCache) return lectureDbCache;
  const paths = [
    join(__dirname, '../data/lecture_db.json'),
    join(__dirname, '../../public/data/lecture_db.json'),
  ];
  for (const p of paths) {
    try {
      lectureDbCache = JSON.parse(readFileSync(p, 'utf8'));
      return lectureDbCache;
    } catch {
      /* try next path */
    }
  }
  lectureDbCache = { lectures: [] };
  return lectureDbCache;
}

/** 분석 스냅샷 → "제3공학관 (자료구조)" 형식 (매칭 실패 시 건물명만) */
export function resolveCurrentLocationTxt(snapshot, db, buildingLabels, refDow = 1) {
  const label = buildingLabels[snapshot.curKey] || snapshot.curKey || '';
  const anchor = snapshot.inClass || snapshot.lastEnded;
  if (!anchor || !label) return label;
  const courseName = findLectureNameForClass(anchor, db, refDow);
  return courseName ? `${label} (${courseName})` : label;
}
