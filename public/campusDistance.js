/**
 * 명지대 자연캠퍼스 도보 거리(분) — 건물↔식당 왕복 포함
 * 출처: 캠퍼스 동선 기준 추정 (실측 데이터로 교체 가능)
 */
window.CampusDistance = (function () {
  const EAT_MIN = 15;

  /** 수업 건물 → 식당 (편도 분) */
  const TO_REST = {
    '3공': { 기숙사: 12, 명진당: 7, 교직원: 4, 학생회관: 8 },
    '5공': { 기숙사: 10, 명진당: 6, 교직원: 5, 학생회관: 6 },
    명진당: { 기숙사: 13, 명진당: 2, 교직원: 8, 학생회관: 10 },
    공2: { 기숙사: 11, 명진당: 8, 교직원: 6, 학생회관: 7 },
    자연: { 기숙사: 9, 명진당: 10, 교직원: 9, 학생회관: 11 },
    학생: { 기숙사: 14, 명진당: 9, 교직원: 7, 학생회관: 3 },
  };

  /** 수업 건물 ↔ 수업 건물 (편도, 다음 수업 복귀용) */
  const B2B = {
    '3공': { '3공': 0, '5공': 8, 공2: 6, 자연: 11, 학생: 8, 명진당: 7 },
    '5공': { '3공': 8, '5공': 0, 공2: 7, 자연: 6, 학생: 12, 명진당: 6 },
    공2: { '3공': 6, '5공': 7, 공2: 0, 자연: 10, 학생: 5, 명진당: 8 },
    자연: { '3공': 11, '5공': 6, 공2: 10, 자연: 0, 학생: 13, 명진당: 10 },
    학생: { '3공': 8, '5공': 12, 공2: 5, 자연: 13, 학생: 0, 명진당: 9 },
    명진당: { '3공': 7, '5공': 6, 공2: 8, 자연: 10, 학생: 9, 명진당: 0 },
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

  function scoreRestaurant({ fromKey, nextKey, gapMin, restaurantKey, waitMin, matchCount, mode, status }) {
    if (status === 'closed') return { score: -9999 };
    if (status === 'bad') return { score: -500 };

    const walk = walkToRest(fromKey, restaurantKey);
    const back = nextKey === 'none' || !nextKey ? 0 : walkToRest(restaurantKey, nextKey);

    const totalTime = walk + waitMin + 15 + back;
    const timeScore = Math.max(0, 100 - totalTime * 1.5);
    const waitScore = Math.max(0, 100 - waitMin * 2.5);
    const matchScore = Math.min(100, matchCount * 30);

    let w = 1.0;
    try {
      const weights = JSON.parse(localStorage.getItem('restaurant_weights') || '{}');
      w = weights[restaurantKey] || 1.0;
    } catch (e) {
      /* ignore */
    }

    let score;
    if (mode === 'distance') {
      score = (timeScore * 0.75 + waitScore * 0.2 + matchScore * 0.05) * w;
    } else if (mode === 'food') {
      score = (matchScore * 0.75 + timeScore * 0.15 + waitScore * 0.1) * w;
    } else {
      score = (timeScore * 0.4 + waitScore * 0.2 + matchScore * 0.4) * w;
    }

    return { score: Math.round(score || 0) };
  }

  return {
    EAT_MIN,
    TO_REST,
    B2B,
    REST_KEYS,
    walkToRest,
    walkB2B,
    planRoundTrip,
    scoreRestaurant,
  };
})();
