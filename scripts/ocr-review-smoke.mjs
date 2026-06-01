import fs from 'node:fs';
import vm from 'node:vm';

const elements = new Map();

function fakeEl(id = '') {
  return {
    id,
    style: {},
    value: '',
    selectedIndex: 0,
    options: [{ text: '제3공학관 (Y19)' }],
    textContent: '',
    innerHTML: '',
    disabled: false,
    src: '',
    className: '',
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() {
        return false;
      },
    },
    appendChild(child) {
      if (child.id) elements.set(child.id, child);
      return child;
    },
    insertAdjacentHTML() {},
    addEventListener() {},
    querySelector() {
      return fakeEl('child');
    },
    querySelectorAll() {
      return [];
    },
  };
}

const document = {
  head: fakeEl('head'),
  body: fakeEl('body'),
  documentElement: fakeEl('html'),
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, fakeEl(id));
    return elements.get(id);
  },
  querySelectorAll() {
    return [];
  },
  querySelector() {
    return fakeEl('query');
  },
  createElement(tag) {
    return fakeEl(tag);
  },
};

const storage = {
  getItem() {
    return null;
  },
  setItem() {},
  removeItem() {},
};

const context = {
  console: {
    log() {},
    warn() {},
    error() {},
  },
  document,
  window: { addEventListener() {}, USER_TIMETABLE: [], MB_APP_BUILD: '' },
  localStorage: storage,
  sessionStorage: storage,
  setInterval() {
    return 1;
  },
  clearInterval() {},
  setTimeout() {
    return 1;
  },
  fetch: async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => '' }),
};

context.KST = {
  now() {
    return new Date('2026-06-01T12:30:00+09:00');
  },
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('public/app.js', 'utf8'), context, { filename: 'public/app.js' });

let replaceCalls = 0;

const timetableUtil = {
  DOW_NAMES: ['일', '월', '화', '수', '목', '금', '토'],
  CAMPUS_BUILDINGS: [
    { key: '3공', label: '제3공학관 (Y19)' },
    { key: '창조', label: '창조예술관 (Y2)' },
  ],
  normalizeClassesFromAi(list) {
    return list.map((c) => ({ buildingKey: '3공', name: '수업', room: '', ...c }));
  },
  loadUserTimetable() {
    return [{ dow: 1, start: '10:00', end: '10:50', room: 'Y19101', buildingKey: '3공', name: '저장수업' }];
  },
  dedupeOverlappingClasses(list) {
    return list;
  },
  replaceUserTimetable() {
    replaceCalls += 1;
  },
  analyzeFromClasses() {
    return { curKey: '저장됨', nextKey: '저장됨', gapMin: 999, today: [{}], nextTxt: '저장수업' };
  },
  summarizeByDow(list) {
    return list.reduce((acc, c) => {
      acc[c.dow] = (acc[c.dow] || 0) + 1;
      return acc;
    }, {});
  },
  resolveRoomToBuildingKey(room) {
    const s = String(room || '');
    if (s.startsWith('Y25')) return '창조';
    if (s.startsWith('Y19')) return '3공';
    return null;
  },
};

context.TimetableUtil = timetableUtil;
context.window.TimetableUtil = timetableUtil;
context.MealEngine = {
  computeMealIntent() {
    return { period: 'lunch', willEat: true };
  },
};

context.openOcrReviewPanel({
  classes: [
    { dow: 1, start: '10:00', end: '16:50', room: 'Y2532', buildingKey: '3공', name: '환경과인간' },
    { dow: 0, start: '11:00', end: '11:50', room: 'Y19116', buildingKey: '3공', name: '회로이론' },
  ],
});

const html = elements.get('ocrReviewBox')?.innerHTML || '';
if (!html.includes('인식 수업 2개')) throw new Error('OCR review title did not render');
if (!html.includes('4시간 이상') && !html.includes('주말')) throw new Error('OCR review issue did not render');
if (!html.includes('수정 반영하고 다시 추천')) throw new Error('OCR review apply action did not render');

function issueText(classes) {
  return context.detectOcrReviewIssues(classes).issues.map((i) => i.text).join('\n');
}

const emptyIssueText = issueText([]);
if (!emptyIssueText.includes('하나도 인식')) {
  throw new Error('Empty OCR risk was not detected');
}

const lowCountIssueText = issueText([
  { dow: 1, start: '10:00', end: '10:50', room: 'Y19116', buildingKey: '3공', name: 'a' },
  { dow: 2, start: '11:00', end: '11:50', room: 'Y2532', buildingKey: '창조', name: 'b' },
  { dow: 3, start: '13:00', end: '13:50', room: 'Y22217', buildingKey: '채플', name: 'c' },
]);
if (!lowCountIssueText.includes('전체 수업이 3개')) {
  throw new Error('Low OCR class count risk was not detected');
}

const mismatchIssueText = issueText([
  { dow: 1, start: '10:00', end: '10:50', room: 'Y2532', buildingKey: '3공', name: 'bad-building' },
]);
if (!mismatchIssueText.includes('기준 건물은 창조')) {
  throw new Error('Room/building mismatch risk was not detected');
}

const todayMissingIssueText = issueText([
  { dow: 1, start: '10:00', end: '10:50', room: 'Y19116', buildingKey: '3공', name: 'mon' },
  { dow: 2, start: '10:00', end: '10:50', room: 'Y2532', buildingKey: '창조', name: 'tue-a' },
  { dow: 2, start: '11:00', end: '11:50', room: 'Y2532', buildingKey: '창조', name: 'tue-b' },
  { dow: 2, start: '13:00', end: '13:50', room: 'Y2532', buildingKey: '창조', name: 'tue-c' },
  { dow: 3, start: '10:00', end: '10:50', room: 'Y22217', buildingKey: '채플', name: 'wed-a' },
  { dow: 3, start: '11:00', end: '11:50', room: 'Y22217', buildingKey: '채플', name: 'wed-b' },
]);
if (!todayMissingIssueText.includes('오늘(월) 수업이 너무 적게')) {
  throw new Error('Today-column missing risk was not detected');
}

const emptyOcr = context.refineScheduleAnalysis({ classes: [], gapMin: 75 }, null, { fromOcr: true });
if (emptyOcr.scheduleMeta?.classCount !== 0) {
  throw new Error('Empty OCR result fell back to saved timetable');
}

replaceCalls = 0;
context.refineScheduleAnalysis(
  { classes: [{ dow: 1, start: '10:00', end: '10:50', room: 'Y19101', buildingKey: '3공', name: '정상' }] },
  null,
  { fromOcr: true, persistOcr: false },
);
if (replaceCalls !== 0) throw new Error('Suspicious OCR result overwrote saved timetable');

context.refineScheduleAnalysis(
  { classes: [{ dow: 1, start: '10:00', end: '10:50', room: 'Y19101', buildingKey: '3공', name: '정상' }] },
  null,
  { fromOcr: true },
);
if (replaceCalls !== 1) throw new Error('Clean OCR result did not persist');

console.log('ocr-review smoke ok');
