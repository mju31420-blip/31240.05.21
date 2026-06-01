import { readFileSync, mkdirSync, writeFileSync, statSync } from 'fs';
import { basename, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const RUNS = Number(readArg('--runs', '2'));
const OUT_DIR = readArg('--out', 'C:\\Users\\Public\\Documents\\ESTsoft\\CreatorTemp\\myeong-biseo-ocr-eval');
const FILTER = readArg('--filter', '');
const PREPROCESS = readArg('--preprocess', 'none');
const ALLOW_EXTERNAL_OCR = process.env.MB_ALLOW_EXTERNAL_OCR === '1' || process.argv.includes('--allow-external');
const PREFLIGHT = process.argv.includes('--preflight');
const SELF_TEST = process.argv.includes('--self-test');
const MAX_TIMETABLE_IMAGE_BYTES = 5 * 1024 * 1024;
const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
let sharp = null;

const images = [
  {
    id: 'park',
    label: '박창준',
    path: 'C:\\Users\\OhSungJae\\Desktop\\KakaoTalk_20260601_020435569_01.png',
    truth: [
      t(1, '10:00', '11:50', 'Y9027', '자연', 'NCS의이해와공기업취업전략'),
      t(1, '13:00', '14:50', 'Y19515', '3공', '반도체소자'),
      t(1, '15:00', '15:50', 'Y19515', '3공', '지능형센서응용'),
      t(1, '16:00', '16:50', 'Y19109', '3공', '마이크로파공학'),
      t(2, '10:00', '11:50', 'Y19619', '3공', '전자회로'),
      t(2, '12:00', '12:50', 'Y22217', '채플', '채플'),
      t(2, '14:00', '15:50', 'Y19615', '3공', '신호및시스템'),
      t(3, '10:00', '11:50', 'Y19109', '3공', '마이크로파공학'),
      t(3, '13:00', '14:50', 'Y19515', '3공', '지능형센서응용'),
      t(4, '10:00', '10:50', 'Y19619', '3공', '전자회로'),
      t(4, '11:00', '11:50', 'Y19615', '3공', '신호및시스템'),
      t(5, '09:00', '11:50', 'Y2526', '창조', '현대사회와심리학'),
    ],
  },
  {
    id: 'nam',
    label: '남승훈',
    path: 'C:\\Users\\OhSungJae\\Desktop\\KakaoTalk_20260601_020435569_02.png',
    truth: [
      t(1, '11:00', '11:50', 'Y527', '5공', '품질관리'),
      t(1, '13:00', '13:50', 'Y501', '5공', '경영과학I'),
      t(1, '16:00', '16:50', 'Y549', '5공', '마케팅애널리틱스'),
      t(3, '10:00', '11:50', 'Y527', '5공', '품질관리'),
      t(3, '13:00', '14:50', 'Y501', '5공', '경영과학I'),
      t(3, '15:00', '16:50', 'Y549', '5공', '마케팅애널리틱스'),
      t(5, '18:00', '20:50', 'Y9001', '자연', '엑셀데이터활용과분석'),
    ],
  },
  {
    id: 'lee',
    label: '이승현',
    path: 'C:\\Users\\OhSungJae\\Desktop\\KakaoTalk_20260601_020435569_03.png',
    truth: [
      t(1, '10:00', '11:50', 'Y19127', '3공', '공학수학1'),
      t(1, '13:00', '14:50', 'Y247', '창조', '파이썬프로그래밍입문'),
      t(1, '15:00', '16:50', 'Y2523', '창조', '현대사회와기독교윤리'),
      t(2, '09:00', '10:50', 'Y2526', '창조', '성서와인간이해'),
      t(2, '11:00', '11:50', 'Y247', '창조', 'CAD'),
      t(2, '13:00', '14:50', 'Y127', '1공', '열역학'),
      t(3, '10:00', '10:50', 'Y19127', '3공', '공학수학1'),
      t(3, '11:00', '11:50', 'Y22217', '채플', '채플'),
      t(3, '13:00', '13:50', 'Y247', '창조', '파이썬프로그래밍입문'),
      t(3, '14:00', '16:50', 'Y5219', '5공', '창업과공동체'),
      t(4, '10:00', '11:50', 'Y247', '창조', 'CAD'),
      t(4, '13:00', '13:50', 'Y127', '1공', '열역학'),
    ],
  },
  {
    id: 'lee-sanghun',
    label: '이상훈',
    path: 'C:\\Users\\OhSungJae\\Desktop\\이상훈 시간표.jpg',
    truth: [
      t(1, '10:00', '11:50', 'Y19619', '3공', 'SoC설계'),
      t(1, '13:00', '14:50', 'Y19515', '3공', '반도체소자'),
      t(1, '15:00', '15:50', 'Y19515', '3공', '지능형센서응용'),
      t(1, '16:00', '16:50', 'Y19605', '3공', '반도체공정'),
      t(2, '10:00', '11:50', 'Y19615', '3공', '전자회로'),
      t(2, '12:00', '12:50', 'Y22217', '채플', '채플'),
      t(2, '14:00', '16:50', 'Y9029', '자연', '우주생명마음'),
      t(3, '10:00', '11:50', 'Y19605', '3공', '반도체공정'),
      t(3, '13:00', '14:50', 'Y19515', '3공', '지능형센서응용'),
      t(3, '15:00', '15:50', 'Y19619', '3공', 'SoC설계'),
      t(3, '16:00', '16:50', 'Y19605', '3공', '반도체소자'),
      t(4, '10:00', '11:50', 'Y19615', '3공', '전자회로'),
    ],
  },
  {
    id: 'env',
    label: '환경과인간',
    path: 'C:\\Users\\OhSungJae\\Desktop\\화면 캡처 2026-03-19 223324.png',
    truth: [
      t(1, '09:00', '10:50', 'Y2532', '창조', '환경과인간'),
      t(1, '13:00', '14:50', 'Y19221', '3공', '디지털논리회로'),
      t(1, '15:00', '16:50', 'Y19127', '3공', '전자기학'),
      t(2, '10:00', '10:50', 'Y19116', '3공', '회로이론'),
      t(2, '12:00', '12:50', 'Y22217', '채플', '채플'),
      t(2, '14:00', '15:50', 'Y19319', '3공', '전기회로실험1'),
      t(3, '09:00', '09:50', 'Y2532', '창조', '환경과인간'),
      t(3, '11:00', '11:50', 'Y19221', '3공', '디지털논리회로'),
      t(3, '13:00', '13:50', 'Y19127', '3공', '전자기학'),
      t(3, '14:00', '15:50', 'Y9119', '자연', 'C언어'),
      t(4, '10:00', '11:50', 'Y19116', '3공', '회로이론'),
      t(4, '13:00', '14:50', 'Y19319', '3공', '디지털회로실험'),
    ],
  },
  {
    id: 'shin',
    label: '신현민',
    path: 'C:\\Users\\OhSungJae\\Desktop\\KakaoTalk_20260601_020435569.png',
    truth: [
      t(1, '10:00', '11:50', 'Y19619', '3공', 'SoC설계'),
      t(1, '15:00', '15:50', 'Y19515', '3공', '지능형센서응용'),
      t(1, '16:00', '16:50', 'Y19109', '3공', '마이크로파공학'),
      t(2, '10:00', '11:50', 'Y19619', '3공', '전자회로'),
      t(2, '12:00', '12:50', 'Y22217', '채플', '채플'),
      t(2, '14:00', '15:50', 'Y19615', '3공', '신호및시스템'),
      t(3, '10:00', '11:50', 'Y19109', '3공', '마이크로파공학'),
      t(3, '13:00', '14:50', 'Y19615', '3공', '지능형센서응용'),
      t(3, '15:00', '15:50', 'Y19619', '3공', 'SoC설계'),
      t(4, '10:00', '10:50', 'Y19619', '3공', '전자회로'),
      t(4, '11:00', '11:50', 'Y19615', '3공', '신호및시스템'),
      t(4, '14:00', '16:50', 'Y9119', '자연', '인공지능입문'),
    ],
  },
];

const selected = FILTER ? images.filter((img) => img.id.includes(FILTER) || img.label.includes(FILTER)) : images;
if (!selected.length) throw new Error(`No image matched filter: ${FILTER}`);

if (SELF_TEST) {
  runSelfTest();
  console.log('ocr-eval self-test ok');
  process.exit();
}

if (PREFLIGHT) {
  const preflight = runPreflight(selected);
  console.log(JSON.stringify(preflight, null, 2));
  if (!preflight.ok) process.exitCode = 1;
  process.exit();
}

if (!ALLOW_EXTERNAL_OCR) {
  console.error(
    'Refusing to run OCR eval because it sends personal timetable images to the external Claude API. ' +
      'Set MB_ALLOW_EXTERNAL_OCR=1 or pass --allow-external only after explicit user approval.',
  );
  process.exit(2);
}

sharp = requireFromFunctions('sharp');
const { analyzeTimetableImage } = await import('../functions/services/scheduleAnalyzer.js');

loadLocalSecrets();
if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is missing. functions/.secret.local was not loaded.');

mkdirSync(OUT_DIR, { recursive: true });

const started = new Date();
const result = {
  startedAt: started.toISOString(),
  runs: RUNS,
  modelSource: 'local analyzeTimetableImage',
  preprocess: PREPROCESS,
  config: ocrEvalConfig(selected),
  images: [],
};

for (const image of selected) {
  const imageResult = { id: image.id, label: image.label, file: image.path, expectedCount: image.truth.length, runs: [] };
  console.log(`\n===== ${image.label} (${basename(image.path)}) =====`);
  for (let i = 1; i <= RUNS; i += 1) {
    console.log(`-- run ${i}/${RUNS}`);
    try {
      const prepared = await prepareImage(image.path);
      const response = await analyzeTimetableImage({
        imageBase64: prepared.base64,
        mediaType: prepared.mediaType,
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
      const classes = Array.isArray(response.classes) ? response.classes.map(normalizePred) : [];
      const evaluation = evaluate(image.truth, classes);
      imageResult.runs.push({ run: i, classes, evaluation });
      console.log(summaryLine(evaluation, classes.length));
    } catch (err) {
      const error = {
        name: err?.name || 'Error',
        message: err?.message || String(err),
        code: err?.code || err?.cause?.code || null,
      };
      imageResult.runs.push({ run: i, classes: [], evaluation: null, error });
      console.error(`run failed: ${error.name} ${error.code || ''} ${error.message}`);
    }
  }
  result.images.push(imageResult);
}

result.summary = summarizeAll(result.images);
result.verdict = computeVerdict(result.summary);

const stamp = started.toISOString().replace(/[:.]/g, '-');
const jsonPath = join(OUT_DIR, `ocr-eval-${stamp}.json`);
const mdPath = join(OUT_DIR, `ocr-eval-${stamp}.md`);
const latestJsonPath = join(OUT_DIR, 'latest.json');
const latestMdPath = join(OUT_DIR, 'latest.md');
writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf8');
writeFileSync(mdPath, renderMarkdown(result), 'utf8');
writeFileSync(latestJsonPath, JSON.stringify(result, null, 2), 'utf8');
writeFileSync(latestMdPath, renderMarkdown(result), 'utf8');

console.log('\n===== TOTAL =====');
console.log(JSON.stringify(result.summary, null, 2));
console.log('\n===== VERDICT =====');
console.log(JSON.stringify(result.verdict, null, 2));
console.log(`\nJSON: ${jsonPath}`);
console.log(`MD:   ${mdPath}`);
console.log(`LATEST_JSON: ${latestJsonPath}`);
console.log(`LATEST_MD:   ${latestMdPath}`);
if (result.verdict.status !== 'beta_candidate') process.exitCode = 2;

function t(dow, start, end, room, buildingKey, name) {
  return { dow, start, end, room, buildingKey, name };
}

function isFullProductionEvalConfig({ filter, runs, selectedImageCount, configuredImageCount }) {
  return !filter && Number.isInteger(runs) && runs >= 2 && selectedImageCount === configuredImageCount;
}

function ocrEvalConfig(selectedImages = selected) {
  const config = {
    runs: RUNS,
    filter: FILTER,
    preprocess: PREPROCESS,
    selectedImageCount: selectedImages.length,
    configuredImageCount: images.length,
  };
  return {
    ...config,
    fullProductionConfig: isFullProductionEvalConfig(config),
  };
}

function readArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function loadLocalSecrets() {
  const secretPath = fileURLToPath(new URL('../functions/.secret.local', import.meta.url));
  try {
    const text = readFileSync(secretPath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const eq = trimmed.indexOf('=');
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      value = value.replace(/^['"]|['"]$/g, '');
      if (key && process.env[key] == null) process.env[key] = value;
    }
  } catch {
    // Environment variable may already be set by the caller.
  }
}

function runPreflight(list) {
  const seen = new Set();
  const imagesChecked = [];
  const errors = [];
  let totalTruth = 0;
  let nineAmTruth = 0;
  let eveningTruth = 0;

  for (const image of list) {
    if (seen.has(image.id)) errors.push(`duplicate image id: ${image.id}`);
    seen.add(image.id);

    let size = 0;
    let mediaType = 'unknown';
    try {
      const stat = statSync(image.path);
      size = stat.size;
      if (size <= 0) errors.push(`${image.id}: empty image file`);
      if (size > MAX_TIMETABLE_IMAGE_BYTES) {
        errors.push(`${image.id}: image ${size} bytes exceeds ${MAX_TIMETABLE_IMAGE_BYTES}`);
      }
      mediaType = detectMediaType(image.path);
      if (!['image/jpeg', 'image/png'].includes(mediaType)) errors.push(`${image.id}: unsupported media type ${mediaType}`);
    } catch (err) {
      errors.push(`${image.id}: image missing or unreadable (${err.message})`);
    }

    if (!Array.isArray(image.truth) || !image.truth.length) {
      errors.push(`${image.id}: truth set is empty`);
    } else {
      for (const [idx, item] of image.truth.entries()) {
        totalTruth += 1;
        const label = `${image.id}.truth[${idx}]`;
        if (!Number.isInteger(item.dow) || item.dow < 0 || item.dow > 6) errors.push(`${label}: invalid dow ${item.dow}`);
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(item.start)) errors.push(`${label}: invalid start ${item.start}`);
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(item.end)) errors.push(`${label}: invalid end ${item.end}`);
        if (timeToMin(item.end) <= timeToMin(item.start)) errors.push(`${label}: end must be after start`);
        if (!String(item.room || '').startsWith('Y')) errors.push(`${label}: room should start with Y (${item.room})`);
        if (!String(item.buildingKey || '').trim()) errors.push(`${label}: missing buildingKey`);
        if (!String(item.name || '').trim()) errors.push(`${label}: missing name`);
        if (item.start === '09:00') nineAmTruth += 1;
        if (timeToMin(item.start) >= 18 * 60) eveningTruth += 1;
      }
    }

    imagesChecked.push({
      id: image.id,
      label: image.label,
      file: image.path,
      bytes: size,
      mediaType,
      truthCount: image.truth?.length || 0,
    });
  }

  return {
    ok: errors.length === 0,
    imageCount: list.length,
    totalTruth,
    nineAmTruth,
    eveningTruth,
    maxBytes: MAX_TIMETABLE_IMAGE_BYTES,
    config: ocrEvalConfig(list),
    images: imagesChecked,
    externalRunPrereqs: inspectExternalRunPrereqs(),
    errors,
  };
}

function inspectExternalRunPrereqs() {
  const deps = {};
  for (const pkg of ['@anthropic-ai/sdk', 'sharp']) {
    try {
      deps[pkg] = { ok: true, resolved: requireFromFunctions.resolve(pkg) };
    } catch (err) {
      deps[pkg] = { ok: false, error: err.code || err.message };
    }
  }

  let secretLocalHasAnthropicKey = false;
  try {
    const secretPath = fileURLToPath(new URL('../functions/.secret.local', import.meta.url));
    const text = readFileSync(secretPath, 'utf8');
    secretLocalHasAnthropicKey = /^ANTHROPIC_API_KEY\s*=/m.test(text);
  } catch {
    secretLocalHasAnthropicKey = false;
  }

  const apiKeySource = process.env.ANTHROPIC_API_KEY
    ? 'environment'
    : secretLocalHasAnthropicKey
      ? 'functions/.secret.local'
      : null;
  const ok = Object.values(deps).every((dep) => dep.ok) && !!apiKeySource;
  return {
    ok,
    apiKeySource,
    dependencies: deps,
  };
}

function runSelfTest() {
  if (!isFullProductionEvalConfig({ filter: '', runs: 2, selectedImageCount: 6, configuredImageCount: 6 })) {
    throw new Error('Full production OCR config should be recognized');
  }
  if (isFullProductionEvalConfig({ filter: 'park', runs: 2, selectedImageCount: 1, configuredImageCount: 6 })) {
    throw new Error('Filtered OCR eval must not be full production config');
  }
  if (isFullProductionEvalConfig({ filter: '', runs: 1, selectedImageCount: 6, configuredImageCount: 6 })) {
    throw new Error('One-run OCR eval must not be full production config');
  }
  if (isFullProductionEvalConfig({ filter: '', runs: 2, selectedImageCount: 5, configuredImageCount: 6 })) {
    throw new Error('Subset OCR eval must not be full production config');
  }

  const truth = [
    t(1, '09:00', '10:50', 'Y2532', '창조', '환경과인간'),
    t(2, '10:00', '11:50', 'Y19116', '3공', '회로이론'),
    t(3, '14:00', '16:50', 'Y9119', '자연', 'C언어'),
  ];
  const perfect = evaluate(truth, truth.map(normalizePred));
  const perfectVerdict = computeVerdict(summarizeAll([
    { label: 'perfect', runs: [{ run: 1, classes: truth, evaluation: perfect }] },
  ]));
  if (perfectVerdict.status !== 'beta_candidate') {
    throw new Error(`Perfect OCR should be beta_candidate: ${JSON.stringify(perfectVerdict)}`);
  }

  const offDay = evaluate(truth, [...truth, t(5, '13:00', '13:50', 'Y527', '5공', 'phantom')].map(normalizePred));
  const offDayVerdict = computeVerdict(summarizeAll([
    { label: 'offDay', runs: [{ run: 1, classes: [], evaluation: offDay }] },
  ]));
  if (offDayVerdict.status !== 'needs_fix') {
    throw new Error(`Off-day hallucination should need fix: ${JSON.stringify(offDayVerdict)}`);
  }

  const nineAmMoved = evaluate(
    truth,
    [
      t(1, '10:00', '10:50', truth[0].room, truth[0].buildingKey, truth[0].name),
      truth[1],
      truth[2],
    ].map(normalizePred),
  );
  const nineAmVerdict = computeVerdict(summarizeAll([
    { label: 'nineAmMoved', runs: [{ run: 1, classes: [], evaluation: nineAmMoved }] },
  ]));
  if (nineAmVerdict.status !== 'needs_fix') {
    throw new Error(`09:00 movement should need fix: ${JSON.stringify(nineAmVerdict)}`);
  }

  const wrongBuilding = evaluate(
    truth,
    [
      t(truth[0].dow, truth[0].start, truth[0].end, truth[0].room, 'wrong-building', truth[0].name),
      truth[1],
      truth[2],
    ].map(normalizePred),
  );
  const wrongBuildingVerdict = computeVerdict(summarizeAll([
    { label: 'wrongBuilding', runs: [{ run: 1, classes: [], evaluation: wrongBuilding }] },
  ]));
  if (wrongBuildingVerdict.status !== 'needs_fix') {
    throw new Error(`Wrong building should need fix: ${JSON.stringify(wrongBuildingVerdict)}`);
  }

  const zeroClassVerdict = computeVerdict(summarizeAll([
    { label: 'zeroClass', runs: [{ run: 1, classes: [], evaluation: evaluate(truth, []) }] },
  ]));
  if (zeroClassVerdict.status !== 'needs_fix') {
    throw new Error(`Zero-class OCR should need fix: ${JSON.stringify(zeroClassVerdict)}`);
  }

  const weak = evaluate(truth, [truth[0]].map(normalizePred));
  const weakVerdict = computeVerdict(summarizeAll([
    { label: 'weak', runs: [{ run: 1, classes: [], evaluation: weak }] },
    { label: 'weak', runs: [{ run: 2, classes: [], evaluation: weak }] },
  ]));
  if (weakVerdict.status !== 'manual_review_required') {
    throw new Error(`Missing-heavy OCR should require manual review: ${JSON.stringify(weakVerdict)}`);
  }
}

function readImageBase64(path) {
  return readFileSync(path).toString('base64');
}

async function prepareImage(path) {
  if (PREPROCESS === 'none') {
    return { base64: readImageBase64(path), mediaType: detectMediaType(path) };
  }

  const input = readFileSync(path);
  const img = sharp(input, { failOn: 'none' });
  const meta = await img.metadata();
  let pipeline = sharp(input, { failOn: 'none' }).rotate();

  if (PREPROCESS === 'phone-crop' && meta.width && meta.height && meta.height / meta.width > 1.35) {
    const left = 0;
    const width = meta.width;
    const top = Math.max(0, Math.round(meta.height * 0.18));
    const height = Math.min(meta.height - top, Math.round(meta.height * 0.54));
    pipeline = pipeline.extract({ left, top, width, height });
  }

  const output = await pipeline
    .greyscale(false)
    .sharpen({ sigma: 0.6 })
    .png()
    .toBuffer();
  return { base64: output.toString('base64'), mediaType: 'image/png' };
}

function detectMediaType(path) {
  const bytes = readFileSync(path);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  return path.toLowerCase().endsWith('.jpg') || path.toLowerCase().endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
}

function normalizePred(c) {
  return {
    dow: Number(c.dow),
    start: String(c.start || ''),
    end: String(c.end || ''),
    room: String(c.room || '').toUpperCase().replace(/\s+/g, ''),
    buildingKey: String(c.buildingKey || ''),
    name: String(c.name || ''),
  };
}

function evaluate(truth, pred) {
  const pairs = [];
  const usedPred = new Set();

  for (let ti = 0; ti < truth.length; ti += 1) {
    let best = null;
    for (let pi = 0; pi < pred.length; pi += 1) {
      if (usedPred.has(pi)) continue;
      const score = matchScore(truth[ti], pred[pi]);
      if (!best || score.total > best.score.total) best = { ti, pi, score };
    }
    if (best && best.score.total >= 7) {
      usedPred.add(best.pi);
      pairs.push(best);
    }
  }

  const matchedTruth = new Set(pairs.map((p) => p.ti));
  const missing = truth.map((item, index) => ({ item, index })).filter(({ index }) => !matchedTruth.has(index));
  const hallucinated = pred.map((item, index) => ({ item, index })).filter(({ index }) => !usedPred.has(index));

  const errors = {
    wrongDay: [],
    wrongStart: [],
    wrongEnd: [],
    wrongRoom: [],
    wrongBuilding: [],
    nineAmMoved: [],
    longBlockWrong: [],
  };

  for (const pair of pairs) {
    const expected = truth[pair.ti];
    const actual = pred[pair.pi];
    if (expected.dow !== actual.dow) errors.wrongDay.push({ expected, actual });
    if (expected.start !== actual.start) errors.wrongStart.push({ expected, actual });
    if (expected.end !== actual.end) errors.wrongEnd.push({ expected, actual });
    if (normalizeRoom(expected.room) !== normalizeRoom(actual.room)) errors.wrongRoom.push({ expected, actual });
    if (expected.buildingKey && actual.buildingKey && expected.buildingKey !== actual.buildingKey) {
      errors.wrongBuilding.push({ expected, actual });
    }
    if (expected.start === '09:00' && actual.start !== '09:00') errors.nineAmMoved.push({ expected, actual });
    if (durationMin(expected) >= 110 && Math.abs(durationMin(expected) - durationMin(actual)) >= 60) {
      errors.longBlockWrong.push({ expected, actual });
    }
  }

  const offDayHallucinations = hallucinated.filter(({ item }) => !truth.some((x) => x.dow === item.dow));
  const score = computeScore(truth.length, pred.length, missing.length, hallucinated.length, errors);

  return {
    expectedCount: truth.length,
    actualCount: pred.length,
    matchedCount: pairs.length,
    score,
    missing: missing.map((x) => x.item),
    hallucinated: hallucinated.map((x) => x.item),
    offDayHallucinations: offDayHallucinations.map((x) => x.item),
    errors,
    pairs: pairs.map((pair) => ({
      score: pair.score.total,
      expected: truth[pair.ti],
      actual: pred[pair.pi],
    })),
  };
}

function matchScore(a, b) {
  const startDelta = Math.abs(timeToMin(a.start) - timeToMin(b.start));
  const endDelta = Math.abs(timeToMin(a.end) - timeToMin(b.end));
  let total = 0;
  if (a.dow === b.dow) total += 4;
  else if (Math.abs(a.dow - b.dow) === 1) total += 1;
  if (a.start === b.start) total += 3;
  else if (startDelta <= 60) total += 1;
  if (a.end === b.end) total += 3;
  else if (endDelta <= 60) total += 1;
  if (normalizeRoom(a.room) && normalizeRoom(a.room) === normalizeRoom(b.room)) total += 5;
  else if (roomPrefix(a.room) && roomPrefix(a.room) === roomPrefix(b.room)) total += 2;
  if (a.buildingKey && a.buildingKey === b.buildingKey) total += 2;
  if (nameSimilarity(a.name, b.name) >= 0.55) total += 2;
  return { total, startDelta, endDelta };
}

function computeScore(expectedCount, actualCount, missing, hallucinated, errors) {
  let score = 100;
  score -= missing * 8;
  score -= hallucinated * 8;
  score -= errors.wrongDay.length * 6;
  score -= errors.wrongStart.length * 4;
  score -= errors.wrongEnd.length * 4;
  score -= errors.wrongRoom.length * 3;
  score -= errors.wrongBuilding.length * 5;
  score -= errors.nineAmMoved.length * 10;
  score -= errors.longBlockWrong.length * 4;
  score -= Math.abs(expectedCount - actualCount) * 2;
  return Math.max(0, score);
}

function summaryLine(evaluation, actualCount) {
  return [
    `classes=${actualCount}`,
    `score=${evaluation.score}`,
    `missing=${evaluation.missing.length}`,
    `hallucinated=${evaluation.hallucinated.length}`,
    `wrongDay=${evaluation.errors.wrongDay.length}`,
    `wrongTime=${evaluation.errors.wrongStart.length + evaluation.errors.wrongEnd.length}`,
    `wrongRoom=${evaluation.errors.wrongRoom.length}`,
    `wrongBuilding=${evaluation.errors.wrongBuilding.length}`,
    `offDay=${evaluation.offDayHallucinations.length}`,
    `9amMoved=${evaluation.errors.nineAmMoved.length}`,
  ].join(' ');
}

function summarizeAll(imagesResult) {
  const allRuns = imagesResult.flatMap((img) => img.runs.map((run) => ({ image: img.label, ...run })));
  const failedRuns = allRuns.filter((run) => run.error).length;
  const runs = allRuns.filter((run) => run.evaluation).map((run) => ({ image: run.image, ...run.evaluation }));
  const sum = (fn) => runs.reduce((acc, item) => acc + fn(item), 0);
  const avg = runs.length ? sum((x) => x.score) / runs.length : 0;
  const zeroClassRuns = runs.filter((run) => run.actualCount === 0).length;
  const unstableImages = imagesResult
    .map((img) => {
      const evalRuns = img.runs.filter((run) => run.evaluation).map((run) => run.evaluation);
      if (evalRuns.length < 2) return null;
      const scores = evalRuns.map((run) => run.score);
      const counts = evalRuns.map((run) => run.actualCount);
      const scoreRange = Math.max(...scores) - Math.min(...scores);
      const countRange = Math.max(...counts) - Math.min(...counts);
      return scoreRange > 20 || countRange > 2 ? img.label : null;
    })
    .filter(Boolean);
  return {
    runCount: allRuns.length,
    evaluatedRuns: runs.length,
    failedRuns,
    zeroClassRuns,
    averageScore: Math.round(avg * 10) / 10,
    totalMissing: sum((x) => x.missing.length),
    totalHallucinated: sum((x) => x.hallucinated.length),
    totalOffDayHallucinations: sum((x) => x.offDayHallucinations.length),
    totalWrongDay: sum((x) => x.errors.wrongDay.length),
    totalWrongStart: sum((x) => x.errors.wrongStart.length),
    totalWrongEnd: sum((x) => x.errors.wrongEnd.length),
    totalWrongRoom: sum((x) => x.errors.wrongRoom.length),
    totalWrongBuilding: sum((x) => x.errors.wrongBuilding.length),
    totalNineAmMoved: sum((x) => x.errors.nineAmMoved.length),
    totalLongBlockWrong: sum((x) => x.errors.longBlockWrong.length),
    unstableImages,
  };
}

function computeVerdict(summary) {
  const blockers = [];
  const warnings = [];
  if (summary.failedRuns) blockers.push(`API/네트워크 실패 run ${summary.failedRuns}건`);
  if (!summary.evaluatedRuns) blockers.push('평가된 run이 없음');
  if (summary.zeroClassRuns) blockers.push(`classes 0개 run ${summary.zeroClassRuns}건`);
  if (summary.totalOffDayHallucinations) blockers.push(`없는 요일 환각 ${summary.totalOffDayHallucinations}건`);
  if (summary.totalNineAmMoved) blockers.push(`09:00 수업 밀림 ${summary.totalNineAmMoved}건`);
  if (summary.totalWrongBuilding) blockers.push(`건물 매핑 오류 ${summary.totalWrongBuilding}건`);
  if (summary.totalMissing >= Math.max(3, summary.evaluatedRuns)) {
    warnings.push(`수업 누락 많음 ${summary.totalMissing}건`);
  }
  if (summary.totalHallucinated >= Math.max(2, Math.ceil(summary.evaluatedRuns / 2))) {
    warnings.push(`수업 환각 많음 ${summary.totalHallucinated}건`);
  }
  if (summary.totalWrongDay >= Math.max(3, summary.evaluatedRuns)) {
    warnings.push(`요일 오류 많음 ${summary.totalWrongDay}건`);
  }
  if (summary.totalLongBlockWrong >= Math.max(4, summary.evaluatedRuns)) {
    warnings.push(`긴 블록 경계 오류 많음 ${summary.totalLongBlockWrong}건`);
  }
  if (summary.averageScore < 60) warnings.push(`평균 점수 낮음 ${summary.averageScore}`);
  if (summary.unstableImages?.length) warnings.push(`run 간 비결정성: ${summary.unstableImages.join(', ')}`);

  if (blockers.length) {
    return { status: 'needs_fix', blockers, warnings };
  }
  if (warnings.length) {
    return { status: 'manual_review_required', blockers, warnings };
  }
  return { status: 'beta_candidate', blockers, warnings };
}

function renderMarkdown(result) {
  const lines = [];
  lines.push('# OCR Evaluation');
  lines.push('');
  lines.push(`Started: ${result.startedAt}`);
  lines.push(`Runs per image: ${result.runs}`);
  lines.push('');
  lines.push('## Run Config');
  lines.push('');
  lines.push(`- filter: ${result.config?.filter || '(all images)'}`);
  lines.push(`- preprocess: ${result.config?.preprocess || 'none'}`);
  lines.push(`- selected images: ${result.config?.selectedImageCount ?? result.images.length}`);
  lines.push(`- configured images: ${result.config?.configuredImageCount ?? result.images.length}`);
  lines.push(`- fullProductionConfig: ${result.config?.fullProductionConfig ? 'yes' : 'no'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  for (const [key, value] of Object.entries(result.summary)) lines.push(`- ${key}: ${value}`);
  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  lines.push(`- status: ${result.verdict.status}`);
  if (result.verdict.blockers.length) lines.push(`- blockers: ${result.verdict.blockers.join(' / ')}`);
  if (result.verdict.warnings.length) lines.push(`- warnings: ${result.verdict.warnings.join(' / ')}`);
  lines.push('');
  for (const image of result.images) {
    lines.push(`## ${image.label}`);
    lines.push('');
    for (const run of image.runs) {
      lines.push(`### Run ${run.run}`);
      lines.push('');
      if (run.error) {
        lines.push(`- error: ${run.error.name} ${run.error.code || ''} ${run.error.message}`);
        lines.push('');
        continue;
      }
      const e = run.evaluation;
      lines.push(`- ${summaryLine(e, run.classes.length)}`);
      if (e.missing.length) lines.push(`- missing: ${e.missing.map(formatClass).join(' / ')}`);
      if (e.hallucinated.length) lines.push(`- hallucinated: ${e.hallucinated.map(formatClass).join(' / ')}`);
      if (e.offDayHallucinations.length) lines.push(`- offDayHallucinations: ${e.offDayHallucinations.map(formatClass).join(' / ')}`);
      lines.push('');
    }
  }
  return `${lines.join('\n')}\n`;
}

function formatClass(c) {
  return `dow${c.dow} ${c.start}-${c.end} ${c.room || '-'} ${c.buildingKey || '-'} ${c.name || '-'}`;
}

function normalizeRoom(room) {
  return String(room || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function roomPrefix(room) {
  const normalized = normalizeRoom(room);
  const match = normalized.match(/^Y\d{1,2}/);
  return match ? match[0] : '';
}

function timeToMin(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function durationMin(c) {
  return timeToMin(c.end) - timeToMin(c.start);
}

function nameSimilarity(a, b) {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.8;
  const common = [...new Set([...x])].filter((ch) => y.includes(ch)).length;
  return common / Math.max(new Set([...x, ...y]).size, 1);
}

function normalizeName(name) {
  return String(name || '').toLowerCase().replace(/[\s_·,./()\-]/g, '');
}
