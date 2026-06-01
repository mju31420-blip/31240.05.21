import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import Module from 'node:module';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve('.');
const publicRoot = path.join(root, 'public');
const require = createRequire(import.meta.url);
const analyzeResponses = [];

function skip(reason) {
  if (process.env.MB_REQUIRE_BROWSER_SMOKE === '1') {
    throw new Error(`ocr-browser-smoke unavailable: ${reason}`);
  }
  console.log(`ocr-browser-smoke skipped: ${reason}`);
  process.exit(0);
}

function addNodeModuleRoots() {
  const roots = [];
  if (process.env.NODE_PATH) roots.push(...process.env.NODE_PATH.split(path.delimiter));
  roots.push(path.join(root, 'node_modules'));
  if (process.env.USERPROFILE) {
    const bundled = path.join(
      process.env.USERPROFILE,
      '.cache',
      'codex-runtimes',
      'codex-primary-runtime',
      'dependencies',
      'node',
      'node_modules',
    );
    roots.push(bundled, path.join(bundled, '.pnpm', 'node_modules'));
  }
  process.env.NODE_PATH = [...new Set(roots.filter(Boolean))].join(path.delimiter);
  Module._initPaths();
}

function loadPlaywright() {
  addNodeModuleRoots();
  try {
    return require('playwright');
  } catch (err) {
    skip(`playwright not found (${err.code || err.message})`);
  }
}

function findBrowserExecutable() {
  const candidates = [
    process.env.MB_BROWSER_PATH,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].filter(Boolean);
  for (const exe of candidates) {
    if (fsSync.existsSync(exe)) return exe;
  }
  skip('Edge/Chrome executable not found');
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function menuPayload() {
  return {
    ok: true,
    MENUS: {
      '\uAE30\uC219\uC0AC': {
        1: { l: ['local-menu'], d: ['local-menu'] },
      },
    },
    updatedAt: 'local-browser-smoke',
  };
}

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const parsed = new URL(req.url, 'http://127.0.0.1');
      if (parsed.pathname === '/__/firebase/init.json') {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ projectId: 'myeong-biseo-v2', appId: 'local', apiKey: 'local' }));
        return;
      }
      if (parsed.pathname === '/api/menus') {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(menuPayload()));
        return;
      }
      if (parsed.pathname === '/api/analyze/timetable') {
        req.resume();
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(analyzeResponses.shift() || { ok: false, error: 'missing smoke OCR response' }));
        return;
      }
      if (parsed.pathname === '/pwa-register.js') {
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
        res.end('');
        return;
      }

      let rel = decodeURIComponent(parsed.pathname);
      if (rel === '/') rel = '/index.html';
      const full = path.resolve(publicRoot, `.${rel}`);
      if (!full.startsWith(path.resolve(publicRoot))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      const buf = await fs.readFile(full);
      res.writeHead(200, { 'content-type': mime[path.extname(full).toLowerCase()] || 'application/octet-stream' });
      res.end(buf);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  });
}

function relevantErrors(errors) {
  return errors.filter((err) => {
    const s = String(err);
    return !s.includes('firebase') &&
      !s.includes('gstatic') &&
      !s.includes('analytics') &&
      !s.includes('ERR_NETWORK_ACCESS_DENIED') &&
      !s.includes('favicon') &&
      !s.includes('fetchWeather') &&
      !s.includes('open-meteo');
  });
}

async function installPageMocks(page, errors) {
  await page.addInitScript(() => {
    window.__BETA_MOCK_TIME__ = '2026-06-01T12:30:00+09:00';
  });
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ current: { temperature_2m: 20, weathercode: 0 } }),
  }));
  await page.route('https://www.gstatic.com/firebasejs/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: 'export function initializeApp(){return {}} export function getAnalytics(){return {}}',
  }));
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
}

const { chromium } = loadPlaywright();
const executablePath = findBrowserExecutable();
const server = createServer();

try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];

  await installPageMocks(page, errors);

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.TimetableUtil && window.openOcrReviewPanel, null, { timeout: 10000 });
  await page.evaluate(() => {
    window.setMd?.('img');
    window.openOcrReviewPanel({
      classes: [
        { dow: 1, start: '10:00', end: '16:50', room: 'Y2532', buildingKey: '\u0033\uACF5', name: 'long-block' },
        { dow: 0, start: '11:00', end: '11:50', room: 'Y19116', buildingKey: '\u0033\uACF5', name: 'weekend-class' },
      ],
    });
  });

  const review = await page.evaluate(() => {
    const box = document.getElementById('ocrReviewBox');
    return {
      title: box?.querySelector('.ocr-r-title')?.textContent || '',
      text: box?.innerText || '',
      display: getComputedStyle(box).display,
      controls: box?.querySelectorAll('input,select,button').length || 0,
      width: Math.round(box?.getBoundingClientRect().width || 0),
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  if (!review.title.includes('2')) throw new Error(`review title missing count: ${JSON.stringify(review)}`);
  if (!review.text.includes('Y2532') || !review.text.includes('Y19116')) {
    throw new Error(`review class tags missing: ${JSON.stringify(review)}`);
  }
  if (review.display === 'none' || review.controls < 10 || review.width < 250 || review.overflowX) {
    throw new Error(`review panel layout failed: ${JSON.stringify(review)}`);
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  const desktopReview = await page.evaluate(() => {
    const box = document.getElementById('ocrReviewBox');
    return {
      display: getComputedStyle(box).display,
      width: Math.round(box?.getBoundingClientRect().width || 0),
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  if (desktopReview.display === 'none' || desktopReview.width < 300 || desktopReview.overflowX) {
    throw new Error(`desktop review panel layout failed: ${JSON.stringify(desktopReview)}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });

  await page.evaluate(() => {
    window.__ocrXssHit = false;
    window.openOcrReviewPanel({
      classes: [
        {
          dow: 1,
          start: '10:00',
          end: '10:50',
          room: 'Y19116',
          buildingKey: '\u0033\uACF5',
          name: '<img src=x onerror="window.__ocrXssHit=true">',
        },
      ],
    });
  });
  const xssReview = await page.evaluate(() => {
    const box = document.getElementById('ocrReviewBox');
    return {
      xssHit: !!window.__ocrXssHit,
      hasInjectedImage: !!box?.querySelector('img'),
      text: box?.innerText || '',
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  if (
    xssReview.xssHit ||
    xssReview.hasInjectedImage ||
    !xssReview.text.includes('<img') ||
    xssReview.overflowX
  ) {
    throw new Error(`OCR review escaping failed: ${JSON.stringify(xssReview)}`);
  }

  await page.evaluate(() => {
    window.openOcrReviewPanel({
      classes: [
        { dow: 1, start: '10:00', end: '10:50', room: 'Y19116', buildingKey: '\u0033\uACF5', name: 'quick-a' },
        { dow: 2, start: '11:00', end: '11:50', room: 'Y2532', buildingKey: '\uCC3D\uC870', name: 'quick-b' },
      ],
    });
  });
  const quickActions = await page.evaluate(() => {
    const box = document.getElementById('ocrReviewBox');
    const findButton = (root, text) =>
      Array.from(root.querySelectorAll('button')).find((btn) => btn.textContent.trim().includes(text));

    const quickB = Array.from(box.querySelectorAll('.ocr-class')).find((card) => card.innerText.includes('quick-b'));
    findButton(quickB, '\uC0AD\uC81C')?.click();
    findButton(box, '\uC218\uC5C5 \uCD94\uAC00')?.click();

    const quickA1 = Array.from(box.querySelectorAll('.ocr-class')).find((card) => card.innerText.includes('quick-a'));
    findButton(quickA1.querySelector('.ocr-class-quick'), '\uB2E4\uC74C\uB0A0')?.click();
    const quickA2 = Array.from(box.querySelectorAll('.ocr-class')).find((card) => card.innerText.includes('quick-a'));
    findButton(quickA2.querySelector('.ocr-class-quick'), '+1\uC2DC\uAC04')?.click();

    const cards = Array.from(box.querySelectorAll('.ocr-class'));
    const quickA = cards.find((card) => card.innerText.includes('quick-a'));
    return {
      classCount: cards.length,
      text: box.innerText,
      quickAText: quickA?.innerText || '',
      hasQuickB: box.innerText.includes('quick-b'),
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  if (
    quickActions.classCount !== 2 ||
    quickActions.hasQuickB ||
    !quickActions.text.includes('\uC218\uC5C5') ||
    !quickActions.quickAText.includes('\uD654 11:00~11:50') ||
    quickActions.overflowX
  ) {
    throw new Error(`review quick actions failed: ${JSON.stringify(quickActions)}`);
  }

  async function runImageAnalyze(classes, options = {}) {
    analyzeResponses.push({ ok: true, classes });
    await page.evaluate((seedSaved) => {
      if (seedSaved) {
        localStorage.setItem('myeong_timetable', JSON.stringify(seedSaved));
      } else {
        localStorage.removeItem('myeong_timetable');
      }
      window.setMd?.('img');
    }, options.seedSaved || null);
    await page.setInputFiles('#fi', {
      name: 'timetable-smoke.png',
      mimeType: 'image/png',
      buffer: Buffer.from('not-a-real-image-but-filereader-safe'),
    });
    await page.waitForFunction(() => !document.getElementById('btnImg')?.disabled, null, { timeout: 10000 });
    await page.evaluate(() => document.getElementById('btnImg')?.click());
    await page.waitForFunction(() => !document.getElementById('btnImg')?.disabled, null, { timeout: 15000 });
    await page.waitForFunction(
      () => document.getElementById('schBd')?.classList.contains('on'),
      null,
      { timeout: 5000 },
    ).catch(() => {});
    await page.waitForTimeout(100);
    return page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('myeong_timetable') || '[]');
      return {
        savedCount: saved.length,
        savedRooms: saved.map((c) => c.room).join(','),
        boardOn: document.getElementById('schBd')?.classList.contains('on') || false,
        boardText: document.getElementById('sbRows')?.innerText || '',
        alertText: document.getElementById('tAlert')?.innerText || '',
        reviewOn: document.getElementById('ocrReviewBox')?.classList.contains('on') || false,
        reviewText: document.getElementById('ocrReviewBox')?.innerText || '',
        foodCards: document.querySelectorAll('.rc-card').length,
        foodText: document.getElementById('rcWrap')?.innerText || '',
      };
    });
  }

  const emptyImageFlow = await runImageAnalyze([], {
    seedSaved: [
      { dow: 1, start: '10:00', end: '10:50', room: 'Y19116', buildingKey: '\u0033\uACF5', name: 'seed-old' },
    ],
  });
  if (
    emptyImageFlow.savedCount !== 1 ||
    !emptyImageFlow.savedRooms.includes('Y19116') ||
    !emptyImageFlow.reviewOn ||
    !emptyImageFlow.reviewText.includes('\uD558\uB098\uB3C4 \uC778\uC2DD') ||
    emptyImageFlow.boardText.includes('seed-old')
  ) {
    throw new Error(`empty image OCR flow mixed saved timetable: ${JSON.stringify(emptyImageFlow)}`);
  }

  const suspiciousImageFlow = await runImageAnalyze([
    { dow: 1, start: '10:00', end: '16:50', room: 'Y2532', buildingKey: '\u0033\uACF5', name: 'suspicious-long' },
  ]);
  if (
    suspiciousImageFlow.savedCount !== 0 ||
    !suspiciousImageFlow.boardOn ||
    !suspiciousImageFlow.reviewOn ||
    suspiciousImageFlow.foodCards < 4 ||
    !suspiciousImageFlow.reviewText.includes('4\uC2DC\uAC04 \uC774\uC0C1') ||
    !suspiciousImageFlow.alertText.includes('\uC758\uC2EC \uC218\uC5C5') ||
    !suspiciousImageFlow.foodText.includes('\uD655\uC778 \uD544\uC694') ||
    !suspiciousImageFlow.foodText.includes('\uCD94\uCC9C\uC740 \uBA3C\uC800')
  ) {
    throw new Error(`suspicious image OCR flow failed: ${JSON.stringify(suspiciousImageFlow)}`);
  }

  const cleanImageFlow = await runImageAnalyze([
    { dow: 1, start: '10:00', end: '10:50', room: 'Y19116', buildingKey: '\u0033\uACF5', name: 'clean-a' },
    { dow: 2, start: '10:00', end: '10:50', room: 'Y2532', buildingKey: '\uCC3D\uC870', name: 'clean-b' },
    { dow: 3, start: '11:00', end: '11:50', room: 'Y22217', buildingKey: '\uCC44\uD50C', name: 'clean-c' },
    { dow: 4, start: '13:00', end: '13:50', room: 'Y9001', buildingKey: '\uC790\uC5F0', name: 'clean-d' },
    { dow: 5, start: '14:00', end: '14:50', room: 'Y527', buildingKey: '\u0035\uACF5', name: 'clean-e' },
  ]);
  if (cleanImageFlow.savedCount !== 5 || !cleanImageFlow.savedRooms.includes('Y19116') || !cleanImageFlow.boardOn || cleanImageFlow.foodCards < 4) {
    throw new Error(`clean image OCR flow failed: ${JSON.stringify(cleanImageFlow)}`);
  }

  const persistBranches = await page.evaluate(async () => {
    localStorage.removeItem('myeong_timetable');
    await window.applyScheduleAnalysis(
      {
        classes: [
          { dow: 1, start: '10:00', end: '16:50', room: 'Y2532', buildingKey: '\u0033\uACF5', name: 'suspicious' },
        ],
      },
      'AI 시간표',
      { persistOcr: false },
    );
    const suspiciousSaved = JSON.parse(localStorage.getItem('myeong_timetable') || '[]');

    localStorage.removeItem('myeong_timetable');
    await window.applyScheduleAnalysis(
      {
        classes: [
          { dow: 1, start: '10:00', end: '10:50', room: 'Y19116', buildingKey: '\u0033\uACF5', name: 'clean-a' },
          { dow: 1, start: '13:00', end: '13:50', room: 'Y2532', buildingKey: '\uCC3D\uC870', name: 'clean-b' },
        ],
      },
      'AI 시간표',
      { persistOcr: true },
    );
    const cleanSaved = JSON.parse(localStorage.getItem('myeong_timetable') || '[]');
    return {
      suspiciousSavedCount: suspiciousSaved.length,
      cleanSavedCount: cleanSaved.length,
      cleanRooms: cleanSaved.map((c) => c.room).join(','),
    };
  });
  if (persistBranches.suspiciousSavedCount !== 0) {
    throw new Error(`suspicious OCR overwrote saved timetable: ${JSON.stringify(persistBranches)}`);
  }
  if (persistBranches.cleanSavedCount !== 2 || !persistBranches.cleanRooms.includes('Y19116') || !persistBranches.cleanRooms.includes('Y2532')) {
    throw new Error(`clean OCR did not persist: ${JSON.stringify(persistBranches)}`);
  }

  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.openOcrReviewPanel({
      classes: [
        { dow: 1, start: '10:00', end: '10:50', room: 'Y19116', buildingKey: '\u0033\uACF5', name: 'class-a' },
        { dow: 1, start: '13:00', end: '13:50', room: 'Y2532', buildingKey: '\uCC3D\uC870', name: 'class-b' },
      ],
    });
  });
  await page.waitForFunction(() => document.querySelector('#ocrReviewBox .ocr-r-btn.primary'), null, { timeout: 10000 });
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#ocrReviewBox .ocr-class'));
    const card = cards.find((el) => el.querySelector('.ocr-class-name')?.textContent?.includes('class-a'));
    if (!card) throw new Error('class-a review card not found');
    const selects = card.querySelectorAll('select');
    selects[0].value = '2';
    selects[0].dispatchEvent(new Event('change', { bubbles: true }));
    const refreshedCards = Array.from(document.querySelectorAll('#ocrReviewBox .ocr-class'));
    const refreshed = refreshedCards.find((el) => el.querySelector('.ocr-class-name')?.textContent?.includes('class-a'));
    if (!refreshed) throw new Error('class-a review card not found after day edit');
    const refreshedSelects = refreshed.querySelectorAll('select');
    refreshedSelects[0].value = '1';
    refreshedSelects[0].dispatchEvent(new Event('change', { bubbles: true }));
    const dayRestoredCards = Array.from(document.querySelectorAll('#ocrReviewBox .ocr-class'));
    const dayRestored = dayRestoredCards.find((el) => el.querySelector('.ocr-class-name')?.textContent?.includes('class-a'));
    if (!dayRestored) throw new Error('class-a review card not found after day restore');
    const dayRestoredInputs = dayRestored.querySelectorAll('input');
    dayRestoredInputs[1].value = 'Y711';
    dayRestoredInputs[1].dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.evaluate(() => document.querySelector('#ocrReviewBox .ocr-r-btn.primary')?.click());
  await page.waitForTimeout(800);
  const applied = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('myeong_timetable') || '[]');
    const edited = saved.find((c) => c.room === 'Y711');
    return {
      savedCount: saved.length,
      savedRooms: saved.map((c) => c.room).join(','),
      editedDow: edited?.dow ?? null,
      editedBuilding: edited?.buildingKey || '',
      boardOn: document.getElementById('schBd')?.classList.contains('on') || false,
      boardText: document.getElementById('sbRows')?.innerText || '',
      foodCards: document.querySelectorAll('.rc-card').length,
      btnDisabled: document.getElementById('btnImg')?.disabled || false,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  if (applied.savedCount !== 2 || !applied.savedRooms.includes('Y711') || !applied.savedRooms.includes('Y2532')) {
    throw new Error(`corrected timetable not saved: ${JSON.stringify(applied)}`);
  }
  if (applied.editedDow !== 1 || applied.editedBuilding !== '\uCCB4\uC721\uAD00') {
    throw new Error(`corrected field values not persisted: ${JSON.stringify(applied)}`);
  }
  if (!applied.boardText.includes('\uCCB4\uC721\uAD00') && !applied.boardText.includes('Y711')) {
    throw new Error(`corrected class not reflected in analysis board: ${JSON.stringify(applied)}`);
  }
  if (!applied.boardOn || applied.foodCards < 4 || applied.btnDisabled || applied.overflowX) {
    throw new Error(`re-analysis UI failed: ${JSON.stringify(applied)}`);
  }

  const savedPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await savedPage.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await installPageMocks(savedPage, errors);
  await savedPage.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await savedPage.waitForFunction(() => window.TimetableUtil && window.doAnalyzeFromTimetable, null, { timeout: 10000 });
  await savedPage.evaluate(async () => {
    window.__BETA_MOCK_TIME__ = '2026-06-01T12:30:00+09:00';
    localStorage.setItem(
      'myeong_timetable',
      JSON.stringify([
        { dow: 1, start: '10:00', end: '11:50', room: 'Y19116', buildingKey: '\u0033\uACF5', name: 'saved-before' },
        { dow: 1, start: '13:00', end: '13:50', room: 'Y711', buildingKey: '\uCCB4\uC721\uAD00', name: 'saved-next' },
      ]),
    );
    window.setMd?.('saved');
    await window.doAnalyzeFromTimetable();
  });
  await savedPage.waitForFunction(
    () => document.getElementById('schBd')?.classList.contains('on'),
    null,
    { timeout: 5000 },
  );
  const savedModeFlow = await savedPage.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('myeong_timetable') || '[]');
    return {
      savedCount: saved.length,
      boardOn: document.getElementById('schBd')?.classList.contains('on') || false,
      boardText: document.getElementById('sbRows')?.innerText || '',
      reviewOn: document.getElementById('ocrReviewBox')?.classList.contains('on') || false,
      foodCards: document.querySelectorAll('.rc-card').length,
      manualModeVisible: getComputedStyle(document.getElementById('manMode')).display !== 'none',
      savedModeVisible: getComputedStyle(document.getElementById('savedMode')).display !== 'none',
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  if (
    savedModeFlow.savedCount !== 2 ||
    !savedModeFlow.boardOn ||
    savedModeFlow.reviewOn ||
    savedModeFlow.foodCards < 4 ||
    savedModeFlow.manualModeVisible ||
    !savedModeFlow.savedModeVisible ||
    savedModeFlow.overflowX
  ) {
    throw new Error(`saved timetable analysis flow failed: ${JSON.stringify(savedModeFlow)}`);
  }
  if (!savedModeFlow.boardText.includes('Y711') && !savedModeFlow.boardText.includes('\uCCB4\uC721\uAD00')) {
    throw new Error(`saved timetable analysis did not reflect next class: ${JSON.stringify(savedModeFlow)}`);
  }
  await savedPage.close();

  const errorPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await errorPage.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  const expectedErrors = [];
  await installPageMocks(errorPage, expectedErrors);
  await errorPage.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await errorPage.waitForFunction(() => window.TimetableUtil && window.setMd, null, { timeout: 10000 });
  analyzeResponses.push({ ok: false, error: 'smoke OCR failure' });
  await errorPage.evaluate(() => {
    sessionStorage.setItem('mb_auto_tt', KST.now().toDateString());
    localStorage.setItem(
      'myeong_timetable',
      JSON.stringify([
        { dow: 1, start: '10:00', end: '10:50', room: 'Y19116', buildingKey: '\u0033\uACF5', name: 'seed-stays' },
      ]),
    );
    window.setMd?.('img');
  });
  await errorPage.setInputFiles('#fi', {
    name: 'broken-timetable-smoke.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not-a-real-error-image-but-filereader-safe'),
  });
  await errorPage.waitForFunction(() => !document.getElementById('btnImg')?.disabled, null, { timeout: 10000 });
  await errorPage.evaluate(() => document.getElementById('btnImg')?.click());
  await errorPage.waitForFunction(() => !document.getElementById('btnImg')?.disabled, null, { timeout: 15000 });
  await errorPage.waitForTimeout(100);
  const failedImageFlow = await errorPage.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('myeong_timetable') || '[]');
    return {
      savedCount: saved.length,
      savedRooms: saved.map((c) => c.room).join(','),
      btnDisabled: document.getElementById('btnImg')?.disabled || false,
      loadingOn: document.getElementById('ldg')?.classList.contains('on') || false,
      boardOn: document.getElementById('schBd')?.classList.contains('on') || false,
      reviewOn: document.getElementById('ocrReviewBox')?.classList.contains('on') || false,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  if (
    failedImageFlow.savedCount !== 1 ||
    !failedImageFlow.savedRooms.includes('Y19116') ||
    failedImageFlow.btnDisabled ||
    failedImageFlow.loadingOn ||
    failedImageFlow.boardOn ||
    failedImageFlow.reviewOn ||
    failedImageFlow.overflowX
  ) {
    throw new Error(`failed image OCR recovery flow failed: ${JSON.stringify(failedImageFlow)}`);
  }
  await errorPage.close();

  const betaPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await betaPage.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await installPageMocks(betaPage, errors);
  await betaPage.goto(`${baseUrl}beta.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await betaPage.waitForFunction(() => window.TimetableUtil && window.openOcrReviewPanel, null, { timeout: 10000 });
  await betaPage.evaluate(() => {
    window.setMd?.('img');
    window.openOcrReviewPanel({
      classes: [
        { dow: 1, start: '10:00', end: '10:50', room: 'Y2532', buildingKey: '\uCC3D\uC870', name: 'beta-class' },
      ],
    });
  });
  const betaReview = await betaPage.evaluate(() => {
    const box = document.getElementById('ocrReviewBox');
    return {
      title: box?.querySelector('.ocr-r-title')?.textContent || '',
      display: box ? getComputedStyle(box).display : '',
      text: box?.innerText || '',
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  if (!betaReview.title.includes('1') || betaReview.display === 'none' || !betaReview.text.includes('Y2532') || betaReview.overflowX) {
    throw new Error(`beta OCR review smoke failed: ${JSON.stringify(betaReview)}`);
  }
  analyzeResponses.push({
    ok: true,
    classes: [
      { dow: 1, start: '10:00', end: '10:50', room: 'Y19116', buildingKey: '\u0033\uACF5', name: 'beta-a' },
      { dow: 2, start: '10:00', end: '10:50', room: 'Y2532', buildingKey: '\uCC3D\uC870', name: 'beta-b' },
      { dow: 3, start: '11:00', end: '11:50', room: 'Y22217', buildingKey: '\uCC44\uD50C', name: 'beta-c' },
      { dow: 4, start: '13:00', end: '13:50', room: 'Y9001', buildingKey: '\uC790\uC5F0', name: 'beta-d' },
      { dow: 5, start: '14:00', end: '14:50', room: 'Y527', buildingKey: '\u0035\uACF5', name: 'beta-e' },
    ],
  });
  await betaPage.evaluate(() => {
    localStorage.removeItem('myeong_timetable');
    window.setMd?.('img');
  });
  await betaPage.setInputFiles('#fi', {
    name: 'beta-timetable-smoke.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not-a-real-beta-image-but-filereader-safe'),
  });
  await betaPage.waitForFunction(() => !document.getElementById('btnImg')?.disabled, null, { timeout: 10000 });
  await betaPage.evaluate(() => document.getElementById('btnImg')?.click());
  await betaPage.waitForFunction(() => !document.getElementById('btnImg')?.disabled, null, { timeout: 15000 });
  await betaPage.waitForFunction(
    () => document.getElementById('schBd')?.classList.contains('on'),
    null,
    { timeout: 5000 },
  );
  const betaImageFlow = await betaPage.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('myeong_timetable') || '[]');
    return {
      savedCount: saved.length,
      savedRooms: saved.map((c) => c.room).join(','),
      boardOn: document.getElementById('schBd')?.classList.contains('on') || false,
      reviewOn: document.getElementById('ocrReviewBox')?.classList.contains('on') || false,
      foodCards: document.querySelectorAll('.rc-card').length,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  if (
    betaImageFlow.savedCount !== 5 ||
    !betaImageFlow.savedRooms.includes('Y2532') ||
    !betaImageFlow.boardOn ||
    !betaImageFlow.reviewOn ||
    betaImageFlow.foodCards < 4 ||
    betaImageFlow.overflowX
  ) {
    throw new Error(`beta image OCR flow failed: ${JSON.stringify(betaImageFlow)}`);
  }

  await betaPage.evaluate(() => {
    window.openOcrReviewPanel({
      classes: [
        { dow: 1, start: '10:00', end: '10:50', room: 'Y19116', buildingKey: '\u0033\uACF5', name: 'beta-edit-a' },
        { dow: 2, start: '13:00', end: '13:50', room: 'Y2532', buildingKey: '\uCC3D\uC870', name: 'beta-edit-b' },
      ],
    });
  });
  await betaPage.waitForFunction(() => document.querySelector('#ocrReviewBox .ocr-r-btn.primary'), null, { timeout: 10000 });
  await betaPage.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#ocrReviewBox .ocr-class'));
    const card = cards.find((el) => el.querySelector('.ocr-class-name')?.textContent?.includes('beta-edit-a'));
    if (!card) throw new Error('beta-edit-a review card not found');
    const inputs = card.querySelectorAll('input');
    inputs[1].value = 'Y711';
    inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
  });
  await betaPage.evaluate(() => document.querySelector('#ocrReviewBox .ocr-r-btn.primary')?.click());
  await betaPage.waitForTimeout(800);
  const betaApplied = await betaPage.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('myeong_timetable') || '[]');
    const edited = saved.find((c) => c.room === 'Y711');
    return {
      savedCount: saved.length,
      savedRooms: saved.map((c) => c.room).join(','),
      editedBuilding: edited?.buildingKey || '',
      boardOn: document.getElementById('schBd')?.classList.contains('on') || false,
      boardText: document.getElementById('sbRows')?.innerText || '',
      foodCards: document.querySelectorAll('.rc-card').length,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  if (betaApplied.savedCount !== 2 || !betaApplied.savedRooms.includes('Y711') || !betaApplied.savedRooms.includes('Y2532')) {
    throw new Error(`beta corrected timetable not saved: ${JSON.stringify(betaApplied)}`);
  }
  if (betaApplied.editedBuilding !== '\uCCB4\uC721\uAD00') {
    throw new Error(`beta corrected building not persisted: ${JSON.stringify(betaApplied)}`);
  }
  if (!betaApplied.boardOn || betaApplied.foodCards < 4 || betaApplied.overflowX) {
    throw new Error(`beta corrected re-analysis UI failed: ${JSON.stringify(betaApplied)}`);
  }
  if (!betaApplied.boardText.includes('\uCCB4\uC721\uAD00') && !betaApplied.boardText.includes('Y711')) {
    throw new Error(`beta corrected class not reflected in analysis board: ${JSON.stringify(betaApplied)}`);
  }
  await betaPage.close();

  const noisy = relevantErrors(errors);
  if (noisy.length) throw new Error(`browser errors: ${noisy.join(' | ')}`);
  await browser.close();
  console.log('ocr-browser-smoke ok: index OCR flows, OCR escaping, saved timetable flow, API failure recovery, beta OCR flow, beta edited-field correction re-analysis, quick actions, edited-field correction re-analysis');
} finally {
  await new Promise((resolve) => server.close(resolve));
}
