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
];

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
  let dow = raw.dow != null ? Number(raw.dow) : raw.요일 != null ? Number(raw.요일) : refDow;
  if (Number.isNaN(dow)) dow = refDow;
  if (dow === 7) dow = 0;
  if (dow < 0 || dow > 6) dow = refDow;
  return {
    dow,
    start: String(start).slice(0, 5),
    end: String(end).slice(0, 5),
    name: raw.name || raw.과목 || '수업',
    room: room || '',
    buildingKey: buildingKey || '3공',
    teacher: raw.teacher || raw.교수 || '',
  };
}

function analyzeFromClasses(classes, refDate) {
  const dow = refDate.getDay();
  const nowMin = refDate.getHours() * 60 + refDate.getMinutes();
  const today = classes.filter((c) => c.dow === dow).sort((a, b) => timeToMin(a.start) - timeToMin(b.start));

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
  else if (dow === 0 || dow === 6 || !today.length) gapMin = 240;
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

function parseGapMinutes(value, classes = [], refDate) {
  const n = parseInt(value, 10);
  const todayCount = classes.filter((c) => c.dow === refDate.getDay()).length;
  if (todayCount >= 1 || classes.length >= 2) {
    const fromClasses = analyzeFromClasses(classes, refDate);
    return fromClasses.gapMin;
  }
  if (!Number.isNaN(n) && n > 0) return Math.min(240, n);
  const nowMin = refDate.getHours() * 60 + refDate.getMinutes();
  const sorted = [...classes]
    .map((c) => ({ start: timeToMin(c.start), end: timeToMin(c.end) }))
    .filter((c) => c.start != null && c.end != null)
    .sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1].start - sorted[i].end;
    if (gap > 0 && sorted[i].end <= nowMin && sorted[i + 1].start >= nowMin) return gap;
  }
  return 75;
}

function refineFromParsed(parsed, refDate) {
  const dow = refDate.getDay();
  const warnings = [];
  let classes = (parsed.수업 || [])
    .map((c) => normalizeClass(c, dow))
    .filter(Boolean);

  if (classes.length) {
    const computed = analyzeFromClasses(classes, refDate);
    const aiGap = parseInt(parsed.공강분, 10);
    let gapMin = computed.gapMin;
    if (!Number.isNaN(aiGap) && Math.abs(aiGap - gapMin) > 20) {
      warnings.push(`공강 ${aiGap}분 → 수업 목록 기준 ${gapMin}분으로 보정`);
    }
    return {
      ...computed,
      gapMin,
      classes,
      warnings,
      gapSource: 'classes_refined',
    };
  }

  const curKey = resolveBuildingKey(parsed.현재건물키) || resolveBuildingKey(parsed.현재위치) || '3공';
  const nextKey =
    parsed.다음건물키 === null ? null : resolveBuildingKey(parsed.다음건물키) || resolveBuildingKey(parsed.다음수업);
  const gapMin = parseGapMinutes(parsed.공강분, classes, refDate);

  return {
    curKey,
    curTxt: parsed.현재위치 || BUILDING_LABELS[curKey] || curKey,
    nextKey: nextKey || 'none',
    nextTxt:
      !nextKey || String(parsed.다음수업 || '').includes('없음')
        ? '없음 (하교)'
        : parsed.다음수업 || BUILDING_LABELS[nextKey] || nextKey,
    gapMin,
    classes,
    warnings,
    gapSource: 'ai_fields',
    today: [],
  };
}

const SCHEMA_HINT = `{
  "현재건물키":"3공|5공|명진당|공2|자연|학생",
  "현재위치":"표시용 문자열",
  "다음건물키":"3공|5공|명진당|공2|자연|학생|null",
  "다음수업":"표시용 문자열",
  "공강분":75,
  "수업":[
    {"dow":1,"name":"과목명","room":"Y19221","start":"13:00","end":"14:30","buildingKey":"3공","teacher":"교수명"}
  ]
}`;

const DOW_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

const ROOM_GUIDE = `호실→건물: Y19→3공, Y5→5공, Y3→명진당, Y9/Y11→공2, Y7/Y25→자연, Y21/Y22→학생.
에브리타임 열(요일칸) 기준 dow: 월=1, 화=2, 수=3, 목=4, 금=5, 토=6, 일=0 (JavaScript 규칙, 0=일~6=토).
이미지에 보이는 주간 시간표의 모든 요일 수업을 "수업" 배열에 넣고, 각 항목에 dow·start·end·room·buildingKey를 반드시 포함.
현재/다음 수업·공강 판단은 오늘 요일(dow) 수업만 사용.`;

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
  const timeContext = `현재 KST는 ${todayName}요일(dow=${dow}) ${ampm} ${hour12}시 ${kstMin}분입니다. 반드시 이 시각·요일 기준으로 현재 수업과 다음 수업을 판단해줘. 오전/오후·요일칸 혼동 금지.`;

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

에브리타임 주간 시간표 이미지입니다.
${ROOM_GUIDE}

1) 지금 진행 중이거나 방금 끝난 수업의 건물·과목
2) 다음 수업 건물·과목 (없으면 null)
3) 지금부터 다음 수업까지 공강 분(숫자)
4) 주간 표의 전 요일 수업을 "수업" 배열에 dow 포함해 저장. 오늘은 ${todayName}요일(dow=${dow}) — 현재·다음·공강은 이 요일만 기준

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
