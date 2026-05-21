/** @file 명비서 — 공간·시간 식사 의도 엔진 (브라우저) */

window.MealEngine = (function () {
  const BUILDINGS = ['3공', '5공', '명진당', '공2', '자연', '학생'];
  const LUNCH_ENDS = ['10:15', '11:00', '11:50', '12:40', '13:30'];
  const DINNER_ENDS = ['16:30', '17:00', '17:30', '18:00'];

  function buildWaves() {
    const waves = [];
    let id = 0;
    for (const b of BUILDINGS) {
      for (const end of LUNCH_ENDS) {
        waves.push({
          id: ++id,
          building: b,
          meal: 'lunch',
          endTime: end,
          surge: Math.min(950, 420 + (BUILDINGS.indexOf(b) % 3) * 80 + LUNCH_ENDS.indexOf(end) * 35),
        });
      }
      for (const end of DINNER_ENDS) {
        waves.push({
          id: ++id,
          building: b,
          meal: 'dinner',
          endTime: end,
          surge: Math.min(720, 280 + (BUILDINGS.indexOf(b) % 4) * 45),
        });
      }
    }
    return waves;
  }

  const CROWD_WAVES = buildWaves();

  function computeMealIntent(gapMin, refDate = new Date()) {
    const TU = typeof TimeUtil !== 'undefined' ? TimeUtil : null;
    const nowMin = refDate.getHours() * 60 + refDate.getMinutes();
    const longGapMin = TU?.LONG_GAP_MIN ?? 120;
    const lunchGapMin = TU?.LUNCH_GAP_MIN ?? 60;
    const lunchStart = TU?.LUNCH_START ?? '11:30';
    const lunchEnd = TU?.LUNCH_END ?? '14:30';
    const lunchWindow = TU ? TU.isInLunchWindow(nowMin, lunchStart, lunchEnd) : nowMin >= 690 && nowMin < 870;
    const longGap = gapMin >= longGapMin;
    const lunchHourGap = gapMin >= lunchGapMin && lunchWindow;
    const willEat = longGap || lunchHourGap;
    let reason = '공강이 짧아 학식 이동은 부담스러울 수 있어요.';
    let rule = 'skip';
    if (longGap) {
      reason = '공강 2시간 이상 — 이 시간대에 식사 이동이 예상됩니다.';
      rule = 'long_gap';
    } else if (lunchHourGap) {
      reason = `${lunchStart}~${lunchEnd} 사이 1시간+ 공강 — 점심 식사 이동이 예상됩니다.`;
      rule = 'lunch_window';
    }
    const period = refDate.getHours() >= 17 ? 'dinner' : 'lunch';
    return { willEat, longGap, lunchHourGap, lunchWindow, rule, reason, period, gapMin };
  }

  /** 거주 유형 — 내부 참고만 (UI 분기 없음) */
  function getUserSegment(home = '') {
    return {
      id: 'all',
      label: home || '미설정',
      hint: '공강·왕복 도보·메뉴 매칭으로 추천합니다.',
      isCommute: home.includes('통학'),
      isDorm: home === '기숙사생',
    };
  }

  function estimateCrowd(building, period, gapMin, willEat) {
    if (!willEat) return { 인원: '120명', 혼잡도: 25, 설명: '식사 이동 수요 낮음' };
    const meal = period === 'dinner' ? 'dinner' : 'lunch';
    const pool = CROWD_WAVES.filter((w) => w.building === building && w.meal === meal);
    const wave = pool[gapMin % pool.length] || pool[0];
    const boost = gapMin >= 120 ? 1.15 : gapMin >= 60 ? 1.05 : 1;
    const surge = Math.round((wave?.surge || 500) * boost);
    return {
      인원: `${surge}명`,
      혼잡도: Math.min(95, Math.round(surge / 10)),
      설명: `${building} 종료 묶음 · ${meal === 'lunch' ? '점심' : '저녁'} 파동`,
    };
  }

  const EXTERNAL = {
    diet: [
      { name: '닭가슴살 샐러드', platform: '쿠팡', q: '닭가슴살 샐러드 도시락' },
      { name: '곤약/두부 도시락', platform: '쿠팡', q: '다이어트 도시락' },
      { name: '샐러드·요거트', platform: '마켓컬리', q: '샐러드' },
    ],
    noMatch: [
      { name: '냉동 도시락·간편식', platform: '쿠팡', q: '냉동 도시락' },
      { name: '밀키트', platform: '쿠팡', q: '밀키트 1인분' },
      { name: '외식 메뉴', platform: '배달의민족', q: '용인 기흥' },
    ],
    badCafeteria: [
      { name: '기흥역 근처 맛집', platform: '네이버지도', q: '명지대 기흥역 맛집' },
      { name: '간편식·도시락', platform: '쿠팡', q: '도시락' },
      { name: '1인 메뉴', platform: '요기요', q: '용인 처인구' },
    ],
  };

  function platformUrl(platform, q) {
    const enc = encodeURIComponent(q);
    if (platform === '배달의민족') return `https://www.baemin.com/search?q=${enc}`;
    if (platform === '쿠팡이츠') return `https://www.coupangeats.com/search?q=${enc}`;
    if (platform === '요기요') return `https://www.yogiyo.co.kr/search/?query=${enc}`;
    if (platform === '쿠팡') return `https://www.coupang.com/np/search?q=${enc}`;
    if (platform === '마켓컬리') return `https://www.marketkurly.com/search?sword=${enc}`;
    if (platform === '네이버지도') return `https://map.naver.com/v5/search/${enc}`;
    return `https://map.naver.com/v5/search/${enc}`;
  }

  function shouldSuggestExternal(profile, bestMenus, mealIntent) {
    if (profile.diet) return { why: '다이어트 모드', list: EXTERNAL.diet };
    if (!mealIntent.willEat) return null;
    const matches = (bestMenus || []).filter((m) => m.tag === 'match');
    if (!matches.length && profile.tastes?.length) {
      return { why: '오늘 학식이 취향과 맞지 않아요', list: EXTERNAL.noMatch };
    }
    if (!bestMenus?.length) {
      return { why: '학식 메뉴 정보가 부족해요', list: EXTERNAL.noMatch };
    }
    return null;
  }

  function logCrowdEvent(evt) {
    try {
      const key = 'mb_crowd_log';
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      arr.push({ ...evt, ts: Date.now() });
      localStorage.setItem(key, JSON.stringify(arr.slice(-150)));
    } catch (_) {}
  }

  /** 주간 시간표에서 오늘·지금 식사 공강 탐지 */
  function scanMealGapsForDay(classes, dow) {
    const t2m = (t) => TimeUtil.timeToMin(t);
    const m2t = (m) => TimeUtil.minToTime(m);
    const day = classes.filter((c) => c.dow === dow).sort((a, b) => t2m(a.start) - t2m(b.start));
    const gaps = [];
    for (let i = 0; i < day.length; i++) {
      const end = t2m(day[i].end);
      const nextStart = day[i + 1] ? t2m(day[i + 1].start) : null;
      if (nextStart == null) continue;
      const gap = nextStart - end;
      if (gap < 45) continue;
      const ref = new Date();
      ref.setHours(Math.floor(end / 60), end % 60, 0, 0);
      const intent = computeMealIntent(gap, ref);
      if (intent.willEat) {
        gaps.push({
          after: day[i].name,
          buildingKey: day[i].buildingKey,
          window: `${m2t(end)}~${m2t(nextStart)}`,
          minutes: gap,
          rule: intent.rule,
        });
      }
    }
    if (day.length === 0 && dow === 5) {
      gaps.push({ after: '-', buildingKey: '3공', window: '종일', minutes: 999, rule: 'long_gap' });
    }
    return gaps;
  }

  return {
    computeMealIntent,
    getUserSegment,
    estimateCrowd,
    shouldSuggestExternal,
    platformUrl,
    logCrowdEvent,
    scanMealGapsForDay,
    CROWD_WAVES,
  };
})();
