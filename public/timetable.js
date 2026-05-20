/**
 * 사용자 주간 시간표 (에브리타임 캡처 기준)
 * 호실 → 건물키: Y19→3공, Y22→학생, Y25→자연, Y9→공2
 */
window.USER_TIMETABLE = [
  { dow: 1, start: '09:00', end: '10:30', name: '환경과인간', room: 'Y2532', buildingKey: '자연', teacher: '조성경' },
  { dow: 1, start: '13:00', end: '14:30', name: '디지털논리회로', room: 'Y19221', buildingKey: '3공', teacher: '남순열' },
  { dow: 1, start: '14:30', end: '16:00', name: '전자기학', room: 'Y19127', buildingKey: '3공', teacher: '정의훈' },

  { dow: 2, start: '10:00', end: '11:30', name: '회로이론', room: 'Y19116', buildingKey: '3공', teacher: '강상희' },
  { dow: 2, start: '12:00', end: '13:00', name: '채플', room: 'Y22217', buildingKey: '학생', teacher: '교목실' },
  { dow: 2, start: '14:00', end: '16:00', name: '전기회로실험1', room: 'Y19319', buildingKey: '3공', teacher: '심재륜' },

  { dow: 3, start: '09:00', end: '10:30', name: '환경과인간', room: 'Y2532', buildingKey: '자연', teacher: '조성경' },
  { dow: 3, start: '11:00', end: '12:30', name: '디지털논리회로', room: 'Y19221', buildingKey: '3공', teacher: '남순열' },
  { dow: 3, start: '13:00', end: '14:00', name: '전자기학', room: 'Y19127', buildingKey: '3공', teacher: '정의훈' },
  { dow: 3, start: '14:00', end: '16:30', name: 'C언어', room: 'Y9119', buildingKey: '공2', teacher: '미배정' },

  { dow: 4, start: '10:00', end: '12:00', name: '회로이론', room: 'Y19116', buildingKey: '3공', teacher: '강상희' },
  { dow: 4, start: '13:00', end: '15:00', name: '디지털논리회로실험', room: 'Y19319', buildingKey: '3공', teacher: '김태완' },
];

const BUILDING_LABELS = {
  '3공': '제3공학관 (Y19)',
  '5공': '제5공학관 (Y5)',
  명진당: '명진당 (Y3)',
  공2: '공학2관 (Y11)',
  자연: '자연과학관 (Y7)',
  학생: '학생회관 (Y21)',
};

window.TimetableUtil = {
  BUILDING_LABELS,

  /** 지금 시각 기준 상태 */
  analyzeNow(classes = USER_TIMETABLE, refDate = null) {
    refDate = refDate || (typeof KST !== 'undefined' ? KST.now() : new Date());
    const dow = refDate.getDay();
    const nowMin = refDate.getHours() * 60 + refDate.getMinutes();
    const t2m = (t) => TimeUtil.timeToMin(t);
    const today = classes.filter((c) => c.dow === dow).sort((a, b) => t2m(a.start) - t2m(b.start));

    let inClass = null;
    let lastEnded = null;
    let nextClass = null;

    for (const c of today) {
      const st = t2m(c.start);
      const en = t2m(c.end);
      if (nowMin >= st && nowMin < en) inClass = c;
      if (en <= nowMin) lastEnded = c;
      if (st > nowMin && !nextClass) nextClass = c;
    }

    const anchor = inClass || lastEnded;
    const curKey = anchor?.buildingKey || (today[0]?.buildingKey) || '3공';
    const curName = inClass?.name || lastEnded?.name || '캠퍼스';
    const curRoom = anchor?.room || '';

    let gapMin = 0;
    let gapFrom = nowMin;
    if (inClass) gapFrom = t2m(inClass.end);
    else if (lastEnded) gapFrom = Math.max(nowMin, t2m(lastEnded.end));

    if (nextClass) {
      gapMin = Math.max(0, t2m(nextClass.start) - gapFrom);
    } else if (dow === 5 || !today.length) {
      gapMin = 240;
    } else if (lastEnded || inClass) {
      gapMin = Math.max(90, 17 * 60 - gapFrom);
    } else {
      gapMin = 75;
    }

    const curTxt = inClass
      ? `${curName} 수업 중 (${curRoom})`
      : lastEnded
        ? `${lastEnded.name} 방금 종료 (${lastEnded.room})`
        : '수업 전·캠퍼스';

    const nextTxt = nextClass
      ? `${nextClass.name} (${nextClass.room}) ${nextClass.start}~${nextClass.end}`
      : dow === 5 || !nextClass
        ? '없음 (하교·자유)'
        : '없음 (하교)';

    const mealIntent = MealEngine.computeMealIntent(gapMin, refDate);

    return {
      curKey,
      curTxt,
      nextKey: nextClass?.buildingKey || 'none',
      nextTxt,
      gapMin,
      mealIntent,
      inClass,
      lastEnded,
      nextClass,
      today,
    };
  },

  formatGapText(gapMin) {
    if (gapMin >= 120) return `${gapMin}분 (2시간 이상)`;
    if (gapMin >= 60) return `${gapMin}분 (1시간+)`;
    return `${gapMin}분`;
  },
};
