/**
 * 식사 의도 판단
 * - 공강 2시간(120분) 이상 → 식사
 * - 11:30~14:30 사이 1시간(60분)+ 공강 → 점심 식사
 */

function timeToMin(t) {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
}

const LUNCH_START = '11:30';
const LUNCH_END = '14:30';

export function computeMealIntent(gapMin, refDate = new Date()) {
  const nowMin = refDate.getHours() * 60 + refDate.getMinutes();
  const lunchWindow = nowMin >= timeToMin(LUNCH_START) && nowMin < timeToMin(LUNCH_END);
  const longGap = gapMin >= 120;
  const lunchHourGap = gapMin >= 60 && lunchWindow;
  const willEat = longGap || lunchHourGap;

  let reason = '공강이 짧아 근처에서 간단히 해결하는 편이 좋아요.';
  let rule = 'skip';
  if (longGap) {
    reason = '공강이 2시간 이상 — 지금은 학식 가기 좋은 시간이에요.';
    rule = 'long_gap';
  } else if (lunchHourGap) {
    reason = `점심 시간대(${LUNCH_START}~${LUNCH_END})에 공강 1시간 이상 — 점심 식사 추천해요.`;
    rule = 'lunch_window';
  }

  const period = refDate.getHours() >= 17 ? 'dinner' : 'lunch';

  return {
    willEat,
    longGap,
    lunchHourGap,
    lunchWindow,
    rule,
    reason,
    period,
    gapMin,
  };
}

/** 거주 유형 → UI/추천 세그먼트 */
export function getUserSegment(home = '') {
  if (home === '기숙사생') {
    return {
      id: 'dorm',
      label: '기숙사생',
      dinnerFocus: true,
      shuttleFocus: false,
      hint: '저녁은 기숙사식당(복지동) 중심으로 추천합니다.',
    };
  }
  if (home === '기흥역행' || home === '기흥역 통학' || home.includes('기흥역')) {
    return {
      id: 'commuter_giheung',
      label: '기흥역행',
      dinnerFocus: false,
      shuttleFocus: true,
      hint: '하교·저녁 전 기흥역 셔틀과 동선을 함께 봐주세요.',
    };
  }
  if (home === '시내행' || home === '시내버스 통학' || home.includes('시내')) {
    return {
      id: 'commuter_sinae',
      label: '시내행',
      dinnerFocus: false,
      shuttleFocus: true,
      hint: '하교·저녁 전 시내 셔틀과 동선을 함께 봐주세요.',
    };
  }
  return {
    id: 'general',
    label: '일반',
    dinnerFocus: false,
    shuttleFocus: false,
    hint: '캠퍼스 식당과 공강 시간을 기준으로 추천합니다.',
  };
}

export function shouldUseShuttle(home, nextKey, period) {
  const seg = getUserSegment(home);
  if (!seg.shuttleFocus) return false;
  return nextKey === 'none' || period === 'dinner';
}
