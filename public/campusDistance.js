/**
 * 명지대 자연캠퍼스 도보 거리(분) — 건물↔식당 왕복 포함
 * 출처: 캠퍼스 동선 기준 추정 (실측 데이터로 교체 가능)
 */
window.CampusDistance = (function () {
  const EAT_MIN = 15;

  /** 수업 건물 → 식당 (편도 분) */
  const TO_REST = {
    '1공': { 기숙사: 11, 명진당: 8, 교직원: 5, 학생회관: 7 },
    '2공': { 기숙사: 11, 명진당: 7, 교직원: 5, 학생회관: 7 },
    '3공': { 기숙사: 12, 명진당: 7, 교직원: 4, 학생회관: 8 },
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

  /**
   * 순위 모드별 가중치 (합 ≈ 1)
   * - distance: 왕복·도보 우선 (공강 짧을 때와 동일 계열)
   * - food: 오늘 식단 취향 매칭 우선
   * - balance: 공강·왕복이 여유면 취향 비중 ↑, 짧으면 거리 비중 ↑
   */
  function rankWeights(mode, gapMin, totalTime) {
    const gap = gapMin ?? 75;
    if (mode === 'distance') return { wTime: 0.78, wWait: 0.17, wMatch: 0.05, label: '거리·왕복' };
    if (mode === 'food') return { wTime: 0.1, wWait: 0.08, wMatch: 0.82, label: '음식·취향' };
    if (gap < 50) return { wTime: 0.62, wWait: 0.18, wMatch: 0.2, label: '균형(공강 짧음→거리)' };
    if (gap >= 90 && totalTime <= 38) return { wTime: 0.26, wWait: 0.12, wMatch: 0.62, label: '균형(여유→취향)' };
    return { wTime: 0.4, wWait: 0.2, wMatch: 0.4, label: '균형' };
  }

  function scoreRestaurant({ fromKey, nextKey, gapMin, restaurantKey, waitMin, matchCount, mode, status }) {
    if (status === 'closed') return { score: -9999, parts: null };

    const walk = walkToRest(fromKey, restaurantKey);
    const back = nextKey === 'none' || !nextKey ? 0 : walkRestToBuilding(restaurantKey, nextKey);
    const totalTime = walk + (waitMin || 0) + EAT_MIN + back;
    const timeScore = Math.max(0, 100 - totalTime * 1.5);
    const waitScore = Math.max(0, 100 - (waitMin || 0) * 2.5);
    const cuisineScore = Math.min(100, Math.max(0, typeof matchCount === 'number' ? matchCount : 0));

    const weights = rankWeights(mode, gapMin, totalTime);

    let visitW = 1.0;
    try {
      const stored = JSON.parse(localStorage.getItem('restaurant_weights') || '{}');
      visitW = stored[restaurantKey] || 1.0;
    } catch (e) {
      /* ignore */
    }

    const statusMul = status === 'bad' ? 0.4 : status === 'warn' ? 0.88 : 1;
    const raw =
      timeScore * weights.wTime + waitScore * weights.wWait + cuisineScore * weights.wMatch;
    const score = Math.round(raw * visitW * statusMul);

    return {
      score: score || 0,
      parts: {
        walk,
        back,
        totalTime,
        timeScore: Math.round(timeScore),
        waitScore: Math.round(waitScore),
        cuisineScore: Math.round(cuisineScore),
        weights,
        statusMul,
        visitW,
      },
    };
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
    rankWeights,
    scoreRestaurant,
  };
})();
