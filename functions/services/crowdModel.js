/**
 * 건물·시간대별 식사 이동 파동 (~100 시드)
 * 실제 로그가 쌓이면 GET /api/crowd/events 로 대체 가능
 */

const BUILDINGS = ['3공', '5공', '명진당', '공2', '자연', '학생'];
const LUNCH_ENDS = ['10:15', '11:00', '11:50', '12:40', '13:30'];
const DINNER_ENDS = ['16:30', '17:00', '17:30', '18:00'];

function buildWaves() {
  const waves = [];
  let id = 0;
  for (const b of BUILDINGS) {
    for (const end of LUNCH_ENDS) {
      const [h, m] = end.split(':').map(Number);
      const base = 420 + (BUILDINGS.indexOf(b) % 3) * 80 + LUNCH_ENDS.indexOf(end) * 35;
      waves.push({
        id: ++id,
        building: b,
        meal: 'lunch',
        endTime: end,
        surge: Math.min(950, base),
        walkSpreadMin: 8 + (id % 5),
      });
    }
    for (const end of DINNER_ENDS) {
      const base = 280 + (BUILDINGS.indexOf(b) % 4) * 45;
      waves.push({
        id: ++id,
        building: b,
        meal: 'dinner',
        endTime: end,
        surge: Math.min(720, base),
        walkSpreadMin: 10 + (id % 4),
      });
    }
  }
  return waves;
}

export const CROWD_WAVES = buildWaves();

export function estimateCrowd({ building, period, gapMin, willEat }) {
  if (!willEat) {
    return { 인원: '120명', 혼잡도: 25, 설명: '식사 이동 수요 낮음' };
  }

  const meal = period === 'dinner' ? 'dinner' : 'lunch';
  const pool = CROWD_WAVES.filter((w) => w.building === building && w.meal === meal);
  const wave = pool[gapMin % pool.length] || pool[0];
  const boost = gapMin >= 120 ? 1.15 : gapMin >= 60 ? 1.05 : 1;
  const surge = Math.round((wave?.surge || 500) * boost);

  return {
    인원: `${surge}명`,
    혼잡도: Math.min(95, Math.round(surge / 10)),
    설명: `${building} 종료 묶음 + ${meal === 'lunch' ? '점심' : '저녁'} 파동`,
    waveId: wave?.id,
  };
}
