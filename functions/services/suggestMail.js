import nodemailer from 'nodemailer';

const DISPLAY_NAME = '명비서';

/** SMTP_FROM="명비서 <a@b.com>" / 이메일만 / 미설정 모두 처리 */
function resolveFrom() {
  const user = (process.env.SMTP_USER || '').trim();
  if (!user) return null;

  const raw = (process.env.SMTP_FROM || '').trim();
  if (!raw || raw === user) {
    return { name: DISPLAY_NAME, address: user };
  }

  const angle = raw.match(/^(.+?)\s*<\s*([^>\s]+)\s*>$/);
  if (angle) {
    const name = angle[1].replace(/^["']|["']$/g, '').trim() || DISPLAY_NAME;
    return { name, address: angle[2].trim() };
  }

  if (raw.includes('@')) {
    return { name: DISPLAY_NAME, address: raw };
  }

  return { name: DISPLAY_NAME, address: user };
}

function getTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true';

  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure && port === 587,
    auth: { user, pass },
    tls: { minVersion: 'TLSv1.2' },
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendSuggestionEmail(payload) {
  const to = (process.env.SUGGEST_TO_EMAIL || '').trim();
  const from = resolveFrom();
  if (!to) {
    const err = new Error('SUGGEST_TO_EMAIL이 설정되지 않았습니다.');
    err.code = 'NO_MAIL_CONFIG';
    throw err;
  }
  if (!from?.address) {
    const err = new Error('SMTP_USER가 설정되지 않았습니다.');
    err.code = 'NO_SMTP';
    throw err;
  }

  const transport = getTransport();
  if (!transport) {
    const err = new Error('SMTP 설정이 없습니다 (SMTP_HOST, SMTP_USER, SMTP_PASS).');
    err.code = 'NO_SMTP';
    throw err;
  }

  const { type, body, name, home, replyEmail } = payload;
  const typeLabel = type || '기타';
  const subject = `[명비서 건의] ${typeLabel}`;
  const sentAt = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

  const text = [
    `유형: ${typeLabel}`,
    `이름: ${name || '익명'}`,
    `거주: ${home || '-'}`,
    replyEmail ? `회신: ${replyEmail}` : '',
    `시각: ${sentAt}`,
    '',
    '--- 내용 ---',
    body,
  ]
    .filter(Boolean)
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta charset="UTF-8">
</head>
<body style="font-family:'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif;line-height:1.65;color:#111">
<p><b>유형:</b> ${escapeHtml(typeLabel)}</p>
<p><b>이름:</b> ${escapeHtml(name || '익명')}</p>
<p><b>거주:</b> ${escapeHtml(home || '-')}</p>
${replyEmail ? `<p><b>회신:</b> ${escapeHtml(replyEmail)}</p>` : ''}
<p><b>시각:</b> ${escapeHtml(sentAt)}</p>
<hr style="border:none;border-top:1px solid #e2e8f2;margin:14px 0">
<p><b>내용</b></p>
<pre style="white-space:pre-wrap;word-break:break-word;font-family:inherit;font-size:14px;margin:0">${escapeHtml(body)}</pre>
</body>
</html>`;

  const info = await transport.sendMail({
    from,
    to,
    replyTo: replyEmail || undefined,
    subject,
    text,
    html,
    headers: {
      'Content-Language': 'ko-KR',
    },
  });

  console.log('[suggest] mail sent', { to, messageId: info.messageId });
  return { sent: true, to, messageId: info.messageId };
}
