import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import vm from 'node:vm';

function run(label, cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed`);
  }
}

function output(cmd, args) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function normalizeText(text) {
  return String(text || '').replace(/\r\n/g, '\n');
}

function readHeadFile(file) {
  return normalizeText(output('git', ['show', `HEAD:${file.replace(/\\/g, '/')}`]));
}

function readWorktreeFile(file) {
  return normalizeText(fs.readFileSync(file, 'utf8'));
}

function extractFunction(text, name) {
  const re = new RegExp(`function\\s+${name}\\s*\\(`);
  const match = re.exec(text);
  if (!match) throw new Error(`Protected function not found: ${name}`);
  const open = text.indexOf('{', match.index);
  if (open < 0) throw new Error(`Protected function has no body: ${name}`);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        const end = text.indexOf('\n', i);
        return text.slice(match.index, end < 0 ? i + 1 : end);
      }
    }
  }
  throw new Error(`Protected function body did not close: ${name}`);
}

function assertProtectedFunctionUnchanged(file, name) {
  const before = extractFunction(readHeadFile(file), name);
  const after = extractFunction(readWorktreeFile(file), name);
  if (before !== after) {
    throw new Error(`Protected function changed: ${file} ${name}`);
  }
}

function extractSection(text, startNeedle, endNeedle) {
  const start = text.indexOf(startNeedle);
  if (start < 0) throw new Error(`Protected section start not found: ${startNeedle}`);
  const end = text.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) throw new Error(`Protected section end not found: ${endNeedle}`);
  return text.slice(start, end);
}

function assertProtectedSectionUnchanged(file, startNeedle, endNeedle, label) {
  const before = extractSection(readHeadFile(file), startNeedle, endNeedle);
  const after = extractSection(readWorktreeFile(file), startNeedle, endNeedle);
  if (before !== after) {
    throw new Error(`Protected section changed: ${label}`);
  }
}

function assertProtectedRankingCodeUntouched() {
  const diff = output('git', ['diff', '--unified=0', '--', 'public/app.js', 'public/campusDistance.js']);
  const forbidden = [
    /scoreRestaurant\s*\(/,
    /scored\.sort/,
    /function\s+setRank\s*\(/,
  ];
  const changedLines = diff
    .split(/\r?\n/)
    .filter((line) => /^[+-]/.test(line) && !line.startsWith('+++') && !line.startsWith('---'));
  const hits = changedLines.filter((line) => forbidden.some((re) => re.test(line)));
  if (hits.length) {
    throw new Error(`Protected ranking code changed:\n${hits.join('\n')}`);
  }
  for (const fn of ['setRank', 'scoreRestaurantLocal', 'toRankCompareRow', 'compareRestaurantRows']) {
    assertProtectedFunctionUnchanged('public/app.js', fn);
  }
  for (const fn of ['rankWeights', 'rankTier', 'scoreRestaurant']) {
    assertProtectedFunctionUnchanged('public/campusDistance.js', fn);
  }
}

function assertShuttleLogicUntouched() {
  const diff = output('git', ['diff', '--unified=0', '--', 'public/app.js']);
  const forbidden = [
    /SHUTTLE/,
    /Shuttle/,
    /shuttle/,
    /drawShuttle/,
    /renderShuttle/,
    /analyzeShuttle/,
  ];
  const changedLines = diff
    .split(/\r?\n/)
    .filter((line) => /^[+-]/.test(line) && !line.startsWith('+++') && !line.startsWith('---'));
  const hits = changedLines.filter((line) => forbidden.some((re) => re.test(line)));
  if (hits.length) {
    throw new Error(`Shuttle logic changed unexpectedly:\n${hits.join('\n')}`);
  }
  assertProtectedSectionUnchanged(
    'public/app.js',
    'const SHUTTLE_ROUTE_STOPS',
    'const LDM =',
    'public/app.js shuttle schedules/rendering',
  );
}

function assertExternalOcrEvalGuarded() {
  const evalScript = fs.readFileSync('scripts/ocr-eval.mjs', 'utf8');
  if (!evalScript.includes('MB_ALLOW_EXTERNAL_OCR') || !evalScript.includes('--allow-external')) {
    throw new Error('scripts/ocr-eval.mjs is missing the explicit external OCR approval guard');
  }
}

function assertSchedulePromptGuards() {
  const text = fs.readFileSync('functions/services/scheduleAnalyzer.js', 'utf8');
  const required = [
    ['block identity', '색깔 블록 1개 = 독립된 수업 1개'],
    ['block top boundary', '오직 블록 상단(top) 경계만 start 기준'],
    ['block bottom boundary', '블록 맨 아래 경계 기준'],
    ['no empty-cell guessing', '빈 칸·빈 요일·빈 시간대를 채우려고 추측하지 마'],
    ['no day duplication', '한 블록을 다른 요일로 복제하지 마'],
    ['weekday column order', '월(dow=1), 다음이 화(dow=2), 수(dow=3), 목(dow=4), 금(dow=5)'],
    ['no invisible weekend classes', '토/일 열이 실제 시간표 격자 안에 보이지 않으면 dow=6, dow=0 수업을 만들지 마'],
    ['HH:50 end rule', 'end는 반드시 HH:50 형식만 사용'],
    ['Y2523 schema building', '"room":"Y2523","buildingKey":"창조"'],
    ['2gong room guide', 'Y81→2공'],
    ['gym room guide', 'Y71→체육관'],
    ['design center room guide', 'Y12→디자인조형센터'],
  ];
  const missing = required.filter(([, needle]) => !text.includes(needle)).map(([label]) => label);
  if (missing.length) {
    throw new Error(`scheduleAnalyzer OCR prompt lost critical guardrails: ${missing.join(', ')}`);
  }
}

function assertReadableReadinessScript() {
  const text = fs.readFileSync('scripts/ocr-readiness.mjs', 'utf8');
  const nonAscii = [...text].filter((ch) => ch.charCodeAt(0) > 127);
  if (nonAscii.length) {
    const sample = [...new Set(nonAscii)].slice(0, 20).join('');
    throw new Error(`scripts/ocr-readiness.mjs contains non-ASCII report text (${nonAscii.length} chars): ${sample}`);
  }
}

function headerValue(headers, key) {
  const found = (headers || []).find((h) => String(h.key || '').toLowerCase() === key.toLowerCase());
  return found?.value || '';
}

function assertFirebaseDeployConfig() {
  const firebase = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
  const rc = JSON.parse(fs.readFileSync('.firebaserc', 'utf8'));
  if (rc.projects?.default !== 'myeong-biseo-v2') {
    throw new Error(`Unexpected Firebase default project: ${rc.projects?.default}`);
  }
  if (firebase.hosting?.public !== 'public') {
    throw new Error(`Firebase hosting public must be public, got ${firebase.hosting?.public}`);
  }
  const rewrites = firebase.hosting?.rewrites || [];
  const apiRewrite = rewrites.find((r) => r.source === '/api/**');
  if (apiRewrite?.function !== 'api' || apiRewrite?.region !== 'asia-northeast3') {
    throw new Error(`Firebase API rewrite is not api/asia-northeast3: ${JSON.stringify(apiRewrite)}`);
  }
  const catchAll = rewrites.find((r) => r.source === '**');
  if (catchAll?.destination !== '/index.html') {
    throw new Error(`Firebase catch-all rewrite must point to /index.html: ${JSON.stringify(catchAll)}`);
  }
  const headers = firebase.hosting?.headers || [];
  for (const source of ['/index.html', '/beta.html', '/app.js', '/sw.js']) {
    const entry = headers.find((h) => h.source === source);
    const cache = headerValue(entry?.headers, 'Cache-Control');
    if (!/no-cache|no-store/.test(cache)) {
      throw new Error(`Firebase ${source} cache header is too sticky: ${cache}`);
    }
  }
  const swHeader = headers.find((h) => h.source === '/sw.js');
  if (headerValue(swHeader?.headers, 'Service-Worker-Allowed') !== '/') {
    throw new Error('Firebase sw.js is missing Service-Worker-Allowed: /');
  }
  const functionConfig = Array.isArray(firebase.functions) ? firebase.functions[0] : firebase.functions;
  if (functionConfig?.source !== 'functions') {
    throw new Error(`Firebase functions source must be functions: ${functionConfig?.source}`);
  }
  const predeploy = functionConfig?.predeploy || [];
  if (!predeploy.some((cmd) => cmd.includes('sync-data')) || !predeploy.some((cmd) => cmd.includes('lint'))) {
    throw new Error(`Firebase functions predeploy must run sync-data and lint: ${JSON.stringify(predeploy)}`);
  }
  for (const file of ['lecture_db.json', 'class_periods.json']) {
    const publicBytes = fs.readFileSync(`public/data/${file}`);
    const functionBytes = fs.readFileSync(`functions/data/${file}`);
    if (Buffer.compare(publicBytes, functionBytes) !== 0) {
      throw new Error(`Data drift between public/data/${file} and functions/data/${file}`);
    }
  }
}

assertProtectedRankingCodeUntouched();
assertShuttleLogicUntouched();
assertExternalOcrEvalGuarded();
assertSchedulePromptGuards();
assertReadableReadinessScript();
assertFirebaseDeployConfig();

run('app syntax', 'node', ['--check', 'public/app.js']);
run('timetable syntax', 'node', ['--check', 'public/timetable.js']);
for (const script of [
  'scripts/ocr-browser-smoke.mjs',
  'scripts/ocr-eval.mjs',
  'scripts/ocr-local-check.mjs',
  'scripts/ocr-readiness.mjs',
  'scripts/ocr-review-smoke.mjs',
  'scripts/probe-app-load.mjs',
]) {
  run(`script syntax ${script}`, 'node', ['--check', script]);
}
run('OCR eval self-test', 'node', ['scripts/ocr-eval.mjs', '--self-test']);
run('OCR readiness self-test', 'node', ['scripts/ocr-readiness.mjs', '--self-test']);
run('app load probe', 'node', ['scripts/probe-app-load.mjs']);
run('rank order regression', 'node', ['scripts/test-rank-order.mjs']);
run('OCR review smoke', 'node', ['scripts/ocr-review-smoke.mjs']);
run('OCR browser smoke', 'node', ['scripts/ocr-browser-smoke.mjs'], {
  env: { ...process.env, MB_REQUIRE_BROWSER_SMOKE: '1' },
});

const functionFiles = [
  'functions/index.js',
  ...fs
    .readdirSync('functions/services')
    .filter((f) => f.endsWith('.js'))
    .map((f) => `functions/services/${f}`),
];
for (const file of functionFiles) {
  run(`function syntax ${file}`, 'node', ['--check', file]);
}

for (const file of ['public/index.html', 'public/beta.html']) {
  const html = fs.readFileSync(file, 'utf8');
  if (!html.includes('/app.js?v=20260601-ocr-review1')) {
    throw new Error(`${file} does not reference the OCR review app.js build`);
  }
  if (!html.includes('/timetable.js?v=20260601-evening1')) {
    throw new Error(`${file} does not reference the evening timetable.js build`);
  }
  if (!html.includes('/pwa-register.js?v=20260601-pwa11')) {
    throw new Error(`${file} does not reference the OCR-era pwa-register build`);
  }
}

const appJs = fs.readFileSync('public/app.js', 'utf8');
if (!appJs.includes("const MB_APP_BUILD = '2026-06-01-ocr-review1'")) {
  throw new Error('app.js does not expose the OCR review MB_APP_BUILD value');
}
if (!appJs.includes('window.MB_APP_BUILD = MB_APP_BUILD')) {
  throw new Error('app.js does not publish MB_APP_BUILD on window');
}
const pwaRegister = fs.readFileSync('public/pwa-register.js', 'utf8');
if (!pwaRegister.includes('/sw.js?v=20260601-pwa11')) {
  throw new Error('pwa-register.js does not register the OCR-era service worker build');
}
const sw = fs.readFileSync('public/sw.js', 'utf8');
if (!sw.includes("SW_VERSION = 'mb-pwa-11'")) {
  throw new Error('sw.js does not use the OCR-era cache version');
}

const periods = await import('../functions/services/everytimePeriods.js');
const scheduleAnalyzer = await import('../functions/services/scheduleAnalyzer.js');
const lectureMatcher = await import('../functions/services/lectureMatcher.js');
const evening = periods.normalizeEverytimeClassTimes('06:00', '08:50');
if (evening?.start !== '18:00' || evening?.end !== '20:50') {
  throw new Error(`server evening normalization failed: ${JSON.stringify(evening)}`);
}
const daytime = periods.normalizeEverytimeClassTimes('10:00', '11:50');
if (daytime?.start !== '10:00' || daytime?.end !== '11:50') {
  throw new Error(`server daytime normalization failed: ${JSON.stringify(daytime)}`);
}

const storage = { getItem: () => null, setItem() {}, removeItem() {} };
const context = {
  console: { log() {}, warn() {}, error() {} },
  window: {},
  localStorage: storage,
  fetch: async () => ({ ok: false, json: async () => ({}) }),
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('public/timetable.js', 'utf8'), context, { filename: 'public/timetable.js' });
const publicEvening = context.window.TimetableUtil.normalizeClass({
  dow: 5,
  start: '06:00',
  end: '08:50',
  room: 'Y9001',
  name: 'Excel',
});
if (publicEvening?.start !== '18:00' || publicEvening?.end !== '20:50') {
  throw new Error(`public evening normalization failed: ${JSON.stringify(publicEvening)}`);
}

const distanceContext = {
  console: { log() {}, warn() {}, error() {} },
  window: {},
  localStorage: storage,
};
distanceContext.globalThis = distanceContext;
vm.createContext(distanceContext);
vm.runInContext(fs.readFileSync('public/campusDistance.js', 'utf8'), distanceContext, {
  filename: 'public/campusDistance.js',
});
const campusDistance = distanceContext.window.CampusDistance;
const buildingKeys = Object.keys(campusDistance.BUILDING_LABELS || {});
for (const from of buildingKeys) {
  if (!campusDistance.TO_REST?.[from]) throw new Error(`TO_REST missing row: ${from}`);
  for (const rest of campusDistance.REST_KEYS || []) {
    if (typeof campusDistance.TO_REST[from]?.[rest] !== 'number') {
      throw new Error(`TO_REST missing ${from} -> ${rest}`);
    }
  }
  if (!campusDistance.B2B?.[from]) throw new Error(`B2B missing row: ${from}`);
  for (const to of buildingKeys) {
    const forward = campusDistance.B2B[from]?.[to];
    const backward = campusDistance.B2B[to]?.[from];
    if (typeof forward !== 'number') throw new Error(`B2B missing ${from} -> ${to}`);
    if (from === to && forward !== 0) throw new Error(`B2B diagonal ${from} must be 0, got ${forward}`);
    if (typeof backward === 'number' && forward !== backward) {
      throw new Error(`B2B asymmetric ${from} -> ${to}: ${forward} !== ${backward}`);
    }
  }
}

const mappingCases = [
  ['Y2532', '창조'],
  ['Y19116', '3공'],
  ['Y22217', '채플'],
  ['Y9001', '자연'],
  ['Y811', '2공'],
  ['Y831', '2공'],
  ['Y851', '2공'],
  ['Y861', '2공'],
  ['Y611', '체육문화관'],
  ['Y621', '체육문화관'],
  ['Y631', '체육문화관'],
  ['Y641', '체육문화관'],
  ['Y711', '체육관'],
  ['Y121', '디자인조형센터'],
  ['Y131', '제4공학관'],
  ['Y201', '건축도시설계원'],
  ['Y231', '차세대과학관'],
  ['Y241', '하이브리드구조실험센터'],
  ['Y271', '창조'],
  ['Y171', '산업협력관'],
];

for (const [room, expected] of mappingCases) {
  const server = scheduleAnalyzer.resolveBuildingKey(room);
  const lecture = lectureMatcher.resolveBuildingKey(room);
  const browser = context.window.TimetableUtil.resolveBuildingKey(room);
  if (server !== expected) throw new Error(`scheduleAnalyzer mapping ${room}: ${server} !== ${expected}`);
  if (lecture !== expected) throw new Error(`lectureMatcher mapping ${room}: ${lecture} !== ${expected}`);
  if (browser !== expected) throw new Error(`public timetable mapping ${room}: ${browser} !== ${expected}`);
}

console.log('ocr-local-check ok');
