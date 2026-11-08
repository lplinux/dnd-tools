/**
 * test/sessionDates.test.js
 *
 * A session's in-world date drives "Around this date". Two things must hold:
 * the server counts an event's day exactly as the client counted the
 * session's (it once ran a day late, and drifted on Gregorian calendars),
 * and a new session starts where the last one ended.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

import { absDay } from '../frontend/src/data/calendar.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'app.js'), 'utf8');

function handlerCode(method, routePath) {
  const start = source.indexOf(`app.${method}('${routePath}'`);
  expect(start, `route not found: ${method} ${routePath}`).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('\n});', start));
}

/** Evaluate eventAbsDaySql's SQL in JS, with SQL's integer division. */
function sqlAbsDay(calendarType, year, doy) {
  const fn = source.slice(source.indexOf('function eventAbsDaySql('), source.indexOf("app.get('/api/campaigns/:campaignId/sessions/:sessionId/upcoming'"));
  const pick = calendarType === 'harptos'
    ? fn.match(/if \(calendarType === 'harptos'\) return '([^']+)'/)[1]
    : fn.match(/\n {2}return '([^']+)'/)[1];
  const js = pick
    .replace(/\(e\.year - 1\) \/ (\d+)/g, 'Math.floor((y - 1) / $1)')
    .replace(/e\.year/g, 'y').replace(/e\.day_of_year/g, 'd');
  return Function('y', 'd', `return ${js};`)(year, doy);
}

describe('an event’s day is counted exactly as the session’s', () => {
  it('Harptos: year 1 day 1 is day zero, every year 365 days', () => {
    for (const [y, d] of [[1, 1], [1, 365], [2, 1], [1493, 319], [1493, 344]]) {
      expect(sqlAbsDay('harptos', y, d), `${y}/${d}`).toBe(absDay(y, d, 'harptos'));
    }
  });

  it('Gregorian: leap days included, at every century rule', () => {
    for (const [y, d] of [[1, 1], [4, 366], [5, 1], [100, 1], [101, 1], [400, 366], [401, 1], [2024, 60], [2026, 312]]) {
      expect(sqlAbsDay('gregorian', y, d), `${y}/${d}`).toBe(absDay(y, d, 'gregorian'));
    }
  });

  it('is what the upcoming route uses, for the start and the end of a span', () => {
    const r = handlerCode('get', '/api/campaigns/:campaignId/sessions/:sessionId/upcoming');
    expect(r).toMatch(/const ABS = eventAbsDaySql\(cal\)/);
    expect(r).toMatch(/\$\{ABS\} AS abs_day/);
    expect(r).toMatch(/AND \$\{ABS\} <= \$3/);
    expect(r).toMatch(/AND \$\{ABS\} \+ GREATEST\(e\.duration_days, 1\) - 1 >= \$2/);
    expect(r).not.toMatch(/\* 365 \+ e\.day_of_year\)/);
  });

  it('includes events still running, not only those starting in the window', () => {
    // Overlap: started on or before the window's end, ends on or after its start.
    const r = handlerCode('get', '/api/campaigns/:campaignId/sessions/:sessionId/upcoming');
    expect(r).toMatch(/running: Number\(e\.abs_day\) < from/);
  });
});

describe('a new session starts where the last one ended', () => {
  const create = handlerCode('post', '/api/campaigns/:campaignId/sessions');
  const next = handlerCode('post', '/api/campaigns/:campaignId/sessions/:sessionId/generate-next');
  const fn = source.slice(source.indexOf('async function startDayFor('), source.indexOf("app.post('/api/campaigns/:campaignId/sessions'"));

  it('takes the latest earlier dated session, then the Today marker', () => {
    expect(fn).toMatch(/in_game_day IS NOT NULL/);
    expect(fn).toMatch(/session_no < \$2/);
    expect(fn).toMatch(/ORDER BY session_no DESC NULLS LAST/);
    expect(fn).toMatch(/SELECT today_marker FROM campaign_meta/);
  });

  it('respects a date the DM sent, even "no date"', () => {
    expect(create).toMatch(/Object\.hasOwn\(req\.body \?\? \{\}, 'in_game_day'\)/);
    expect(create).toMatch(/: await startDayFor\(pool, req\.params\.campaignId, n\)/);
  });

  it('a generated session starts on the day the played one finished', () => {
    expect(next).toMatch(/src\.in_game_day \?\? await startDayFor\(client, campaignId/);
  });

  it('marking played still records the finish date and moves the clock', () => {
    const put = handlerCode('put', '/api/campaigns/:campaignId/sessions/:sessionId');
    expect(put).toMatch(/if \(saved\.in_game_day != null && saved\.status === 'played'\)/);
  });

  it('a non-numeric Today marker gives no date rather than a wrong one', () => {
    expect(fn).toMatch(/Number\.isFinite\(marker\) && marker >= 0 \? marker : null/);
  });
});
