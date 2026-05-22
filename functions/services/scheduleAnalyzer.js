import Anthropic from '@anthropic-ai/sdk';
import { BUILDING_KEYS, BUILDING_LABELS } from '../config.js';
import { computeMealIntent } from './mealIntent.js';

const clientCache = new Map();

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

const BUILDING_KEYS_LIST = Object.keys(BUILDING_LABELS).join('|');

function getClient(apiKey) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  if (!clientCache.has(key)) clientCache.set(key, new Anthropic({ apiKey: key }));
  return clientCache.get(key);
}

function kstNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
}

export function resolveBuildingKey(text) {
  if (!text || text === '없음' || String(text).includes('하교')) return null;
  const t = String(text);
  for (const [key, aliases] of Object.entries(BUILDING_KEYS)) {
    if (aliases.some((a) => t.includes(a))) return key;
  }
  for (const [prefix, key] of ROOM_PREFIX_MAP) {
    if (t.toUpperCase().includes(prefix)) return key;
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

function normalizeDow(raw, refDow) {
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

function timeToMin(t) {
  if (!t) return null;
  const m = String(t).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function normalizeClass(raw, refDow) {
  if (!raw) return null;
  const room = raw.room || raw.호실 || '';
  const buildingKey =
    raw.buildingKey ||
    raw.건물키 ||
    resolveBuildingKey(raw.현재건물키) ||
    resolveRoomToBuildingKey(room, null) ||
    resolveBuildingKey(raw.building);
  const start = raw.start || raw.시작;
  const end = raw.end || raw.종료;
  if (!start || !end) return null;
  const dow = normalizeDow(raw.dow != null ? raw.dow : raw.요일, refDow);
  const key = buildingKey && BUILDING_LABELS[buildingKey] ? buildingKey : '3공';
  return {
    dow,
    start: String(start).slice(0, 5),
    end: String(end).slice(0, 5),
    name: raw.name || raw.과목 || '수업',
    room: room || '',
    buildingKey: key,
    teacher: raw.teacher || raw.교수 || '',
  };
}

function analyzeFromClasses(classes, refDate) {
  const dow = refDate.getDay();
  const noSchool = dow === 0 || dow === 6;
  const nowMin = refDate.getHours() * 60 + refDate.getMinutes();
  const today = noSchool ? [] : classes.filter((c) => c.dow === dow).sort((a, b) => timeToMin(a.start) - timeToMin(b.start));

  let inClass = null;
  let lastEnded = null;
  let nextClass = null;

  for (const c of today) {
    const st = timeToMin(c.start);
    const en = timeToMin(c.end);
    if (st == null || en == null) continue;
    if (nowMin >= st && nowMin < en) inClass = c;
    if (en <= nowMin) lastEnded = c;
    if (st > nowMin && !nextClass) nextClass = c;
  }

  const anchor = inClass || lastEnded;
  const curKey = anchor?.buildingKey || today[0]?.buildingKey || '3공';

  let gapFrom = nowMin;
  if (inClass) gapFrom = timeToMin(inClass.end);
  else if (lastEnded) gapFrom = Math.max(nowMin, timeToMin(lastEnded.end));

  let gapMin = 0;
  if (nextClass) gapMin = Math.max(0, timeToMin(nextClass.start) - gapFrom);
  else if (noSchool || !today.length) gapMin = 240;
  else if (lastEnded || inClass) gapMin = Math.max(90, 17 * 60 - gapFrom);
  else gapMin = 75;

  const curTxt = inClass
    ? `${inClass.name} 수업 중 (${inClass.room || BUILDING_LABELS[curKey]})`
    : lastEnded
      ? `${lastEnded.name} 방금 종료 (${lastEnded.room || BUILDING_LABELS[curKey]})`
      : BUILDING_LABELS[curKey] || curKey;

  const nextKey = nextClass?.buildingKey || null;
  const nextTxt = nextClass
    ? `${nextClass.name} (${nextClass.room || BUILDING_LABELS[nextKey]}) ${nextClass.start}~${nextClass.end}`
    : '없음 (하교)';

  return { curKey, curTxt, nextKey, nextTxt, gapMin, inClass, lastEnded, nextClass, today };
}

function refineFromParsed(parsed, refDate) {
  const refDow = refDate.getDay();
  const classes = (parsed.수업 || parsed.classes || [])
    .map((c) => normalizeClass(c, refDow))
    .filter(Boolean);

  if (!classes.length) {
    return {
      curKey: '3공',
      curTxt: '캠퍼스',
      nextKey: 'none',
      nextTxt: '없음 (하교)',
      gapMin: 75,
      classes: [],
      warnings: ['시간표에서 수업 시간을 읽지 못했습니다. 이미지를 다시 촬영해 주세요.'],
      gapSource: 'no_classes',
      today: [],
    };
  }

  const computed = analyzeFromClasses(classes, refDate);
  return {
    ...computed,
    nextKey: computed.nextKey || 'none',
    classes,
    warnings: [],
    gapSource: 'timetable_classes',
  };
}

const SCHEMA_HINT = `{
  "수업":[
    {"dow":1,"start":"09:00","end":"10:30","room":"Y19221","buildingKey":"3공","name":"과목명"}
  ]
}`;

const ROOM_GUIDE = `호실→buildingKey: Y1→1공, Y19→3공, Y5→5공, Y3→명진당, Y9/Y11→공2, Y7/Y25→자연, Y21/Y22→학생, 채플→채플, 창조→창조.
buildingKey 허용: ${BUILDING_KEYS_LIST}.
에브리타임 열 dow: 월=1, 화=2, 수=3, 목=4, 금=5, 토=6, 일=0.`;

export async function analyzeTimetableImage({ imageBase64, mediaType = 'image/jpeg', apiKey }) {
  const client = getClient(apiKey);
  if (!client) {
    const err = new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다. Firebase Secret을 설정해 주세요.');
    err.code = 'NO_API_KEY';
    throw err;
  }

  const now = kstNow();
  const utcNow = new Date();
  const kstHour = (utcNow.getUTCHours() + 9) % 24;
  const kstMin = utcNow.getUTCMinutes();
  const ampm = kstHour < 12 ? '오전' : '오후';
  const hour12 = kstHour % 12 || 12;
  const dow = now.getDay();
  const todayName = DOW_NAMES[dow];
  const timeContext = `현재 KST는 ${todayName}요일(dow=${dow}) ${ampm} ${hour12}시 ${kstMin}분입니다.`;

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          {
            type: 'text',
            text: `${timeContext}

에브리타임 주간 시간표 이미지입니다. **수업 시간표 데이터만** 추출하세요.

${ROOM_GUIDE}

규칙:
- JSON의 "수업" 배열에만 담기 (dow, start, end, room, buildingKey 필수 / name·teacher 선택)
- 이미지에 보이는 **모든 요일**의 수업을 빠짐없이 포함
- 현재건물·다음건물·공강분·혼잡도·메뉴 등 **다른 필드는 출력하지 마세요** (앱이 KST 시각으로 계산)
- 과목 색·메모·친구시간표 등 시간표 외 정보 무시

JSON만 출력:
${SCHEMA_HINT}`,
          },
        ],
      },
    ],
  });

  const text = (msg.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  let parsed;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse((jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, '').trim());
  } catch {
    throw new Error('AI 응답 JSON 파싱 실패');
  }

  const refined = refineFromParsed(parsed, now);
  const mealIntent = computeMealIntent(refined.gapMin, now);

  return {
    curKey: refined.curKey,
    curTxt: refined.curTxt,
    nextKey: refined.nextKey,
    nextTxt: refined.nextTxt,
    gapMin: refined.gapMin,
    mealIntent,
    수업: refined.classes,
    classes: refined.classes,
    warnings: refined.warnings,
    gapSource: refined.gapSource,
    raw: parsed,
  };
}
