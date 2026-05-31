import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_DAYTIME = [
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

const VALID_DURATIONS = [50, 95, 110, 145, 170, 230, 290, 350, 410];

let periodsCache = null;

export function loadClassPeriods() {
  if (periodsCache) return periodsCache;
  const paths = [
    join(__dirname, '../data/class_periods.json'),
    join(__dirname, '../../public/data/class_periods.json'),
  ];
  for (const p of paths) {
    try {
      periodsCache = JSON.parse(readFileSync(p, 'utf8'));
      return periodsCache;
    } catch {
      /* try next */
    }
  }
  periodsCache = { daytime: DEFAULT_DAYTIME, consecutiveSpan: { durationsMin: VALID_DURATIONS } };
  return periodsCache;
}

export function getDaytimePeriods(config = loadClassPeriods()) {
  return Array.isArray(config?.daytime) && config.daytime.length ? config.daytime : DEFAULT_DAYTIME;
}

export function formatPeriodTableForPrompt(config = loadClassPeriods()) {
  const daytime = getDaytimePeriods(config);
  const lines = daytime.map((p) => `   ${p.period}교시: ${p.start}~${p.end}`);
  const examples = [
    '   연속 예 — 2교시+3교시 → 10:00~11:50',
    '   연속 예 — 6교시(14:00)+7교시 → 14:00~15:50',
    '   연속 예 — 6~8교시 3연속 → 14:00~16:50',
  ];
  return [...lines, ...examples].join('\n');
}

function timeToMin(t) {
  if (!t) return null;
  const m = String(t).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function minToTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function findStartPeriodIndex(timeMin, daytime) {
  for (let i = 0; i < daytime.length; i++) {
    if (timeToMin(daytime[i].start) === timeMin) return i;
  }
  return -1;
}

function endForSpan(startIdx, periodCount, daytime) {
  const endIdx = startIdx + periodCount - 1;
  if (endIdx < 0 || endIdx >= daytime.length) return null;
  return daytime[endIdx].end;
}

function inferPeriodCountFromEndRow(startMin, endMin, daytime) {
  const maxPeriods = periodsCache?.consecutiveSpan?.maxDaytimePeriods ?? 8;
  const startIdx = findStartPeriodIndex(startMin, daytime);
  if (startIdx < 0) return null;

  const endMinPart = endMin % 60;
  const endHour = Math.floor(endMin / 60);

  if (endMinPart === 50) {
    for (let count = 1; count <= maxPeriods; count++) {
      const expected = endForSpan(startIdx, count, daytime);
      if (expected && timeToMin(expected) === endMin) return count;
    }
    return null;
  }

  if (endMinPart === 0) {
    const targetEnd = endHour * 60 + 50;
    for (let count = 1; count <= maxPeriods; count++) {
      const expected = endForSpan(startIdx, count, daytime);
      if (expected && timeToMin(expected) === targetEnd) return count;
    }
    const hourSpan = Math.max(1, endHour - Math.floor(startMin / 60));
    if (hourSpan <= maxPeriods) return hourSpan;
  }

  return null;
}

/** 명지대 주간 교시표 기준 — 09~17시 정시 시작, :50 종료, 1~3교시 연속 */
export function normalizeEverytimeClassTimes(start, end, config = loadClassPeriods()) {
  const daytime = getDaytimePeriods(config);
  const durations = config?.consecutiveSpan?.durationsMin || VALID_DURATIONS;
  const maxPeriods = config?.consecutiveSpan?.maxDaytimePeriods ?? 8;

  const st = timeToMin(start);
  let en = timeToMin(end);
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
      for (let count = 1; count <= maxPeriods; count++) {
        const expected = endForSpan(startIdx, count, daytime);
        if (expected && timeToMin(expected) === targetEnd) {
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

  if (periodCount == null || periodCount < 1 || periodCount > maxPeriods) return null;

  const endStr = endForSpan(startIdx, periodCount, daytime);
  if (!endStr) return null;

  const duration = timeToMin(endStr) - normalizedStart;
  if (!durations.includes(duration)) return null;

  return fixCommonMisreadStart({ start: minToTime(normalizedStart), end: endStr }, daytime);
}

function fixCommonMisreadStart(times) {
  return times;
}
