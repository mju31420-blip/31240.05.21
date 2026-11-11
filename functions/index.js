import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import express from 'express';
import cors from 'cors';
import { getMenus } from './services/menuCache.js';
import {
  analyzeTimetableImage,
  estimateBase64DecodedBytes,
  MAX_TIMETABLE_IMAGE_BYTES,
} from './services/scheduleAnalyzer.js';
import { sendSuggestionEmail } from './services/suggestMail.js';

const JSON_LIMIT = '8mb';
const ALLOWED_ORIGIN_RE = /^https:\/\/(myeong-biseo-v2\.web\.app|myeong-biseo-v2\.firebaseapp\.com)$/;
const LOCAL_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const SUGGEST_TYPES = new Set(['기능 요청', '버그 신고', '식당 오류', '셔틀 오류', '기타']);
const RATE_LIMITS = new Map();

function getDb() {
  if (!getApps().length) initializeApp();
  return getFirestore();
}

function trimField(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function isValidEmail(value) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function rateLimit({ windowMs, max }) {
  return (req, res, next) => {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = forwarded || req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${ip}:${req.path}`;
    const now = Date.now();
    const bucket = RATE_LIMITS.get(key);
    if (!bucket || now > bucket.resetAt) {
      RATE_LIMITS.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.status(429).json({ ok: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
      return;
    }
    next();
  };
}

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');
const smtpHost = defineSecret('SMTP_HOST');
const smtpUser = defineSecret('SMTP_USER');
const smtpPass = defineSecret('SMTP_PASS');
const suggestToEmail = defineSecret('SUGGEST_TO_EMAIL');

const app = express();
app.use(cors({
  origin(origin, cb) {
    if (!origin || ALLOWED_ORIGIN_RE.test(origin) || LOCAL_ORIGIN_RE.test(origin)) {
      cb(null, true);
      return;
    }
    cb(null, false);
  },
}));
app.use(express.json({ limit: JSON_LIMIT }));

app.get(['/api/health', '/health'], (_req, res) => {
  res.json({
    ok: true,
    platform: 'firebase',
  });
});

/** 기숙사·명진당·교직원·학생회관 — 학교 홈페이지에서 가져온 주간 식단 */
app.get(['/api/menus', '/menus'], rateLimit({ windowMs: 60 * 1000, max: 60 }), async (req, res) => {
  try {
    const data = await getMenus({ force: req.query.refresh === '1' });
    res.json({
      ok: true,
      MENUS: data.MENUS || {},
      updatedAt: data.updatedAt || new Date().toISOString(),
    });
  } catch (err) {
    console.error('[api/menus]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post(['/api/suggest', '/suggest'], rateLimit({ windowMs: 60 * 60 * 1000, max: 8 }), async (req, res) => {
  const typeRaw = trimField(req.body?.type, 40);
  const body = trimField(req.body?.body, 2000);
  const name = trimField(req.body?.name, 40);
  const home = trimField(req.body?.home, 40);
  const replyEmail = trimField(req.body?.replyEmail, 254);
  if (!body) {
    return res.status(400).json({ ok: false, error: '내용을 입력해주세요' });
  }
  if (!isValidEmail(replyEmail)) {
    return res.status(400).json({ ok: false, error: '이메일 형식을 확인해주세요' });
  }

  const payload = {
    type: SUGGEST_TYPES.has(typeRaw) ? typeRaw : '기타',
    body,
    name: name || '익명',
    home,
    replyEmail,
    createdAt: FieldValue.serverTimestamp(),
    status: 'pending',
  };

  let backupId = null;
  try {
    const doc = await getDb().collection('suggestions').add(payload);
    backupId = doc.id;
  } catch (backupErr) {
    console.warn('[api/suggest] firestore backup failed', backupErr.message);
  }

  try {
    const result = await sendSuggestionEmail({
      type: payload.type,
      body: payload.body,
      name: payload.name,
      home: payload.home,
      replyEmail: payload.replyEmail,
    });
    if (backupId) {
      await getDb().collection('suggestions').doc(backupId).update({
        status: 'sent',
        mailMessageId: result.messageId || null,
        sentAt: FieldValue.serverTimestamp(),
      });
    }
    res.json({ ok: true, message: '건의가 메일로 전달되었습니다.' });
  } catch (err) {
    console.error('[api/suggest]', err.message, err.code);
    if (backupId) {
      try {
        await getDb().collection('suggestions').doc(backupId).update({
          status: 'mail_failed',
          error: err.message,
          errorCode: err.code || 'UNKNOWN',
        });
      } catch (e) {
        console.warn('[api/suggest] firestore update failed', e.message);
      }
    }
    const status =
      err.code === 'NO_MAIL_CONFIG' || err.code === 'NO_SMTP' || err.code === 'SMTP_AUTH' ? 503 : 500;
    res.status(status).json({
      ok: false,
      error: err.message,
      code: err.code,
      saved: Boolean(backupId),
    });
  }
});

/** 시간표 이미지 OCR — ANTHROPIC_API_KEY (Secret / env) */
app.post(['/api/analyze/timetable', '/analyze/timetable'], rateLimit({ windowMs: 60 * 60 * 1000, max: 20 }), async (req, res) => {
  try {
    const { imageBase64, mediaType } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ ok: false, error: 'imageBase64가 필요합니다' });
    }
    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(String(mediaType || 'image/jpeg'))) {
      return res.status(400).json({ ok: false, error: '지원하지 않는 이미지 형식입니다.', code: 'IMAGE_TYPE_UNSUPPORTED' });
    }
    const b64 = String(imageBase64).replace(/^data:image\/\w+;base64,/, '').trim();
    if (estimateBase64DecodedBytes(b64) > MAX_TIMETABLE_IMAGE_BYTES) {
      return res.status(400).json({
        ok: false,
        error: '이미지 크기는 5MB 이하여야 합니다.',
        code: 'IMAGE_TOO_LARGE',
      });
    }
    const result = await analyzeTimetableImage({
      imageBase64: b64,
      mediaType: mediaType || 'image/jpeg',
    });
    res.json({
      ok: true,
      curKey: result.curKey,
      curTxt: result.curTxt,
      nextTxt: result.nextTxt,
      gapMin: result.gapMin,
      nextKey: result.nextKey,
      classes: Array.isArray(result.classes) ? result.classes : [],
      mealIntent: result.mealIntent,
      warnings: result.warnings || [],
      gapSource: result.gapSource || '',
    });
  } catch (err) {
    console.error('[api/analyze/timetable]', err.message);
    const status =
      err.code === 'NO_API_KEY' ? 503 : err.code === 'IMAGE_TOO_LARGE' || err.code === 'IMAGE_EMPTY' ? 400 : 500;
    res.status(status).json({ ok: false, error: err.message, code: err.code });
  }
});

function firestoreDocToJson(doc) {
  const data = doc.data();
  const row = { id: doc.id, ...data };
  for (const [key, value] of Object.entries(row)) {
    if (value && typeof value.toDate === 'function') {
      row[key] = value.toDate().toISOString();
    }
  }
  return row;
}

async function loadDashboardCollection(name) {
  const db = getDb();
  try {
    const snap = await db.collection(name).orderBy('timestamp', 'desc').limit(2000).get();
    return snap.docs.map(firestoreDocToJson);
  } catch (err) {
    console.warn(`[api/dashboard] ${name} orderBy fallback`, err.message);
    const snap = await db.collection(name).limit(2000).get();
    return snap.docs.map(firestoreDocToJson);
  }
}

async function handleDashboard(req, res) {
  const token = readDashboardCookie(req);
  if (!token || !(dashboardSessions.get(token) > Date.now())) {
    dashboardSessions.delete(token);
    return res.status(401).json({ ok: false, error: '관리자 로그인이 필요합니다.' });
  }
  try {
    const [visits, sessions] = await Promise.all([
      loadDashboardCollection('visits'),
      loadDashboardCollection('sessions'),
    ]);
    res.json({ ok: true, visits, sessions });
  } catch (err) {
    console.error('[api/dashboard]', err);
    res.status(500).json({ ok: false, error: '대시보드 데이터를 불러오지 못했습니다.' });
  }
}

const dashboardPassword = defineSecret('DASHBOARD_ADMIN_PASSWORD');
const DASHBOARD_SESSION_MS = 4 * 60 * 60 * 1000;
const DASHBOARD_LOGIN_WINDOW_MS = 5 * 60 * 1000;
const DASHBOARD_COOKIE = '__session'; // Firebase Hosting에서 Functions로 전달되는 쿠키
const dashboardCookieOptions = { httpOnly: true, secure: true, sameSite: 'strict', path: '/api/dashboard' };
// 대시보드는 인스턴스 1개에서 세션과 로그인 실패 횟수를 관리한다.
const dashboardSessions = new Map();
let dashboardLoginWindow = { failures: 0, expiresAt: 0 };

function readDashboardCookie(req) {
  return /(?:^|;\s*)__session=([A-Za-z0-9_-]{43})(?=;|$)/.exec(req.get('cookie') || '')?.[1];
}

const dashboardApp = express();
dashboardApp.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
dashboardApp.use(express.json({ limit: '2kb' }));

dashboardApp.post('/api/dashboard/login', (req, res) => {
  if (!req.is('application/json')) return res.sendStatus(415);
  const expected = dashboardPassword.value();
  if (!expected || expected.trim().length < 16) {
    return res.status(503).json({ ok: false, error: '관리자 비밀번호 설정을 확인해 주세요.' });
  }
  const now = Date.now();
  if (dashboardLoginWindow.expiresAt <= now) {
    dashboardLoginWindow = { failures: 0, expiresAt: now + DASHBOARD_LOGIN_WINDOW_MS };
  }
  if (dashboardLoginWindow.failures >= 10) {
    res.set('Retry-After', String(Math.ceil((dashboardLoginWindow.expiresAt - now) / 1000)));
    return res.status(429).json({ ok: false, error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
  }
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const actualHash = createHash('sha256').update(password).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  if (!timingSafeEqual(actualHash, expectedHash)) {
    dashboardLoginWindow.failures += 1;
    return res.status(401).json({ ok: false, error: '비밀번호가 올바르지 않습니다.' });
  }

  dashboardLoginWindow.failures = 0;
  dashboardSessions.delete(readDashboardCookie(req));
  for (const [token, expiresAt] of dashboardSessions) {
    if (expiresAt <= now) dashboardSessions.delete(token);
  }
  if (dashboardSessions.size >= 20) dashboardSessions.delete(dashboardSessions.keys().next().value);
  const token = randomBytes(32).toString('base64url');
  dashboardSessions.set(token, now + DASHBOARD_SESSION_MS);
  res.cookie(DASHBOARD_COOKIE, token, { ...dashboardCookieOptions, maxAge: DASHBOARD_SESSION_MS });
  return res.json({ ok: true });
});

dashboardApp.post('/api/dashboard/logout', (req, res) => {
  if (!req.is('application/json')) return res.sendStatus(415);
  dashboardSessions.delete(readDashboardCookie(req));
  res.clearCookie(DASHBOARD_COOKIE, dashboardCookieOptions);
  return res.json({ ok: true });
});

dashboardApp.get('/api/dashboard', handleDashboard);

export const dashboardApi = onRequest(
  {
    invoker: 'public',
    secrets: [dashboardPassword],
    timeoutSeconds: 120,
    memory: '512MiB',
    maxInstances: 1,
    region: 'asia-northeast3',
  },
  dashboardApp,
);

/** Hosting rewrite: /api/** → 이 함수 (경로 그대로 전달) */
function applySecrets() {
  if (anthropicApiKey.value()) process.env.ANTHROPIC_API_KEY = anthropicApiKey.value();
  if (smtpHost.value()) process.env.SMTP_HOST = smtpHost.value();
  if (smtpUser.value()) process.env.SMTP_USER = smtpUser.value();
  if (smtpPass.value()) process.env.SMTP_PASS = smtpPass.value();
  if (suggestToEmail.value()) process.env.SUGGEST_TO_EMAIL = suggestToEmail.value();
}

export const api = onRequest(
  {
    invoker: 'public',
    secrets: [anthropicApiKey, smtpHost, smtpUser, smtpPass, suggestToEmail],
    timeoutSeconds: 120,
    memory: '512MiB',
    maxInstances: 10,
    region: 'asia-northeast3',
  },
  (req, res) => {
    applySecrets();
    return app(req, res);
  },
);
