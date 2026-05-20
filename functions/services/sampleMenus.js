/** 크롤 실패 시 오늘 점심/저녁 샘플 (dow: 0=일 … 6=토) */
export function getSampleMenus() {
  const lunch = [
    { n: '제육볶음', t: '고기류', k: 0 },
    { n: '김치찌개', t: '찌개류', k: 0 },
    { n: '비빔밥', t: '건강식', k: 0 },
  ];
  const dinner = [
    { n: '돈까스', t: '고기류', k: 0 },
    { n: '우동', t: '면류', k: 0 },
  ];
  function week() {
    const days = {};
    for (let dow = 0; dow <= 6; dow++) {
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
