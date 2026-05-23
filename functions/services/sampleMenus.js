/** 크롤 실패 시 식당·요일별 점심/저녁 샘플 (dow: 0=일 … 6=토) */
export function getSampleMenus() {
  const lunchByDow = {
    1: ['제육볶음', '김치찌개', '비빔밥'],
    2: ['돈까스', '우동', '미역국'],
    3: ['불고기', '된장찌개', '잡곡밥'],
    4: ['치킨마요덮밥', '순두부찌개', '야채볶음'],
    5: ['스파게티', '함박스테이크', '콩나물국'],
  };
  const dinnerByDow = {
    1: ['치킨가라아게', '냉면'],
    2: ['제육덮밥', '라면'],
    3: ['생선구이', '카레라이스'],
    4: ['오징어볶음', '짜장면'],
    5: ['삼겹살구이', '우동'],
  };

  /** 식당마다 메뉴를 다르게 — 음식·취향 탭 순위 분리용 */
  const restaurantLunch = {
    기숙사: {
      3: ['제육볶음', '순두부찌개', '비빔밥'],
      4: ['갈비찜', '미역국', '잡곡밥'],
    },
    명진당: {
      3: ['돈까스', '우동', '규동'],
      4: ['가츠동', '라멘', '야끼소바'],
    },
    교직원: {
      3: ['불고기', '된장찌개', '잡곡밥'],
      4: ['닭갈비', '순두부찌개', '비빔밥'],
    },
    학생회관: {
      3: ['스파게티', '함박스테이크', '피자토스트'],
      4: ['로제파스타', '치킨텐더', '샐러드'],
    },
  };

  const restaurantDinner = {
    명진당: { 3: ['가라아게', '우동'], 5: ['돈까스', '라멘'] },
    학생회관: { 3: ['파스타', '스테이크'], 5: ['함박', '수프'] },
  };

  function toItems(names) {
    return (names || []).map((n) => ({ n, t: '없음', k: 0 }));
  }

  function namesFor(map, dow, fallback) {
    return map?.[dow] || map?.[3] || fallback[dow] || fallback[3] || fallback[1];
  }

  function weekFor(lunchMap, dinnerMap = dinnerByDow) {
    const days = {};
    for (let dow = 0; dow <= 6; dow++) {
      days[dow] = {
        l: toItems(namesFor(lunchMap, dow, lunchByDow)),
        d: toItems(namesFor(dinnerMap, dow, dinnerByDow)),
        b: [],
      };
    }
    return days;
  }

  return {
    기숙사: weekFor(restaurantLunch.기숙사),
    명진당: weekFor(restaurantLunch.명진당, { ...dinnerByDow, ...restaurantDinner.명진당 }),
    교직원: weekFor(restaurantLunch.교직원),
    학생회관: weekFor(restaurantLunch.학생회관, { ...dinnerByDow, ...restaurantDinner.학생회관 }),
  };
}
