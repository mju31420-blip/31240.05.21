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
import { sendSuggestionEmail, getMailConfigStatus } from './services/suggestMail.js';

function getDb() {
  if (!getApps().length) initializeApp();
  return getFirestore();
}

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');
const smtpHost = defineSecret('SMTP_HOST');
const smtpUser = defineSecret('SMTP_USER');
const smtpPass = defineSecret('SMTP_PASS');
const suggestToEmail = defineSecret('SUGGEST_TO_EMAIL');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '12mb' }));

app.get(['/api/health', '/health'], (_req, res) => {
  const mail = getMailConfigStatus();
  res.json({
    ok: true,
    hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    mailReady: mail.hasTo && mail.hasSmtp,
    mail,
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
  const { type, body, name, home, replyEmail } = req.body || {};
  if (!body?.trim()) {
    return res.status(400).json({ ok: false, error: '내용을 입력해주세요' });
  }

  const payload = {
    type: type || '기타',
    body: body.trim(),
    name: name || '익명',
    home: home || '',
    replyEmail: replyEmail || '',
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
app.post(['/api/analyze/timetable', '/analyze/timetable'], async (req, res) => {
  try {
    const { imageBase64, mediaType } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ ok: false, error: 'imageBase64가 필요합니다' });
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
