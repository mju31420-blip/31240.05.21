/** 대한민국(KST) 시각 */
window.KST = {
  now() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
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
