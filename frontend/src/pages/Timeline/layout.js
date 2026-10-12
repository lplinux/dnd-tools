/**
 * pages/Timeline/layout.js
 *
 * Pure layout math for the SVG-Gantt timeline (faithful port of timeline.html):
 *  - Events cluster into "segments" so empty time is compressed (GAP_H break).
 *  - `dayY` / `yToAbsDay` map an absolute day ↔ a pixel Y at the current
 *    pixels-per-day (ppd) zoom.
 *  - The zoom slider is logarithmic (sliderToPPD / ppdToSlider); `granularity`
 *    picks the date-axis density; `buildDateMarks` generates the axis labels.
 *
 * All functions are parameterized (events, ppd, calType) — no globals.
 */

import {
  absDay, fromAbsDay, harptDayToPeriod, gregDayToMD, gregMonthDays, GREG_MONTHS, HARPTOS,
} from '@/data/calendar';

// Segment / sizing constants
export const CLUS_PAD = 15;   // days of padding around each event cluster
export const GAP_H = 32;      // px height of a compressed-gap break
export const BOTTOM_PAD = 80; // px extra at the bottom so labels aren't clipped

// Zoom range (pixels per day)
export const MIN_PPD = 0.0002;
export const MAX_PPD = 60;

// Layout geometry
export const COL_W = 130;
export const HEADER_H = 72;
export const SIDE_W = 160;
export const R = 11;     // event node radius
export const GSPC = 22;  // grouped-node spacing
export const PAD = 20;

export function evEndAbs(ev, calType) {
  return absDay(ev.year, ev.dayOfYear, calType) + (ev.durationDays || 1) - 1;
}

/**
 * Cluster events along the day axis (gaps > 2·CLUS_PAD become a break) and
 * assign each cluster a pixel `yStart`. Returns [{ minA, maxA, yStart }].
 */
export function buildSegments(events, ppd, calType) {
  if (!events.length) {
    const a = absDay(1492, 1, calType);
    return [{ minA: a, maxA: a + 364, yStart: 0 }];
  }
  const days = [];
  events.forEach((e) => {
    days.push(absDay(e.year, e.dayOfYear, calType));
    days.push(evEndAbs(e, calType));
  });
  const uniqueDays = [...new Set(days)].sort((a, b) => a - b);

  const clusters = [];
  let cur = { min: uniqueDays[0] - CLUS_PAD, max: uniqueDays[0] + CLUS_PAD };
  for (let i = 1; i < uniqueDays.length; i++) {
    if (uniqueDays[i] - CLUS_PAD <= cur.max) cur.max = Math.max(cur.max, uniqueDays[i] + CLUS_PAD);
    else { clusters.push({ ...cur }); cur = { min: uniqueDays[i] - CLUS_PAD, max: uniqueDays[i] + CLUS_PAD }; }
  }
  clusters.push(cur);

  let y = 0;
  return clusters.map((c, i) => {
    const seg = { minA: Math.max(0, c.min), maxA: c.max, yStart: y };
    y += (c.max - c.min + 1) * ppd;
    if (i < clusters.length - 1) y += GAP_H;
    return seg;
  });
}

export function segTotalH(segments, ppd) {
  if (!segments.length) return 1;
  const s = segments[segments.length - 1];
  return s.yStart + (s.maxA - s.minA + 1) * ppd + BOTTOM_PAD;
}

/** Absolute day → pixel Y (center of the day band). */
export function dayY(a, segments, ppd) {
  for (const s of segments) {
    if (a >= s.minA && a <= s.maxA) return s.yStart + (a - s.minA) * ppd + ppd / 2;
  }
  if (!segments.length) return 0;
  if (a < segments[0].minA) return segments[0].yStart;
  const last = segments[segments.length - 1];
  return last.yStart + (last.maxA - last.minA + 1) * ppd;
}

/** Pixel Y → absolute day (inverse of dayY, including gap interpolation). */
export function yToAbsDay(y, segments, ppd) {
  for (const s of segments) {
    const sh = (s.maxA - s.minA + 1) * ppd;
    if (y >= s.yStart && y <= s.yStart + sh) return s.minA + Math.round((y - s.yStart) / ppd);
  }
  for (let i = 0; i < segments.length - 1; i++) {
    const s1 = segments[i];
    const s2 = segments[i + 1];
    const s1end = s1.yStart + (s1.maxA - s1.minA + 1) * ppd;
    if (y >= s1end && y <= s2.yStart) {
      const frac = (y - s1end) / (s2.yStart - s1end);
      return Math.round(s1.maxA + frac * (s2.minA - s1.maxA));
    }
  }
  return segments[segments.length - 1]?.maxA || 0;
}

// ── Zoom ──────────────────────────────────────────────────────
export const sliderToPPD = (v) => MIN_PPD * Math.pow(MAX_PPD / MIN_PPD, v / 100);
export const ppdToSlider = (p) => Math.round(100 * Math.log(p / MIN_PPD) / Math.log(MAX_PPD / MIN_PPD));

export function granularity(ppd) {
  if (ppd >= 3) return 'day';
  if (ppd >= 0.1) return 'month';
  if (ppd >= 0.01) return 'year';
  if (ppd >= 0.001) return 'decade';
  if (ppd >= 0.0001) return 'century';
  return 'millennium';
}

const GRAN_LABELS = { day: 'Day', month: 'Month', year: 'Year', decade: 'Decade', century: 'Century', millennium: 'Millennium' };
export const granLabel = (ppd) => GRAN_LABELS[granularity(ppd)];

// ── Date axis marks ───────────────────────────────────────────
function buildRangeMarks(minA, maxA, ppd, calType) {
  const gran = granularity(ppd);
  const marks = [];
  const suffix = calType === 'harptos' ? ' DR' : '';

  if (gran === 'day') {
    for (let a = minA; a <= maxA; a++) {
      const { year, dayOfYear } = fromAbsDay(a, calType);
      if (dayOfYear === 1) marks.push({ a, label: `${year}${suffix}`, type: 'yearLabel' });
      if (calType === 'harptos') {
        const r = harptDayToPeriod(dayOfYear);
        if (!r) continue;
        const { period: p, dayInPeriod: di } = r;
        if (di === 1) marks.push({ a, label: p.sp ? `✦ ${p.name}` : p.name, type: p.sp ? 'special' : 'month' });
        else marks.push({ a, label: `${di}`, type: 'day' });
      } else {
        const { m, d } = gregDayToMD(year, dayOfYear);
        if (d === 1) marks.push({ a, label: GREG_MONTHS[m].slice(0, 3), type: 'month' });
        else marks.push({ a, label: `${d}`, type: 'day' });
      }
    }
  } else if (gran === 'month') {
    const y0 = fromAbsDay(minA, calType).year;
    const y1 = fromAbsDay(maxA, calType).year;
    for (let yr = y0; yr <= y1 + 1; yr++) {
      marks.push({ a: absDay(yr, 1, calType), label: `${yr}${suffix}`, type: 'yearLabel' });
      if (calType === 'harptos') {
        for (const p of HARPTOS) {
          const a = absDay(yr, p.sd, calType);
          if (a < minA - 400 || a > maxA + 400) continue;
          marks.push({ a, label: p.sp ? `✦ ${p.name}` : p.name, type: p.sp ? 'special' : 'month' });
        }
      } else {
        let doy = 1;
        for (let m = 0; m < 12; m++) {
          const a = absDay(yr, doy, calType);
          if (a >= minA - 400 && a <= maxA + 400) marks.push({ a, label: GREG_MONTHS[m], type: 'month' });
          doy += gregMonthDays(m, yr);
        }
      }
    }
  } else if (gran === 'year') {
    const y0 = fromAbsDay(minA, calType).year;
    const y1 = fromAbsDay(maxA, calType).year;
    for (let yr = y0; yr <= y1 + 1; yr++) marks.push({ a: absDay(yr, 1, calType), label: `${yr}${suffix}`, type: yr % 10 === 0 ? 'decade' : 'year' });
  } else if (gran === 'decade') {
    const y0 = Math.floor(fromAbsDay(minA, calType).year / 10) * 10;
    const y1 = Math.ceil(fromAbsDay(maxA, calType).year / 10) * 10;
    for (let yr = y0; yr <= y1; yr += 10) marks.push({ a: absDay(yr, 1, calType), label: `${yr}${calType === 'harptos' ? 's DR' : 's'}`, type: yr % 100 === 0 ? 'century' : 'decade' });
  } else if (gran === 'century') {
    const y0 = Math.floor(fromAbsDay(minA, calType).year / 100) * 100;
    const y1 = Math.ceil(fromAbsDay(maxA, calType).year / 100) * 100;
    for (let yr = y0; yr <= y1; yr += 100) marks.push({ a: absDay(yr, 1, calType), label: `${yr}${suffix}`, type: yr % 1000 === 0 ? 'millennium' : 'century' });
  } else {
    const y0 = Math.floor(fromAbsDay(minA, calType).year / 1000) * 1000;
    const y1 = Math.ceil(fromAbsDay(maxA, calType).year / 1000) * 1000;
    for (let yr = y0; yr <= y1; yr += 1000) marks.push({ a: absDay(yr, 1, calType), label: `${yr}${suffix}`, type: 'millennium' });
  }
  return marks;
}

export function buildDateMarks(segments, ppd, calType) {
  const marks = [];
  for (const seg of segments) marks.push(...buildRangeMarks(seg.minA, seg.maxA, ppd, calType));
  return marks;
}
