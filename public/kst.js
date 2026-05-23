/** 대한민국(KST) 시각 */
function kstNow() {
  const mock = window.__BETA_MOCK_TIME__;
  if (mock) {
    const fixed = new Date(mock);
    if (!Number.isNaN(fixed.getTime())) return fixed;
  }
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
}

window.KST = {
  now() {
    return kstNow();
  },
  format(d = null) {
    const x = d || KST.now();
    return x.toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  },
};
