import Anthropic from '@anthropic-ai/sdk';
import { BUILDING_KEYS, BUILDING_LABELS } from '../config.js';
import { computeMealIntent } from './mealIntent.js';

const clientCache = new Map();

function getClient(apiKey) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  if (!clientCache.has(key)) clientCache.set(key, new Anthropic({ apiKey: key }));
  return clientCache.get(key);
}

export function resolveBuildingKey(text) {
  if (!text || text === '없음' || text.includes('하교')) return null;
  const t = String(text);
  for (const [key, aliases] of Object.entries(BUILDING_KEYS)) {
    if (aliases.some((a) => t.includes(a))) return key;
  }
  return null;
}

function parseGapMinutes(value, classes = []) {
  const n = parseInt(value, 10);
  if (!Number.isNaN(n) && n > 0) return Math.min(240, n);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
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

function timeToMin(t) {
  if (!t) return null;
  const m = String(t).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

const SCHEMA_HINT = `{"현재건물키":"3공|5공|명진당|공2|자연|학생","현재위치":"표시명","다음건물키":null,"다음수업":"표시명","공강분":75,"수업":[]}`;

export async function analyzeTimetableImage({ imageBase64, mediaType = 'image/jpeg', apiKey }) {
  const client = getClient(apiKey);
  if (!client) {
    const err = new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다. Firebase Secret을 설정해 주세요.');
    err.code = 'NO_API_KEY';
    throw err;
  }

  const now = new Date();
  const kstHour = (now.getUTCHours() + 9) % 24;
  const kstMinute = now.getUTCMinutes();
  const ampm = kstHour < 12 ? '오전' : '오후';
  const hour12 = kstHour % 12 || 12;
  const timeContext = `현재 KST 시각은 ${ampm} ${hour12}시 ${kstMinute}분입니다. 반드시 이 시각을 기준으로 현재 진행 중인 수업과 다음 수업을 판단해줘. 오전/오후를 절대 혼동하지 마.`;
  const kstDow = new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCDay();
  const dow = kstDow;
  const timeStr = `${String(kstHour).padStart(2, '0')}:${String(kstMinute).padStart(2, '0')}`;

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1200,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          {
            type: 'text',
            text: `${timeContext}

에브리타임 주간 시간표. 현재: ${['일', '월', '화', '수', '목', '금', '토'][dow]}요일 ${timeStr} (KST)
방금 끝난 수업 건물, 다음 수업, 공강 분을 JSON만 출력:
${SCHEMA_HINT}`,
          },
        ],
      },
    ],
  });

  const text = (msg.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  let parsed;
  try {
    parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    throw new Error('AI 응답 JSON 파싱 실패');
  }

  const curKey = resolveBuildingKey(parsed.현재건물키) || resolveBuildingKey(parsed.현재위치) || '3공';
  const nextKey =
    parsed.다음건물키 === null ? null : resolveBuildingKey(parsed.다음건물키) || resolveBuildingKey(parsed.다음수업);
  const gapMin = parseGapMinutes(parsed.공강분, parsed.수업 || []);
  const mealIntent = computeMealIntent(gapMin, now);

  return {
    curKey,
    curTxt: parsed.현재위치 || BUILDING_LABELS[curKey] || curKey,
    nextKey: nextKey || 'none',
    nextTxt:
      !nextKey || String(parsed.다음수업 || '').includes('없음')
        ? '없음 (하교)'
        : parsed.다음수업 || BUILDING_LABELS[nextKey] || nextKey,
    gapMin,
    mealIntent,
    수업: parsed.수업 || [],
    raw: parsed,
  };
}
