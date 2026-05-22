import nodemailer from 'nodemailer';

function getTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
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
  const to = process.env.SUGGEST_TO_EMAIL;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!to) {
    const err = new Error('SUGGEST_TO_EMAIL이 설정되지 않았습니다.');
    err.code = 'NO_MAIL_CONFIG';
    throw err;
  }

  const transport = getTransport();
  if (!transport) {
    const err = new Error('SMTP 설정이 없습니다 (SMTP_HOST, SMTP_USER, SMTP_PASS).');
    err.code = 'NO_SMTP';
    throw err;
  }

  const { type, body, name, home, replyEmail } = payload;
  const subjectRaw = `[명비서 건의] ${type || '기타'}`;
  const text = [
    `유형: ${type || '기타'}`,
    `이름: ${name || '익명'}`,
    `거주: ${home || '-'}`,
    replyEmail ? `회신: ${replyEmail}` : '',
    `시각: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
    '',
    '--- 내용 ---',
    body,
  ]
    .filter(Boolean)
    .join('\n');

  const htmlEscaped = escapeHtml(text).replace(/\n/g, '<br>\n');
  const html = `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"></head>
<body style="font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;line-height:1.6;color:#111">${htmlEscaped}</body>
</html>`;

  await transport.sendMail({
    from: { name: '명비서', address: from },
    to,
    subject: subjectRaw,
    text,
    html,
  });
  return { sent: true, to };
}
