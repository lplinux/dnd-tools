/**
 * The Harptos calendar is the load-bearing bit of domain maths in this app:
 * every timeline position, the Today marker and the journey-map movement paths
 * are derived from an absolute day index. Its awkward part is the five festival
 * days, which sit BETWEEN months and are each a one-day period of their own.
 */

import { describe, it, expect } from 'vitest';
import {
  HARPTOS, absDay, fromAbsDay, harptDayToPeriod, formatDate,
  isLeap, gregDaysInYear, gregDayToMD, gregDoyFromMD, parseDuration, formatDuration,
} from './calendar';

describe('Harptos structure', () => {
  it('covers exactly 365 days with no gap or overlap', () => {
    const total = HARPTOS.reduce((n, p) => n + p.days, 0);
    expect(total).toBe(365);
    // every period starts the day after the previous one ends
    HARPTOS.reduce((expectedStart, p) => {
      expect(p.sd).toBe(expectedStart);
      return p.sd + p.days;
    }, 1);
  });

  it('has five single-day festivals', () => {
    const fests = HARPTOS.filter((p) => p.sp);
    expect(fests.map((p) => p.name)).toEqual([
      'Midwinter', 'Greengrass', 'Midsummer', 'Highharvestide', 'Feast of the Moon',
    ]);
    expect(fests.every((p) => p.days === 1)).toBe(true);
  });
});

describe('harptDayToPeriod', () => {
  it('finds the month a normal day falls in', () => {
    expect(harptDayToPeriod(1)).toMatchObject({ dayInPeriod: 1 });
    expect(harptDayToPeriod(1).period.name).toBe('Hammer');
    expect(harptDayToPeriod(30).period.name).toBe('Hammer');
  });

  it('resolves the festival days themselves', () => {
    // day 31 is Midwinter, wedged between Hammer and Alturiak
    expect(harptDayToPeriod(31).period.name).toBe('Midwinter');
    expect(harptDayToPeriod(32).period.name).toBe('Alturiak');
    expect(harptDayToPeriod(335).period.name).toBe('Feast of the Moon');
  });

  it('returns null outside the year', () => {
    expect(harptDayToPeriod(0)).toBeNull();
    expect(harptDayToPeriod(366)).toBeNull();
  });
});

describe('formatDate (harptos)', () => {
  it('omits the day number for a festival, since it is the whole period', () => {
    expect(formatDate(1492, 31, 'harptos')).toBe('Midwinter, 1492 DR');
  });
  it('includes the day within a month', () => {
    expect(formatDate(1492, 1, 'harptos')).toBe('1 Hammer, 1492 DR');
    expect(formatDate(1492, 32, 'harptos')).toBe('1 Alturiak, 1492 DR');
  });
});

describe('absDay / fromAbsDay round-trip', () => {
  it('is lossless across harptos years, including festival days', () => {
    for (const [year, doy] of [[1, 1], [1492, 1], [1492, 31], [1492, 365], [1493, 1], [2000, 200]]) {
      const back = fromAbsDay(absDay(year, doy, 'harptos'), 'harptos');
      expect(back).toEqual({ year, dayOfYear: doy });
    }
  });

  it('is lossless in gregorian across leap boundaries', () => {
    for (const [year, doy] of [[1, 1], [1999, 365], [2000, 366], [2001, 1], [2024, 60], [2100, 365]]) {
      const back = fromAbsDay(absDay(year, doy, 'gregorian'), 'gregorian');
      expect(back).toEqual({ year, dayOfYear: doy });
    }
  });

  it('orders days monotonically, which is what the timeline axis relies on', () => {
    const a = absDay(1492, 364, 'harptos');
    const b = absDay(1492, 365, 'harptos');
    const c = absDay(1493, 1, 'harptos');
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(c - b).toBe(1);
  });
});

describe('gregorian leap years', () => {
  it('applies the century rule', () => {
    expect(isLeap(2024)).toBe(true);
    expect(isLeap(1900)).toBe(false);   // divisible by 100, not 400
    expect(isLeap(2000)).toBe(true);    // divisible by 400
    expect(gregDaysInYear(2024)).toBe(366);
    expect(gregDaysInYear(1900)).toBe(365);
  });

  it('shifts dates after February in a leap year', () => {
    expect(gregDayToMD(2023, 60)).toEqual({ m: 2, d: 1 });   // 1 March
    expect(gregDayToMD(2024, 60)).toEqual({ m: 1, d: 29 });  // 29 February
  });

  it('gregDoyFromMD inverts gregDayToMD', () => {
    for (const [y, doy] of [[2024, 1], [2024, 60], [2024, 366], [2023, 365]]) {
      const { m, d } = gregDayToMD(y, doy);
      expect(gregDoyFromMD(m, d, y)).toBe(doy);
    }
  });
});

describe('durations', () => {
  it('round-trips exactly below 30 days', () => {
    for (const days of [1, 2, 7, 29]) {
      expect(parseDuration(formatDuration(days))).toBe(days);
    }
  });

  it('reads an exact day count back, at any size', () => {
    // The event edit modal pre-fills with `${days}d` and parses it back on save,
    // so this is the property that stops merely opening the modal from changing
    // the duration. It previously pre-filled with the DISPLAY format, and a
    // 45-day event came back as 60.
    for (const days of [1, 29, 30, 45, 100, 365, 1000]) {
      expect(parseDuration(`${days}d`)).toBe(days);
    }
  });

  it('still converts the units a user may type', () => {
    expect(parseDuration('3m')).toBe(90);
    expect(parseDuration('2y')).toBe(730);
    expect(parseDuration('5')).toBe(5);       // bare number means days
  });

  it('falls back to a single day on anything unreadable', () => {
    expect(parseDuration('')).toBe(1);
    expect(parseDuration('soon')).toBe(1);
    expect(parseDuration(null)).toBe(1);
    // including its own approximate output — which is why nothing round-trips
    // through formatDuration any more
    expect(parseDuration('~2m')).toBe(1);
  });

  it('formatDuration is display-only, and approximate above 30 days', () => {
    expect(formatDuration(1)).toBe('1d');
    expect(formatDuration(29)).toBe('29d');
    expect(formatDuration(45)).toBe('~2m');   // the ~ marks it as lossy
    expect(formatDuration(400)).toBe('~1.1y');
  });
});
