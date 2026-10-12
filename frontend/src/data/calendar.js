/**
 * data/calendar.js
 *
 * Calendar systems for the Timeline (Harptos / Gregorian) and the
 * calendar-agnostic absolute-day storage used by events. Pure functions,
 * parameterized by `calType` ('harptos' | 'gregorian') — faithful port of the
 * legacy timeline.html calendar math.
 *
 *  - Harptos: every year = 365 days, no leap years. 12 months × 30 days + 5
 *    festival ("special") days interleaved at fixed start-days (sd).
 *  - Gregorian: real leap years.
 *
 * Events store { year, dayOfYear } which map to a single integer `absDay`
 * (days from epoch) so events across eras share one axis.
 */

export const HARPTOS = [
  { name: 'Hammer', days: 30, sd: 1, sp: false }, { name: 'Midwinter', days: 1, sd: 31, sp: true },
  { name: 'Alturiak', days: 30, sd: 32, sp: false }, { name: 'Ches', days: 30, sd: 62, sp: false },
  { name: 'Tarsakh', days: 30, sd: 92, sp: false }, { name: 'Greengrass', days: 1, sd: 122, sp: true },
  { name: 'Mirtul', days: 30, sd: 123, sp: false }, { name: 'Kythorn', days: 30, sd: 153, sp: false },
  { name: 'Flamerule', days: 30, sd: 183, sp: false }, { name: 'Midsummer', days: 1, sd: 213, sp: true },
  { name: 'Eleasis', days: 30, sd: 214, sp: false }, { name: 'Eleint', days: 30, sd: 244, sp: false },
  { name: 'Highharvestide', days: 1, sd: 274, sp: true }, { name: 'Marpenoth', days: 30, sd: 275, sp: false },
  { name: 'Uktar', days: 30, sd: 305, sp: false }, { name: 'Feast of the Moon', days: 1, sd: 335, sp: true },
  { name: 'Nightal', days: 30, sd: 336, sp: false },
];

export const GREG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const GREG_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Event/player colour palette. */
export const PALETTE = ['#c0392b', '#e67e22', '#d4ac0d', '#27ae60', '#16a085', '#2980b9', '#8e44ad', '#e91e8c', '#546e7a', '#e74c3c', '#f39c12', '#1abc9c'];

export const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const gregDaysInYear = (y) => (isLeap(y) ? 366 : 365);
export const gregMonthDays = (m, y) => (m === 1 ? (isLeap(y) ? 29 : 28) : GREG_DAYS[m]);

export function gregDayToMD(year, doy) {
  const feb = isLeap(year) ? 29 : 28;
  const md = [31, feb, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let d = doy;
  let m = 0;
  while (m < 11 && d > md[m]) { d -= md[m]; m++; }
  return { m, d };
}

export function gregDoyFromMD(monthIdx, day, year) {
  const feb = isLeap(year) ? 29 : 28;
  const md = [31, feb, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let doy = day;
  for (let i = 0; i < monthIdx; i++) doy += md[i];
  return doy;
}

/** Calendar-agnostic absolute day index from (year, dayOfYear). */
export function absDay(year, doy, calType) {
  if (calType === 'harptos') return (year - 1) * 365 + doy - 1;
  const y = year - 1;
  return 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + doy - 1;
}

/** Inverse of absDay → { year, dayOfYear }. */
export function fromAbsDay(abs, calType) {
  if (calType === 'harptos') {
    return { year: Math.floor(abs / 365) + 1, dayOfYear: (abs % 365) + 1 };
  }
  let yr = Math.floor(abs / 365.2425) + 1;
  while (absDay(yr + 1, 1, calType) <= abs) yr++;
  while (yr > 1 && absDay(yr, 1, calType) > abs) yr--;
  return { year: yr, dayOfYear: abs - absDay(yr, 1, calType) + 1 };
}

/** Harptos: map a day-of-year to its month/festival period. */
export function harptDayToPeriod(doy) {
  for (const p of HARPTOS) {
    if (doy >= p.sd && doy < p.sd + p.days) return { period: p, dayInPeriod: doy - p.sd + 1 };
  }
  return null;
}

/** Human-readable date for (year, dayOfYear). */
export function formatDate(year, doy, calType) {
  if (calType === 'harptos') {
    const r = harptDayToPeriod(doy);
    if (!r) return `Day ${doy}, ${year} DR`;
    return r.period.sp ? `${r.period.name}, ${year} DR` : `${r.dayInPeriod} ${r.period.name}, ${year} DR`;
  }
  const { m, d } = gregDayToMD(year, doy);
  return `${d} ${GREG_MONTHS[m]} ${year}`;
}

/** Month/festival <option> data for the active calendar. */
export function monthOptions(calType) {
  if (calType === 'harptos') return HARPTOS.map((p, i) => ({ value: i, label: `${p.name}${p.sp ? ' ✦' : ''}` }));
  return GREG_MONTHS.map((m, i) => ({ value: i, label: m }));
}

/** Form (monthIdx, day) → day-of-year. */
export function doyFromForm(midx, day, year, calType) {
  if (calType === 'harptos') {
    const p = HARPTOS[midx];
    return p.sd + (p.sp ? 0 : day - 1);
  }
  return gregDoyFromMD(midx, day, year);
}

/** day-of-year → form { midx, day, special }. */
export function formMidxFromDoy(doy, year, calType) {
  if (calType === 'harptos') {
    for (let i = 0; i < HARPTOS.length; i++) {
      const p = HARPTOS[i];
      if (doy >= p.sd && doy < p.sd + p.days) return { midx: i, day: doy - p.sd + 1, special: p.sp };
    }
    return { midx: 0, day: 1, special: false };
  }
  const { m, d } = gregDayToMD(year, doy);
  return { midx: m, day: d, special: false };
}

/** Parse a duration string like "3d", "2m", "1y" → days (min 1). */
export function parseDuration(s) {
  if (!s || !String(s).trim()) return 1;
  const m = String(s).trim().match(/^(\d+(?:\.\d+)?)\s*([dDmMyY]?)$/);
  if (!m) return 1;
  const n = parseFloat(m[1]);
  const unit = (m[2] || 'd').toLowerCase();
  if (unit === 'y') return Math.max(1, Math.round(n * 365));
  if (unit === 'm') return Math.max(1, Math.round(n * 30));
  return Math.max(1, Math.round(n));
}

/** Format a day count back to a short label. */
export function formatDuration(d) {
  if (!d || d <= 1) return '1d';
  if (d < 30) return `${d}d`;
  if (d < 365) return `~${Math.round(d / 30)}m`;
  return `~${(d / 365).toFixed(1)}y`;
}
