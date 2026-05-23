/** 크롤 실패 시 요일별 점심/저녁 샘플 (dow: 0=일 … 6=토, dateKey: MM-DD) */
export function getSampleMenus() {
  const lunchByDow = {
    1: [
      { n: '제육볶음', t: '고기류', k: 0 },
      { n: '김치찌개', t: '찌개류', k: 0 },
      { n: '비빔밥', t: '건강식', k: 0 },
    ],
    2: [
      { n: '돈까스', t: '고기류', k: 0 },
      { n: '우동', t: '면류', k: 0 },
      { n: '미역국', t: '찌개류', k: 0 },
    ],
    3: [
      { n: '불고기', t: '고기류', k: 0 },
      { n: '된장찌개', t: '찌개류', k: 0 },
      { n: '잡곡밥', t: '건강식', k: 0 },
    ],
    4: [
      { n: '치킨마요덮밥', t: '면류', k: 0 },
      { n: '순두부찌개', t: '찌개류', k: 0 },
      { n: '야채볶음', t: '건강식', k: 0 },
    ],
    5: [
      { n: '스파게티', t: '면류', k: 0 },
      { n: '함박스테이크', t: '고기류', k: 0 },
      { n: '콩나물국', t: '찌개류', k: 0 },
    ],
  };
  const dinnerByDow = {
    1: [
      { n: '치킨가라아게', t: '고기류', k: 0 },
      { n: '냉면', t: '면류', k: 0 },
    ],
    2: [
      { n: '제육덮밥', t: '고기류', k: 0 },
      { n: '라면', t: '면류', k: 0 },
    ],
    3: [
      { n: '생선구이', t: '고기류', k: 0 },
      { n: '카레라이스', t: '면류', k: 0 },
    ],
    4: [
      { n: '오징어볶음', t: '고기류', k: 0 },
      { n: '짜장면', t: '면류', k: 0 },
    ],
    5: [
      { n: '삼겹살구이', t: '고기류', k: 0 },
      { n: '우동', t: '면류', k: 0 },
    ],
  };
  const defaultLunch = lunchByDow[3];
  const defaultDinner = dinnerByDow[3];

  function week() {
    const days = {};
    for (let dow = 0; dow <= 6; dow++) {
      const lunch = lunchByDow[dow] || defaultLunch;
      const dinner = dinnerByDow[dow] || defaultDinner;
      days[dow] = { l: [...lunch], d: [...dinner], b: [] };
    }
    return days;
  }

  return {
    기숙사: week(),
    명진당: week(),
    교직원: week(),
    학생회관: week(),
  };
}
