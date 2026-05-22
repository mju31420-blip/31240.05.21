/** KST 기준 주말·공휴일 (무수업·식당 주말 모드 등) */
window.SchoolCalendar = {
  _dates: null,
  _loading: null,

  async load() {
    if (this._dates) return this._dates;
    if (this._loading) return this._loading;
    this._loading = (async () => {
      try {
        const res = await fetch('/data/kr-holidays.json');
        if (!res.ok) throw new Error(`holidays HTTP ${res.status}`);
        const data = await res.json();
        this._dates = new Set((data.dates || []).map(String));
      } catch (e) {
        console.warn('[schoolCalendar]', e.message || e);
        this._dates = new Set();
      }
      return this._dates;
    })();
    return this._loading;
  },

  _ymd(d) {
    const x = d || (typeof KST !== 'undefined' ? KST.now() : new Date());
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const day = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  isHoliday(d) {
    if (!this._dates) return false;
    return this._dates.has(this._ymd(d));
  },

  isNoSchoolDay(d) {
    const x = d || (typeof KST !== 'undefined' ? KST.now() : new Date());
    const dow = x.getDay();
    return dow === 0 || dow === 6 || this.isHoliday(x);
  },

  dayLabel(d) {
    const x = d || (typeof KST !== 'undefined' ? KST.now() : new Date());
    const names = ['일', '월', '화', '수', '목', '금', '토'];
    let lbl = `${names[x.getDay()]}요일`;
    if (this.isHoliday(x)) lbl += ' · 공휴일';
    else if (x.getDay() === 0 || x.getDay() === 6) lbl += ' · 주말';
    return lbl;
  },
};
