/**
 * components/ui/calendarDate.test.js
 *
 * The point of the picker is that a wrong date should be unreachable. These
 * cover the three ways one could still get in: a month shorter than the day
 * already chosen, the Harptos festivals (one-day "months" with their own
 * day-of-year arithmetic), and the round trip through the stored integer.
 */
import { describe, it, expect } from 'vitest';
import { daysInMonth, partsFromAbsDay, absDayFromParts } from './CalendarDate';
import { HARPTOS } from '@/data/calendar';

describe('daysInMonth', () => {
  it('knows the Harptos months', () => {
    expect(daysInMonth(0, 1493, 'harptos')).toBe(30);   // Hammer
    expect(daysInMonth(1, 1493, 'harptos')).toBe(1);    // Midwinter, a festival
  });

  it('follows the Gregorian leap year', () => {
    expect(daysInMonth(1, 2024, 'gregorian')).toBe(29);
    expect(daysInMonth(1, 2025, 'gregorian')).toBe(28);
    expect(daysInMonth(1, 2100, 'gregorian')).toBe(28); // not a leap year
    expect(daysInMonth(1, 2000, 'gregorian')).toBe(29); // but this one is
  });

  it('never leaves a 31st available where there is none', () => {
    for (let m = 0; m < 12; m++) {
      expect(daysInMonth(m, 2025, 'gregorian')).toBeLessThanOrEqual(31);
    }
    expect(daysInMonth(3, 2025, 'gregorian')).toBe(30);  // April
    expect(daysInMonth(8, 2025, 'gregorian')).toBe(30);  // September
  });
});

describe('the round trip through the stored absolute day', () => {
  const cases = [
    ['harptos', 1493, 0, 1],    // 1 Hammer
    ['harptos', 1493, 0, 30],   // 30 Hammer
    ['harptos', 1493, 14, 2],   // 2 Uktar — the campaign's own anchor
    ['harptos', 1493, 16, 30],  // 30 Nightal, the last day of the year
    ['harptos', 1, 0, 1],       // the epoch itself
    ['gregorian', 2026, 9, 11],
    ['gregorian', 2024, 1, 29], // 29 Feb on a leap year
  ];

  for (const [cal, year, midx, day] of cases) {
    it(`survives ${cal} ${year}-${midx + 1}-${day}`, () => {
      const abs = absDayFromParts({ year, midx, day }, cal);
      expect(Number.isInteger(abs)).toBe(true);
      expect(partsFromAbsDay(abs, cal)).toEqual({ year, midx, day });
    });
  }

  it('puts the Harptos epoch at zero, which the server must accept', () => {
    // The reason journalDay bounds on `>= 0` rather than `> 0`.
    expect(absDayFromParts({ year: 1, midx: 0, day: 1 }, 'harptos')).toBe(0);
  });

  it('round-trips every Harptos festival', () => {
    HARPTOS.forEach((p, midx) => {
      if (!p.sp) return;
      const abs = absDayFromParts({ year: 1493, midx, day: 1 }, 'harptos');
      expect(partsFromAbsDay(abs, 'harptos')).toEqual({ year: 1493, midx, day: 1 });
    });
  });

  it('orders consecutive days consecutively', () => {
    // A date control that round-trips but does not sort would reorder the
    // journal, which is read in this value's order.
    const a = absDayFromParts({ year: 1493, midx: 0, day: 30 }, 'harptos');
    const b = absDayFromParts({ year: 1493, midx: 1, day: 1 }, 'harptos');  // Midwinter
    const c = absDayFromParts({ year: 1493, midx: 2, day: 1 }, 'harptos');  // 1 Alturiak
    expect(b).toBe(a + 1);
    expect(c).toBe(b + 1);
  });
});

describe('no date at all', () => {
  it('is null in both directions', () => {
    expect(partsFromAbsDay(null, 'harptos')).toBeNull();
    expect(partsFromAbsDay(undefined, 'harptos')).toBeNull();
    expect(absDayFromParts(null, 'harptos')).toBeNull();
  });

  it('treats a blank or nonsense year as no date, not year zero', () => {
    expect(absDayFromParts({ year: '', midx: 3, day: 7 }, 'harptos')).toBeNull();
    expect(absDayFromParts({ year: 'abc', midx: 0, day: 1 }, 'harptos')).toBeNull();
    expect(absDayFromParts({ year: 0, midx: 0, day: 1 }, 'harptos')).toBeNull();
    expect(absDayFromParts({ year: -5, midx: 0, day: 1 }, 'harptos')).toBeNull();
  });

  it('accepts a year typed as a string, which is what an input gives', () => {
    expect(absDayFromParts({ year: '1493', midx: 14, day: 2 }, 'harptos'))
      .toBe(absDayFromParts({ year: 1493, midx: 14, day: 2 }, 'harptos'));
  });
});
