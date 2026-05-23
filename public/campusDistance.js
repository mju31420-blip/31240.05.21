/**
 * 명지대 자연캠퍼스 도보 거리(분) — 건물↔식당 왕복 포함
 * 출처: 캠퍼스 동선 기준 추정 (실측 데이터로 교체 가능)
 */
window.CampusDistance = (function () {
  const EAT_MIN = 20;

  /** 수업 건물 → 식당 (편도 분) */
  const TO_REST = {
    '1공': { 기숙사: 11, 명진당: 8, 교직원: 5, 학생회관: 7 },
    '2공': { 기숙사: 11, 명진당: 7, 교직원: 5, 학생회관: 7 },
    '3공': { 기숙사: 10, 명진당: 7, 교직원: 4, 학생회관: 8 },
    '5공': { 기숙사: 10, 명진당: 6, 교직원: 5, 학생회관: 6 },
    명진당: { 기숙사: 13, 명진당: 2, 교직원: 8, 학생회관: 10 },
    공2: { 기숙사: 11, 명진당: 8, 교직원: 6, 학생회관: 7 },
    자연: { 기숙사: 9, 명진당: 10, 교직원: 9, 학생회관: 11 },
    학생: { 기숙사: 14, 명진당: 9, 교직원: 7, 학생회관: 3 },
    창조: { 기숙사: 12, 명진당: 9, 교직원: 7, 학생회관: 9 },
    채플: { 기숙사: 13, 명진당: 9, 교직원: 7, 학생회관: 4 },
  };

  /** 수업 건물 ↔ 수업 건물 (편도, 다음 수업 복귀용) */
  const B2B = {
    '1공': { '1공': 0, '2공': 5, '3공': 7, '5공': 9, 공2: 8, 자연: 12, 학생: 9, 명진당: 8, 창조: 6, 채플: 10 },
    '2공': { '1공': 5, '2공': 0, '3공': 6, '5공': 7, 공2: 5, 자연: 11, 학생: 8, 명진당: 7, 창조: 6, 채플: 9 },
    '3공': { '1공': 7, '2공': 6, '3공': 0, '5공': 8, 공2: 6, 자연: 11, 학생: 8, 명진당: 7, 창조: 7, 채플: 9 },
    '5공': { '1공': 9, '2공': 7, '3공': 8, '5공': 0, 공2: 7, 자연: 6, 학생: 12, 명진당: 6, 창조: 5, 채플: 11 },
    공2: { '1공': 8, '2공': 5, '3공': 6, '5공': 7, 공2: 0, 자연: 10, 학생: 5, 명진당: 8, 창조: 6, 채플: 6 },
    자연: { '1공': 12, '2공': 11, '3공': 11, '5공': 6, 공2: 10, 자연: 0, 학생: 13, 명진당: 10, 창조: 9, 채플: 12 },
    학생: { '1공': 9, '2공': 8, '3공': 8, '5공': 12, 공2: 5, 자연: 13, 학생: 0, 명진당: 9, 창조: 8, 채플: 4 },
    명진당: { '1공': 8, '2공': 7, '3공': 7, '5공': 6, 공2: 8, 자연: 10, 학생: 9, 명진당: 0, 창조: 7, 채플: 8 },
    창조: { '1공': 6, '2공': 6, '3공': 7, '5공': 5, 공2: 6, 자연: 9, 학생: 8, 명진당: 7, 창조: 0, 채플: 8 },
    채플: { '1공': 10, '2공': 9, '3공': 9, '5공': 11, 공2: 6, 자연: 12, 학생: 4, 명진당: 8, 창조: 8, 채플: 0 },
  };

  const REST_KEYS = ['기숙사', '명진당', '교직원', '학생회관'];

  function walkToRest(fromB, rest) {
    return (TO_REST[fromB] || TO_REST['3공'])[rest] ?? 8;
  }

  function walkB2B(fromB, toB) {
    if (!toB || toB === 'none') return 0;
    return (B2B[fromB] || B2B['3공'])[toB] ?? 8;
  }

  /** 식당 → 다음 수업 건물 (식당에서 나와 건물로) */
  function walkRestToBuilding(rest, toB) {
    if (!toB || toB === 'none') return 0;
    return walkToRest(toB, rest);
  }

  /**
   * 왕복 동선: 현재건물 → 식당 → (다음 수업 건물)
   * 1시간 공강이면 back이 길어 기숙사 등 먼 곳은 자동 불리
   */
  function planRoundTrip(fromKey, nextKey, restaurantKey, waitMin, eatMin = EAT_MIN) {
    const go = walkToRest(fromKey, restaurantKey);
    const hasNext = nextKey && nextKey !== 'none';
    const back = hasNext ? walkRestToBuilding(restaurantKey, nextKey) : 0;
    const total = go + (waitMin || 0) + eatMin + back;
    return {
      go,
      back,
      wait: waitMin || 0,
      eat: eatMin,
      total,
      margin: null,
      hasNext,
      label: hasNext
        ? `가기 ${go}분 + 식사 ${eatMin}분 + 복귀 ${back}분`
        : `가기 ${go}분 + 식사 ${eatMin}분 (하교)`,
    };
  }

  /** 공강이 짧을수록 1(거리·대기 우선), 길수록 0(취향 우선) */
  function gapPressure(gapMin) {
    const gap = gapMin ?? 75;
    if (gap <= 42) return 1;
    if (gap >= 98) return 0;
    return (98 - gap) / (98 - 42);
  }

  /**
   * 순위 모드별 가중치 (합 ≈ 1)
   * - distance / food: 고정
   * - balance: 공강 길이만으로 결정 (식당별 totalTime에 따라 달라지지 않음 → 공정 비교)
   */
  function rankWeights(mode, gapMin, period) {
    if (period === 'dinner') {
      if (mode === 'distance') return { wTime: 0.88, wWait: 0.04, wMatch: 0.08, label: '거리·왕복' };
      if (mode === 'food') return { wTime: 0.2, wWait: 0.04, wMatch: 0.76, label: '음식·취향' };
      return { wTime: 0.55, wWait: 0.04, wMatch: 0.41, label: '균형' };
    }
    if (mode === 'distance') return { wTime: 0.76, wWait: 0.18, wMatch: 0.06, label: '거리·왕복' };
    if (mode === 'food') return { wTime: 0.1, wWait: 0.08, wMatch: 0.82, label: '음식·취향' };

    const p = gapPressure(gapMin);
    const wTime = 0.24 + 0.5 * p;
    const wWait = 0.12 + 0.1 * p;
    const wMatch = Math.max(0.08, 1 - wTime - wWait);
    const label = p >= 0.82 ? '균형(공강 짧음→거리)' : p <= 0.18 ? '균형(여유→취향)' : '균형';
    return { wTime, wWait, wMatch, label };
  }

  /** 운영 종료만 (오픈 전·내일 예정·운영 중은 순위 대상) */
  function isClosedEntry(entry) {
    return entry.cardState === 'closed' || entry.closed === true || entry.status === 'closed';
  }

  /** 0=추천 가능, 1=시간 부족, 2=영업 종료 */
  function rankTier(entry) {
    if (isClosedEntry(entry)) return 2;
    const margin = entry.margin;
    if (typeof margin === 'number' && margin < 0) return 1;
    if (entry.infeasible) return 1;
    return 0;
  }

  /**
   * 왕복·공강 여유를 반영한 시간 점수 (0~100)
   * margin < 0 이면 강한 감점, 여유가 있으면 소폭 가산
   */
  function timeScoreFromTrip(totalTime, gapMin) {
    const gap = gapMin ?? 75;
    const margin = gap - totalTime;
    if (margin < 0) return Math.max(0, 22 + margin * 2.2);
    const base = Math.max(0, 100 - totalTime * 1.42);
    const bufferBonus = Math.min(16, margin * 0.5);
    return Math.min(100, base + bufferBonus);
  }

  function visitWeight(restaurantKey) {
    try {
      const stored = JSON.parse(localStorage.getItem('restaurant_weights') || '{}');
      const w = stored[restaurantKey];
      if (typeof w !== 'number' || !Number.isFinite(w)) return 1;
      return Math.min(1.08, Math.max(0.92, w));
    } catch (e) {
      return 1;
    }
  }

  function scoreRestaurant({
    fromKey,
    nextKey,
    gapMin,
    restaurantKey,
    waitMin,
    matchCount,
    mode,
    period,
    status,
  }) {
    if (status === 'closed') {
      return { score: 0, closed: true, tier: 2, infeasible: false, parts: null };
    }

    const walk = walkToRest(fromKey, restaurantKey);
    const back = nextKey === 'none' || !nextKey ? 0 : walkRestToBuilding(restaurantKey, nextKey);
    const totalTime = walk + (waitMin || 0) + EAT_MIN + back;
    const margin = (gapMin ?? 75) - totalTime;
    const infeasible = margin < 0;

    const timeScore = timeScoreFromTrip(totalTime, gapMin);
    const waitScore = Math.max(0, 100 - (waitMin || 0) * 2.5);
    const cuisineScore = Math.min(100, Math.max(0, typeof matchCount === 'number' ? matchCount : 0));

    const weights = rankWeights(mode, gapMin, period);

    const statusMul = status === 'bad' ? 0.42 : status === 'warn' ? 0.9 : 1;
    const feasibilityMul = infeasible ? 0.35 : 1;
    const raw =
      timeScore * weights.wTime + waitScore * weights.wWait + cuisineScore * weights.wMatch;
    const score = Math.round(raw * visitWeight(restaurantKey) * statusMul * feasibilityMul);

    return {
      score: score || 0,
      closed: false,
      tier: infeasible ? 1 : 0,
      infeasible,
      margin,
      totalTime,
      parts: {
        walk,
        back,
        totalTime,
        margin,
        timeScore: Math.round(timeScore),
        waitScore: Math.round(waitScore),
        cuisineScore: Math.round(cuisineScore),
        weights,
        statusMul,
        feasibilityMul,
        visitW: visitWeight(restaurantKey),
      },
    };
  }

  /**
   * 카드 순서만 모드별로 다르게 (배너·UI 문구와 무관)
   * - distance: 식당까지 도보(편도) → 왕복 총시간 → 대기
   * - food: 오늘 취향 점수 → 음식 모드 종합점수
   * - balance: 공강 반영 종합점수 → 여유(margin) → 왕복
   */
  function compareRestaurants(a, b, mode, period) {
    const cA = isClosedEntry(a);
    const cB = isClosedEntry(b);
    if (cA !== cB) return cA ? 1 : -1;
    if (cA && cB) {
      return (a.restaurantKey || a.key || '').localeCompare(b.restaurantKey || b.key || '', 'ko');
    }

    const tierA = rankTier(a);
    const tierB = rankTier(b);
    if (tierA !== tierB) return tierA - tierB;

    const m = mode || 'balance';
    const mealPeriod = period || 'lunch';
    const walkA = a.walk ?? 999;
    const walkB = b.walk ?? 999;
    const waitA = a.wait ?? 999;
    const waitB = b.wait ?? 999;
    const totalA = a.total ?? a.totalTime ?? 999;
    const totalB = b.total ?? b.totalTime ?? 999;
    const tasteA = a.tasteScore ?? a.cuisineScore ?? 0;
    const tasteB = b.tasteScore ?? b.cuisineScore ?? 0;
    const marginA = typeof a.margin === 'number' ? a.margin : -999;
    const marginB = typeof b.margin === 'number' ? b.margin : -999;

    if (mealPeriod === 'dinner') {
      if (m === 'food' && tasteB !== tasteA) return tasteB - tasteA;
      if (walkA !== walkB) return walkA - walkB;
      if (totalA !== totalB) return totalA - totalB;
      return (a.restaurantKey || a.key || '').localeCompare(b.restaurantKey || b.key || '', 'ko');
    }
    if (m === 'distance') {
      if (walkA !== walkB) return walkA - walkB;
      if (totalA !== totalB) return totalA - totalB;
      if (waitA !== waitB) return waitA - waitB;
      return b.score - a.score;
    }
    if (m === 'food') {
      if (tasteB !== tasteA) return tasteB - tasteA;
      if (b.score !== a.score) return b.score - a.score;
      if (walkA !== walkB) return walkA - walkB;
      return totalA - totalB;
    }
    if (b.score !== a.score) return b.score - a.score;
    if (marginB !== marginA) return marginB - marginA;
    if (totalA !== totalB) return totalA - totalB;
    return (a.restaurantKey || a.key || '').localeCompare(b.restaurantKey || b.key || '', 'ko');
  }

  return {
    EAT_MIN,
    TO_REST,
    B2B,
    REST_KEYS,
    walkToRest,
    walkB2B,
    walkRestToBuilding,
    planRoundTrip,
    gapPressure,
    rankWeights,
    isClosedEntry,
    rankTier,
    compareRestaurants,
    scoreRestaurant,
  };
})();
