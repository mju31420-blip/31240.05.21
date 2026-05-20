import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import express from 'express';
import cors from 'cors';
import { getMenus } from './services/menuCache.js';
import { analyzeTimetableImage } from './services/scheduleAnalyzer.js';
import { sendSuggestionEmail } from './services/suggestMail.js';

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');
const smtpHost = defineSecret('SMTP_HOST');
const smtpUser = defineSecret('SMTP_USER');
const smtpPass = defineSecret('SMTP_PASS');
const suggestToEmail = defineSecret('SUGGEST_TO_EMAIL');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '12mb' }));

app.get(['/api/health', '/health'], (_req, res) => {
  res.json({
    ok: true,
    hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    platform: 'firebase',
  });
});

/** 기숙사·명진당·교직원·학생회관 — 오늘 점심/저녘 (크롤 실패 시 샘플) */
app.get(['/api/menus', '/menus'], async (req, res) => {
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

app.post(['/api/suggest', '/suggest'], async (req, res) => {
  try {
    const { type, body, name, home, replyEmail } = req.body || {};
    if (!body?.trim()) {
      return res.status(400).json({ ok: false, error: '내용을 입력해주세요' });
    }
    await sendSuggestionEmail({ type, body: body.trim(), name, home, replyEmail });
    res.json({ ok: true, message: '건의가 메일로 전달되었습니다.' });
  } catch (err) {
    console.error('[api/suggest]', err.message);
    const status = err.code === 'NO_MAIL_CONFIG' || err.code === 'NO_SMTP' ? 503 : 500;
    res.status(status).json({ ok: false, error: err.message, code: err.code });
  }
});

/** 시간표 이미지 OCR — ANTHROPIC_API_KEY (Secret / env) */
app.post(['/api/analyze/timetable', '/analyze/timetable'], async (req, res) => {
  try {
    const { imageBase64, mediaType } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ ok: false, error: 'imageBase64가 필요합니다' });
    }
    const result = await analyzeTimetableImage({
      imageBase64: String(imageBase64).replace(/^data:image\/\w+;base64,/, ''),
      mediaType: mediaType || 'image/jpeg',
    });
    res.json({
      ok: true,
      curKey: result.curKey,
      curTxt: result.curTxt,
      nextTxt: result.nextTxt,
      gapMin: result.gapMin,
      nextKey: result.nextKey,
      mealIntent: result.mealIntent,
    });
  } catch (err) {
    console.error('[api/analyze/timetable]', err.message);
    const status = err.code === 'NO_API_KEY' ? 503 : 500;
    res.status(status).json({ ok: false, error: err.message, code: err.code });
  }
});

/** Hosting rewrite: /api/** → 이 함수 (경로 그대로 전달) */
function applySecrets() {
  if (anthropicApiKey.value()) process.env.ANTHROPIC_API_KEY = anthropicApiKey.value();
  if (smtpHost.value()) process.env.SMTP_HOST = smtpHost.value();
  if (smtpUser.value()) process.env.SMTP_USER = smtpUser.value();
  if (smtpPass.value()) process.env.SMTP_PASS = smtpPass.value();
  if (suggestToEmail.value()) process.env.SUGGEST_TO_EMAIL = suggestToEmail.value();
  process.env.SMTP_FROM = process.env.SMTP_FROM || process.env.SMTP_USER;
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
