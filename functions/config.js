/** @type {Record<string, { url: string; label: string }>} */
export const RESTAURANT_SOURCES = {
  기숙사: { url: 'https://www.mju.ac.kr/mjukr/487/subview.do', label: '생활관식당' },
  교직원: { url: 'https://www.mju.ac.kr/mjukr/488/subview.do', label: '교직원식당' },
  명진당: { url: 'https://www.mju.ac.kr/mjukr/485/subview.do', label: '명진당' },
  학생회관: { url: 'https://www.mju.ac.kr/mjukr/486/subview.do', label: '학생회관' },
};

export const BUILDING_KEYS = {
  '1공': ['1공', '제1공학관', '1공학관', '제1공'],
  '2공': ['2공', '제2공학관', '2공학관', '제2공'],
  '3공': ['3공', '제3공학관', '3공학관', 'Y19', 'y19'],
  '5공': ['5공', '제5공학관', '5공학관', 'Y5', 'y5'],
  명진당: ['명진당', '명진', 'Y3', 'y3'],
  공2: ['공2', '공학2관', 'Y11', 'y11'],
  자연: ['자연', '자연과학관', 'Y7', 'y7', 'Y25', 'y25'],
  학생: ['학생', '학생회관', 'Y21', 'y21', 'Y22', 'y22'],
  창조: ['창조', '창조관', '창의', '혁신관'],
  채플: ['채플', '채플관', '예배당'],
};

export const BUILDING_LABELS = {
  '1공': '제1공학관',
  '2공': '제2공학관',
  '3공': '제3공학관 (Y19)',
  '5공': '제5공학관 (Y5)',
  명진당: '명진당 (Y3)',
  공2: '공학2관 (Y11)',
  자연: '자연과학관 (Y7)',
  학생: '학생회관 (Y21)',
  창조: '창조관',
  채플: '채플관',
};
