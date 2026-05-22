/**
 * PWA Service Worker 등록 및 업데이트 알림
 */
(function registerPwa() {
  if (!('serviceWorker' in navigator)) return;

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js?v=20260522-fix2', { scope: '/' })
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const next = reg.installing;
          if (!next) return;
          next.addEventListener('statechange', () => {
            if (next.state === 'installed' && navigator.serviceWorker.controller) {
              notifyUpdate(reg);
            }
          });
        });
      })
      .catch((err) => console.warn('[pwa] sw register failed', err));
  });

  function notifyUpdate(reg) {
    if (typeof showToast === 'function') {
      showToast('업데이트 적용 중…');
    }
    reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
  }

  /** URL ?tab=food|shuttle — 홈 화면 바로가기 */
  const params = new URLSearchParams(location.search);
  const tab = params.get('tab');
  if (tab) {
    window.addEventListener('load', () => {
      setTimeout(() => {
        if (typeof goTab !== 'function') return;
        const el = document.querySelector(`.tb[onclick*="'${tab}'"]`);
        if (el) goTab(tab, el);
      }, 500);
    });
  }
})();
