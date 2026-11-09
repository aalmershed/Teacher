// جدولي: جدول الحصص الأسبوعي للمعلم (عرض وتعديل فقط، بدون طباعة)
// days: أيام الدراسة (0 = الأحد ... 6 = السبت)
// periods: أوقات الحصص بالترتيب { start, end } بصيغة HH:MM
// cells: { 'يوم-رقم الحصة': { klass, subject, place } }
// notify: تنبيه الجوال قبل بداية الحصة (يعمل في التطبيق)

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const str = (v, max) => String(v ?? '').trim().slice(0, max);

const DEFAULT_PERIODS = [
  ['07:00', '07:45'], ['07:45', '08:30'], ['08:30', '09:15'],
  ['09:35', '10:20'], ['10:20', '11:05'], ['11:05', '11:50'], ['11:50', '12:35'],
].map(([start, end]) => ({ start, end }));

const DEFAULTS = { days: [0, 1, 2, 3, 4], periods: DEFAULT_PERIODS, cells: {}, notify: { enabled: false, before: 5 } };

function normalize(d) {
  d = d && typeof d === 'object' ? d : {};
  const days = [...new Set((Array.isArray(d.days) ? d.days : DEFAULTS.days).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b);
  const periods = (Array.isArray(d.periods) && d.periods.length ? d.periods : DEFAULT_PERIODS).slice(0, 12).map((p, i) => ({
    start: TIME.test(p?.start) ? p.start : (DEFAULT_PERIODS[i] || DEFAULT_PERIODS[0]).start,
    end: TIME.test(p?.end) ? p.end : (DEFAULT_PERIODS[i] || DEFAULT_PERIODS[0]).end,
  }));
  const cells = {};
  const src = d.cells && typeof d.cells === 'object' ? d.cells : {};
  for (const [key, c] of Object.entries(src)) {
    const m = /^([0-6])-(\d{1,2})$/.exec(key);
    if (!m || Number(m[2]) >= periods.length || !c || typeof c !== 'object') continue;
    const cell = { klass: str(c.klass, 40), subject: str(c.subject, 60), place: str(c.place, 60) };
    if (cell.klass || cell.subject || cell.place) cells[key] = cell;
  }
  const before = Math.round(Number(d.notify?.before));
  return {
    days: days.length ? days : DEFAULTS.days,
    periods,
    cells,
    notify: { enabled: !!d.notify?.enabled, before: Number.isFinite(before) ? Math.min(30, Math.max(0, before)) : 5 },
  };
}

module.exports = { normalize, DEFAULTS };
