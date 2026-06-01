import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '../public/');
const order = ['utils.js', 'kst.js', 'schoolCalendar.js', 'campusDistance.js', 'timetable.js', 'mealEngine.js', 'app.js'];

function fakeEl() {
  return {
    textContent: '로딩중...',
    innerHTML: '',
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild() {},
    addEventListener() {},
    querySelector: () => fakeEl(),
    querySelectorAll: () => [],
    insertAdjacentHTML() {},
  };
}

const el = fakeEl();
const ctx = {
  window: {},
  document: {
    getElementById: () => el,
    querySelector: () => null,
    querySelectorAll: () => [],
    documentElement: { classList: { add() {}, remove() {} } },
    createElement: () => fakeEl(),
    addEventListener() {},
  },
  localStorage: { getItem: () => null, setItem() {} },
  sessionStorage: { getItem: () => null, setItem() {} },
  console,
  setTimeout() {},
  setInterval() {},
  addEventListener() {},
  fetch: async (url = '') => ({
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => String(url).includes('open-meteo')
      ? ({ current: { temperature_2m: 20, weathercode: 0 } })
      : ({ ok: true, MENUS: { 기숙사: { 1: { l: ['local-menu'] } } } }),
  }),
  location: { search: '' },
  navigator: { serviceWorker: { addEventListener() {} } },
};
ctx.window = ctx;

for (const f of order) {
  try {
    const code = fs.readFileSync(path.join(dir, f), 'utf8');
    vm.runInNewContext(code, ctx, { filename: f });
    console.log(f, 'ok', 'goTab=', typeof ctx.goTab, 'nowTime=', el.textContent);
  } catch (e) {
    console.error(f, 'FAIL', e.message);
    process.exit(1);
  }
}
