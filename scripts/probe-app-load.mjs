import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '../public/');
const order = ['utils.js', 'kst.js', 'schoolCalendar.js', 'campusDistance.js', 'timetable.js', 'mealEngine.js', 'app.js'];

const el = { textContent: '로딩중...', style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {} };
const ctx = {
  window: {},
  document: {
    getElementById: () => el,
    querySelector: () => null,
    querySelectorAll: () => [],
    documentElement: { classList: { add() {}, remove() {} } },
    createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} }),
    addEventListener() {},
  },
  localStorage: { getItem: () => null, setItem() {} },
  sessionStorage: { getItem: () => null, setItem() {} },
  console,
  setTimeout() {},
  setInterval() {},
  fetch: async () => ({
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => ({ ok: true, MENUS: {} }),
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
