/** 시간 문자열 ↔ 분 (KST 로컬 시각 기준) */
window.TimeUtil = (function () {
  const LUNCH_START = '11:30';
  const LUNCH_END = '14:30';
  const LONG_GAP_MIN = 120;
  const LUNCH_GAP_MIN = 60;

  function timeToMin(t) {
    const [h, m] = String(t).split(':').map(Number);
    return h * 60 + (m || 0);
  }

  function minToTime(m) {
    const h = Math.floor(m / 60);
    const mi = m % 60;
    return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  }

  /** 점심 시간대: 공강 시작·종료가 이 구간과 겹치면 점심 식사 후보 */
  function isInLunchWindow(nowMin, start = LUNCH_START, end = LUNCH_END) {
    return nowMin >= timeToMin(start) && nowMin < timeToMin(end);
  }

  function mealRules() {
    return {
      longGapMinutes: LONG_GAP_MIN,
      lunchGapMinutes: LUNCH_GAP_MIN,
      lunchWindowStart: LUNCH_START,
      lunchWindowEnd: LUNCH_END,
    };
  }

  return {
    timeToMin,
    minToTime,
    isInLunchWindow,
    mealRules,
    LUNCH_START,
    LUNCH_END,
    LONG_GAP_MIN,
    LUNCH_GAP_MIN,
  };
})();
